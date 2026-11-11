import { t } from '@/i18n/i18n';
import { startActivity, type ActivityHandle } from '@/store/activityStore';
import { extractKeywords, keySentences, leadSummary } from '../heuristic';
import { AiFlowError } from '../errors';
import type { AiProvider, GenerateInput, ProviderResult } from '../types';

/*
 * Tier 2 on-device engine: a small summarization model run by Transformers.js in this browser (WebGPU
 * when available, WebAssembly otherwise). Used only when the user has opted in and the browser has no
 * built-in Summarizer. The library is loaded from a CDN on first use, and the model files are kept in
 * the browser Cache API by the library itself. Nothing is sent to a server during generation.
 */

export const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.1';
export const TRANSFORMERS_MODEL = 'Xenova/distilbart-cnn-6-6';
/** Approximate download size, shown in the settings hint. */
export const TRANSFORMERS_MODEL_SIZE_LABEL = '250 MB';

const CACHE_NAME = 'transformers-cache';
/** The model reads at most about 1024 tokens; 4000 characters stays within that. */
const MAX_INPUT_CHARS = 4000;

export interface TransformersProgress {
  status: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

export type SummarizationPipeline = (
  text: string,
  opts: { max_new_tokens: number; min_new_tokens?: number },
) => Promise<Array<{ summary_text: string }>>;

export interface TransformersModule {
  env: { allowLocalModels: boolean; useBrowserCache: boolean };
  pipeline(
    task: 'summarization',
    model: string,
    options: {
      dtype?: string;
      device?: 'webgpu' | 'wasm';
      progress_callback?: (p: TransformersProgress) => void;
    },
  ): Promise<SummarizationPipeline>;
}

/** WebAssembly is the floor for the on-device model. */
export function isTransformersSupported(): boolean {
  return typeof WebAssembly === 'object';
}

/** True when the model files are already in the Transformers.js cache. False on any error. */
export async function isTransformersModelCached(): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false;
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();
    return keys.some((request) => request.url.includes(TRANSFORMERS_MODEL));
  } catch {
    return false;
  }
}

function abortError(): DOMException {
  return new DOMException('The summary was cancelled.', 'AbortError');
}

let modulePromise: Promise<TransformersModule> | null = null;

/** Load the library from the CDN once. A failure clears the memo so the next call retries. */
function loadModule(): Promise<TransformersModule> {
  modulePromise ??= (async (): Promise<TransformersModule> => {
    try {
      return (await import(/* @vite-ignore */ TRANSFORMERS_CDN)) as TransformersModule;
    } catch {
      modulePromise = null;
      throw new AiFlowError('ai.err.transformers');
    }
  })();
  return modulePromise;
}

let summarizerPromise: Promise<SummarizationPipeline> | null = null;
let readySummarizer: SummarizationPipeline | null = null;

async function createSummarizer(onProgress?: (percent: number | null) => void): Promise<SummarizationPipeline> {
  const mod = await loadModule();
  mod.env.allowLocalModels = false;
  mod.env.useBrowserCache = true;
  const progress_callback = (p: TransformersProgress): void => {
    if (!onProgress) return;
    if (p.status === 'progress' && typeof p.progress === 'number') onProgress(Math.round(p.progress));
    else if (p.status === 'ready') onProgress(100);
  };
  const device: 'webgpu' | 'wasm' = 'gpu' in navigator ? 'webgpu' : 'wasm';
  try {
    return await mod.pipeline('summarization', TRANSFORMERS_MODEL, { dtype: 'q8', device, progress_callback });
  } catch (err) {
    if (device !== 'webgpu') throw err;
    // WebGPU can fail on some devices even when the API exists; one retry on WebAssembly.
    return mod.pipeline('summarization', TRANSFORMERS_MODEL, { dtype: 'q8', device: 'wasm', progress_callback });
  }
}

/**
 * The summarization pipeline, created once. onProgress only receives updates while the first load runs.
 * A failure clears the memo and throws AiFlowError('ai.err.transformers').
 */
export function loadSummarizer(onProgress?: (percent: number | null) => void): Promise<SummarizationPipeline> {
  summarizerPromise ??= createSummarizer(onProgress).then(
    (pipe) => {
      readySummarizer = pipe;
      return pipe;
    },
    () => {
      summarizerPromise = null;
      throw new AiFlowError('ai.err.transformers');
    },
  );
  return summarizerPromise;
}

/** Load the pipeline behind a progress activity in the global activity bar. */
async function loadWithActivity(): Promise<SummarizationPipeline> {
  const activity: ActivityHandle = startActivity({ label: t('ai.onDeviceModelLoading'), total: 100 });
  try {
    const pipe = await loadSummarizer((percent) => {
      if (percent !== null) activity.update(percent, 100);
    });
    activity.complete();
    return pipe;
  } catch (err) {
    activity.fail(t('ai.failed'));
    throw err;
  }
}

/** Settings: download and prepare the model. Shows the progress activity; rejects on failure. */
export async function downloadTransformersModel(): Promise<void> {
  await (readySummarizer ?? loadWithActivity());
}

export const transformersProvider: AiProvider = {
  id: 'transformers',
  privacy: 'on-device',

  async generate(input: GenerateInput): Promise<ProviderResult> {
    if (input.signal.aborted) throw abortError();
    const summarizer = readySummarizer ?? (await loadWithActivity());
    if (input.signal.aborted) throw abortError();

    const out = await summarizer(input.text.slice(0, MAX_INPUT_CHARS), { max_new_tokens: 160, min_new_tokens: 40 });
    if (input.signal.aborted) throw abortError();

    let summary = (out[0]?.summary_text ?? '').trim();
    if (!summary) summary = leadSummary(input.text, input.locale, 3);
    const takeaways = keySentences(input.text, input.locale, 3);
    const tags = extractKeywords(input.text, input.locale, 5);

    input.onPartial({ summary, takeaways, tags });
    return {
      summary,
      takeaways,
      tags,
      provider: 'transformers',
      model: TRANSFORMERS_MODEL,
      privacy: 'on-device',
      notes: ['ai.note.transformersEnglish', 'ai.note.heuristicTags'],
    };
  },
};
