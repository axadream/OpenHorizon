import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { db } from '@/db/db';
import { AlreadySubscribedError, addFeedFromUrl, type AddFeedStep } from '@/features/feeds/addFeed';
import { playChime } from '@/features/audio/chimes';
import { startActivity } from '@/store/activityStore';
import { t, useT } from '@/i18n/i18n';
import { FetchAllFailedError } from '@/lib/proxy/fetchWithProxy';
import { diagnoseFetchError } from '@/lib/proxy/diagnose';
import { NotAFeedError } from '@/lib/parser/types';
import { FolderPicker, resolveFolderId } from '@/components/dialogs/FolderPicker';
import { onFeedSubscribed, showFeed, toHttpUrl } from '@/components/dialogs/subscribe';

export interface AddByUrlTabProps {
  initialUrl?: string;
  /** Called when the address is a web page rather than a feed: the dialog switches to Discover. */
  onNotAFeed(url: string): void;
}

interface UrlError {
  title: string;
  detail?: string;
  /** Labels of the routes that were tried, shown under the diagnosis. */
  routes?: string[];
  duplicateFeedId?: string;
}

const VIA_LABEL: Record<string, string> = {
  direct: 'direct',
  env: 'custom proxy',
  local: 'built-in proxy',
  jina: 'jina reader',
  alloriginsget: 'allorigins (json)',
  allorigins: 'allorigins',
  corsproxy: 'corsproxy',
  codetabs: 'codetabs',
  rss2json: 'rss2json',
};

/** Percent reported for each add step, and the label shown while it runs. */
const URL_STEPS: Record<AddFeedStep, { done: number; labelKey: 'add.stepChecking' | 'add.stepFetching' | 'add.stepParsing' | 'add.stepSaving' }> = {
  checking: { done: 10, labelKey: 'add.stepChecking' },
  fetching: { done: 40, labelKey: 'add.stepFetching' },
  parsing: { done: 75, labelKey: 'add.stepParsing' },
  saving: { done: 100, labelKey: 'add.stepSaving' },
};

function stepLabel(step: AddFeedStep): string {
  const { done, labelKey } = URL_STEPS[step];
  return `${t(labelKey)} (${done}%)`;
}

function describeError(err: unknown): UrlError {
  if (err instanceof AlreadySubscribedError) {
    return { title: t('add.alreadySubscribed'), duplicateFeedId: err.feedId };
  }
  const diagnosis = diagnoseFetchError(err, { online: navigator.onLine });
  if (err instanceof FetchAllFailedError) {
    return {
      title: diagnosis.title,
      detail: diagnosis.detail,
      routes: err.attempts.map((a) => VIA_LABEL[a.via] ?? a.via),
    };
  }
  return { title: diagnosis.title, detail: diagnosis.detail || undefined };
}

export function AddByUrlTab({ initialUrl = '', onNotAFeed }: AddByUrlTabProps) {
  useT();
  const uid = useId();
  const urlId = `${uid}-url`;
  const errorId = `${uid}-error`;
  const notifyId = `${uid}-notify`;

  const [url, setUrl] = useState(initialUrl);
  const [folder, setFolder] = useState('');
  const [newFolder, setNewFolder] = useState('');
  const [notify, setNotify] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UrlError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Closing the dialog (or leaving this tab) while a fetch is running aborts it.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (loading) return;

    const target = toHttpUrl(url);
    if (!target) {
      setError({ title: url.trim() ? t('add.invalid') : t('add.empty') });
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setError(null);

    const activity = startActivity({ label: stepLabel('checking'), total: 100 });
    try {
      const folderId = await resolveFolderId(folder, newFolder);
      const feed = await addFeedFromUrl(target, {
        folderId,
        signal: ctrl.signal,
        onProgress: (step) => activity.update(URL_STEPS[step].done, 100, stepLabel(step)),
      });
      if (notify) await db.feeds.update(feed.id, { isFavorite: 1 });
      activity.complete(t('add.added', { title: feed.title }));
      onFeedSubscribed({ ...feed, isFavorite: notify ? 1 : 0 });
    } catch (err) {
      if (ctrl.signal.aborted) {
        activity.complete(t('add.cancelled'));
        return;
      }
      if (err instanceof NotAFeedError) {
        activity.complete(t('add.notFeedLooking'));
        onNotAFeed(target);
        return;
      }
      const described = describeError(err);
      activity.fail(described.title);
      void playChime('error');
      setError(described);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={urlId} className="text-sm font-medium text-silver">
          {t('add.urlLabel')}
        </label>
        <Input
          id={urlId}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoFocus
          placeholder="https://example.com/feed.xml"
          value={url}
          disabled={loading}
          invalid={error !== null}
          errorId={error ? errorId : undefined}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
        />
      </div>

      <FolderPicker
        value={folder}
        onValueChange={setFolder}
        newName={newFolder}
        onNewNameChange={setNewFolder}
        disabled={loading}
      />

      <div className="flex items-center justify-between gap-3">
        <span id={notifyId} className="text-sm text-silver">
          {t('add.notify')}
        </span>
        <Switch checked={notify} onCheckedChange={setNotify} disabled={loading} aria-labelledby={notifyId} />
      </div>

      {error ? (
        <div id={errorId} role="alert" className="flex flex-wrap items-start gap-2 text-sm text-danger">
          <AlertTriangle aria-hidden="true" size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="font-semibold">{error.title}</span>
            {error.detail ? <span className="text-text">{error.detail}</span> : null}
            {error.routes && error.routes.length > 0 ? (
              <p className="text-xs text-text-muted">{t('add.tried', { routes: error.routes.join(', ') })}</p>
            ) : null}
          </div>
          {error.duplicateFeedId ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => showFeed(error.duplicateFeedId ?? '')}>
              {t('add.showFeed')}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={loading}>
          {t('add.submit')}
        </Button>
      </div>
    </form>
  );
}
