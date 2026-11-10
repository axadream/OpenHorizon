import { Fragment, useMemo, useRef, useState, type ComponentPropsWithoutRef, type FormEvent, type KeyboardEvent } from 'react';
import Dexie from 'dexie';
import { Bookmark, CircleDot, FolderPlus, Inbox, PanelLeftClose, PanelLeftOpen, Plus, RefreshCw, Rss, Search, Settings, Star, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { FeedRowSkeleton } from '@/components/ui/Skeleton';
import { db } from '@/db/db';
import type { Feed, Folder } from '@/db/schema';
import { useCounts } from '@/features/articles/articleQueries';
import { useFeeds, useFolders, useUnreadCounts } from '@/features/feeds/feedQueries';
import { createFolder, moveFeedToFolder, renameFolder, setFolderCollapsed } from '@/features/feeds/folders';
import { syncAll } from '@/features/sync/syncAll';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useLive } from '@/hooks/useLive';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/toast';
import { useNavCollapsed, useSearchQuery, useSyncing, useSyncingFeedIds, useView } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import type { View } from '@/store/types';
import { NavRow } from '@/components/nav/NavRow';
import { FeedRow } from '@/components/nav/FeedRow';
import { FolderRow } from '@/components/nav/FolderRow';
import { NavSearch } from '@/components/nav/NavSearch';
import { FeedContextMenu, FolderContextMenu, renameFeed } from '@/components/nav/FeedContextMenu';

/** Two-column layout range (tablet): nav is forced to the 64 px rail. */
export const TABLET_QUERY = '(min-width: 768px) and (max-width: 1023.98px)';

/** True when the nav renders as the 64 px rail: collapsed by the user, or forced on tablet. Never on mobile. */
export function useNavRail(): boolean {
  const collapsed = useNavCollapsed();
  const mobile = useIsMobile();
  const tablet = useMediaQuery(TABLET_QUERY);
  return !mobile && (collapsed || tablet);
}

type MenuTarget = { kind: 'feed'; feed: Feed } | { kind: 'folder'; folder: Folder };

function selectView(view: View): void {
  useUiStore.getState().setView(view);
}

/** Inline form that creates a folder; when opened from a feed's menu the feed is moved into it. */
function NewFolderForm({ feedId, onDone }: { feedId: string | null; onDone(): void }) {
  const [name, setName] = useState('');
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) {
      onDone();
      return;
    }
    try {
      const folder = await createFolder(name);
      if (feedId) await moveFeedToFolder(feedId, folder.id);
      toast.success(`Created folder ${folder.name}`);
    } catch (err: unknown) {
      toast.error('Could not create the folder', { description: err instanceof Error ? err.message : undefined });
    }
    onDone();
  };
  return (
    <form onSubmit={submit} className="px-2 pb-2">
      <Input
        aria-label="New folder name"
        placeholder="Folder name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onDone();
          }
        }}
        className="h-8 text-sm"
      />
    </form>
  );
}

/**
 * Left navigation pane: smart views, folders with their feeds, unfiled feeds, search, and a
 * footer with Add feed / Settings / Refresh all and the online indicator. In rail mode the same
 * tree renders as icons with tooltips and accent dots.
 */
export function NavPane({ className, ...rest }: ComponentPropsWithoutRef<'nav'>) {
  const rail = useNavRail();
  const view = useView();
  const search = useSearchQuery();
  const feeds = useFeeds();
  const folders = useFolders();
  const unread = useUnreadCounts();
  const counts = useCounts();
  const favoriteUnread = useLive(
    () =>
      db.articles
        .where('[isFavorite+publishedAt]')
        .between([1, Dexie.minKey], [1, Dexie.maxKey], true, true)
        .and((a) => a.isRead === 0)
        .count(),
    [],
    0,
  );
  const syncingIds = useSyncingFeedIds();
  const syncing = useSyncing();
  const online = useOnlineStatus();

  const [searchOpen, setSearchOpen] = useState(false);
  const [renamingFeedId, setRenamingFeedId] = useState<string | null>(null);
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<{ feedId: string | null } | null>(null);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useRovingFocus(bodyRef, '[data-nav-item]', { orientation: 'vertical', loop: true });

  const folderIds = useMemo(() => new Set((folders ?? []).map((f) => f.id)), [folders]);
  const grouped = useMemo(() => {
    const byFolder = new Map<string, Feed[]>();
    const unfiled: Feed[] = [];
    for (const feed of feeds ?? []) {
      if (feed.folderId && folderIds.has(feed.folderId)) {
        const list = byFolder.get(feed.folderId) ?? [];
        list.push(feed);
        byFolder.set(feed.folderId, list);
      } else {
        unfiled.push(feed);
      }
    }
    return { byFolder, unfiled };
  }, [feeds, folderIds]);

  const query = search.trim().toLocaleLowerCase();
  const matches = query ? (feeds ?? []).filter((f) => f.title.toLocaleLowerCase().includes(query)) : null;

  const openMenu = (el: HTMLElement, target: MenuTarget) => {
    anchorRef.current = el;
    setMenu(target);
  };
  const closeMenu = () => {
    setMenu(null);
    anchorRef.current?.focus({ preventScroll: true });
  };

  const toggleSearch = () => {
    if (searchOpen) {
      setSearchOpen(false);
      useUiStore.getState().setSearchQuery('');
    } else {
      setSearchOpen(true);
    }
  };
  const closeSearch = () => toggleSearch();

  const refreshAll = () => {
    syncAll().catch((err: unknown) => toast.error('Sync failed', { description: err instanceof Error ? err.message : undefined }));
  };

  const onNavKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    if (!el.hasAttribute('data-nav-item')) return;
    const folderId = el.dataset.folderToggle ?? el.dataset.folderRow;
    const folder = folderId ? (folders ?? []).find((f) => f.id === folderId) : undefined;
    const items = Array.from(bodyRef.current?.querySelectorAll<HTMLElement>('[data-nav-item]') ?? []);
    const index = items.indexOf(el);

    if (e.key === 'ArrowRight' && folder) {
      e.preventDefault();
      if (folder.collapsed === 1) void setFolderCollapsed(folder.id, false);
      else items[index + 1]?.focus();
    } else if (e.key === 'ArrowLeft') {
      if (folder && folder.collapsed !== 1) {
        e.preventDefault();
        void setFolderCollapsed(folder.id, true);
        return;
      }
      const parent = el.dataset.parentFolder;
      if (parent) {
        e.preventDefault();
        bodyRef.current?.querySelector<HTMLElement>(`[data-folder-row="${parent}"]`)?.focus();
      }
    }
  };

  const renderFeed = (feed: Feed, depth: 0 | 1, parentFolderId: string | null) => (
    <FeedRow
      key={feed.id}
      feed={feed}
      unreadCount={unread?.byFeed.get(feed.id) ?? 0}
      selected={view.type === 'feed' && view.feedId === feed.id}
      depth={depth}
      parentFolderId={parentFolderId}
      rail={rail}
      syncing={syncingIds.has(feed.id)}
      renaming={renamingFeedId === feed.id}
      onSelect={(feedId) => selectView({ type: 'feed', feedId })}
      onContextMenu={(e, target) => openMenu(e.currentTarget as HTMLElement, { kind: 'feed', feed: target })}
      onRenameCommit={(title) => {
        setRenamingFeedId(null);
        renameFeed(feed.id, title).catch((err: unknown) =>
          toast.error('Could not rename the feed', { description: err instanceof Error ? err.message : undefined }),
        );
      }}
      onRenameCancel={() => setRenamingFeedId(null)}
    />
  );

  const menuTarget = menu;

  return (
    <nav
      id="nav-pane"
      aria-label="Feeds"
      className={cn('flex min-h-0 flex-col overflow-hidden border-r border-border bg-panel', className)}
      {...rest}
    >
      <header className="steel hairline-b flex h-[var(--toolbar-h)] shrink-0 items-center gap-2 px-3">
        <Rss aria-hidden="true" size={20} strokeWidth={1.75} className="shrink-0 text-accent" />
        {rail ? null : (
          <p className="min-w-0 flex-1 truncate text-lg font-semibold tracking-[-0.01em] text-text">OpenHorizon</p>
        )}
        {rail ? null : (
          <IconButton label="Search feeds" icon={Search} pressed={searchOpen} onClick={toggleSearch} />
        )}
      </header>

      {searchOpen && !rail ? <NavSearch onClose={closeSearch} /> : null}

      <div
        ref={bodyRef}
        onKeyDown={onNavKeyDown}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
      >
        <section aria-labelledby="nav-smart">
          <h2
            id="nav-smart"
            className={cn(
              'px-2 pt-1 pb-1.5 text-xs font-semibold tracking-[0.08em] text-text-faint uppercase',
              rail && 'sr-only',
            )}
          >
            Smart views
          </h2>
          <ul role="list" className="flex flex-col gap-0.5">
            <NavRow
              icon={Inbox}
              label="All"
              count={counts.unread}
              selected={view.type === 'all'}
              rail={rail}
              onSelect={() => selectView({ type: 'all' })}
            />
            <NavRow
              icon={CircleDot}
              label="Unread"
              count={counts.unread}
              selected={view.type === 'unread'}
              rail={rail}
              onSelect={() => selectView({ type: 'unread' })}
            />
            <NavRow
              icon={Star}
              label="Favorites"
              count={favoriteUnread}
              selected={view.type === 'favorites'}
              rail={rail}
              onSelect={() => selectView({ type: 'favorites' })}
            />
            <NavRow
              icon={Bookmark}
              label="Read Later"
              count={counts.readLater}
              selected={view.type === 'readLater'}
              rail={rail}
              onSelect={() => selectView({ type: 'readLater' })}
            />
          </ul>
        </section>

        <section aria-labelledby="nav-folders" className="mt-4">
          <div className={cn('flex items-center justify-between pr-1', rail && 'justify-center')}>
            <h2
              id="nav-folders"
              className={cn(
                'px-2 pt-1 pb-1.5 text-xs font-semibold tracking-[0.08em] text-text-faint uppercase',
                rail && 'sr-only',
              )}
            >
              {matches ? 'Matching feeds' : 'Folders'}
            </h2>
            {rail || matches ? null : (
              <IconButton
                label="New folder"
                icon={FolderPlus}
                size="sm"
                onClick={() => setNewFolder({ feedId: null })}
              />
            )}
          </div>

          {newFolder && !matches && !rail ? (
            <NewFolderForm feedId={newFolder.feedId} onDone={() => setNewFolder(null)} />
          ) : null}

          {feeds === undefined || folders === undefined ? (
            <div className="flex flex-col gap-1 px-1">
              <FeedRowSkeleton />
              <FeedRowSkeleton />
              <FeedRowSkeleton />
            </div>
          ) : null}

          {feeds !== undefined && folders !== undefined && feeds.length === 0 && folders.length === 0 ? (
            <p className={cn('px-2 py-2 text-sm text-text-muted', rail && 'sr-only')}>
              No feeds yet. Add one to get started.
            </p>
          ) : null}

          {matches ? (
            matches.length === 0 ? (
              <p className={cn('px-2 py-2 text-sm text-text-muted', rail && 'sr-only')}>No feeds match “{search.trim()}”.</p>
            ) : (
              <ul role="list" aria-label="Matching feeds" className="flex flex-col gap-0.5">
                {matches.map((feed) => renderFeed(feed, 0, feed.folderId))}
              </ul>
            )
          ) : (
            <>
              <ul role="list" className="flex flex-col gap-0.5">
                {(folders ?? []).map((folder) => {
                  const kids = grouped.byFolder.get(folder.id) ?? [];
                  const expanded = folder.collapsed !== 1;
                  const childrenId = `nav-folder-${folder.id}`;
                  return (
                    <Fragment key={folder.id}>
                      <FolderRow
                        folder={folder}
                        unreadCount={unread?.byFolder.get(folder.id) ?? 0}
                        selected={view.type === 'folder' && view.folderId === folder.id}
                        expanded={expanded}
                        rail={rail}
                        renaming={renamingFolderId === folder.id}
                        childrenId={childrenId}
                        onToggle={() => void setFolderCollapsed(folder.id, expanded)}
                        onSelect={() => selectView({ type: 'folder', folderId: folder.id })}
                        onContextMenu={(e, target) => openMenu(e.currentTarget as HTMLElement, { kind: 'folder', folder: target })}
                        onRenameCommit={(name) => {
                          setRenamingFolderId(null);
                          renameFolder(folder.id, name).catch((err: unknown) =>
                            toast.error('Could not rename the folder', { description: err instanceof Error ? err.message : undefined }),
                          );
                        }}
                        onRenameCancel={() => setRenamingFolderId(null)}
                      />
                      {expanded && kids.length > 0 ? (
                        <li role="none">
                          <ul id={childrenId} role="group" aria-label={`${folder.name} feeds`} className="flex flex-col gap-0.5">
                            {kids.map((feed) => renderFeed(feed, 1, folder.id))}
                          </ul>
                        </li>
                      ) : null}
                    </Fragment>
                  );
                })}
              </ul>

              {grouped.unfiled.length > 0 ? (
                <>
                  {(folders ?? []).length > 0 && !rail ? (
                    <h3 className="px-2 pt-3 pb-1.5 text-xs font-semibold tracking-[0.08em] text-text-faint uppercase">
                      Unfiled
                    </h3>
                  ) : null}
                  <ul role="list" aria-label="Unfiled feeds" className="flex flex-col gap-0.5">
                    {grouped.unfiled.map((feed) => renderFeed(feed, 0, null))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </section>
      </div>

      <footer
        className={cn(
          'steel hairline-t flex shrink-0 items-center gap-1 px-2 py-2',
          rail ? 'flex-col' : 'justify-between',
        )}
      >
        <IconButton label="Settings" icon={Settings} onClick={() => useUiStore.getState().openDialog('settings')} />
        {rail ? (
          <IconButton label="Add feed" icon={Plus} onClick={() => useUiStore.getState().openDialog('addFeed')} />
        ) : (
          <Button variant="primary" size="sm" leadingIcon={Plus} onClick={() => useUiStore.getState().openDialog('addFeed')}>
            Add feed
          </Button>
        )}
        <span className={cn('inline-flex', syncing && '[&_svg]:animate-spin-slow')}>
          <IconButton
            label="Refresh all feeds"
            icon={RefreshCw}
            disabled={syncing}
            aria-busy={syncing || undefined}
            onClick={refreshAll}
          />
        </span>
        {online ? null : (
          <span role="status" aria-label="Offline" title="Offline" className="inline-flex items-center gap-1 text-xs text-warning">
            <WifiOff aria-hidden="true" size={14} strokeWidth={1.75} />
            {rail ? null : <span>Offline</span>}
          </span>
        )}
        <IconButton
          label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
          icon={rail ? PanelLeftOpen : PanelLeftClose}
          className="hidden lg:inline-flex"
          onClick={() => useUiStore.getState().toggleNavCollapsed()}
        />
      </footer>

      {menuTarget?.kind === 'feed' ? (
        <FeedContextMenu
          feed={menuTarget.feed}
          anchorRef={anchorRef}
          onClose={closeMenu}
          onRename={() => setRenamingFeedId(menuTarget.feed.id)}
          onNewFolder={() => setNewFolder({ feedId: menuTarget.feed.id })}
        />
      ) : null}
      {menuTarget?.kind === 'folder' ? (
        <FolderContextMenu
          folder={menuTarget.folder}
          anchorRef={anchorRef}
          onClose={closeMenu}
          onRename={() => setRenamingFolderId(menuTarget.folder.id)}
        />
      ) : null}
    </nav>
  );
}
