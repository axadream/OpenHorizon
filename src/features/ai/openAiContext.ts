import { getAllSettings } from '@/features/settings/settings';
import { getApiKey } from './apiKey';
import { resolveAiConfig } from './config';
import { AiFlowError, diagnoseAiError, type Diagnosis } from './errors';
import { getPreset } from './presets';
import type { OpenAiContext } from './providers/openAiCompatible';

/*
 * Request context from the saved settings, for the Settings actions (fetch models, test connection).
 * Throws AiFlowError with a user-facing key when the saved setup cannot make a request.
 */

export async function loadOpenAiContext(options: { needModel: boolean }): Promise<OpenAiContext> {
  const s = await getAllSettings();
  if (s.aiProvider === 'chrome-builtin') throw new AiFlowError('ai.err.notConfigured');
  const apiKey = await getApiKey();
  const { config, issues } = resolveAiConfig(
    { provider: s.aiProvider, baseUrl: s.aiBaseUrl, model: s.aiModel, hasKey: apiKey !== '' },
    location.protocol,
  );
  if (!config) throw new AiFlowError('ai.err.notConfigured');
  if (issues.includes('mixed')) throw new AiFlowError('ai.err.mixed', { host: config.host });
  if (issues.includes('key')) throw new AiFlowError('ai.err.noKey');
  if (options.needModel && issues.includes('model')) throw new AiFlowError('ai.err.notConfigured');
  return { config, apiKey };
}

/** Friendly diagnosis of an error, using the saved provider and the page's origin and connectivity. */
export async function diagnoseNow(err: unknown): Promise<Diagnosis | null> {
  const s = await getAllSettings();
  return diagnoseAiError(err, {
    provider: s.aiProvider,
    baseUrl: s.aiBaseUrl || getPreset(s.aiProvider).baseUrl,
    pageOrigin: location.origin,
    pageProtocol: location.protocol,
    online: navigator.onLine,
  });
}
