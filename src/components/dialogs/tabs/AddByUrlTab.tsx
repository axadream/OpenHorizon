import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { db } from '@/db/db';
import { AlreadySubscribedError, addFeedFromUrl, type AddFeedStep } from '@/features/feeds/addFeed';
import { startActivity } from '@/store/activityStore';
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
const URL_STEPS: Record<AddFeedStep, { done: number; label: string }> = {
  checking: { done: 10, label: 'Checking address' },
  fetching: { done: 40, label: 'Fetching feed' },
  parsing: { done: 75, label: 'Reading feed' },
  saving: { done: 100, label: 'Saving feed' },
};

function stepLabel(step: AddFeedStep): string {
  const { done, label } = URL_STEPS[step];
  return `${label} (${done}%)`;
}

function describeError(err: unknown): UrlError {
  if (err instanceof AlreadySubscribedError) {
    return { title: "You're already subscribed to this feed.", duplicateFeedId: err.feedId };
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
      setError({ title: url.trim() ? 'Enter a valid web address' : 'Enter a feed URL' });
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
      activity.complete(`Added ${feed.title}`);
      onFeedSubscribed({ ...feed, isFavorite: notify ? 1 : 0 });
    } catch (err) {
      if (ctrl.signal.aborted) {
        activity.complete('Cancelled');
        return;
      }
      if (err instanceof NotAFeedError) {
        activity.complete('Not a feed, looking for feeds');
        onNotAFeed(target);
        return;
      }
      const described = describeError(err);
      activity.fail(described.title);
      setError(described);
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={urlId} className="text-sm font-medium text-silver">
          Feed URL
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
          Notify me about new articles (favorite feed)
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
              <p className="text-xs text-text-muted">Tried: {error.routes.join(', ')}</p>
            ) : null}
          </div>
          {error.duplicateFeedId ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => showFeed(error.duplicateFeedId ?? '')}>
              Show feed
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={loading}>
          Add feed
        </Button>
      </div>
    </form>
  );
}
