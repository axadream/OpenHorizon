import type { AiProviderId } from '@/db/schema';
import { classifyEndpoint, hostOf, isMixedContent, normalizeBaseUrl } from './endpoint';
import { getPreset } from './presets';
import type { AiPrivacy } from './types';

/*
 * Provider configuration: validation and resolution from the settings values. Pure, so the same
 * rules drive the Settings form, the reader and the tests.
 */

export type AiConfigIssue = 'baseUrl' | 'model' | 'key' | 'mixed';

export interface AiConfigInput {
  provider: AiProviderId;
  /** Typed base address; '' means the preset default. */
  baseUrl: string;
  model: string;
  /** Whether an API key is available (in memory, session or remembered). The key itself is not needed here. */
  hasKey: boolean;
}

export interface ResolvedAiConfig {
  provider: AiProviderId;
  /** Normalised base address ('' for chrome-builtin). */
  baseUrl: string;
  model: string;
  privacy: AiPrivacy;
  requiresKey: boolean;
  jsonMode: boolean;
  ollamaTags: boolean;
  /** Host shown in the consent dialog ('' for chrome-builtin). */
  host: string;
  /** Key of the consent record: the provider id, or provider:host for address-classified providers. */
  consentKey: string;
  /** Article text is cut to this many characters before the request (from the preset). */
  maxInputChars?: number;
  /** Sent as max_tokens (from the preset). */
  maxOutputTokens?: number;
}

export interface AiConfigResult {
  /** Null when the base address is missing or invalid. */
  config: ResolvedAiConfig | null;
  issues: AiConfigIssue[];
}

/** Resolve settings into a config and the list of problems that stop a request (empty when ready). */
export function resolveAiConfig(input: AiConfigInput, pageProtocol: string): AiConfigResult {
  const preset = getPreset(input.provider);
  if (input.provider === 'chrome-builtin' || input.provider === 'auto') {
    return {
      config: {
        provider: input.provider,
        baseUrl: '',
        model: '',
        privacy: 'on-device',
        requiresKey: false,
        jsonMode: false,
        ollamaTags: false,
        host: '',
        consentKey: '',
      },
      issues: [],
    };
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl.trim() || preset.baseUrl);
  if (!baseUrl) return { config: null, issues: ['baseUrl'] };

  const host = hostOf(baseUrl);
  const issues: AiConfigIssue[] = [];
  if (!input.model.trim()) issues.push('model');
  if (preset.requiresKey && !input.hasKey) issues.push('key');
  if (isMixedContent(baseUrl, pageProtocol)) issues.push('mixed');

  const privacy = preset.privacyFromUrl ? classifyEndpoint(baseUrl) : preset.privacy;
  return {
    config: {
      provider: input.provider,
      baseUrl,
      model: input.model.trim(),
      privacy,
      requiresKey: preset.requiresKey,
      jsonMode: preset.jsonMode,
      ollamaTags: preset.ollamaTags,
      host,
      consentKey: preset.privacyFromUrl ? `${input.provider}:${host}` : input.provider,
      maxInputChars: preset.maxInputChars,
      maxOutputTokens: preset.maxOutputTokens,
    },
    issues,
  };
}
