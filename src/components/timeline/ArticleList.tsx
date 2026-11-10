import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { Article, Feed } from '@/db/schema';
import { Button } from '@/components/ui/Button';
import { toggleFavorite, toggleReadLater, toggleRead } from '@/features/articles/articleActions';
import {
  deleteArticleWithUndo,
  reportFailure,
  toggleFavoriteWithToast,
} from '@/features/articles/articleCommands';
import type { LayoutMode } from '@/features/appearance/appearance';
import { useAppearanceStore } from '@/features/appearance/appearanceStore';
import type { GesturePoint } from '@/hooks/useLongPress';
import { t, useIsRtl, useLocale } from '@/i18n/i18n';
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
  layout: LayoutMode;
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
  const ui = useUiStore.getState();
  ui.selectArticle(id, { openOnMobile: true });
  // Reading layout: choosing an article hands the screen to the reader (J/K keeps the list open).
  if (useAppearanceStore.getState().layoutMode === 'reading') ui.setTimelineOverlay(false);
}

function report(action: Promise<unknown>, message: () => string): void {
  action.catch(() => toast.error(message()));
}

const onToggleFavorite = (id: string) => report(toggleFavorite(id), () => t('article.couldNotFavorite'));
const onToggleReadLater = (id: string) => report(toggleReadLater(id), () => t('article.couldNotLater'));
const onToggleRead = (id: string) => report(toggleRead(id), () => t('article.couldNotReadState'));
const onLoadMore = () => useUiStore.getState().loadMore();

/* Gestures: swipe deletes (undoable), swipe favorites (announced), long press opens the sheet. */
const onSwipeDelete = (id: string) =>
  void deleteArticleWithUndo(id).catch(reportFailure(t('article.couldNotDelete')));
const onSwipeFavorite = (id: string) =>
  void toggleFavoriteWithToast(id).catch(reportFailure(t('article.couldNotFavorite')));
const onOpenActions = (id: string, point: GesturePoint) =>
  useUiStore.getState().openDialog('articleActions', { articleId: id, x: point.x, y: point.y });

/** Opens the action sheet for a row from the keyboard, anchored to the row's start edge. */
function openActionsForRow(id: string): void {
  const rect = document.getElementById(`article-${id}`)?.getBoundingClientRect();
  onOpenActions(id, rect ? { x: rect.left + 24, y: rect.top + rect.height / 2 } : { x: 0, y: 0 });
}

/**
 * Listbox of timeline rows (DESIGN §6.4, WAI-ARIA listbox). One tab stop; the "active" row is
 * exposed via aria-activedescendant and moved with ArrowUp/ArrowDown/Home/End. Enter or Space
 * selects it. Also publishes the ordered ids to the store for the keyboard hook.
 */
export function ArticleList({ articles, feedMap, label, density, layout, selectedId, recentCutoff, canLoadMore }: ArticleListProps) {
  const ids = useMemo(() => articles.map((a) => a.id), [articles]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const locale = useLocale();
  const rtl = useIsRtl();

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
        aria-label={t('timeline.articlesLabel', { title: label })}
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
              feedTitle={feed?.title ?? t('common.unknownFeed')}
              feedFaviconUrl={feed?.faviconUrl}
              selected={article.id === selectedId}
              index={index}
              layout={layout}
              density={density}
              recentCutoff={recentCutoff}
              rtl={rtl}
              locale={locale}
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
            {t('timeline.loadMore')}
          </Button>
        </div>
      ) : null}
    </>
  );
}
