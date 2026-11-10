import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import type { AiProviderId } from '@/db/schema';
import { clearApiKey, getApiKey, setApiKey } from '@/features/ai/apiKey';
import { AiConsentRequiredError } from '@/features/ai/errors';
import { normalizeBaseUrl } from '@/features/ai/endpoint';
import { loadOpenAiContext, diagnoseNow } from '@/features/ai/openAiContext';
import { getPreset } from '@/features/ai/presets';
import { listModels } from '@/features/ai/providers/openAiCompatible';
import { setSetting, useSetting } from '@/features/settings/settings';
import { t, useT } from '@/i18n/i18n';
import { toast } from '@/lib/toast';
import { diagnosisText } from '@/components/ai/labels';
import { Row } from './SettingsParts';

/*
 * Endpoint fields of an OpenAI-style provider: base address (editable for local and custom
 * endpoints), model with Fetch models, and the API key with its Remember switch. Values are saved on
 * blur or Enter; the saved values drive every request.
 */

/** A request that needs cloud consent first. retry() runs once the user has accepted. */
export interface ConsentRequest {
  consentKey: string;
  host: string;
  scope: 'test' | 'models';
  withKey: boolean;
  retry(): void;
}

export interface AiConnectionFieldsProps {
  provider: AiProviderId;
  /** Asked when the provider needs consent before a request (fetching the model list). */
  onConsentRequired(request: ConsentRequest): void;
}

export function AiConnectionFields({ provider, onConsentRequired }: AiConnectionFieldsProps) {
  useT();
  const baseUrl = useSetting('aiBaseUrl');
  const model = useSetting('aiModel');
  const remember = useSetting('aiRememberKey');
  const preset = getPreset(provider);
  const editable = preset.privacyFromUrl;
  const urlId = useId();
  const urlHintId = useId();
  const urlErrorId = useId();
  const modelId = useId();
  const listId = useId();
  const keyId = useId();
  const keyHintId = useId();
  const rememberId = useId();

  const [urlDraft, setUrlDraft] = useState(baseUrl);
  const [urlInvalid, setUrlInvalid] = useState(false);
  const [modelDraft, setModelDraft] = useState(model);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => setUrlDraft(baseUrl), [baseUrl]);
  useEffect(() => setModelDraft(model), [model]);
  useEffect(() => {
    setModelOptions([]);
    setFetchStatus(null);
  }, [provider]);
  useEffect(() => {
    void getApiKey().then((key) => setHasKey(key !== ''));
  }, [remember, provider]);

  const commitUrl = async (): Promise<void> => {
    const raw = urlDraft.trim();
    if (raw === '') {
      setUrlInvalid(false);
      await setSetting('aiBaseUrl', '');
      return;
    }
    const normalized = normalizeBaseUrl(raw);
    if (!normalized) {
      setUrlInvalid(true);
      return;
    }
    setUrlInvalid(false);
    setUrlDraft(normalized);
    if (normalized !== baseUrl) await setSetting('aiBaseUrl', normalized);
  };

  const commitModel = async (): Promise<void> => {
    const value = modelDraft.trim();
    if (value !== model) await setSetting('aiModel', value);
  };

  const saveKey = async (): Promise<void> => {
    const value = keyDraft.trim();
    if (!value) return;
    try {
      await setApiKey(value, remember);
      setKeyDraft('');
      setHasKey(true);
    } catch (err) {
      toast.error(t('settings.saveFailed'), { description: err instanceof Error ? err.message : undefined });
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void saveKey();
    }
  };

  const toggleRemember = async (on: boolean): Promise<void> => {
    // Read the key from where it is kept now, write the setting, then store it where the new flag says.
    const current = await getApiKey();
    await setSetting('aiRememberKey', on);
    await setApiKey(current, on);
    setHasKey(current !== '');
  };

  const fetchModels = async (): Promise<void> => {
    setFetching(true);
    setFetchStatus(null);
    try {
      const ctx = await loadOpenAiContext({ needModel: false });
      const ids = await listModels(ctx, new AbortController().signal);
      setModelOptions(ids);
      setFetchStatus({ ok: true, text: t('plural.aiModels', { count: ids.length }) });
    } catch (err) {
      if (err instanceof AiConsentRequiredError) {
        const withKey = hasKey;
        onConsentRequired({
          consentKey: err.consentKey,
          host: err.host,
          scope: 'models',
          withKey,
          retry: () => void fetchModels(),
        });
        return;
      }
      const diagnosis = await diagnoseNow(err);
      setFetchStatus({ ok: false, text: diagnosis ? diagnosisText(diagnosis) : t('ai.err.generic') });
    } finally {
      setFetching(false);
    }
  };

  const urlValue = editable ? urlDraft : preset.baseUrl;

  return (
    <>
      <Row
        label={<label htmlFor={urlId}>{t('ai.baseUrl')}</label>}
        hint={<span id={urlHintId}>{t('ai.baseUrlHint')}</span>}
      >
        <div className="flex flex-col gap-1">
          <Input
            id={urlId}
            value={urlValue}
            disabled={!editable}
            placeholder={preset.baseUrl || 'https://'}
            inputMode="url"
            spellCheck={false}
            autoComplete="off"
            invalid={urlInvalid}
            errorId={urlErrorId}
            aria-describedby={urlHintId}
            onChange={(e) => setUrlDraft(e.target.value)}
            onBlur={() => void commitUrl()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void commitUrl();
              }
            }}
            className="w-72 max-w-full"
          />
          {urlInvalid ? (
            <p id={urlErrorId} className="text-xs text-danger">
              {t('ai.setupRequired')}
            </p>
          ) : null}
        </div>
      </Row>

      <Row label={<label htmlFor={modelId}>{t('ai.model')}</label>}>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={modelId}
              list={listId}
              value={modelDraft}
              placeholder={t('ai.modelPlaceholder')}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setModelDraft(e.target.value)}
              onBlur={() => void commitModel()}
              className="w-56 max-w-full"
            />
            <datalist id={listId}>
              {modelOptions.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
            <Button variant="steel" size="sm" leadingIcon={RefreshCw} loading={fetching} onClick={() => void fetchModels()}>
              {t('ai.fetchModels')}
            </Button>
          </div>
          {fetchStatus ? (
            <p role="status" className={fetchStatus.ok ? 'text-xs text-text-muted' : 'text-xs text-danger'}>
              {fetchStatus.text}
            </p>
          ) : null}
        </div>
      </Row>

      <div className="flex flex-col gap-2">
        <label htmlFor={keyId} className="text-sm text-silver">
          {t('ai.apiKey')}
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={keyId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={keyDraft}
            placeholder={hasKey ? '••••••••' : ''}
            aria-describedby={keyHintId}
            onChange={(e) => setKeyDraft(e.target.value)}
            onBlur={() => void saveKey()}
            onKeyDown={onKeyDown}
            className="w-56 max-w-full"
          />
          <Button variant="ghost" size="sm" disabled={!hasKey} onClick={() => void clearApiKey().then(() => setHasKey(false))}>
            {t('ai.clearKey')}
          </Button>
        </div>
        <p id={keyHintId} className="text-xs text-text-muted">
          {preset.requiresKey && !hasKey ? t('ai.keyRequired') : t('ai.apiKeyHint')}
        </p>
        <div className="flex items-center justify-between gap-3">
          <span id={rememberId} className="text-sm text-silver">
            {t('ai.rememberKey')}
          </span>
          <Switch checked={remember} onCheckedChange={(on) => void toggleRemember(on)} aria-labelledby={rememberId} />
        </div>
        <p className="flex items-start gap-2 text-xs text-warning">
          <ShieldAlert aria-hidden="true" size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>{t('ai.apiKeyWarning')}</span>
        </p>
      </div>
    </>
  );
}

/** Multi-line instructions field shared by the AI settings. */
export function InstructionsField({
  id,
  value,
  onCommit,
}: {
  id: string;
  value: string;
  onCommit(next: string): void;
}) {
  useT();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Textarea
      id={id}
      value={draft}
      maxLength={1000}
      placeholder={t('ai.defaultInstructions')}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() !== value) onCommit(draft.trim());
      }}
      className="min-h-16"
    />
  );
}
