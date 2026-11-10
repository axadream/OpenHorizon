import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db/db';
import { resolveAiConfig, type ResolvedAiConfig } from '../config';
import { grantCloudConsent } from '../consent';
import { AiConsentRequiredError, AiHttpError } from '../errors';
import { createOpenAiProvider, listModels, testConnection, type FetchLike } from './openAiCompatible';

const encoder = new TextEncoder();

function configFor(provider: 'openai' | 'ollama', model = 'model-x'): ResolvedAiConfig {
  const { config } = resolveAiConfig(
    { provider, baseUrl: '', model, hasKey: true },
    'https:',
  );
  if (!config) throw new Error('config should resolve');
  return config;
}

/** A streamed response whose bytes arrive in the given pieces (so events are split across reads). */
function sseResponse(pieces: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of pieces) controller.enqueue(encoder.encode(piece));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function deltaEvent(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

const signal = (): AbortSignal => new AbortController().signal;

beforeEach(async () => {
  await db.settings.clear();
});

describe('consent gating', () => {
  it('a cloud provider without consent throws before any fetch is made', async () => {
    const fetchImpl = vi.fn<FetchLike>();
    const provider = createOpenAiProvider({ config: configFor('openai'), apiKey: 'sk-test', fetchImpl });

    await expect(
      provider.generate({
        title: 'T',
        url: 'https://example.com/a',
        text: 'Body text.',
        locale: 'en',
        instructions: 'Be brief.',
        signal: signal(),
        onPartial: () => undefined,
      }),
    ).rejects.toBeInstanceOf(AiConsentRequiredError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('listing models and testing the connection also need consent first', async () => {
    const fetchImpl = vi.fn<FetchLike>();
    const ctx = { config: configFor('openai'), apiKey: 'sk-test', fetchImpl };
    await expect(listModels(ctx, signal())).rejects.toBeInstanceOf(AiConsentRequiredError);
    await expect(testConnection(ctx, signal())).rejects.toBeInstanceOf(AiConsentRequiredError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('after consent is recorded the request goes out with the bearer key and no cookies', async () => {
    await grantCloudConsent('openai');
    const fetchImpl = vi.fn<FetchLike>(async () => new Response(JSON.stringify({ data: [{ id: 'gpt-b' }, { id: 'gpt-a' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const ids = await listModels({ config: configFor('openai'), apiKey: 'sk-test', fetchImpl }, signal());
    expect(ids).toEqual(['gpt-a', 'gpt-b']);
    const url = fetchImpl.mock.calls[0]?.[0];
    const init = fetchImpl.mock.calls[0]?.[1];
    expect(url).toBe('https://api.openai.com/v1/models');
    const headers = init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe('Bearer sk-test');
    expect(init?.credentials).toBe('omit');
  });

  it('a local server needs no consent', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => new Response(JSON.stringify({ models: [{ name: 'llama3.2' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    const ids = await listModels({ config: configFor('ollama'), apiKey: '', fetchImpl }, signal());
    expect(ids).toEqual(['llama3.2'].sort());
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://localhost:11434/v1/models');
  });
});

describe('generate over SSE', () => {
  it('streams partial summaries and returns the parsed draft, with chunks split mid-event', async () => {
    const body = '{"summary": "Grid prices rose. Supply is tight.", "takeaways": ["Prices up", "Supply down"], "tags": ["energy"]}';
    const events = [deltaEvent(body.slice(0, 20)), deltaEvent(body.slice(20, 60)), deltaEvent(body.slice(60))].join('');
    // Split the bytes at odd places, including inside a data line.
    const cut = [events.slice(0, 33), events.slice(33, 150), events.slice(150)];
    const fetchImpl = vi.fn<FetchLike>(async () => sseResponse(cut));
    const partials: string[] = [];
    const provider = createOpenAiProvider({ config: configFor('ollama'), apiKey: '', fetchImpl });

    const result = await provider.generate({
      title: 'Grid',
      url: 'https://example.com/g',
      text: 'Article.',
      locale: 'en',
      instructions: 'Be brief.',
      signal: signal(),
      onPartial: (p) => {
        if (p.summary !== undefined) partials.push(p.summary);
      },
    });

    expect(result.summary).toBe('Grid prices rose. Supply is tight.');
    expect(result.takeaways).toEqual(['Prices up', 'Supply down']);
    expect(result.tags).toEqual(['energy']);
    expect(result.provider).toBe('ollama');
    expect(partials.length).toBeGreaterThan(1);
    expect(partials[partials.length - 1]).toBe('Grid prices rose. Supply is tight.');

    const init = fetchImpl.mock.calls[0]?.[1];
    const sent = JSON.parse(String(init?.body)) as { stream: boolean; response_format?: unknown; messages: { role: string }[] };
    expect(sent.stream).toBe(true);
    expect(sent.response_format).toEqual({ type: 'json_object' });
    expect(sent.messages.map((m) => m.role)).toEqual(['system', 'user']);
  });

  it('accepts a plain JSON completion when the server does not stream', async () => {
    const content = '{"summary":"Plain.","takeaways":["a"],"tags":["b"]}';
    const fetchImpl = vi.fn<FetchLike>(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = createOpenAiProvider({ config: configFor('ollama'), apiKey: '', fetchImpl });
    const result = await provider.generate({
      title: 'T',
      url: '',
      text: 'x',
      locale: 'en',
      instructions: '',
      signal: signal(),
      onPartial: () => undefined,
    });
    expect(result.summary).toBe('Plain.');
  });

  it('retries without response_format when the server refuses it', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(new Response('{"error":"response_format is not supported"}', { status: 400 }))
      .mockResolvedValueOnce(
        sseResponse([deltaEvent('{"summary":"Retried.","takeaways":["x"],"tags":["y"]}'), 'data: [DONE]\n\n']),
      );
    const provider = createOpenAiProvider({ config: configFor('ollama'), apiKey: '', fetchImpl });
    const result = await provider.generate({
      title: 'T',
      url: '',
      text: 'x',
      locale: 'en',
      instructions: '',
      signal: signal(),
      onPartial: () => undefined,
    });
    expect(result.summary).toBe('Retried.');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const second = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body)) as Record<string, unknown>;
    expect(second.response_format).toBeUndefined();
  });

  it('surfaces an HTTP error status for diagnosis', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => new Response('bad key', { status: 401 }));
    const provider = createOpenAiProvider({ config: configFor('ollama'), apiKey: '', fetchImpl });
    await expect(
      provider.generate({
        title: 'T',
        url: '',
        text: 'x',
        locale: 'en',
        instructions: '',
        signal: signal(),
        onPartial: () => undefined,
      }),
    ).rejects.toEqual(expect.objectContaining({ status: 401 }));
    await expect(testConnection({ config: configFor('ollama'), apiKey: '', fetchImpl }, signal())).rejects.toBeInstanceOf(AiHttpError);
  });
});
