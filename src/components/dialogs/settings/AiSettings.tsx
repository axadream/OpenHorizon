import { useEffect, useId, useState } from 'react';
import { Download, LogIn, LogOut, Plug, RotateCcw } from 'lucide-react';
import { AiConsentDialog } from '@/components/ai/AiConsentDialog';
import {
  AUTO_ENGINE_KEY,
  AVAILABILITY_KEY,
  diagnosisText,
  ENGINE_KEY,
  PRIVACY_HINT_KEY,
  PROVIDER_ID_KEY,
  PROVIDER_KEY,
} from '@/components/ai/labels';
import { PrivacyBadge } from '@/components/ai/PrivacyBadge';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import type { AiProviderId } from '@/db/schema';
import { getApiKey } from '@/features/ai/apiKey';
import { grantCloudConsent } from '@/features/ai/consent';
import { AI_PROVIDER_IDS, OPENROUTER_HOST, OPENROUTER_KEYS_URL } from '@/features/ai/presets';
import { AiConsentRequiredError } from '@/features/ai/errors';
import { resolveAiConfig } from '@/features/ai/config';
import { beginOpenRouterSignIn, signOutOpenRouter } from '@/features/ai/oauth/openrouter';
import { loadOpenAiContext, diagnoseNow } from '@/features/ai/openAiContext';
import { resolveAutoEngine, resolveOnDeviceEngine } from '@/features/ai/orchestrator';
import {
  chromeUnavailableReason,
  getChromeAiSupport,
  downloadChromeModel,
  type ChromeAiSupport,
} from '@/features/ai/providers/chromeBuiltin';
import { listModels, testConnection } from '@/features/ai/providers/openAiCompatible';
import {
  downloadOnDeviceModel,
  isOnDeviceModelCached,
  isOnDeviceModelSupported,
  ON_DEVICE_MODEL_SIZE_LABEL,
} from '@/features/ai/providers/wllama';
import type { AiPrivacy } from '@/features/ai/types';
import { useSetting } from '@/features/settings/settings';
import { t, useT, type TranslationKey } from '@/i18n/i18n';
import { toast } from '@/lib/toast';
import { AiConnectionFields, InstructionsField, type ConsentRequest } from './AiConnectionFields';
import { Row, Section, save } from './SettingsParts';

/*
 * Settings > AI summaries. Enable switch, provider with its privacy badge, endpoint and key fields for
 * OpenAI-style providers, the built-in model status for Chrome, instructions, and a connection test.
 * Cloud use always goes through the consent dialog first. Lazy-loaded from SettingsDialog.
 */

/** Privacy class and host the current provider setting would send text to. auto stays on-device unless signed in. */
function currentTarget(provider: AiProviderId, baseUrl: string, signedIn: boolean): { privacy: AiPrivacy; host: string } {
  if (provider === 'auto' && signedIn) return { privacy: 'cloud', host: OPENROUTER_HOST };
  if (provider === 'chrome-builtin' || provider === 'auto') return { privacy: 'on-device', host: '' };
  const { config } = resolveAiConfig({ provider, baseUrl, model: 'model', hasKey: true }, location.protocol);
  return { privacy: config?.privacy ?? 'cloud', host: config?.host ?? '' };
}

/** Why the built-in model is unavailable, as a status label. */
const CHROME_REASON_KEY: Record<ReturnType<typeof chromeUnavailableReason>, TranslationKey> = {
  mobile: 'ai.status.unavailableMobile',
  browser: 'ai.status.unavailableBrowser',
  device: 'ai.status.unavailableDevice',
};

interface OnDeviceState {
  support: ChromeAiSupport;
  cached: boolean;
  engineKey: TranslationKey;
}

/** The engine label: the auto order when auto is chosen, otherwise the on-device order. */
async function engineKeyFor(provider: AiProviderId, onDeviceModel: boolean, signedIn: boolean): Promise<TranslationKey> {
  if (provider === 'auto') return AUTO_ENGINE_KEY[await resolveAutoEngine({ onDeviceModel, signedIn })];
  return ENGINE_KEY[await resolveOnDeviceEngine({ onDeviceModel })];
}

async function readOnDeviceState(provider: AiProviderId, onDeviceModel: boolean, signedIn: boolean): Promise<OnDeviceState> {
  const [support, cached, engineKey] = await Promise.all([
    getChromeAiSupport(),
    isOnDeviceModelCached(),
    engineKeyFor(provider, onDeviceModel, signedIn),
  ]);
  return { support, cached, engineKey };
}

/** Signed in to OpenRouter: the setting says so and the key is stored. */
function useSignedIn(): boolean {
  const signedInProvider = useSetting('aiSignedInProvider');
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    let alive = true;
    void getApiKey().then((key) => {
      if (alive) setHasKey(key !== '');
    });
    return () => {
      alive = false;
    };
  }, [signedInProvider]);

  return signedInProvider === 'openrouter' && hasKey;
}

/** Model for the signed-in OpenRouter service: the models it lists, free ones first. */
function OpenRouterModelPicker() {
  const model = useSetting('aiOpenRouterModel');
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    // Without a list (no consent yet, offline or an error) the current value stays the only option.
    void loadOpenAiContext({ needModel: false })
      .then((ctx) => listModels(ctx, new AbortController().signal))
      .then((list) => {
        if (alive) setIds(list);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const options = [...new Set([model, ...ids])].sort(
    (a, b) => Number(b.endsWith(':free')) - Number(a.endsWith(':free')) || a.localeCompare(b),
  );

  return (
    <div className="flex flex-col gap-2">
      <select
        aria-label={t('ai.openRouterModel')}
        value={model}
        onChange={(e) => save('aiOpenRouterModel', e.target.value)}
        className="h-[30px] rounded-sm border border-border-strong bg-bg px-2 text-sm text-text shadow-[var(--inner-well)] focus-ring"
      >
        {options.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>
      <p className="text-xs text-text-muted">{t('ai.openRouterModelHint')}</p>
    </div>
  );
}

/**
 * Sign in with OpenRouter (features/ai/oauth). The browser leaves for openrouter.ai and comes back with
 * the key stored, so the row shows the sign-in button, or the account state and the model when signed in.
 */
function SignInRow() {
  useT();
  const signedIn = useSignedIn();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Going back with the browser's back button can restore the page with the button still busy.
    const reset = (): void => setBusy(false);
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);

  const signIn = (): void => {
    setBusy(true);
    beginOpenRouterSignIn().catch((err: unknown) => {
      setBusy(false);
      toast.error(t('ai.failed'), { description: err instanceof Error ? err.message : undefined });
    });
  };

  const signOut = (): void => {
    void signOutOpenRouter().then(() => toast.info(t('ai.signedOut')));
  };

  return (
    <Row label={t('ai.signIn')} hint={signedIn ? t('ai.signInNotice') : t('ai.signInHint')}>
      {signedIn ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span role="status" className="text-sm text-success">
              {t('ai.signedIn')}
            </span>
            <Button variant="ghost" size="sm" leadingIcon={LogOut} onClick={signOut}>
              {t('ai.signOut')}
            </Button>
            <a href={OPENROUTER_KEYS_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-text-muted underline">
              {t('ai.revokeKey')}
            </a>
          </div>
          <OpenRouterModelPicker />
        </div>
      ) : (
        <Button variant="steel" size="sm" leadingIcon={LogIn} loading={busy} onClick={signIn}>
          {t('ai.signIn')}
        </Button>
      )}
    </Row>
  );
}

/**
 * Engine in use, the browser built-in model status, and the opt-in on-device model (wllama).
 * Downloads must start from a click, so both download buttons are plain click handlers.
 */
function OnDeviceStatus({ provider, signedIn }: { provider: AiProviderId; signedIn: boolean }) {
  useT();
  const onDeviceModel = useSetting('aiOnDeviceModel');
  const [state, setState] = useState<OnDeviceState | null>(null);
  const [revision, setRevision] = useState(0);
  const [chromeBusy, setChromeBusy] = useState(false);
  const [modelBusy, setModelBusy] = useState(false);
  const supported = isOnDeviceModelSupported();

  useEffect(() => {
    let alive = true;
    void readOnDeviceState(provider, onDeviceModel, signedIn).then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, [provider, onDeviceModel, signedIn, revision]);

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
        <>
          <p role="status" className="text-sm text-silver">
            {t('ai.chromeStatus', { status: t(CHROME_REASON_KEY[chromeUnavailableReason()]) })}
          </p>
          <p className="text-sm text-text-muted">{t('ai.builtinUnavailable')}</p>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          {support ? (
            <p role="status" className="text-sm text-silver">
              {t('ai.chromeStatus', { status: t(AVAILABILITY_KEY[support.summarizer]) })}
            </p>
          ) : null}
          {support?.summarizer === 'downloading' ? (
            <Button variant="steel" size="sm" leadingIcon={Download} loading disabled>
              {t('ai.downloadModel')}
            </Button>
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
          <span className="text-sm text-text">{t(state.engineKey)}</span>
        </Row>
      ) : null}

      {supported ? (
        <Row
          label={`${t('ai.onDeviceModel')} · ${t('ai.experimental')}`}
          hint={t('ai.onDeviceModelHint', { size: ON_DEVICE_MODEL_SIZE_LABEL })}
        >
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

  const signedIn = useSignedIn();
  const target = currentTarget(provider, baseUrl, signedIn);

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

  const testButton = (
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
  );

  return (
    <Section id="ai" title={t('ai.title')}>
      <p className="text-sm text-text-muted">{t('ai.intro')}</p>

      <Row label={<span id={switchId}>{t('ai.enable')}</span>} hint={t('ai.enableHint')}>
        <Switch checked={enabled} onCheckedChange={(on) => save('aiEnabled', on)} aria-labelledby={switchId} />
      </Row>

      <Row
        label={<label htmlFor={providerId}>{t('ai.provider')}</label>}
        hint={provider === 'auto' ? t('ai.autoHint') : t(PRIVACY_HINT_KEY[target.privacy], { host: target.host })}
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
        <OnDeviceStatus provider={provider} signedIn={signedIn} />
      ) : provider === 'auto' ? (
        <>
          <SignInRow />
          <OnDeviceStatus provider={provider} signedIn={signedIn} />
        </>
      ) : provider === 'openrouter' ? (
        <>
          <SignInRow />
          {testButton}
        </>
      ) : (
        <>
          <AiConnectionFields provider={provider} onConsentRequired={setConsent} />
          {testButton}
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
