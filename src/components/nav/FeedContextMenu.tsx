import type { RefObject } from 'react';
import { CheckCheck, Folder as FolderIcon, FolderPlus, Inbox, Link as LinkIcon, Pencil, Star, Trash2 } from 'lucide-react';
import { Menu, MenuItem } from '@/components/ui/Menu';
import { db } from '@/db/db';
import type { Feed, Folder } from '@/db/schema';
import { markAllRead, undoMarkAllRead } from '@/features/articles/articleActions';
import { useFolders } from '@/features/feeds/feedQueries';
import { deleteFolder, moveFeedToFolder } from '@/features/feeds/folders';
import { removeFeed, restoreFeed } from '@/features/feeds/removeFeed';
import { toast } from '@/lib/toast';
import { useUiStore } from '@/store/uiStore';
import type { View } from '@/store/types';

function messageOf(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

/** Run an async action; failures become an error toast. */
function run(task: () => Promise<void>, failure: string): void {
  task().catch((err: unknown) => toast.error(failure, { description: messageOf(err) }));
}

/** Rename a feed. Sets titleCustomized so a later sync does not overwrite the title. */
export async function renameFeed(feedId: string, title: string): Promise<void> {
  await db.feeds.update(feedId, { title, titleCustomized: 1, updatedAt: Date.now() });
}

async function toggleFavoriteFeed(feed: Feed): Promise<void> {
  const on = feed.isFavorite !== 1;
  await db.feeds.update(feed.id, { isFavorite: on ? 1 : 0, updatedAt: Date.now() });
  toast.success(on ? `${feed.title} is now a favorite feed` : `${feed.title} is no longer a favorite feed`);
}

async function markReadWithUndo(view: View, emptyLabel: string): Promise<void> {
  const ids = await markAllRead(view);
  if (ids.length === 0) {
    toast.info(`Nothing unread in ${emptyLabel}`);
    return;
  }
  toast.undo(`Marked ${ids.length} as read`, {
    onUndo: () => {
      void undoMarkAllRead(ids);
    },
  });
}

async function unsubscribe(feed: Feed): Promise<void> {
  const snapshot = await removeFeed(feed.id);
  if (!snapshot) {
    toast.info(`${feed.title} was already removed`);
    return;
  }
  const ui = useUiStore.getState();
  if (ui.view.type === 'feed' && ui.view.feedId === feed.id) ui.setView({ type: 'all' });
  toast.undo(`Unsubscribed from ${feed.title}`, {
    description: `${snapshot.articles.length} articles removed`,
    onUndo: () => {
      restoreFeed(snapshot).then(
        () => toast.success(`Restored ${feed.title}`),
        (err: unknown) => toast.error('Could not restore the feed', { description: messageOf(err) }),
      );
    },
  });
}

async function copyFeedUrl(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Feed URL copied');
  } catch {
    toast.error('Could not copy the feed URL');
  }
}

async function restoreFolder(folder: Folder, feedIds: string[]): Promise<void> {
  await db.transaction('rw', db.folders, db.feeds, async () => {
    await db.folders.put(folder);
    if (feedIds.length > 0) await db.feeds.where(':id').anyOf(feedIds).modify({ folderId: folder.id });
  });
}

/** Delete a folder (its feeds become unfiled) with an Undo that puts everything back. */
async function removeFolderWithUndo(folder: Folder): Promise<void> {
  const feedIds = await db.feeds.where('folderId').equals(folder.id).primaryKeys();
  await deleteFolder(folder.id);
  const ui = useUiStore.getState();
  if (ui.view.type === 'folder' && ui.view.folderId === folder.id) ui.setView({ type: 'all' });
  toast.undo(`Deleted folder ${folder.name}`, {
    description: feedIds.length > 0 ? `${feedIds.length} feeds moved out of it` : 'The folder was empty',
    onUndo: () => {
      restoreFolder(folder, feedIds).then(
        () => toast.success(`Restored folder ${folder.name}`),
        (err: unknown) => toast.error('Could not restore the folder', { description: messageOf(err) }),
      );
    },
  });
}

export interface FeedContextMenuProps {
  feed: Feed;
  /** Element the menu is anchored to (the row or its more-actions button). Focus returns here. */
  anchorRef: RefObject<HTMLElement | null>;
  onClose(): void;
  onRename(): void;
  onNewFolder(): void;
}

/** Actions for one feed: rename, move, favorite, mark read, copy URL, unsubscribe. Mounted only while open. */
export function FeedContextMenu({ feed, anchorRef, onClose, onRename, onNewFolder }: FeedContextMenuProps) {
  const folders = useFolders();
  const move = (folderId: string | null) =>
    run(() => moveFeedToFolder(feed.id, folderId), 'Could not move the feed');

  return (
    <Menu
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      triggerRef={anchorRef}
      label={`Actions for ${feed.title}`}
      className="max-h-[60dvh] overflow-y-auto"
    >
      <MenuItem icon={Pencil} onClick={onRename}>
        Rename
      </MenuItem>
      <div role="separator" className="hairline-t my-1.5" />
      <div role="none" className="px-3 pt-1 pb-1 text-xs font-semibold tracking-[0.08em] text-text-faint uppercase">
        Move to folder
      </div>
      {(folders ?? []).map((folder) => (
        <MenuItem
          key={folder.id}
          icon={FolderIcon}
          hint={folder.id === feed.folderId ? 'Current' : undefined}
          onClick={() => move(folder.id)}
        >
          {folder.name}
        </MenuItem>
      ))}
      <MenuItem icon={Inbox} hint={feed.folderId === null ? 'Current' : undefined} onClick={() => move(null)}>
        No folder
      </MenuItem>
      <MenuItem icon={FolderPlus} onClick={onNewFolder}>
        New folder…
      </MenuItem>
      <div role="separator" className="hairline-t my-1.5" />
      <MenuItem icon={Star} onClick={() => run(() => toggleFavoriteFeed(feed), 'Could not update the feed')}>
        {feed.isFavorite === 1 ? 'Unfavorite feed' : 'Favorite feed (notify)'}
      </MenuItem>
      <MenuItem
        icon={CheckCheck}
        onClick={() => run(() => markReadWithUndo({ type: 'feed', feedId: feed.id }, feed.title), 'Could not mark as read')}
      >
        Mark all read
      </MenuItem>
      <MenuItem icon={LinkIcon} onClick={() => void copyFeedUrl(feed.url)}>
        Copy feed URL
      </MenuItem>
      <div role="separator" className="hairline-t my-1.5" />
      <MenuItem icon={Trash2} destructive onClick={() => run(() => unsubscribe(feed), 'Could not unsubscribe')}>
        Unsubscribe
      </MenuItem>
    </Menu>
  );
}

export interface FolderContextMenuProps {
  folder: Folder;
  anchorRef: RefObject<HTMLElement | null>;
  onClose(): void;
  onRename(): void;
}

/** Actions for one folder: rename, mark all read, delete (feeds become unfiled, undoable). */
export function FolderContextMenu({ folder, anchorRef, onClose, onRename }: FolderContextMenuProps) {
  return (
    <Menu
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      triggerRef={anchorRef}
      label={`Actions for folder ${folder.name}`}
    >
      <MenuItem icon={Pencil} onClick={onRename}>
        Rename
      </MenuItem>
      <MenuItem
        icon={CheckCheck}
        onClick={() => run(() => markReadWithUndo({ type: 'folder', folderId: folder.id }, folder.name), 'Could not mark as read')}
      >
        Mark all read
      </MenuItem>
      <div role="separator" className="hairline-t my-1.5" />
      <MenuItem icon={Trash2} destructive onClick={() => run(() => removeFolderWithUndo(folder), 'Could not delete the folder')}>
        Delete folder
      </MenuItem>
    </Menu>
  );
}
