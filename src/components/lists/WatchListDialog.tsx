import { useId, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { WatchListPicker } from '@/components/lists/WatchListPicker';
import { describeSaveError, runAddVideo } from '@/components/dialogs/saveActions';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { NEW_LIST_VALUE, useWatchLists } from '@/features/lists/lists';
import { t, useT } from '@/i18n/i18n';
import { parseYouTubeUrl } from '@/lib/youtube';
import { toast } from '@/lib/toast';
import { useDialog } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';

let sessionSeq = 0;

/** Add a YouTube video to a watch list. Opened from the reader, the article sheet or a watch list's menu. */
export function WatchListDialog() {
  useT();
  const payload = useDialog('watchList');
  const open = payload !== false;
  // A new session per open: the form starts from the payload, like the add-feed dialog.
  const session = useMemo(() => (open ? ++sessionSeq : 0), [payload]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) useUiStore.getState().closeDialog('watchList');
      }}
      title={t('lists.dialogTitle')}
    >
      {payload === false ? null : (
        <WatchListForm key={session} initialUrl={payload.url ?? ''} initialListId={payload.listId} />
      )}
    </Dialog>
  );
}

interface WatchListFormProps {
  initialUrl: string;
  initialListId?: string;
}

function WatchListForm({ initialUrl, initialListId }: WatchListFormProps) {
  useT();
  const uid = useId();
  const urlId = `${uid}-url`;
  const errorId = `${uid}-error`;
  const lists = useWatchLists() ?? [];

  const [url, setUrl] = useState(initialUrl);
  const [choice, setChoice] = useState<string | null>(null);
  const [newName, setNewName] = useState(t('lists.watchTitle'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Until the user picks, preselect the requested list, else the first list, else "New list…".
  const preferred = initialListId && lists.some((l) => l.id === initialListId) ? initialListId : undefined;
  const effectiveChoice = choice ?? preferred ?? lists[0]?.id ?? NEW_LIST_VALUE;

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (busy) return;
    const target = url.trim();
    if (parseYouTubeUrl(target).kind !== 'video') {
      setError(t('lists.notVideo'));
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const ui = useUiStore.getState();
      const outcome = await runAddVideo(effectiveChoice, newName, target);
      if (outcome.kind === 'added') {
        toast.success(t('lists.added', { list: outcome.list.title }));
        ui.closeDialog('watchList');
      } else if (outcome.kind === 'duplicate') {
        toast.info(t('lists.alreadyIn'));
        ui.setView({ type: 'feed', feedId: outcome.feedId });
        ui.selectArticle(outcome.articleId, { openOnMobile: true });
        ui.closeDialog('watchList');
      }
    } catch (err) {
      const info = describeSaveError(err);
      setError(info.detail ? `${info.title} ${info.detail}` : info.title);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={urlId} className="text-sm font-medium text-silver">
          {t('lists.videoUrl')}
        </label>
        <Input
          id={urlId}
          type="url"
          inputMode="url"
          autoComplete="off"
          autoFocus
          placeholder="https://www.youtube.com/watch?v="
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

      <WatchListPicker
        lists={lists}
        value={effectiveChoice}
        newName={newName}
        onValueChange={setChoice}
        onNewNameChange={setNewName}
        disabled={busy}
      />

      {error ? (
        <div id={errorId} role="alert" className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle aria-hidden="true" size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={busy}>
          {t('lists.submit')}
        </Button>
      </div>
    </form>
  );
}
