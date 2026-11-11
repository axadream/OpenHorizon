import type { AiProviderId } from '@/db/schema';
import type { Diagnosis } from '@/features/ai/errors';
import type { OnDeviceEngine } from '@/features/ai/orchestrator';
import type { AiAvailability, AiPrivacy, ProviderId } from '@/features/ai/types';
import { t, type TranslationKey } from '@/i18n/i18n';

/* Message keys for AI enums. Literal keys so the typed translator checks every one. */

/** Translated text of a diagnosis (friendly error). */
export function diagnosisText(d: Diagnosis): string {
  return t(d.key, d.params);
}

export const PROVIDER_KEY: Record<AiProviderId, TranslationKey> = {
  'chrome-builtin': 'ai.provider.chrome-builtin',
  ollama: 'ai.provider.ollama',
  lmstudio: 'ai.provider.lmstudio',
  openai: 'ai.provider.openai',
  mistral: 'ai.provider.mistral',
  deepseek: 'ai.provider.deepseek',
  gemini: 'ai.provider.gemini',
  custom: 'ai.provider.custom',
};

export const PROVIDER_ID_KEY: Record<ProviderId, TranslationKey> = {
  ...PROVIDER_KEY,
  wllama: 'ai.provider.wllama',
  heuristic: 'ai.provider.heuristic',
};

export const ENGINE_KEY: Record<OnDeviceEngine, TranslationKey> = {
  chrome: 'ai.engine.chrome',
  wllama: 'ai.engine.wllama',
  heuristic: 'ai.engine.heuristic',
};

export const PRIVACY_KEY: Record<AiPrivacy, TranslationKey> = {
  'on-device': 'ai.privacy.on-device',
  local: 'ai.privacy.local',
  cloud: 'ai.privacy.cloud',
};

export const PRIVACY_HINT_KEY: Record<AiPrivacy, TranslationKey> = {
  'on-device': 'ai.privacyHint.on-device',
  local: 'ai.privacyHint.local',
  cloud: 'ai.privacyHint.cloud',
};

export const AVAILABILITY_KEY: Record<AiAvailability, TranslationKey> = {
  available: 'ai.status.available',
  downloadable: 'ai.status.downloadable',
  downloading: 'ai.status.downloading',
  unavailable: 'ai.status.unavailable',
};
