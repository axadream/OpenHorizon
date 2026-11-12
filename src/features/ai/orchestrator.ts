import type { Article, Settings } from '@/db/schema';
import { playChime } from '@/features/audio/chimes';
import { getAllSettings } from '@/features/settings/settings';
import { getLocale, t } from '@/i18n/i18n';
import { toast } from '@/lib/toast';
import { startActivity } from '@/store/activityStore';
import { prepareArticleText } from './articleText';
import { buildAiCache, isAiCacheValid, writeAiCache } from './cache';
import { resolveAiConfig, type AiConfigIssue } from './config';
import { getApiKey } from './apiKey';
import { AiConsentRequiredError, AiFlowError, isAbortError, type AiErrorKey } from './errors';
import { diagnoseNow } from './openAiContext';
import { chromeBuiltinProvider, getChromeAiSupport } from './providers/chromeBuiltin';
import { heuristicProvider } from './providers/heuristic';
import { createOpenAiProvider } from './providers/openAiCompatible';
import { isOnDeviceModelSupported, onDeviceModelProvider } from './providers/wllama';
import type { AiProvider, DraftPatch, ProviderResult } from './types';

/*
 * Runs one article summary: cache check, provider choice, generation, cache write. Page only and
 * loaded lazily from the reader. Activity bar and chimes are handled here so every caller gets them.
 */

export type SummaryArticle = Pick<Article, 'id' | 'title' | 'link' | 'summary' | 'contentRaw' | 'fullContent' | 'ai'>;

export interface SummaryRun {
  result: ProviderResult;
  /** True when the result came from the article's cache (no request was made). */
  cached: boolean;
  /** When the result was generated (epoch ms). */
  at: number;
  truncated: boolean;
}

export interface RunOptions {
  /** Ignore the cache and generate again. */
  fresh?: boolean;
  signal: AbortSignal;
  onPartial(patch: DraftPatch): void;
}

function pageProtocol(): string {
  return typeof location !== 'undefined' ? location.protocol : 'https:';
}

const ISSUE_ERROR: Record<Exclude<AiConfigIssue, 'mixed'>, AiErrorKey> = {
  baseUrl: 'ai.err.notConfigured',
  model: 'ai.err.notConfigured',
  key: 'ai.err.noKey',
};

/** Settings-derived readiness, used by the reader button (true when the panel may open). */
export async function isAiReady(): Promise<boolean> {
  const s = await getAllSettings();
  if (s.aiProvider === 'chrome-builtin' || s.aiProvider === 'auto') return true;
  const apiKey = await getApiKey();
  const { config, issues } = resolveAiConfig(
    {
      provider: s.aiProvider,
      baseUrl: s.aiProvider === 'openrouter' ? '' : s.aiBaseUrl,
      model: s.aiProvider === 'openrouter' ? s.aiOpenRouterModel : s.aiModel,
      hasKey: apiKey !== '',
    },
    pageProtocol(),
  );
  // A mixed-content address still opens the panel, so the user sees the explanation there.
  return config !== null && issues.every((issue) => issue === 'mixed');
}

/** The on-device engine in use: 'chrome' (built-in), 'wllama' (opt-in model) or 'heuristic' (offline). */
export type OnDeviceEngine = 'chrome' | 'wllama' | 'heuristic';

/** Tier 1 Chrome built-in when available; tier 2 wllama when opted in; tier 3 heuristic. */
export async function resolveOnDeviceEngine(opts: { onDeviceModel: boolean }): Promise<OnDeviceEngine> {
  if ((await getChromeAiSupport()).summarizer !== 'unavailable') return 'chrome';
  if (opts.onDeviceModel && isOnDeviceModelSupported()) return 'wllama';
  return 'heuristic';
}

/** The engine 'auto' uses: Chrome built-in, then the signed-in cloud service, then the on-device fallbacks. */
export type AutoEngine = 'chrome' | 'openrouter' | 'wllama' | 'heuristic';

/** Pure order of the auto engines. signedIn means a signed-in service with a key is ready (the caller checks). */
export async function resolveAutoEngine(opts: { onDeviceModel: boolean; signedIn: boolean }): Promise<AutoEngine> {
  if ((await getChromeAiSupport()).summarizer !== 'unavailable') return 'chrome';
  if (opts.signedIn) return 'openrouter';
  if (opts.onDeviceModel && isOnDeviceModelSupported()) return 'wllama';
  return 'heuristic';
}

/**
 * Wraps the signed-in cloud provider for auto mode: when the service fails (network, quota, server), the
 * user gets the offline heuristic result instead of an error, and the reason is shown as a toast.
 * Consent and cancellation still propagate.
 */
function withOfflineFallback(provider: AiProvider): AiProvider {
  return {
    id: provider.id,
    privacy: provider.privacy,
    async generate(input) {
      try {
        return await provider.generate(input);
      } catch (err) {
        if (isAbortError(err) || err instanceof AiConsentRequiredError) throw err;
        const diagnosis = await diagnoseNow(err);
        toast.error(t('ai.failed'), { description: diagnosis ? t(diagnosis.key, diagnosis.params) : undefined });
        const result = await heuristicProvider.generate(input);
        return { ...result, notes: [...result.notes, 'ai.note.cloudFailed'] };
      }
    },
  };
}

/**
 * The provider for the current settings. Throws AiFlowError when a cloud or local provider is not set up.
 * auto: Chrome built-in when the browser has it, then the signed-in cloud service, then the on-device
 * fallbacks. Any other value is the user's manual choice and is used as is.
 */
export async function chooseProvider(
  s: Pick<Settings, 'aiProvider' | 'aiBaseUrl' | 'aiModel' | 'aiOnDeviceModel' | 'aiSignedInProvider' | 'aiOpenRouterModel'>,
): Promise<AiProvider> {
  if (s.aiProvider === 'chrome-builtin') {
    const engine = await resolveOnDeviceEngine({ onDeviceModel: s.aiOnDeviceModel });
    if (engine === 'chrome') return chromeBuiltinProvider;
    return engine === 'wllama' ? onDeviceModelProvider : heuristicProvider;
  }
  if (s.aiProvider === 'auto') {
    const autoKey = await getApiKey();
    const signedIn = s.aiSignedInProvider === 'openrouter' && autoKey !== '';
    const engine = await resolveAutoEngine({ onDeviceModel: s.aiOnDeviceModel, signedIn });
    if (engine === 'chrome') return chromeBuiltinProvider;
    if (engine === 'openrouter') {
      const { config, issues } = resolveAiConfig(
        { provider: 'openrouter', baseUrl: '', model: s.aiOpenRouterModel, hasKey: true },
        pageProtocol(),
      );
      if (config && !issues.includes('model')) return withOfflineFallback(createOpenAiProvider({ config, apiKey: autoKey }));
    }
    const onDevice = await resolveAutoEngine({ onDeviceModel: s.aiOnDeviceModel, signedIn: false });
    return onDevice === 'wllama' ? onDeviceModelProvider : heuristicProvider;
  }
  const apiKey = await getApiKey();
  // The OpenRouter model and address come from their own settings, so an old custom address never receives the key.
  const { config, issues } = resolveAiConfig(
    {
      provider: s.aiProvider,
      baseUrl: s.aiProvider === 'openrouter' ? '' : s.aiBaseUrl,
      model: s.aiProvider === 'openrouter' ? s.aiOpenRouterModel : s.aiModel,
      hasKey: apiKey !== '',
    },
    pageProtocol(),
  );
  if (issues.includes('key')) throw new AiFlowError('ai.err.noKey');
  if (issues.includes('mixed') && config) throw new AiFlowError('ai.err.mixed', { host: config.host });
  if (!config) throw new AiFlowError('ai.err.notConfigured');
  const blocking = issues.find((issue): issue is Exclude<AiConfigIssue, 'mixed'> => issue !== 'mixed');
  if (blocking) throw new AiFlowError(ISSUE_ERROR[blocking]);
  return createOpenAiProvider({ config, apiKey });
}

/** Summarise one article, reusing its cached result when the text and the UI language are unchanged. */
export async function runArticleSummary(article: SummaryArticle, opts: RunOptions): Promise<SummaryRun> {
  const locale = getLocale();
  const prepared = prepareArticleText(article);
  if (!prepared.body) throw new AiFlowError('ai.err.generic');

  const cached = article.ai;
  if (cached && !opts.fresh && isAiCacheValid(cached, prepared.hash, locale)) {
    return {
      result: {
        summary: cached.summary,
        takeaways: cached.takeaways,
        tags: cached.tags,
        provider: cached.provider as ProviderResult['provider'],
        model: cached.model,
        privacy: cached.privacy,
        notes: [],
      },
      cached: true,
      at: cached.at,
      truncated: prepared.truncated,
    };
  }

  const settings = await getAllSettings();
  const provider = await chooseProvider(settings);
  const instructions = settings.aiInstructions.trim() || t('ai.defaultInstructions');
  const activity = startActivity({ label: t('ai.generating'), total: null });
  try {
    const result = await provider.generate({
      title: article.title,
      url: article.link,
      text: prepared.body,
      locale,
      instructions,
      signal: opts.signal,
      onPartial: opts.onPartial,
    });
    const at = Date.now();
    if (result.summary || result.takeaways.length > 0) {
      await writeAiCache(article.id, buildAiCache(result, prepared.hash, locale, at));
    }
    activity.complete(t('ai.done'));
    void playChime('done');
    return { result, cached: false, at, truncated: prepared.truncated };
  } catch (err) {
    if (isAbortError(err)) {
      activity.complete(t('ai.cancelled'));
    } else {
      activity.fail(t('ai.failed'));
      void playChime('error');
    }
    throw err;
  }
}
