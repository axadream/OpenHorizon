import type { AiProviderId } from '@/db/schema';
import type { AiPrivacy } from './types';

/** Settings order of the provider select. auto first: it is the default (Chrome built-in, then sign-in, then on-device). */
export const AI_PROVIDER_IDS: readonly AiProviderId[] = [
  'auto',
  'chrome-builtin',
  'openrouter',
  'ollama',
  'lmstudio',
  'openai',
  'mistral',
  'deepseek',
  'gemini',
  'custom',
];

export interface AiPreset {
  id: AiProviderId;
  /** Default base address ('' when the user must type one or none exists). */
  baseUrl: string;
  /**
   * Privacy when the address is fixed. Presets with privacyFromUrl are classified from the address
   * instead (a local server pointed at a remote host is cloud).
   */
  privacy: AiPrivacy;
  privacyFromUrl: boolean;
  requiresKey: boolean;
  /** Send response_format json_object (retried without it if the server refuses). */
  jsonMode: boolean;
  /** Ollama also serves its own model list at /api/tags. */
  ollamaTags: boolean;
  /** Article text is cut to this many characters before the request. Unset means no cut. */
  maxInputChars?: number;
  /** Sent as max_tokens. Unset means the server default. */
  maxOutputTokens?: number;
}

export const OPENROUTER_KEYS_URL = 'https://openrouter.ai/settings/keys';
export const OPENROUTER_HOST = 'openrouter.ai';

export const AI_PRESETS: Record<AiProviderId, AiPreset> = {
  auto: {
    id: 'auto',
    baseUrl: '',
    privacy: 'on-device',
    privacyFromUrl: false,
    requiresKey: false,
    jsonMode: false,
    ollamaTags: false,
  },
  'chrome-builtin': {
    id: 'chrome-builtin',
    baseUrl: '',
    privacy: 'on-device',
    privacyFromUrl: false,
    requiresKey: false,
    jsonMode: false,
    ollamaTags: false,
  },
  openrouter: {
    id: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    privacy: 'cloud',
    privacyFromUrl: false,
    requiresKey: true,
    jsonMode: false,
    ollamaTags: false,
    maxInputChars: 6000,
    maxOutputTokens: 400,
  },
  ollama: {
    id: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    privacy: 'local',
    privacyFromUrl: true,
    requiresKey: false,
    jsonMode: true,
    ollamaTags: true,
  },
  lmstudio: {
    id: 'lmstudio',
    baseUrl: 'http://localhost:1234/v1',
    privacy: 'local',
    privacyFromUrl: true,
    requiresKey: false,
    jsonMode: false,
    ollamaTags: false,
  },
  openai: {
    id: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    privacy: 'cloud',
    privacyFromUrl: false,
    requiresKey: true,
    jsonMode: true,
    ollamaTags: false,
  },
  mistral: {
    id: 'mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    privacy: 'cloud',
    privacyFromUrl: false,
    requiresKey: true,
    jsonMode: true,
    ollamaTags: false,
  },
  deepseek: {
    id: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    privacy: 'cloud',
    privacyFromUrl: false,
    requiresKey: true,
    jsonMode: true,
    ollamaTags: false,
  },
  gemini: {
    id: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    privacy: 'cloud',
    privacyFromUrl: false,
    requiresKey: true,
    jsonMode: true,
    ollamaTags: false,
  },
  custom: {
    id: 'custom',
    baseUrl: '',
    privacy: 'cloud',
    privacyFromUrl: true,
    requiresKey: false,
    jsonMode: false,
    ollamaTags: false,
  },
};

export function getPreset(id: AiProviderId): AiPreset {
  return AI_PRESETS[id];
}
