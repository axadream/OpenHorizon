import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { Article, Feed } from '@/db/schema';
import { Button } from '@/components/ui/Button';
import { toggleFavorite, toggleReadLater, toggleRead } from '@/features/articles/articleActions';
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
