import { useEffect, useId, useState } from 'react';
import { Download, Plug, RotateCcw } from 'lucide-react';
import { AiConsentDialog } from '@/components/ai/AiConsentDialog';
import { AVAILABILITY_KEY, diagnosisText, ENGINE_KEY, PRIVACY_HINT_KEY, PROVIDER_ID_KEY, PROVIDER_KEY } from '@/components/ai/labels';
import { PrivacyBadge } from '@/components/ai/PrivacyBadge';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import type { AiProviderId } from '@/db/schema';
import { getApiKey } from '@/features/ai/apiKey';
import { grantCloudConsent } from '@/features/ai/consent';
import { AI_PROVIDER_IDS } from '@/features/ai/presets';
import { AiConsentRequiredError } from '@/features/ai/errors';
import { resolveAiConfig } from '@/features/ai/config';
import { loadOpenAiContext, diagnoseNow } from '@/features/ai/openAiContext';
import { resolveOnDeviceEngine, type OnDeviceEngine } from '@/features/ai/orchestrator';
import { getChromeAiSupport, downloadChromeModel, type ChromeAiSupport } from '@/features/ai/providers/chromeBuiltin';
import { testConnection } from '@/features/ai/providers/openAiCompatible';
import {
  downloadOnDeviceModel,
  isOnDeviceModelCached,
  isOnDeviceModelSupported,
  ON_DEVICE_MODEL_SIZE_LABEL,
} from '@/features/ai/providers/wllama';
import type { AiPrivacy } from '@/features/ai/types';
import { useSetting } from '@/features/settings/settings';
import { t, useT } from '@/i18n/i18n';
import { toast } from '@/lib/toast';
import { AiConnectionFields, InstructionsField, type ConsentRequest } from './AiConnectionFields';
import { Row, Section, save } from './SettingsParts';

/*
 * Settings > AI summaries. Enable switch, provider with its privacy badge, endpoint and key fields for
 * OpenAI-style providers, the built-in model status for Chrome, instructions, and a connection test.
 * Cloud use always goes through the consent dialog first. Lazy-loaded from SettingsDialog.
 */

/** Privacy class and host the current provider setting would send text to. */
function currentTarget(provider: AiProviderId, baseUrl: string): { privacy: AiPrivacy; host: string } {
  if (provider === 'chrome-builtin') return { privacy: 'on-device', host: '' };
  const { config } = resolveAiConfig({ provider, baseUrl, model: 'model', hasKey: true }, location.protocol);
  return { privacy: config?.privacy ?? 'cloud', host: config?.host ?? '' };
}

interface OnDeviceState {
  support: ChromeAiSupport;
  cached: boolean;
  engine: OnDeviceEngine;
}

async function readOnDeviceState(onDeviceModel: boolean): Promise<OnDeviceState> {
  const [support, cached, engine] = await Promise.all([
    getChromeAiSupport(),
    isOnDeviceModelCached(),
    resolveOnDeviceEngine({ onDeviceModel }),
  ]);
  return { support, cached, engine };
}

/**
 * Engine in use, the browser built-in model status, and the opt-in on-device model (wllama).
 * Downloads must start from a click, so both download buttons are plain click handlers.
 */
function OnDeviceStatus() {
  useT();
  const onDeviceModel = useSetting('aiOnDeviceModel');
  const [state, setState] = useState<OnDeviceState | null>(null);
  const [revision, setRevision] = useState(0);
  const [chromeBusy, setChromeBusy] = useState(false);
  const [modelBusy, setModelBusy] = useState(false);
  const supported = isOnDeviceModelSupported();

  useEffect(() => {
    let alive = true;
    void readOnDeviceState(onDeviceModel).then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, [onDeviceModel, revision]);

  const reload = (): void => setRevision((n) => n + 1);

  const downloadChrome = async (): Promise<void> => {
    setChromeBusy(true);
    try {
      await downloadChromeModel();
    } catch (err) {
      toast.error(t('ai.failed'), { description: err instanceof Error ? err.message : undefined });
    } finally {
      setChromeBusy(false);
      reload();
    }
  };

  const enableModel = async (): Promise<void> => {
    setModelBusy(true);
    try {
      await downloadOnDeviceModel();
      save('aiOnDeviceModel', true);
    } catch (err) {
      toast.error(t('ai.failed'), { description: err instanceof Error ? err.message : undefined });
    } finally {
      setModelBusy(false);
      reload();
    }
  };

  const support = state?.support ?? null;

  return (
    <>
      {support?.summarizer === 'unavailable' ? (
        <p className="text-sm text-text-muted">{t('ai.builtinUnavailable')}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {support ? (
            <p role="status" className="text-sm text-silver">
              {t('ai.chromeStatus', { status: t(AVAILABILITY_KEY[support.summarizer]) })}
            </p>
          ) : null}
          {support?.summarizer === 'downloadable' ? (
            <Button variant="steel" size="sm" leadingIcon={Download} loading={chromeBusy} onClick={() => void downloadChrome()}>
              {t('ai.downloadModel')}
            </Button>
          ) : null}
        </div>
      )}

      {state ? (
        <Row label={t('ai.engine')}>
          <span className="text-sm text-text">{t(ENGINE_KEY[state.engine])}</span>
        </Row>
      ) : null}

      {supported ? (
        <Row label={t('ai.onDeviceModel')} hint={t('ai.onDeviceModelHint', { size: ON_DEVICE_MODEL_SIZE_LABEL })}>
          <span role="status" className="text-sm text-silver">
            {t(state?.cached ? 'ai.onDeviceModelReady' : 'ai.onDeviceModelNotLoaded')}
          </span>
          {onDeviceModel ? (
            <Button variant="ghost" size="sm" onClick={() => save('aiOnDeviceModel', false)}>
              {t('ai.onDeviceModelDisable')}
            </Button>
          ) : (
            <Button variant="steel" size="sm" leadingIcon={Download} loading={modelBusy} onClick={() => void enableModel()}>
              {t('ai.onDeviceModelEnable')}
            </Button>
          )}
        </Row>
      ) : (
        <p className="text-sm text-text-muted">{t('ai.onDeviceUnsupported')}</p>
      )}
    </>
  );
}

export function AiSettings() {
  useT();
  const enabled = useSetting('aiEnabled');
  const provider = useSetting('aiProvider');
  const baseUrl = useSetting('aiBaseUrl');
  const instructions = useSetting('aiInstructions');
  const switchId = useId();
  const providerId = useId();
  const instructionsId = useId();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [consent, setConsent] = useState<ConsentRequest | null>(null);

  const target = currentTarget(provider, baseUrl);

  const changeProvider = (next: AiProviderId): void => {
    save('aiProvider', next);
    save('aiBaseUrl', '');
    save('aiModel', '');
    setTestResult(null);
  };

  const runTest = async (): Promise<void> => {
    setTesting(true);
    setTestResult(null);
    try {
      const ctx = await loadOpenAiContext({ needModel: true });
      const result = await testConnection(ctx, new AbortController().signal);
      setTestResult({ ok: true, text: t('ai.testOk', { provider: t(PROVIDER_ID_KEY[provider]), ms: result.latencyMs }) });
    } catch (err) {
      if (err instanceof AiConsentRequiredError) {
        const withKey = (await getApiKey()) !== '';
        setConsent({
          consentKey: err.consentKey,
          host: err.host,
          scope: 'test',
          withKey,
          retry: () => void runTest(),
        });
        return;
      }
      const diagnosis = await diagnoseNow(err);
      setTestResult({ ok: false, text: diagnosis ? diagnosisText(diagnosis) : t('ai.err.generic') });
    } finally {
      setTesting(false);
    }
  };

  const acceptConsent = async (): Promise<void> => {
    if (!consent) return;
    const pending = consent;
    setConsent(null);
    await grantCloudConsent(pending.consentKey);
    pending.retry();
  };

  const declineConsent = (): void => {
    setConsent(null);
    setTestResult({ ok: false, text: t('ai.err.consent') });
  };

  return (
    <Section id="ai" title={t('ai.title')}>
      <p className="text-sm text-text-muted">{t('ai.intro')}</p>

      <Row label={<span id={switchId}>{t('ai.enable')}</span>} hint={t('ai.enableHint')}>
        <Switch checked={enabled} onCheckedChange={(on) => save('aiEnabled', on)} aria-labelledby={switchId} />
      </Row>

      <Row
        label={<label htmlFor={providerId}>{t('ai.provider')}</label>}
        hint={t(PRIVACY_HINT_KEY[target.privacy], { host: target.host })}
      >
        <select
          id={providerId}
          value={provider}
          onChange={(e) => changeProvider(e.target.value as AiProviderId)}
          className="h-[30px] rounded-sm border border-border-strong bg-bg px-2 text-sm text-text shadow-[var(--inner-well)] focus-ring"
        >
          {AI_PROVIDER_IDS.map((id) => (
            <option key={id} value={id}>
              {t(PROVIDER_KEY[id])}
            </option>
          ))}
        </select>
        <PrivacyBadge privacy={target.privacy} />
      </Row>

      {provider === 'chrome-builtin' ? (
        <OnDeviceStatus />
      ) : (
        <>
          <AiConnectionFields provider={provider} onConsentRequired={setConsent} />
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="steel" size="sm" leadingIcon={Plug} loading={testing} onClick={() => void runTest()}>
              {t('ai.testConnection')}
            </Button>
            {testResult ? (
              <p role="status" className={testResult.ok ? 'text-sm text-success' : 'text-sm text-danger'}>
                {testResult.text}
              </p>
            ) : null}
          </div>
        </>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor={instructionsId} className="text-sm text-silver">
          {t('ai.instructions')}
        </label>
        <InstructionsField id={instructionsId} value={instructions} onCommit={(next) => save('aiInstructions', next)} />
        <p className="text-xs text-text-muted">{t('ai.instructionsHint')}</p>
        <div>
          <Button variant="ghost" size="sm" leadingIcon={RotateCcw} onClick={() => save('aiInstructions', '')}>
            {t('ai.resetInstructions')}
          </Button>
        </div>
      </div>

      {consent ? (
        <AiConsentDialog
          open
          host={consent.host}
          scope={consent.scope}
          withKey={consent.withKey}
          onAccept={() => void acceptConsent()}
          onDecline={declineConsent}
        />
      ) : null}
    </Section>
  );
}
