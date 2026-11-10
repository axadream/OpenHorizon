import { useEffect, useRef, useState } from 'react';
import { Bookmark, Circle, CircleCheck, ExternalLink, Share2, Star, Trash2, type LucideIcon } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Menu, MenuItem } from '@/components/ui/Menu';
import type { Article } from '@/db/schema';
import {
  deleteArticleWithUndo,
  reportFailure,
  toggleFavoriteWithToast,
  toggleReadLaterWithToast,
  toggleReadWithToast,
} from '@/features/articles/articleCommands';
import { useArticle } from '@/features/articles/articleQueries';
import { useFeedMap } from '@/features/feeds/feedQueries';
import { share } from '@/features/sharing/share';
import { useIsMobile } from '@/hooks/useIsMobile';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/toast';
import { useDialog } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import type { ArticleActionsPayload } from '@/store/types';

/*
 * Long-press / context-menu actions for one article. Mobile: a bottom sheet (Dialog, placement
 * "bottom"; the native dialog gives the focus trap, Escape and backdrop close). Desktop: a Menu
 * anchored at the pointer position. Both render the same action list. Mounted once in AppDialogs.
 */

/** Popover leaves after 120 ms; focus goes back to the row once it has gone. */
const FOCUS_RETURN_DELAY_MS = 130;

interface SheetAction {
  key: string;
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
  disabled?: boolean;
  run(): void;
}

function closeSheet(): void {
  useUiStore.getState().closeDialog('articleActions');
}

/** Runs an async command and reports its failure as an error toast. */
function report(task: Promise<unknown>, message: string): void {
  task.catch(reportFailure(message));
}

function buildActions(article: Article, siteUrl: string | undefined): SheetAction[] {
  const id = article.id;
  const read = article.isRead === 1;
  const favorite = article.isFavorite === 1;
  const readLater = article.isReadLater === 1;
  const url = article.link || siteUrl || '';
  // Close first, then act: the sheet's focus return and the share call's user activation both stay intact.
  const then = (fn: () => void) => () => {
    closeSheet();
    fn();
  };

  return [
    {
      key: 'read',
      label: read ? 'Mark as unread' : 'Mark as read',
      icon: read ? Circle : CircleCheck,
      run: then(() => report(toggleReadWithToast(id), 'Could not update read state')),
    },
    {
      key: 'favorite',
      label: favorite ? 'Unfavorite' : 'Favorite',
      icon: Star,
      run: then(() => report(toggleFavoriteWithToast(id), 'Could not update favorite')),
    },
    {
      key: 'readLater',
      label: readLater ? 'Remove from Read later' : 'Read later',
      icon: Bookmark,
      run: then(() => report(toggleReadLaterWithToast(id), 'Could not update read later')),
    },
    {
      key: 'share',
      label: 'Share',
      icon: Share2,
      run: then(() => {
        if (!url) {
          toast.info('This article has no link to share');
          return;
        }
        report(share({ title: article.title, url, text: article.title }), 'Could not share the article');
      }),
    },
    {
      key: 'open',
      label: 'Open original in new tab',
      icon: ExternalLink,
      disabled: !article.link,
      run: then(() => {
        if (article.link) window.open(article.link, '_blank', 'noopener,noreferrer');
      }),
    },
    {
      key: 'delete',
      label: 'Delete',
      icon: Trash2,
      destructive: true,
      run: then(() => report(deleteArticleWithUndo(id), 'Could not delete the article')),
    },
  ];
}

function SheetButton({ action }: { action: SheetAction }) {
  const Icon = action.icon;
  return (
    <button
      type="button"
      aria-label={action.label}
      disabled={action.disabled}
      onClick={action.run}
      className={cn(
        'focus-ring flex h-12 w-full items-center gap-3 rounded-sm px-3 text-left text-base select-none',
        'transition-colors duration-[var(--duration-instant)] ease-standard',
        'hover:bg-card active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50',
        action.destructive ? 'text-danger' : 'text-silver hover:text-text',
      )}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.75} className="shrink-0 opacity-80" />
      <span className="min-w-0 flex-1 truncate">{action.label}</span>
    </button>
  );
}

/** Article actions for the long-press / context-menu gesture. Reads its target from the `articleActions` dialog slot. */
export function ArticleActionSheet() {
  const payload = useDialog('articleActions');
  const isMobile = useIsMobile();
  const open = payload !== false;

  // Keep the last target during the exit transition so the list does not blank out. Stored as state
  // and updated during render (React's derived-state pattern), so the first open frame is exact.
  const [lastShown, setLastShown] = useState<ArticleActionsPayload | null>(null);
  if (payload && payload !== lastShown) setLastShown(payload);
  const shown = payload || lastShown;

  const article = useArticle(shown?.articleId ?? null);
  const feeds = useFeedMap();
  const feed = article ? feeds.get(article.feedId) : undefined;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Remember what had focus when the sheet opened.
  useEffect(() => {
    if (open) openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, [open]);

  // After closing, return focus to the opener, unless the user has already moved it elsewhere.
  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => {
      const el = openerRef.current;
      const active = document.activeElement;
      if (el && el.isConnected && (!active || active === document.body)) el.focus({ preventScroll: true });
      openerRef.current = null;
    }, FOCUS_RETURN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  const actions = article ? buildActions(article, feed?.siteUrl) : [];
  const onOpenChange = (next: boolean) => {
    if (!next) closeSheet();
  };

  return (
    <>
      <Dialog
        open={open && isMobile}
        onOpenChange={onOpenChange}
        title={article?.title ?? 'Article actions'}
        description={feed?.title}
        placement="bottom"
      >
        <div className="flex flex-col gap-1">
          {actions.map((action) => (
            <SheetButton key={action.key} action={action} />
          ))}
        </div>
      </Dialog>

      {/* Zero-size anchor at the pointer (or the focused row for the Menu key). */}
      <span
        ref={anchorRef}
        aria-hidden="true"
        className="pointer-events-none fixed size-0"
        style={{ left: shown?.x ?? 0, top: shown?.y ?? 0 }}
      />
      <Menu
        open={open && !isMobile}
        onOpenChange={onOpenChange}
        triggerRef={anchorRef}
        label={article ? `Actions for ${article.title}` : 'Article actions'}
      >
        {actions.map((action) => (
          <MenuItem
            key={action.key}
            icon={action.icon}
            destructive={action.destructive}
            disabled={action.disabled}
            aria-label={action.label}
            onClick={action.run}
          >
            {action.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
