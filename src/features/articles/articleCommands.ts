import { db } from '@/db/db';
import { toast } from '@/lib/toast';
import { useUiStore } from '@/store/uiStore';
import { deleteArticle, markRead, markUnread, restoreArticle, setFavorite, setReadLater } from './articleActions';

/*
 * User-facing article commands shared by swipe gestures, the action sheet and keyboard shortcuts.
 * Each one reads the current row, applies the opposite state and announces the result through the
 * toast live region, so every input path reports the same way.
 */

function describeFailure(err: unknown): string | undefined {
  return err instanceof Error ? err.message : undefined;
}

/** Shows an error toast for a failed command. */
export function reportFailure(message: string): (err: unknown) => void {
  return (err) => toast.error(message, { description: describeFailure(err) });
}

/**
 * Delete one article with an Undo toast. Returns false when it no longer existed. The undo restores
 * the exact row and clears its tombstone, so a sync in the meantime cannot duplicate it.
 */
export async function deleteArticleWithUndo(id: string): Promise<boolean> {
  const removed = await deleteArticle(id);
  if (!removed) {
    toast.info('That article is already gone');
    return false;
  }
  // The reader waits for its article; a deleted one must not leave it on a skeleton.
  const ui = useUiStore.getState();
  if (ui.selectedArticleId === id) ui.selectArticle(null);
  toast.undo('Article deleted', {
    onUndo: () => {
      restoreArticle(removed).then(
        (restored) => {
          if (restored) toast.success('Article restored');
          else toast.error('Could not restore the article', { description: 'Its feed was removed' });
        },
        reportFailure('Could not restore the article'),
      );
    },
  });
  return true;
}

export async function toggleReadWithToast(id: string): Promise<void> {
  const article = await db.articles.get(id);
  if (!article) return;
  if (article.isRead === 1) {
    await markUnread(id);
    toast.success('Marked as unread');
  } else {
    await markRead(id);
    toast.success('Marked as read');
  }
}

export async function toggleFavoriteWithToast(id: string): Promise<void> {
  const article = await db.articles.get(id);
  if (!article) return;
  const on = article.isFavorite !== 1;
  await setFavorite(id, on);
  toast.success(on ? 'Added to favorites' : 'Removed from favorites');
}

export async function toggleReadLaterWithToast(id: string): Promise<void> {
  const article = await db.articles.get(id);
  if (!article) return;
  const on = article.isReadLater !== 1;
  await setReadLater(id, on);
  toast.success(on ? 'Saved for later' : 'Removed from read later');
}
