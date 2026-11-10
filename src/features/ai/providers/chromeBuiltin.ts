import { t } from '@/i18n/i18n';
import type { Locale } from '@/i18n/types';
import { startActivity, type ActivityHandle } from '@/store/activityStore';
import { buildTagPrompt } from '../buildPrompt';
import { extractKeywords, keySentences, leadSummary } from '../heuristic';
import { AiFlowError } from '../errors';
import { parseBullets, parseTagList, plainModelText } from '../parseAiJson';
import type { AiAvailability, AiNoteKey, AiProvider, GenerateInput, ProviderResult } from '../types';
import {
  chromeAiGlobals,
  type ChromeModelMonitor,
  type SummarizerApi,
  type SummarizerCreateOptions,
  type SummarizerSession,
} from './chromeTypes';

/*
 * Chrome built-in AI: Summarizer API (tldr for the summary, key-points for the takeaways) and, when
 * it is already available, the Prompt API for tags. Everything is feature-detected. Output language
 * is restricted to what the browser supports; otherwise English is used and the result says so.
 */

/** Output languages the built-in summarizer accepts. */
export const CHROME_OUTPUT_LANGUAGES = ['en', 'es', 'ja'] as const;

/** Map the Chrome availability values (including the older names) to the four states used here. */
export function mapAvailability(raw: unknown): AiAvailability {
  switch (raw) {
    case 'available':
    case 'readily':
      return 'available';
    case 'downloadable':
    case 'after-download':
      return 'downloadable';
    case 'downloading':
      return 'downloading';
    default:
      return 'unavailable';
  }
}

async function availabilityOf(query: (() => Promise<string>) | undefined): Promise<AiAvailability> {
  if (!query) return 'unavailable';
  try {
    return mapAvailability(await query());
  } catch {
    return 'unavailable';
  }
}

export interface ChromeAiSupport {
  summarizer: AiAvailability;
  prompt: AiAvailability;
}

/** Availability of both built-in APIs. Missing APIs are 'unavailable'. */
export async function getChromeAiSupport(): Promise<ChromeAiSupport> {
  const api = chromeAiGlobals();
  const summarizerApi = api.Summarizer;
  const promptApi = api.LanguageModel;
  const [summarizer, prompt] = await Promise.all([
    availabilityOf(summarizerApi ? () => summarizerApi.availability({ outputLanguage: 'en' }) : undefined),
    availabilityOf(promptApi ? () => promptApi.availability() : undefined),
  ]);
  return { summarizer, prompt };
}

/** The output language to ask for, and whether it differs from the interface language. */
export function outputLanguageFor(locale: Locale): { language: string; fellBack: boolean } {
  return (CHROME_OUTPUT_LANGUAGES as readonly string[]).includes(locale)
    ? { language: locale, fellBack: false }
    : { language: 'en', fellBack: true };
}

function abortError(): DOMException {
  return new DOMException('The summary was cancelled.', 'AbortError');
}

/**
 * Create a summarizer or language session. A download (monitor 'downloadprogress') is shown in the
 * global activity bar. Creation failures propagate to the caller.
 */
async function createSession(
  api: SummarizerApi,
  options: Omit<SummarizerCreateOptions, 'monitor'>,
  label: string,
): Promise<SummarizerSession> {
  const progress: { handle?: ActivityHandle } = {};
  const monitor = (m: ChromeModelMonitor): void => {
    m.addEventListener('downloadprogress', (e) => {
      const pct = e.loaded <= 1 ? Math.round(e.loaded * 100) : Math.round(e.loaded);
      progress.handle ??= startActivity({ label, total: 100 });
      progress.handle.update(Math.min(100, Math.max(0, pct)), 100);
    });
  };
  try {
    const session = await api.create({ ...options, monitor });
    progress.handle?.complete();
    return session;
  } catch (err) {
    progress.handle?.fail(t('ai.failed'));
    throw err;
  }
}

/**
 * Read a streamed summary. Chunks may be cumulative (each one the whole text so far) or deltas; both
 * are accepted. onText receives the text so far after every chunk.
 */
async function readChunks(
  stream: ReadableStream<string> | AsyncIterable<string>,
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<string> {
  const state = { text: '' };
  const add = (chunk: string): void => {
    if (signal.aborted) throw abortError();
    state.text = state.text !== '' && chunk.startsWith(state.text) ? chunk : state.text + chunk;
    onText(state.text);
  };
  if ('getReader' in stream) {
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      add(value);
    }
  } else {
    for await (const chunk of stream) add(chunk);
  }
  return state.text;
}

async function summarizeWith(
  api: SummarizerApi,
  type: 'tldr' | 'key-points',
  input: GenerateInput,
  language: string,
  onText?: (text: string) => void,
): Promise<string> {
  if (input.signal.aborted) throw abortError();
  const session = await createSession(
    api,
    { type, format: 'markdown', length: 'medium', sharedContext: input.instructions, outputLanguage: language },
    t('ai.downloadingModel'),
  );
  try {
    if (session.summarizeStreaming) {
      return await readChunks(session.summarizeStreaming(input.text, { context: input.instructions }), input.signal, (text) =>
        onText?.(plainModelText(text)),
      );
    }
    return await session.summarize(input.text, { context: input.instructions });
  } finally {
    session.destroy();
  }
}

/** Tags from the Prompt API when it is ready; otherwise the offline keyword heuristic. */
async function tagsFor(input: GenerateInput, language: string): Promise<{ tags: string[]; heuristic: boolean }> {
  const api = chromeAiGlobals().LanguageModel;
  if (api && (await availabilityOf(() => api.availability({ outputLanguage: language }))) === 'available') {
    try {
      const prompt = buildTagPrompt(input.text, input.locale);
      const session = await api.create({
        initialPrompts: [{ role: 'system', content: prompt.system }],
        outputLanguage: language,
      });
      try {
        const tags = parseTagList(await session.prompt(prompt.user));
        if (tags.length > 0) return { tags, heuristic: false };
      } finally {
        session.destroy();
      }
    } catch {
      // Fall through to the heuristic: a failed tag call should not fail the whole summary.
    }
  }
  return { tags: extractKeywords(input.text, input.locale, 5), heuristic: true };
}

export const chromeBuiltinProvider: AiProvider = {
  id: 'chrome-builtin',
  privacy: 'on-device',

  async generate(input: GenerateInput): Promise<ProviderResult> {
    const api = chromeAiGlobals().Summarizer;
    if (!api) throw new AiFlowError('ai.err.chrome');
    const { language, fellBack } = outputLanguageFor(input.locale);
    const notes: AiNoteKey[] = fellBack ? ['ai.note.englishOutput'] : [];

    let summary = plainModelText(await summarizeWith(api, 'tldr', input, language, (text) => input.onPartial({ summary: text })));
    if (!summary) summary = leadSummary(input.text, input.locale, 3);

    let takeaways = parseBullets(await summarizeWith(api, 'key-points', input, language));
    if (takeaways.length === 0) takeaways = keySentences(input.text, input.locale, 3);

    const tagged = await tagsFor(input, language);
    if (tagged.heuristic) notes.push('ai.note.heuristicTags');

    input.onPartial({ summary, takeaways, tags: tagged.tags });
    return {
      summary,
      takeaways,
      tags: tagged.tags,
      provider: 'chrome-builtin',
      model: 'Summarizer API',
      privacy: 'on-device',
      notes,
    };
  },
};

/**
 * Settings: start the model download. Must run from a user gesture (a button click). Returns the
 * availability afterwards.
 */
export async function downloadChromeModel(): Promise<AiAvailability> {
  const api = chromeAiGlobals().Summarizer;
  if (!api) return 'unavailable';
  const session = await createSession(api, { type: 'tldr', format: 'markdown', length: 'medium', outputLanguage: 'en' }, t('ai.downloadingModel'));
  session.destroy();
  return (await getChromeAiSupport()).summarizer;
}
