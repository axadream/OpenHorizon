import { buildPrompt } from '../buildPrompt';
import type { ResolvedAiConfig } from '../config';
import { assertCloudConsent } from '../consent';
import { AiFlowError, AiHttpError } from '../errors';
import { chatCompletionsUrl, modelsUrl, ollamaTagsUrl } from '../endpoint';
import { parseAiJson, partialSummary } from '../parseAiJson';
import { createSseParser, parseChatChunk } from '../sse';
import type { AiProvider, GenerateInput, ProviderResult } from '../types';

/*
 * One client for any OpenAI-style /chat/completions endpoint: streaming over SSE with an AbortController
 * and a deadline, a non-streaming fallback when the server answers with plain JSON, and a retry without
 * response_format when the server refuses it. Every request first asserts cloud consent, so nothing is
 * sent to a cloud host before the user has accepted it.
 */

export const REQUEST_TIMEOUT_MS = 120_000;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface OpenAiContext {
  config: ResolvedAiConfig;
  /** '' for keyless local servers. Sent only as a bearer header; never logged. */
  apiKey: string;
  /** Injected in tests. Defaults to the global fetch, looked up at call time. */
  fetchImpl?: FetchLike;
}

function doFetch(ctx: OpenAiContext): FetchLike {
  return ctx.fetchImpl ?? ((url, init) => fetch(url, init));
}

function requestHeaders(apiKey: string, accept: string, json: boolean): Record<string, string> {
  const headers: Record<string, string> = { Accept: accept };
  if (json) headers['Content-Type'] = 'application/json';
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

async function readText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 2000);
  } catch {
    return '';
  }
}

interface Deadline {
  signal: AbortSignal;
  done(): void;
}

/** A signal that aborts when the user aborts or when the deadline passes. */
function withDeadline(user: AbortSignal): Deadline {
  const controller = new AbortController();
  const onUserAbort = (): void => controller.abort(user.reason);
  if (user.aborted) controller.abort(user.reason);
  else user.addEventListener('abort', onUserAbort, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DOMException('The request timed out.', 'TimeoutError')),
    REQUEST_TIMEOUT_MS,
  );
  return {
    signal: controller.signal,
    done(): void {
      clearTimeout(timer);
      user.removeEventListener('abort', onUserAbort);
    },
  };
}

async function post(ctx: OpenAiContext, url: string, body: unknown, signal: AbortSignal): Promise<Response> {
  const res = await doFetch(ctx)(url, {
    method: 'POST',
    headers: requestHeaders(ctx.apiKey, 'text/event-stream, application/json', true),
    body: JSON.stringify(body),
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  });
  if (!res.ok) throw new AiHttpError(res.status, await readText(res));
  return res;
}

async function getJson(ctx: OpenAiContext, url: string, signal: AbortSignal): Promise<unknown> {
  const res = await doFetch(ctx)(url, {
    method: 'GET',
    headers: requestHeaders(ctx.apiKey, 'application/json', false),
    signal,
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  });
  if (!res.ok) throw new AiHttpError(res.status, await readText(res));
  return res.json();
}

/** The message text of a non-streaming chat completion. */
export function completionText(data: unknown): string {
  const content = (data as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new AiFlowError('ai.err.badOutput');
  return content;
}

/** Read a chat completion, streamed (SSE) or plain JSON, calling onText with the text so far. */
async function readCompletion(res: Response, onText?: (text: string) => void): Promise<string> {
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('text/event-stream') || !res.body) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new AiFlowError('ai.err.badOutput');
    }
    return completionText(data);
  }

  const state: { text: string; error: string | null } = { text: '', error: null };
  const parser = createSseParser({
    onData(data) {
      const chunk = parseChatChunk(data);
      if (!chunk) return;
      if (chunk.error) {
        state.error = chunk.error;
        return;
      }
      if (chunk.delta) {
        state.text += chunk.delta;
        onText?.(state.text);
      }
    },
  });
  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.end();
  if (state.error !== null) throw new AiHttpError(500, state.error);
  return state.text;
}

/** One JSON-output chat request. Asserts consent first, so a cloud call without consent never reaches fetch. */
async function chatJson(
  ctx: OpenAiContext,
  system: string,
  user: string,
  signal: AbortSignal,
  onText?: (text: string) => void,
): Promise<string> {
  await assertCloudConsent(ctx.config);
  const deadline = withDeadline(signal);
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  const bodyFor = (jsonMode: boolean): Record<string, unknown> => ({
    model: ctx.config.model,
    messages,
    temperature: 0.2,
    stream: true,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  });
  const url = chatCompletionsUrl(ctx.config.baseUrl);
  try {
    let res: Response;
    try {
      res = await post(ctx, url, bodyFor(ctx.config.jsonMode), deadline.signal);
    } catch (err) {
      const refusedJsonMode =
        ctx.config.jsonMode && err instanceof AiHttpError && err.status === 400 && /response_format|json_object/i.test(err.body);
      if (!refusedJsonMode) throw err;
      res = await post(ctx, url, bodyFor(false), deadline.signal);
    }
    return await readCompletion(res, onText);
  } finally {
    deadline.done();
  }
}

/** Provider for one OpenAI-style endpoint. Produces the summary, takeaways and tags in a single request. */
export function createOpenAiProvider(ctx: OpenAiContext): AiProvider {
  return {
    id: ctx.config.provider,
    privacy: ctx.config.privacy,
    async generate(input: GenerateInput): Promise<ProviderResult> {
      const prompt = buildPrompt({
        title: input.title,
        url: input.url,
        text: input.text,
        locale: input.locale,
        instructions: input.instructions,
      });
      const raw = await chatJson(ctx, prompt.system, prompt.user, input.signal, (text) => {
        const partial = partialSummary(text);
        if (partial !== null) input.onPartial({ summary: partial });
      });
      const draft = parseAiJson(raw);
      if (!draft) throw new AiFlowError('ai.err.badOutput');
      input.onPartial(draft);
      return {
        ...draft,
        provider: ctx.config.provider,
        model: ctx.config.model,
        privacy: ctx.config.privacy,
        notes: [],
      };
    },
  };
}

function modelIds(data: unknown, listKey: 'data' | 'models', field: 'id' | 'name'): string[] {
  const list = (data as Record<string, unknown> | null)?.[listKey];
  if (!Array.isArray(list)) throw new AiFlowError('ai.err.badOutput');
  const ids = list
    .map((item) => (item && typeof item === 'object' ? (item as Record<string, unknown>)[field] : undefined))
    .filter((v): v is string => typeof v === 'string' && v !== '');
  return [...new Set(ids)].sort();
}

/**
 * Model ids from GET {base}/models. Ollama also answers its native /api/tags at the server root; that
 * is tried when /models is missing or the connection itself fails.
 */
export async function listModels(ctx: OpenAiContext, signal: AbortSignal): Promise<string[]> {
  await assertCloudConsent(ctx.config);
  const deadline = withDeadline(signal);
  try {
    try {
      return modelIds(await getJson(ctx, modelsUrl(ctx.config.baseUrl), deadline.signal), 'data', 'id');
    } catch (err) {
      // Ollama's own list is tried when /models is missing, unreachable or shaped differently.
      const fallback =
        ctx.config.ollamaTags &&
        (err instanceof TypeError || err instanceof AiFlowError || (err instanceof AiHttpError && err.status === 404));
      if (!fallback) throw err;
      return modelIds(await getJson(ctx, ollamaTagsUrl(ctx.config.baseUrl), deadline.signal), 'models', 'name');
    }
  } finally {
    deadline.done();
  }
}

/** Tiny request for Settings > Test connection. Returns the latency and a short reply. */
export async function testConnection(ctx: OpenAiContext, signal: AbortSignal): Promise<{ latencyMs: number; reply: string }> {
  await assertCloudConsent(ctx.config);
  const deadline = withDeadline(signal);
  const started = Date.now();
  try {
    const res = await post(
      ctx,
      chatCompletionsUrl(ctx.config.baseUrl),
      {
        model: ctx.config.model,
        messages: [{ role: 'user', content: 'Reply with OK.' }],
        max_tokens: 8,
        temperature: 0,
        stream: false,
      },
      deadline.signal,
    );
    const reply = completionText(await res.json());
    return { latencyMs: Date.now() - started, reply: reply.trim().slice(0, 80) };
  } finally {
    deadline.done();
  }
}
