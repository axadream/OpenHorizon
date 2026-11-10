import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { Article, Feed } from '@/db/schema';
import { Button } from '@/components/ui/Button';
import { toggleFavorite, toggleReadLater, toggleRead } from '@/features/articles/articleActions';
import {
  deleteArticleWithUndo,
  reportFailure,
  toggleFavoriteWithToast,
} from '@/features/articles/articleCommands';
import type { GesturePoint } from '@/hooks/useLongPress';
import { setTimelineIds } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import { toast } from '@/lib/toast';
import { ArticleRow } from './ArticleRow';

export interface ArticleListProps {
  articles: readonly Article[];
  feedMap: ReadonlyMap<string, Feed>;
  /** View name, used for the listbox label. */
  label: string;
  density: 'comfortable' | 'compact';
  selectedId: string | null;
  recentCutoff: number;
  /** True when the page is full and more articles may exist. */
  canLoadMore: boolean;
}

/*
 * Module-level handlers: identities never change, so memoised rows never re-render because
 * of a callback. Store writes go through getState() to avoid subscribing this component.
 */
function select(id: string): void {
  useUiStore.getState().selectArticle(id, { openOnMobile: true });
}

function report(action: Promise<unknown>, message: string): void {
  action.catch(() => toast.error(message));
}

const onToggleFavorite = (id: string) => report(toggleFavorite(id), 'Could not update favorite');
const onToggleReadLater = (id: string) => report(toggleReadLater(id), 'Could not update read later');
const onToggleRead = (id: string) => report(toggleRead(id), 'Could not update read state');
const onLoadMore = () => useUiStore.getState().loadMore();

/* Gestures: swipe right deletes (undoable), swipe left toggles favorite (announced), long press opens the sheet. */
const onSwipeDelete = (id: string) => void deleteArticleWithUndo(id).catch(reportFailure('Could not delete the article'));
const onSwipeFavorite = (id: string) => void toggleFavoriteWithToast(id).catch(reportFailure('Could not update favorite'));
const onOpenActions = (id: string, point: GesturePoint) =>
  useUiStore.getState().openDialog('articleActions', { articleId: id, x: point.x, y: point.y });

/** Opens the action sheet for a row from the keyboard, anchored to the row's left edge. */
function openActionsForRow(id: string): void {
  const rect = document.getElementById(`article-${id}`)?.getBoundingClientRect();
  onOpenActions(id, rect ? { x: rect.left + 24, y: rect.top + rect.height / 2 } : { x: 0, y: 0 });
}

/**
 * Listbox of timeline rows (DESIGN §6.4, WAI-ARIA listbox). One tab stop; the "active" row is
 * exposed via aria-activedescendant and moved with ArrowUp/ArrowDown/Home/End. Enter or Space
 * selects it. Also publishes the ordered ids to the store for the keyboard hook.
 */
export function ArticleList({ articles, feedMap, label, density, selectedId, recentCutoff, canLoadMore }: ArticleListProps) {
  const ids = useMemo(() => articles.map((a) => a.id), [articles]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    setTimelineIds(ids);
  }, [ids]);

  // Active row: the arrow-key position if it is still in the list, else the selection, else the first row.
  const activeInList = activeId !== null && ids.includes(activeId);
  const selectedInList = selectedId !== null && ids.includes(selectedId);
  const active = activeInList ? activeId : selectedInList ? selectedId : (ids[0] ?? null);

  const onRowSelect = useCallback((id: string) => {
    setActiveId(id);
    select(id);
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (ids.length === 0) return;
    const index = active === null ? -1 : ids.indexOf(active);
    let next: number;
    switch (e.key) {
      case 'ArrowDown':
        next = Math.min(index + 1, ids.length - 1);
        break;
      case 'ArrowUp':
        next = Math.max(index - 1, 0);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = ids.length - 1;
        break;
      case 'Enter':
      case ' ':
        if (active !== null) {
          e.preventDefault();
          onRowSelect(active);
        }
        return;
      case 'ContextMenu':
      case 'F10':
        // The Menu key and Shift+F10 open the same sheet a long press does. Focus stays on the listbox.
        if (e.key === 'F10' && !e.shiftKey) return;
        if (active !== null) {
          e.preventDefault();
          openActionsForRow(active);
        }
        return;
      default:
        return;
    }
    e.preventDefault();
    const nextId = ids[next];
    setActiveId(nextId);
    document.getElementById(`article-${nextId}`)?.scrollIntoView({ block: 'nearest' });
  };

  return (
    <>
      <ul
        id="timeline-listbox"
        role="listbox"
        aria-label={`${label} articles`}
        aria-activedescendant={active !== null ? `article-${active}` : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="focus-ring min-h-full"
      >
        {articles.map((article, index) => {
          const feed = feedMap.get(article.feedId);
          return (
            <ArticleRow
              key={article.id}
              article={article}
              feedTitle={feed?.title ?? 'Unknown feed'}
              feedFaviconUrl={feed?.faviconUrl}
              selected={article.id === selectedId}
              index={index}
              density={density}
              recentCutoff={recentCutoff}
              onSelect={onRowSelect}
              onToggleFavorite={onToggleFavorite}
              onToggleReadLater={onToggleReadLater}
              onToggleRead={onToggleRead}
              onSwipeDelete={onSwipeDelete}
              onSwipeFavorite={onSwipeFavorite}
              onOpenActions={onOpenActions}
            />
          );
        })}
      </ul>
      {canLoadMore ? (
        <div className="flex justify-center p-3">
          <Button variant="steel" onClick={onLoadMore}>
            Load more
          </Button>
        </div>
      ) : null}
    </>
  );
}
