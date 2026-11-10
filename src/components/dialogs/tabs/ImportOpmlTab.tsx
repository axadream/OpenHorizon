import { useId, useMemo, useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/toast';
import { importOpml } from '@/features/feeds/addFeed';
import { useFeeds } from '@/features/feeds/feedQueries';
import { runSyncFromPage } from '@/features/sync/scheduler';
import { parseOpml, type OpmlFeed, type OpmlResult } from '@/lib/opml/parseOpml';
import { normalizeFeedUrl } from '@/lib/url';
import { activityPercent, startActivity } from '@/store/activityStore';
import { useUiStore } from '@/store/uiStore';

interface FolderGroup {
  /** Folder name, or '' for feeds outside any folder. */
  name: string;
  feeds: OpmlFeed[];
}

interface Progress {
  done: number;
  total: number;
}

function groupByFolder(feeds: readonly OpmlFeed[]): FolderGroup[] {
  const map = new Map<string, OpmlFeed[]>();
  for (const f of feeds) {
    const key = f.folder ?? '';
    const list = map.get(key) ?? [];
    list.push(f);
    map.set(key, list);
  }
  // Folders in order of appearance; unfiled feeds last.
  const groups = [...map.entries()].map(([name, list]) => ({ name, feeds: list }));
  return groups.sort((a, b) => (a.name === '' ? 1 : b.name === '' ? -1 : 0));
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function importLabel(done: number, total: number): string {
  const pct = activityPercent({ done, total }) ?? 0;
  return `Importing feed ${done} of ${total} (${pct}%)`;
}

export function ImportOpmlTab() {
  const uid = useId();
  const dropId = `${uid}-drop`;
  const fetchId = `${uid}-fetch`;
  const fetchLabelId = `${uid}-fetch-label`;
  const inputRef = useRef<HTMLInputElement>(null);

  const feeds = useFeeds();
  const subscribed = useMemo(() => new Set((feeds ?? []).map((f) => normalizeFeedUrl(f.url))), [feeds]);

  const [parsed, setParsed] = useState<OpmlResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fetchNow, setFetchNow] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSubscribed = (xmlUrl: string): boolean => subscribed.has(normalizeFeedUrl(xmlUrl));

  async function loadFile(file: File): Promise<void> {
    setError(null);
    try {
      const result = parseOpml(await file.text());
      if (result.feeds.length === 0) {
        setParsed(null);
        setError('No feeds found in this file.');
        return;
      }
      setParsed(result);
      setFileName(file.name);
      // Pre-select everything that is not already subscribed.
      setSelected(new Set(result.feeds.filter((f) => !isSubscribed(f.xmlUrl)).map((f) => f.xmlUrl)));
    } catch (err) {
      setParsed(null);
      setError(err instanceof Error ? err.message : 'Could not read this file.');
    }
  }

  function onDrop(e: DragEvent<HTMLButtonElement>): void {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void loadFile(file);
  }

  function toggle(xmlUrl: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(xmlUrl)) next.delete(xmlUrl);
      else next.add(xmlUrl);
      return next;
    });
  }

  async function runImport(): Promise<void> {
    if (!parsed || selected.size === 0 || busy) return;
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: selected.size });
    const activity = startActivity({ label: importLabel(0, selected.size), total: selected.size });
    try {
      const summary = await importOpml(parsed, {
        selected: [...selected],
        fetchNow,
        // Fire and forget: the articles arrive while the dialog closes. The sync reports its own activity.
        syncFeeds: (ids) => {
          void runSyncFromPage({ feedIds: ids }).catch(() => undefined);
          return Promise.resolve();
        },
        onProgress: (done, total) => {
          setProgress({ done, total });
          activity.update(done, total, importLabel(done, total));
        },
      });
      activity.complete(`Imported ${plural(summary.added, 'feed')}`);
      toast.success(`Imported ${plural(summary.added, 'feed')}`, {
        description: summary.skipped > 0 ? `${summary.skipped} already subscribed, skipped.` : undefined,
      });
      useUiStore.getState().closeDialog('addFeed');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The import failed. Nothing else was changed.';
      activity.fail(message);
      setError(message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const groups = parsed ? groupByFolder(parsed.feeds) : [];
  const alreadyCount = parsed ? parsed.feeds.filter((f) => isSubscribed(f.xmlUrl)).length : 0;
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <button
        id={dropId}
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'focus-ring flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong p-8 text-center transition-colors duration-[var(--duration-fast)]',
          dragging ? 'bg-card/60' : 'hover:bg-card/50',
          'disabled:opacity-50',
        )}
      >
        <Upload aria-hidden="true" size={28} strokeWidth={1.75} className="text-text-muted" />
        <span className="text-sm text-silver">
          {fileName ? `Selected: ${fileName}` : 'Drop an OPML file or click to browse'}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".opml,.xml,text/xml,text/x-opml"
        aria-labelledby={dropId}
        tabIndex={-1}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void loadFile(file);
          e.target.value = '';
        }}
      />

      {error ? (
        <div role="alert" className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle aria-hidden="true" size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {parsed ? (
        <>
          <p className="text-sm text-text-muted" role="status">
            {`${plural(parsed.feeds.length, 'feed')} in ${plural(parsed.folders.length, 'folder')} (${alreadyCount} already subscribed, skipped)`}
          </p>

          <div className="flex flex-col gap-4">
            {groups.map((group) => (
              <fieldset key={group.name || '__unfiled'} className="flex flex-col gap-1">
                <legend className="mb-1 text-xs font-semibold tracking-[0.06em] text-text-muted uppercase">
                  {group.name || 'Unfiled'} ({group.feeds.length})
                </legend>
                {group.feeds.map((f) => {
                  const already = isSubscribed(f.xmlUrl);
                  return (
                    <label
                      key={f.xmlUrl}
                      className={cn('flex items-center gap-3 rounded-sm px-1 py-1.5', already ? 'opacity-60' : 'hover:bg-card/50')}
                    >
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-accent"
                        checked={!already && selected.has(f.xmlUrl)}
                        disabled={already || busy}
                        onChange={() => toggle(f.xmlUrl)}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-text">{f.title}</span>
                      {already ? <span className="shrink-0 text-xs text-text-muted">Already subscribed</span> : null}
                    </label>
                  );
                })}
              </fieldset>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span id={fetchLabelId} className="text-sm text-silver">
              Fetch articles now
            </span>
            <Switch
              id={fetchId}
              checked={fetchNow}
              onCheckedChange={setFetchNow}
              disabled={busy}
              aria-labelledby={fetchLabelId}
            />
          </div>

          {progress ? (
            <div
              role="progressbar"
              aria-label="Import progress"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              aria-valuetext={`${progress.done} of ${progress.total}`}
              className="h-1.5 w-full overflow-hidden rounded-full bg-card"
            >
              <div className="h-full bg-accent transition-[width] duration-[var(--duration-base)]" style={{ width: `${pct}%` }} />
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button variant="primary" loading={busy} disabled={selected.size === 0} onClick={() => void runImport()}>
              {`Import ${selected.size} ${selected.size === 1 ? 'feed' : 'feeds'}`}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
