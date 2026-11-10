import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Copy, RefreshCw, Sparkles, X } from 'lucide-react';
import { AiConsentDialog } from '@/components/ai/AiConsentDialog';
import { PROVIDER_ID_KEY } from '@/components/ai/labels';
import { PrivacyBadge } from '@/components/ai/PrivacyBadge';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import type { Article } from '@/db/schema';
import { useAiPanelStore } from '@/features/ai/aiPanelStore';
import { prepareArticleText } from '@/features/ai/articleText';
import { getApiKey } from '@/features/ai/apiKey';
import { grantCloudConsent } from '@/features/ai/consent';
import { AiConsentRequiredError, isAbortError, type Diagnosis } from '@/features/ai/errors';
import { diagnoseNow } from '@/features/ai/openAiContext';
import { runArticleSummary, type SummaryRun } from '@/features/ai/orchestrator';
import type { DraftPatch } from '@/features/ai/types';
import { t, useT } from '@/i18n/i18n';
import { MarkdownLite } from '@/lib/markdownLite';
import { toast } from '@/lib/toast';

/*
 * AI summary panel above the article body. Shows summary, key takeaways and tags, streams the summary
 * while it is generated, and keeps the provider and privacy badges visible. Output is rendered through
 * MarkdownLite (React elements only). Lazy-loaded from ReaderPane.
 */

type Phase = 'running' | 'done' | 'empty' | 'cancelled' | 'error' | 'consent';

interface PendingConsent {
  consentKey: string;
  host: string;
  withKey: boolean;
  fresh: boolean;
}

export interface AiSummaryPanelProps {
  article: Article;
}

function hasContent(run: SummaryRun): boolean {
  return run.result.summary.length > 0 || run.result.takeaways.length > 0 || run.result.tags.length > 0;
}

export function AiSummaryPanel({ article }: AiSummaryPanelProps) {
  useT();
  const titleId = useId();
  const sumId = useId();
  const takeId = useId();
  const tagId = useId();
  const prepared = useMemo(
    () => prepareArticleText(article),
    [article.id, article.title, article.summary, article.contentRaw, article.fullContent],
  );

  const [phase, setPhase] = useState<Phase>('running');
  const [run, setRun] = useState<SummaryRun | null>(null);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<Diagnosis | null>(null);
  const [consent, setConsent] = useState<PendingConsent | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const start = useCallback(
    async (fresh: boolean): Promise<void> => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const isCurrent = (): boolean => controllerRef.current === controller;

      setPhase('running');
      setError(null);
      setPartial('');
      try {
        const next = await runArticleSummary(article, {
          fresh,
          signal: controller.signal,
          onPartial: (patch: DraftPatch) => {
            if (isCurrent() && patch.summary !== undefined) setPartial(patch.summary);
          },
        });
        if (!isCurrent()) return;
        setRun(next);
        setPhase(hasContent(next) ? 'done' : 'empty');
      } catch (err) {
        if (!isCurrent()) return;
        if (err instanceof AiConsentRequiredError) {
          const withKey = (await getApiKey()) !== '';
          if (!isCurrent()) return;
          setConsent({ consentKey: err.consentKey, host: err.host, withKey, fresh });
          setPhase('consent');
          return;
        }
        const diagnosis = await diagnoseNow(err);
        if (!isCurrent()) return;
        if (diagnosis === null || isAbortError(err)) {
          setPhase('cancelled');
        } else {
          setError(diagnosis);
          setPhase('error');
        }
      }
    },
    [article],
  );

  // Generate (or reuse the cache) when the panel opens for an article; abort when it closes.
  useEffect(() => {
    if (!prepared.body) {
      setPhase('empty');
      return;
    }
    void start(false);
    return () => controllerRef.current?.abort();
    // Keyed by article id: a new article remounts the panel (ReaderPane passes key={article.id}).
  }, [article.id]);

  const result = run?.result ?? null;
  const running = phase === 'running';
  const summaryText = running ? partial : (result?.summary ?? '');

  const cancel = (): void => {
    controllerRef.current?.abort();
  };

  const copy = (): void => {
    if (!result?.summary) return;
    if (!navigator.clipboard) {
      toast.error(t('ai.copyFailed'));
      return;
    }
    navigator.clipboard.writeText(result.summary).then(
      () => toast.success(t('ai.copied')),
      () => toast.error(t('ai.copyFailed')),
    );
  };

  const acceptConsent = async (): Promise<void> => {
    if (!consent) return;
    const pending = consent;
    setConsent(null);
    await grantCloudConsent(pending.consentKey);
    void start(pending.fresh);
  };

  const declineConsent = (): void => {
    setConsent(null);
    setError({ key: 'ai.err.consent' });
    setPhase('error');
  };

  const statusLine = running ? t('ai.generating') : run?.cached && phase === 'done' ? t('ai.cachedNote') : '';

  return (
    <section
      aria-labelledby={titleId}
      dir="auto"
      className="steel-card mx-auto mb-6 w-full max-w-[var(--reader-measure)] rounded-md p-4 text-sm text-silver"
    >
      <header className="flex flex-wrap items-center gap-2">
        <Sparkles aria-hidden="true" size={16} strokeWidth={1.75} className="text-accent" />
        <h2 id={titleId} className="text-base font-semibold tracking-[-0.01em] text-text">
          {t('ai.summaryTitle')}
        </h2>
        {result ? <PrivacyBadge privacy={result.privacy} /> : null}
        <div className="ms-auto flex items-center gap-1">
          {running ? (
            <Button variant="ghost" size="sm" onClick={cancel}>
              {t('ai.cancel')}
            </Button>
          ) : null}
          {result && result.summary ? <IconButton label={t('ai.copy')} icon={Copy} size="sm" onClick={copy} /> : null}
          <IconButton
            label={t('ai.regenerate')}
            icon={RefreshCw}
            size="sm"
            disabled={running || consent !== null}
            onClick={() => void start(true)}
          />
          <IconButton label={t('ai.close')} icon={X} size="sm" onClick={() => useAiPanelStore.getState().hide()} />
        </div>
      </header>

      <p role="status" aria-live="polite" className="mt-2 min-h-4 text-xs text-text-muted">
        {statusLine}
      </p>

      {phase === 'error' && error ? (
        <div role="alert" className="mt-2 rounded-sm bg-danger-soft px-3 py-2 text-danger">
          {t(error.key, error.params)}
        </div>
      ) : null}
      {phase === 'empty' ? (
        <p className="mt-2 text-text-muted">{t(prepared.body ? 'ai.emptyResult' : 'ai.noText')}</p>
      ) : null}

      {summaryText ? (
        <section aria-labelledby={sumId} className="mt-4">
          <h3 id={sumId} className="mb-1 text-xs font-semibold tracking-[0.06em] text-text-muted uppercase">
            {t('ai.summary')}
          </h3>
          <MarkdownLite source={summaryText} />
        </section>
      ) : null}

      {result && result.takeaways.length > 0 ? (
        <section aria-labelledby={takeId} className="mt-4">
          <h3 id={takeId} className="mb-1 text-xs font-semibold tracking-[0.06em] text-text-muted uppercase">
            {t('ai.takeaways')}
          </h3>
          <MarkdownLite source={result.takeaways.map((item) => `- ${item}`).join('\n')} />
        </section>
      ) : null}

      {result && result.tags.length > 0 ? (
        <section aria-labelledby={tagId} className="mt-4">
          <h3 id={tagId} className="mb-1 text-xs font-semibold tracking-[0.06em] text-text-muted uppercase">
            {t('ai.tags')}
          </h3>
          <ul className="flex flex-wrap gap-1.5">
            {result.tags.map((tag) => (
              <li
                key={tag}
                className="inline-flex h-7 items-center rounded-full border border-border-strong px-3 text-xs font-medium text-silver"
              >
                {tag}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result ? (
        <footer className="mt-4 flex flex-col gap-1 border-t border-border pt-3 text-xs text-text-muted">
          <p>
            {result.model
              ? t('ai.producedBy', { provider: t(PROVIDER_ID_KEY[result.provider]), model: result.model })
              : t('ai.producedByOnly', { provider: t(PROVIDER_ID_KEY[result.provider]) })}
          </p>
          {result.notes.map((key) => (
            <p key={key}>{t(key)}</p>
          ))}
          {run?.truncated ? <p>{t('ai.truncated')}</p> : null}
        </footer>
      ) : null}

      {consent ? (
        <AiConsentDialog
          open
          host={consent.host}
          scope="article"
          withKey={consent.withKey}
          onAccept={() => void acceptConsent()}
          onDecline={declineConsent}
        />
      ) : null}
    </section>
  );
}
