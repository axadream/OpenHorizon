import { useRef, useState, useSyncExternalStore } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCheck, MoreHorizontal, PanelLeft, RefreshCw, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Dialog } from '@/components/ui/Dialog';
import { IconButton } from '@/components/ui/IconButton';
import { Menu, MenuItem } from '@/components/ui/Menu';
import { useSetting } from '@/features/settings/settings';
import { markAllRead, undoMarkAllRead } from '@/features/articles/articleActions';
import { queryUnreadIds } from '@/features/articles/articleQueries';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { useNow } from '@/hooks/useNow';
import { syncAll } from '@/features/sync/syncAll';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/toast';
import { timeAgo } from '@/lib/time';
import { useSyncProgress, useSyncing, useTimelineOptions } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import type { TimelineFilter, TimelineSort, View } from '@/store/types';

/** Mark-all asks for confirmation above this many articles. */
const CONFIRM_THRESHOLD = 20;

const setFilter = (f: TimelineFilter) => useUiStore.getState().setTimelineFilter(f);
const setSort = (s: TimelineSort) => useUiStore.getState().setTimelineSort(s);
const showFeeds = () => useUiStore.getState().setMobilePane('nav');

/** Runs a full sync from the header. Progress and the pulse cutoff go into the store. */
export async function refreshAll(): Promise<void> {
  const ui = useUiStore.getState();
  if (ui.syncing) return;
  ui.setSyncing(true, { done: 0, total: 0 });
  try {
    const result = await syncAll({
      onProgress: (done, total) => useUiStore.getState().setSyncing(true, { done, total }),
    });
    useUiStore.getState().setRecentlyFetchedCutoff(result.startedAt);
    if (result.errorCount > 0) {
      toast.error(`Sync failed for ${result.errorCount} ${result.errorCount === 1 ? 'feed' : 'feeds'}`);
    }
  } catch {
    toast.error('Sync failed');
  } finally {
    useUiStore.getState().setSyncing(false);
  }
}

async function commitMarkAll(view: View): Promise<void> {
  try {
    const ids = await markAllRead(view);
    if (ids.length === 0) return;
    toast.undo(`Marked ${ids.length} as read`, {
      onUndo: () => {
        undoMarkAllRead(ids).catch(() => toast.error('Could not undo'));
      },
    });
  } catch {
    toast.error('Could not mark articles as read');
  }
}

function SortItems({ sort }: { sort: TimelineSort }) {
  return (
    <>
      <MenuItem
        icon={ArrowDown}
        aria-current={sort === 'newest' ? 'true' : undefined}
        className={sort === 'newest' ? 'text-accent' : undefined}
        onClick={() => setSort('newest')}
      >
        Newest first
      </MenuItem>
      <MenuItem
        icon={ArrowUp}
        aria-current={sort === 'oldest' ? 'true' : undefined}
        className={sort === 'oldest' ? 'text-accent' : undefined}
        onClick={() => setSort('oldest')}
      >
        Oldest first
      </MenuItem>
    </>
  );
}

function SyncBar() {
  const progress = useSyncProgress();
  const done = progress?.done ?? 0;
  const total = progress?.total ?? 0;
  return (
    <div
      role="progressbar"
      aria-label="Syncing feeds"
      aria-valuemin={0}
      aria-valuemax={total > 0 ? total : undefined}
      aria-valuenow={total > 0 ? done : undefined}
      aria-valuetext={total > 0 ? `${done} of ${total}` : 'Starting'}
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
    >
      {total > 0 ? (
        <div
          className="h-full bg-accent transition-[width] duration-[var(--duration-base)] ease-standard"
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      ) : (
        <div className="h-full w-full animate-shimmer bg-[image:linear-gradient(90deg,transparent_0%,var(--color-accent)_50%,transparent_100%)] bg-[length:200%_100%]" />
      )}
    </div>
  );
}

export interface TimelineHeaderProps {
  view: View;
  /** Pane title: view name or feed/folder name. */
  title: string;
  /** Unread articles in the current view; undefined while loading. */
  unreadCount: number | undefined;
}

/**
 * Timeline toolbar (DESIGN §6.4). Filter chips and refresh are always visible. Sort and
 * mark-all move into a "More" menu below the lg breakpoint.
 */
export function TimelineHeader({ view, title, unreadCount }: TimelineHeaderProps) {
  const { filter, sort } = useTimelineOptions();
  const syncing = useSyncing();
  const chipsRef = useRef<HTMLDivElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [confirmCount, setConfirmCount] = useState<number | null>(null);

  useRovingFocus(chipsRef, 'button[role="radio"]', { orientation: 'horizontal' });

  const unread = unreadCount ?? 0;

  async function markAll(): Promise<void> {
    try {
      const ids = await queryUnreadIds(view);
      if (ids.length === 0) {
        toast.info('Nothing to mark as read');
        return;
      }
      if (ids.length > CONFIRM_THRESHOLD) {
        setConfirmCount(ids.length);
        return;
      }
      await commitMarkAll(view);
    } catch {
      toast.error('Could not mark articles as read');
    }
  }

  return (
    <header className="steel hairline-b relative z-sticky flex h-[var(--toolbar-h)] shrink-0 items-center gap-1.5 px-3">
      <IconButton label="Feeds" icon={PanelLeft} className="md:hidden" onClick={showFeeds} />

      <h2 className="min-w-0 truncate text-lg font-semibold tracking-[-0.01em] text-text">{title}</h2>
      <Badge count={unread} tone="accent" className="shrink-0" />

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <div ref={chipsRef} role="radiogroup" aria-label="Filter" className="mr-1 flex items-center gap-1">
          <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </Chip>
          <Chip selected={filter === 'unread'} onClick={() => setFilter('unread')}>
            Unread
          </Chip>
        </div>

        <div className="hidden items-center gap-0.5 lg:flex">
          <IconButton
            ref={sortRef}
            label="Sort"
            icon={ArrowUpDown}
            aria-haspopup="menu"
            aria-expanded={sortOpen}
            onClick={() => setSortOpen((o) => !o)}
          />
          <Menu open={sortOpen} onOpenChange={setSortOpen} triggerRef={sortRef} align="end" label="Sort order">
            <SortItems sort={sort} />
          </Menu>
          <IconButton
            label="Mark all as read"
            icon={CheckCheck}
            disabled={unread === 0}
            onClick={() => void markAll()}
          />
        </div>

        <IconButton
          ref={moreRef}
          label="More timeline actions"
          icon={MoreHorizontal}
          className="lg:hidden"
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((o) => !o)}
        />
        <Menu open={moreOpen} onOpenChange={setMoreOpen} triggerRef={moreRef} align="end" label="Timeline actions">
          <SortItems sort={sort} />
          <MenuItem icon={CheckCheck} disabled={unread === 0} onClick={() => void markAll()}>
            Mark all as read
          </MenuItem>
        </Menu>

        <IconButton
          label="Refresh"
          icon={RefreshCw}
          disabled={syncing}
          aria-busy={syncing || undefined}
          className={cn(syncing && '[&>svg]:animate-spin-slow')}
          onClick={() => void refreshAll()}
        />
      </div>

      {syncing ? <SyncBar /> : null}

      <Dialog
        open={confirmCount !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmCount(null);
        }}
        title="Mark all as read?"
        description={`${confirmCount ?? 0} articles in this view will be marked as read. You can undo right after.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmCount(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirmCount(null);
                void commitMarkAll(view);
              }}
            >
              Mark as read
            </Button>
          </>
        }
      />
    </header>
  );
}

/* Online state without depending on another module: a plain external store over window events. */
function subscribeOnline(listener: () => void): () => void {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
}

function useIsOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

export interface TimelineStatusProps {
  /** Articles shown in the list. */
  count: number;
  unreadCount: number | undefined;
}

/** Sub-header: counts, last sync time, and the offline notice. Hidden while the list is empty and online. */
export function TimelineStatus({ count, unreadCount }: TimelineStatusProps) {
  const lastSyncAt = useSetting('lastSyncAt');
  const now = useNow();
  const online = useIsOnline();
  if (count === 0 && online) return null;
  return (
    <div className="flex h-7 shrink-0 items-center gap-3 overflow-hidden px-3 text-xs text-text-muted tabular-nums">
      {!online ? (
        <span className="inline-flex shrink-0 items-center gap-1.5">
          <WifiOff aria-hidden="true" size={14} strokeWidth={1.75} />
          Offline — showing cached articles
        </span>
      ) : null}
      {count > 0 ? (
        <span className="min-w-0 truncate">
          {`${count} articles · ${unreadCount ?? 0} unread · ${lastSyncAt ? `updated ${timeAgo(lastSyncAt, now)}` : 'not synced yet'}`}
        </span>
      ) : null}
    </div>
  );
}
