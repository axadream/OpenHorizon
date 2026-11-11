import { t } from '@/i18n/i18n';
import { startActivity, type ActivityHandle } from '@/store/activityStore';
import { extractKeywords, keySentences, leadSummary } from '../heuristic';
import { AiFlowError, isAbortError } from '../errors';
import type { AiProvider, GenerateInput, ProviderResult } from '../types';
import { heuristicProvider } from './heuristic';

/*
 * Tier 2 on-device engine: SmolLM2 360M Instruct (Q4_K_M GGUF, Apache-2.0) run by wllama, which is
 * llama.cpp compiled to WebAssembly (MIT). The library is loaded from a CDN and the model is fetched
 * only after the user asks for it. Generation runs in the library's own Web Worker, so the page stays
 * responsive. Nothing is sent to a server during generation; the library keeps the model in its cache.
 */

export const WLLAMA_CDN = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.13.0/esm/index.js';
export const WLLAMA_WASM_CDN = 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.13.0/esm/wasm-from-cdn.js';
export const ON_DEVICE_MODEL_URL =
  'https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf';
export const ON_DEVICE_MODEL_NAME = 'SmolLM2-360M-Instruct (Q4_K_M)';
/** Approximate download size, shown in the settings hint. */
export const ON_DEVICE_MODEL_SIZE_LABEL = '270 MB';

/** Part of the model's file name, used to recognise it in the library's cache listing. */
const MODEL_CACHE_MARKER = 'SmolLM2-360M-Instruct-Q4_K_M';
/** Context window requested when loading the model. */
const CONTEXT_TOKENS = 1536;
const MAX_NEW_TOKENS = 120;
/** About 800 tokens of article text; the rest of the context is left for the prompt and the answer. */
const MAX_INPUT_CHARS = 3200;
const MAX_TAKEAWAYS = 3;
const PROMPT = 'Summarize this news article in 3 short bullet points. Use only the provided text.';
/** A leading bullet or number of a model answer line ("- ", "* ", "• ", "1. ", "2) "). */
const BULLET = /^\s*(?:[-*•]|\d+[.)])\s*/;

export interface WllamaProgress {
  loaded: number;
  total: number;
}

export interface WllamaLoadConfig {
  n_ctx?: number;
  n_threads?: number;
  progressCallback?: (progress: WllamaProgress) => void;
  useCache?: boolean;
}

export interface WllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface WllamaChatRequest {
  messages: WllamaChatMessage[];
  max_tokens?: number;
  temperature?: number;
  abortSignal?: AbortSignal;
}

export interface WllamaChatResponse {
  choices: Array<{ message: { content: string }; finish_reason?: string | null }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export interface WllamaCacheEntry {
  name: string;
  metadata?: { originalURL?: string };
}

export interface WllamaInstance {
  loadModelFromUrl(url: string, config?: WllamaLoadConfig): Promise<void>;
  createChatCompletion(request: WllamaChatRequest): Promise<WllamaChatResponse>;
  exit(): Promise<void>;
  cacheManager: { list(): Promise<WllamaCacheEntry[]> };
}

export interface WllamaConfig {
  allowOffline?: boolean;
  parallelDownloads?: number;
  suppressNativeLog?: boolean;
}

export interface WllamaModule {
  Wllama: new (paths: Record<string, string>, config?: WllamaConfig) => WllamaInstance;
}

/** The two modules the engine needs: the library and the WebAssembly asset paths. */
export interface WllamaLibrary {
  wllama: WllamaModule;
  paths: Record<string, string>;
}

/** WebAssembly and Worker are both needed: the model runs in a Web Worker. */
export function isOnDeviceModelSupported(): boolean {
  return typeof WebAssembly === 'object' && typeof Worker === 'function';
}

function abortError(): DOMException {
  return new DOMException('The summary was cancelled.', 'AbortError');
}

async function importLibrary(): Promise<WllamaLibrary> {
  const wllama = (await import(/* @vite-ignore */ WLLAMA_CDN)) as WllamaModule;
  const wasm = (await import(/* @vite-ignore */ WLLAMA_WASM_CDN)) as { default: Record<string, string> };
  return { wllama, paths: wasm.default };
}

/** Replaceable for tests. The default fetches the library from the CDN. */
let libraryLoader: () => Promise<WllamaLibrary> = importLibrary;
let libraryPromise: Promise<WllamaLibrary> | null = null;

/** Load the library once. A failure clears the memo so the next call retries. */
function loadLibrary(): Promise<WllamaLibrary> {
  libraryPromise ??= (async (): Promise<WllamaLibrary> => libraryLoader())().catch(() => {
    libraryPromise = null;
    throw new AiFlowError('ai.err.onDeviceModel');
  });
  return libraryPromise;
}

/** Stops a worker and frees its memory. Best effort: a failure here must not hide the real error. */
async function releaseInstance(instance: WllamaInstance | null): Promise<void> {
  if (!instance) return;
  try {
    await instance.exit();
  } catch {
    // Nothing more to do: the worker is gone or was never started.
  }
}

/**
 * True when the model file is already in the library's cache. Creates a short-lived instance only to
 * read the cache listing; the model is never loaded for this check. False on any error.
 */
export async function isOnDeviceModelCached(): Promise<boolean> {
  if (!isOnDeviceModelSupported()) return false;
  let probe: WllamaInstance | null = null;
  try {
    const { wllama, paths } = await loadLibrary();
    probe = new wllama.Wllama(paths, { allowOffline: true, suppressNativeLog: true });
    const entries = await probe.cacheManager.list();
    return entries.some(
      (entry) => entry.name.includes(MODEL_CACHE_MARKER) || (entry.metadata?.originalURL ?? '').includes(MODEL_CACHE_MARKER),
    );
  } catch {
    return false;
  } finally {
    await releaseInstance(probe);
  }
}

let modelPromise: Promise<WllamaInstance> | null = null;
let readyModel: WllamaInstance | null = null;

/**
 * The loaded model, created once. onProgress receives whole percentages while the first load runs.
 * A failure frees the worker, clears the memo and throws AiFlowError('ai.err.onDeviceModel'). The next
 * call retries: the library's cache keeps files that finished downloading, but a partial download
 * starts again from the beginning.
 */
export function loadOnDeviceModel(onProgress?: (percent: number) => void): Promise<WllamaInstance> {
  modelPromise ??= (async (): Promise<WllamaInstance> => {
    let instance: WllamaInstance | null = null;
    try {
      const { wllama, paths } = await loadLibrary();
      instance = new wllama.Wllama(paths, { allowOffline: true, suppressNativeLog: true });
      await instance.loadModelFromUrl(ON_DEVICE_MODEL_URL, {
        n_ctx: CONTEXT_TOKENS,
        progressCallback: ({ loaded, total }) => onProgress?.(total > 0 ? Math.round((loaded / total) * 100) : 0),
      });
      readyModel = instance;
      return instance;
    } catch {
      await releaseInstance(instance);
      modelPromise = null;
      throw new AiFlowError('ai.err.onDeviceModel');
    }
  })();
  return modelPromise;
}

/** Load the model behind a progress activity in the global activity bar. */
async function loadWithActivity(): Promise<WllamaInstance> {
  const activity: ActivityHandle = startActivity({ label: t('ai.onDeviceModelLoading'), total: 100 });
  try {
    const model = await loadOnDeviceModel((percent) => activity.update(percent, 100));
    activity.complete();
    return model;
  } catch (err) {
    activity.fail(t('ai.failed'));
    throw err;
  }
}

/** Settings: download and prepare the model. Shows the progress activity; rejects on failure. */
export async function downloadOnDeviceModel(): Promise<void> {
  if (readyModel) return;
  await loadWithActivity();
}

/** One bullet per line, markers removed, empty lines dropped. */
function parseLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(BULLET, '').trim())
    .filter((line) => line.length > 0);
}

function buildResult(input: GenerateInput, content: string): ProviderResult {
  const lines = parseLines(content);
  const takeaways = lines.length > 0 ? lines.slice(0, MAX_TAKEAWAYS) : keySentences(input.text, input.locale, MAX_TAKEAWAYS);
  const summary = lines.length > 0 ? lines.join(' ') : leadSummary(input.text, input.locale, 3);
  const tags = extractKeywords(input.text, input.locale, 5);

  input.onPartial({ summary, takeaways, tags });
  return {
    summary,
    takeaways,
    tags,
    provider: 'wllama',
    model: ON_DEVICE_MODEL_NAME,
    privacy: 'on-device',
    notes: ['ai.note.onDeviceEnglish', 'ai.note.heuristicTags'],
  };
}

export const onDeviceModelProvider: AiProvider = {
  id: 'wllama',
  privacy: 'on-device',

  async generate(input: GenerateInput): Promise<ProviderResult> {
    if (input.signal.aborted) throw abortError();
    try {
      const model = readyModel ?? (await loadWithActivity());
      if (input.signal.aborted) throw abortError();

      const response = await model.createChatCompletion({
        messages: [{ role: 'user', content: `${PROMPT}\n\n${input.text.slice(0, MAX_INPUT_CHARS)}` }],
        max_tokens: MAX_NEW_TOKENS,
        temperature: 0.2,
        abortSignal: input.signal,
      });
      if (input.signal.aborted) throw abortError();

      return buildResult(input, response.choices[0]?.message.content ?? '');
    } catch (err) {
      // A cancelled summary is not an error. Anything else (load failure, out of memory in the
      // worker, malformed output) falls back to the offline result so the reader never gets stuck.
      if (input.signal.aborted) throw abortError();
      if (isAbortError(err)) throw err;
      const fallback = await heuristicProvider.generate(input);
      return { ...fallback, notes: ['ai.note.onDeviceFailed', ...fallback.notes] };
    }
  },
};

/** Test seam: replace the library loader and clear the memos. Pass null to restore the CDN loader. */
export function __setModuleLoaderForTests(loader: (() => Promise<WllamaLibrary>) | null): void {
  libraryLoader = loader ?? importLibrary;
  libraryPromise = null;
  modelPromise = null;
  readyModel = null;
}
