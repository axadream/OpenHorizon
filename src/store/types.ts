import type { ReaderPrefs } from '@/features/reader/readerPrefs';

/** What the timeline shows (ARCHITECTURE §3). */
export type View =
  | { type: 'all' }
  | { type: 'unread' }
  | { type: 'favorites' }
  | { type: 'readLater' }
  | { type: 'feed'; feedId: string }
  | { type: 'folder'; folderId: string };

export type TimelineFilter = 'all' | 'unread';
export type TimelineSort = 'newest' | 'oldest';
export type MobilePane = 'nav' | 'timeline' | 'reader';
export type AddFeedTab = 'url' | 'discover' | 'xml' | 'opml';

export interface AddFeedDialogPayload {
  initialUrl?: string;
  tab?: AddFeedTab;
}

export interface SettingsDialogPayload {
  section?: string;
}

export interface SharePayload {
  title: string;
  url: string;
  text?: string;
}

/** Payload type per dialog name (what `openDialog` accepts). */
export interface DialogPayloads {
  addFeed: AddFeedDialogPayload;
  settings: SettingsDialogPayload;
  share: SharePayload;
}

export type DialogName = keyof DialogPayloads;

/** Closed value per dialog: `false` for the modal dialogs, `null` for share. */
export interface DialogClosedValues {
  addFeed: false;
  settings: false;
  share: null;
}

/** Current state of every dialog: its payload when open, its closed value otherwise. */
export interface DialogSlots {
  addFeed: DialogClosedValues['addFeed'] | DialogPayloads['addFeed'];
  settings: DialogClosedValues['settings'] | DialogPayloads['settings'];
  share: DialogClosedValues['share'] | DialogPayloads['share'];
}

export interface SyncProgress {
  done: number;
  total: number;
}

/** Arguments accepted by `openDialog`: share needs a payload, the others may omit it. */
export type OpenDialogArgs<K extends DialogName> = K extends 'share'
  ? [payload: SharePayload]
  : [payload?: DialogPayloads[K]];

/** Subset of the UI state that is persisted to localStorage['oh-ui'] (ARCHITECTURE §4). */
export interface PersistedUiState {
  navCollapsed: boolean;
  readerPrefs: ReaderPrefs;
  timelineSort: TimelineSort;
  timelineFilter: TimelineFilter;
}

export interface UIState extends PersistedUiState {
  // navigation
  view: View;
  selectedArticleId: string | null;
  mobilePane: MobilePane;
  readerFullscreen: boolean;
  // timeline
  timelineLimit: number;
  searchQuery: string;
  // dialogs
  dialogs: DialogSlots;
  // transient sync state (not persisted)
  syncing: boolean;
  syncProgress: SyncProgress | null;
  syncingFeedIds: Set<string>;
  /** Bumped when a sync finished elsewhere (SW); included in every live query's deps. */
  dbEpoch: number;
  /** Articles fetched after this timestamp get the "recently fetched" pulse. */
  recentlyFetchedCutoff: number;

  // actions
  setView(v: View): void;
  selectArticle(id: string | null, opts?: { openOnMobile?: boolean }): void;
  setMobilePane(p: MobilePane): void;
  toggleNavCollapsed(): void;
  setReaderFullscreen(on: boolean): void;
  setTimelineFilter(f: TimelineFilter): void;
  setTimelineSort(s: TimelineSort): void;
  loadMore(): void;
  setSearchQuery(q: string): void;
  setReaderPrefs(partial: Partial<ReaderPrefs>): void;
  resetReaderPrefs(): void;
  openDialog<K extends DialogName>(name: K, ...args: OpenDialogArgs<K>): void;
  closeDialog(name: DialogName): void;
  closeAllDialogs(): void;
  setSyncing(on: boolean, progress?: SyncProgress): void;
  markFeedSyncing(feedId: string, on: boolean): void;
  bumpDbEpoch(): void;
  setRecentlyFetchedCutoff(ts: number): void;
}

/** Stable key for a View, safe to use in React/Dexie dependency arrays. */
export function viewKey(view: View): string {
  switch (view.type) {
    case 'feed':
      return `feed:${view.feedId}`;
    case 'folder':
      return `folder:${view.folderId}`;
    default:
      return view.type;
  }
}
