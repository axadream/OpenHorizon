import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { WatchListPicker } from '@/components/lists/WatchListPicker';
import { describeSaveError, runAddVideo, runSavePage } from '@/components/dialogs/saveActions';
import { showArticle, toHttpUrl } from '@/components/dialogs/subscribe';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { NEW_LIST_VALUE, useWatchLists } from '@/features/lists/lists';
import { t, useT } from '@/i18n/i18n';
import { toast } from '@/lib/toast';
import { parseYouTubeUrl } from '@/lib/youtube';

interface SaveError {
  title: string;
  detail?: string;
}

/**
 * Save a web page as an article (Saved pages). A YouTube video address goes to a watch list
 * instead, through the list picker that appears when such an address is typed.
 */
export function SavePageTab() {
  useT();
  const uid = useId();
  const urlId = `${uid}-url`;
  const errorId = `${uid}-error`;
  const lists = useWatchLists() ?? [];

  const [url, setUrl] = useState('');
  const [choice, setChoice] = useState<string | null>(null);
  const [newName, setNewName] = useState(t('lists.watchTitle'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SaveError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const target = toHttpUrl(url);
  const isVideo = target !== null && parseYouTubeUrl(target).kind === 'video';
  const effectiveChoice = choice ?? lists[0]?.id ?? NEW_LIST_VALUE;

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (busy) return;
    if (!target) {
      setError({ title: url.trim() ? t('add.invalid') : t('add.empty') });
      return;
    }

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy(true);
    setError(null);
    try {
      if (isVideo) {
        const outcome = await runAddVideo(effectiveChoice, newName, target, ctrl.signal);
        if (outcome.kind === 'added') {
          toast.success(t('lists.added', { list: outcome.list.title }));
          showArticle(outcome.list.id, outcome.article.id);
        } else if (outcome.kind === 'duplicate') {
          toast.info(t('lists.alreadyIn'));
          showArticle(outcome.feedId, outcome.articleId);
        }
      } else {
        const outcome = await runSavePage(target, ctrl.signal);
        if (outcome.kind === 'saved') {
          toast.success(t('save.saved', { title: outcome.article.title }));
          showArticle(outcome.article.feedId, outcome.article.id);
        } else if (outcome.kind === 'duplicate') {
          toast.info(t('save.duplicate'));
          showArticle(outcome.feedId, outcome.articleId);
        }
      }
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(describeSaveError(err));
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">{t('save.hint')}</p>

      <div className="flex flex-col gap-2">
        <label htmlFor={urlId} className="text-sm font-medium text-silver">
          {t('save.urlLabel')}
        </label>
        <Input
          id={urlId}
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder="https://example.com/article"
          value={url}
          disabled={busy}
          invalid={error !== null}
          errorId={error ? errorId : undefined}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
        />
      </div>

      {isVideo ? (
        <>
          <p role="status" className="text-sm text-text-muted">
            {t('save.videoDetected')}
          </p>
          <WatchListPicker
            lists={lists}
            value={effectiveChoice}
            newName={newName}
            onValueChange={setChoice}
            onNewNameChange={setNewName}
            disabled={busy}
          />
        </>
      ) : null}

      {error ? (
        <div id={errorId} role="alert" className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle aria-hidden="true" size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-semibold">{error.title}</span>
            {error.detail ? <span className="text-text">{error.detail}</span> : null}
          </div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={busy}>
          {isVideo ? t('lists.submit') : t('save.submit')}
        </Button>
      </div>
    </form>
  );
}
