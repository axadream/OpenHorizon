import { useEffect } from 'react';
import { db } from '@/db/db';
import {
  markAllRead,
  toggleFavorite,
  toggleRead,
  toggleReadLater,
} from '@/features/articles/articleActions';
import { deleteArticleWithUndo } from '@/features/articles/articleCommands';
import { queryUnreadIds } from '@/features/articles/articleQueries';
import { share } from '@/features/sharing/share';
import { runSyncFromPage } from '@/features/sync/scheduler';
import { t } from '@/i18n/i18n';
import { toast } from '@/lib/toast';
import { getTimelineIds, selectIsDialogOpen } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import type { DialogName, MobilePane, View } from '@/store/types';

/** One row of the shortcut help (rendered by the Settings dialog). DESIGN 8.4. */
export interface KeymapEntry {
  keys: readonly string[];
  label: string;
}

export const KEYMAP: readonly KeymapEntry[] = [
  { keys: ['J', '↓'], label: 'Next article' },
  { keys: ['K', '↑'], label: 'Previous article' },
  { keys: ['Home', 'End'], label: 'First / last article (timeline list)' },
  { keys: ['Enter', 'O'], label: 'Open selected article (mobile: reader)' },
  { keys: ['←', '→'], label: 'Move focus between panes (mirrored in right-to-left languages)' },
  { keys: ['M'], label: 'Toggle read' },
  { keys: ['L'], label: 'Toggle read later' },
  { keys: ['F'], label: 'Toggle favorite' },
  { keys: ['S'], label: 'Share article' },
  { keys: ['V'], label: 'Open original in a new tab' },
  { keys: ['Delete'], label: 'Delete article (undo available)' },
  { keys: ['Menu', 'Shift+F10'], label: 'Article actions (same sheet as a long press)' },
  { keys: ['R'], label: 'Refresh all feeds' },
  { keys: ['Shift+R'], label: 'Refresh current feed' },
  { keys: ['A'], label: 'Add feed' },
  { keys: ['Shift+A'], label: 'Mark all read in this view' },
  { keys: ['Shift+F'], label: 'Toggle reader fullscreen' },
  { keys: ['/'], label: 'Search feeds' },
  { keys: ['1', '2', '3', '4'], label: 'Smart views: All, Unread, Favorites, Read Later' },
  { keys: [','], label: 'Settings' },
  { keys: ['?'], label: 'Keyboard shortcuts' },
  { keys: ['Esc'], label: 'Close, exit fullscreen, hide the article list, go back a pane, clear search' },
];

const MOBILE_QUERY = '(max-width: 767.98px)';
const ORDER: readonly MobilePane[] = ['nav', 'timeline', 'reader'];
const DIALOG_NAMES: readonly DialogName[] = ['addFeed', 'settings', 'share', 'articleActions'];
/** Keys that belong to a control: Enter there must keep its native activation. */
const INTERACTIVE =
  'button, a[href], input, textarea, select, [role="button"], [role="menuitem"], [role="tab"], [role="radio"], [role="switch"], [role="slider"], [role="option"], [role="checkbox"]';
const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

function isMobileViewport(): boolean {
  return window.matchMedia(MOBILE_QUERY).matches;
}

/** Writing direction of the document (set from the active locale). Arrow keys swap in RTL. */
function isRtl(): boolean {
  return document.documentElement.dir === 'rtl';
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest(EDITABLE) !== null;
}

function selectedId(): string | null {
  return useUiStore.getState().selectedArticleId;
}

function reportError(message: string): (err: unknown) => void {
  return (err) => toast.error(message, { description: err instanceof Error ? err.message : undefined });
}

/** Next (+1) or previous (-1) article in the timeline; the first or last one when nothing is selected. */
function moveSelection(delta: 1 | -1): void {
  const ids = getTimelineIds();
  if (ids.length === 0) return;
  const s = useUiStore.getState();
  const current = s.selectedArticleId ? ids.indexOf(s.selectedArticleId) : -1;
  const next =
    current < 0 ? (delta > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, current + delta));
  const id = ids[next];
  if (id === s.selectedArticleId) return;
  // Keep the reader open while reading; from the timeline, J/K opens the article on mobile.
  s.selectArticle(id, { openOnMobile: isMobileViewport() && s.mobilePane === 'timeline' });
  document.getElementById(`article-${id}`)?.scrollIntoView({ block: 'nearest' });
}

async function shareSelected(): Promise<void> {
  const id = selectedId();
  if (!id) return;
  const article = await db.articles.get(id);
  if (!article) return;
  const feed = await db.feeds.get(article.feedId);
  const url = article.link || feed?.siteUrl || '';
  if (!url) {
    toast.info(t('keys.noLink'));
    return;
  }
  await share({ title: article.title, url, text: article.title });
}

async function openOriginalSelected(): Promise<void> {
  const id = selectedId();
  if (!id) return;
  const article = await db.articles.get(id);
  if (article?.link) window.open(article.link, '_blank', 'noopener,noreferrer');
}

async function markAllReadInView(view: View): Promise<void> {
  const ids = await queryUnreadIds(view);
  if (ids.length === 0) {
    toast.info(t('keys.nothingUnread'));
    return;
  }
  if (ids.length > 20 && !window.confirm(t('plural.confirmMark', { count: ids.length }))) return;
  const changed = await markAllRead(view);
  toast.success(t('plural.marked', { count: changed.length }));
}

/** Focus the nav search field, opening it first when it is closed (retries while the pane mounts). */
function focusSearch(): void {
  const s = useUiStore.getState();
  if (isMobileViewport()) s.setMobilePane('nav');
  const existing = document.getElementById('nav-search');
  if (existing) {
    existing.focus();
    return;
  }
  document.querySelector<HTMLElement>('#nav-pane [data-search-toggle]')?.click();
  let tries = 0;
  const attempt = () => {
    const input = document.getElementById('nav-search');
    if (input) input.focus();
    else if (++tries < 10) window.setTimeout(attempt, 30);
  };
  window.setTimeout(attempt, 0);
}

type Pane = 'nav' | 'timeline' | 'reader';

/* Panes are found by data-pane (stable across languages), never by their translated labels. */
function paneOf(el: Element | null): Pane | null {
  if (!el) return null;
  if (el.closest('#nav-pane')) return 'nav';
  if (el.closest('[data-pane="timeline"]')) return 'timeline';
  if (el.closest('[data-pane="reader"]')) return 'reader';
  return null;
}

/** Focus the main control of a pane. Inert panes (hidden in fullscreen) are skipped. */
function focusPane(pane: Pane): void {
  // Candidates in priority order: the roving item or listbox first, then any control in the pane.
  const candidates: Record<Pane, string[]> = {
    nav: ['#nav-pane [data-nav-item][tabindex="0"]', '#nav-pane [data-nav-item]'],
    timeline: ['#timeline-listbox', '[data-pane="timeline"] button:not([disabled])'],
    reader: ['#reader-article', '[data-pane="reader"] button:not([disabled])'],
  };
  for (const selector of candidates[pane]) {
    const el = document.querySelector<HTMLElement>(selector);
    if (el && !el.closest('[inert]')) {
      el.focus();
      return;
    }
  }
}

/** Esc chain (DESIGN 8.4): dialog, fullscreen, reading slide-over, mobile back one pane, clear search. One step per press. */
function escapeChain(e: KeyboardEvent): void {
  const s = useUiStore.getState();
  const dialogOpen = document.querySelector('dialog[open]') !== null || DIALOG_NAMES.some((n) => selectIsDialogOpen(s, n));
  if (dialogOpen) {
    e.preventDefault();
    s.closeAllDialogs();
    return;
  }
  if (s.readerFullscreen) {
    e.preventDefault();
    s.setReaderFullscreen(false);
    return;
  }
  if (s.timelineOverlay) {
    e.preventDefault();
    s.setTimelineOverlay(false);
    return;
  }
  if (isMobileViewport()) {
    const index = ORDER.indexOf(s.mobilePane);
    if (index > 0) {
      e.preventDefault();
      s.setMobilePane(ORDER[index - 1]);
      return;
    }
  }
  if (s.searchQuery !== '') {
    e.preventDefault();
    s.setSearchQuery('');
  }
}

/** Arrow keys between panes: desktop/tablet moves focus; mobile steps the pane stack back. Direction is the logical one. */
function arrowPane(direction: 1 | -1): boolean {
  if (isMobileViewport()) {
    if (direction === -1) {
      const s = useUiStore.getState();
      const index = ORDER.indexOf(s.mobilePane);
      if (index > 0) s.setMobilePane(ORDER[index - 1]);
      return true;
    }
    return false;
  }
  const current = paneOf(document.activeElement);
  if (current === null) {
    focusPane('timeline');
    return true;
  }
  const target = ORDER[ORDER.indexOf(current) + direction];
  if (target) focusPane(target);
  return true;
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented) return;
  if (e.key === 'Escape') {
    escapeChain(e);
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (isEditable(e.target)) return;
  if (document.querySelector('dialog[open]')) return;

  const s = useUiStore.getState();
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const inReader = paneOf(document.activeElement) === 'reader';
  let handled = true;

  switch (k) {
    case 'ArrowDown':
      // Inside the reader the arrows scroll the article; navigation there uses J/K.
      if (inReader) return;
      moveSelection(1);
      break;
    case 'ArrowUp':
      if (inReader) return;
      moveSelection(-1);
      break;
    case 'j':
      moveSelection(1);
      break;
    case 'k':
      moveSelection(-1);
      break;
    case 'Enter':
    case 'o': {
      if (e.key === 'Enter' && e.target instanceof HTMLElement && e.target.closest(INTERACTIVE)) {
        handled = false;
        break;
      }
      const id = selectedId();
      if (id && isMobileViewport()) s.selectArticle(id, { openOnMobile: true });
      break;
    }
    // Logical direction: in LTR ArrowLeft goes back a pane; in RTL the panes run the other way, so it swaps.
    case 'ArrowLeft':
      arrowPane(isRtl() ? 1 : -1);
      break;
    case 'ArrowRight':
      if (!arrowPane(isRtl() ? -1 : 1)) handled = false;
      break;
    case 'm': {
      const id = selectedId();
      if (id) toggleRead(id).catch(reportError(t('article.couldNotReadState')));
      break;
    }
    case 'l': {
      const id = selectedId();
      if (id) toggleReadLater(id).catch(reportError(t('article.couldNotLater')));
      break;
    }
    case 'f': {
      if (e.shiftKey) {
        if (isMobileViewport()) handled = false;
        else s.setReaderFullscreen(!s.readerFullscreen);
        break;
      }
      const id = selectedId();
      if (id) toggleFavorite(id).catch(reportError(t('article.couldNotFavorite')));
      break;
    }
    case 'Delete': {
      const id = selectedId();
      if (id) deleteArticleWithUndo(id).catch(reportError(t('article.couldNotDelete')));
      break;
    }
    case 's':
      shareSelected().catch(reportError(t('article.couldNotShare')));
      break;
    case 'v':
      openOriginalSelected().catch(reportError(t('article.couldNotOpen')));
      break;
    case 'r': {
      const view = s.view;
      if (e.shiftKey && view.type === 'feed') {
        runSyncFromPage({ manual: true, feedIds: [view.feedId] }).catch(reportError(t('timeline.syncFailed')));
      } else {
        runSyncFromPage({ manual: true }).catch(reportError(t('timeline.syncFailed')));
      }
      break;
    }
    case 'a':
      if (e.shiftKey) markAllReadInView(s.view).catch(reportError(t('timeline.couldNotMark')));
      else s.openDialog('addFeed');
      break;
    case '/':
      focusSearch();
      break;
    case '1':
      s.setView({ type: 'all' });
      break;
    case '2':
      s.setView({ type: 'unread' });
      break;
    case '3':
      s.setView({ type: 'favorites' });
      break;
    case '4':
      s.setView({ type: 'readLater' });
      break;
    case ',':
      s.openDialog('settings');
      break;
    case '?':
      // The shortcut list lives in the App section of Settings (SettingsDialog, id "app").
      s.openDialog('settings', { section: 'app' });
      break;
    default:
      handled = false;
  }

  if (handled) e.preventDefault();
}

/**
 * Global keyboard shortcuts (DESIGN 8.4, ARCHITECTURE 10). Mount once in AppShell. Ignored while
 * focus is in an editable field or a dialog is open; Esc is always handled.
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
