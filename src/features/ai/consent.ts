import { getSetting, setSetting } from '@/features/settings/settings';
import type { ResolvedAiConfig } from './config';
import { AiConsentRequiredError } from './errors';

/*
 * Cloud consent. A cloud provider needs a recorded acceptance before any request leaves the device.
 * assertCloudConsent runs before every request that could carry article text or the API key, so a
 * missing consent stops the flow before fetch is called.
 */

export type ConsentConfig = Pick<ResolvedAiConfig, 'privacy' | 'consentKey' | 'host'>;

/** True when the consent key has an accepted timestamp. */
export async function hasCloudConsent(consentKey: string): Promise<boolean> {
  const map = await getSetting('aiCloudConsent');
  return typeof map[consentKey] === 'number';
}

/** Record the acceptance for one consent key (provider id, or provider:host). */
export async function grantCloudConsent(consentKey: string): Promise<void> {
  const map = await getSetting('aiCloudConsent');
  await setSetting('aiCloudConsent', { ...map, [consentKey]: Date.now() });
}

/** Throws AiConsentRequiredError for a cloud config without consent. On-device and local configs pass. */
export async function assertCloudConsent(config: ConsentConfig): Promise<void> {
  if (config.privacy !== 'cloud') return;
  if (!(await hasCloudConsent(config.consentKey))) {
    throw new AiConsentRequiredError(config.consentKey, config.host);
  }
}
