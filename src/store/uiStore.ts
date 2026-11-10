import { create } from 'zustand';
import { createJSONStorage, persist, subscribeWithSelector } from 'zustand/middleware';
import {
  DEFAULT_READER_PREFS,
  FONT_SIZES,
  LINE_HEIGHTS,
  READER_FONTS,
  type FontSizeStep,
  type LineHeightStep,
  type ReaderFont,
  type ReaderPrefs,
} from '@/features/reader/readerPrefs';
import { viewKey, type DialogName, type DialogPayloads, type DialogSlots, type OpenDialogArgs, type PersistedUiState, type UIState } from './types';

/** localStorage key for the persisted slice. */
export const UI_STORAGE_KEY = 'oh-ui';

/** The only keys that reach localStorage (ARCHITECTURE §4). Keep in sync with `partialize`. */
export const UI_PERSIST_KEYS = ['navCollapsed', 'readerPrefs', 'timelineSort', 'timelineFilter'] as const;

/** Timeline page size; "Load more" adds one page. */
export const PAGE_SIZE = 100;

const DIALOGS_CLOSED: DialogSlots = {
  addFeed: false,
  settings: false,
  share: null,
  changelog: false,
  articleActions: false,
  watchList: false,
};

/** Validate a persisted reader prefs object; anything malformed falls back to the defaults. */
export function sanitizeReaderPrefs(raw: unknown): ReaderPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof ReaderPrefs, unknown>>;
  const isStep = <T extends number>(v: unknown, max: number): v is T =>
    Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
  return {
    fontSize: isStep<FontSizeStep>(r.fontSize, FONT_SIZES.length - 1) ? r.fontSize : DEFAULT_READER_PREFS.fontSize,
    lineHeight: isStep<LineHeightStep>(r.lineHeight, LINE_HEIGHTS.length - 1) ? r.lineHeight : DEFAULT_READER_PREFS.lineHeight,
    font: (READER_FONTS as readonly unknown[]).includes(r.font) ? (r.font as ReaderFont) : DEFAULT_READER_PREFS.font,
    width: r.width === 'narrow' || r.width === 'wide' ? r.width : DEFAULT_READER_PREFS.width,
    images: typeof r.images === 'boolean' ? r.images : DEFAULT_READER_PREFS.images,
    keepScreenOn: typeof r.keepScreenOn === 'boolean' ? r.keepScreenOn : DEFAULT_READER_PREFS.keepScreenOn,
    embedVideos: typeof r.embedVideos === 'boolean' ? r.embedVideos : DEFAULT_READER_PREFS.embedVideos,
  };
}

function sanitizePersisted(raw: unknown): Partial<PersistedUiState> {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof PersistedUiState, unknown>>;
  const out: Partial<PersistedUiState> = {};
  if (typeof p.navCollapsed === 'boolean') out.navCollapsed = p.navCollapsed;
  if (p.timelineSort === 'newest' || p.timelineSort === 'oldest') out.timelineSort = p.timelineSort;
  if (p.timelineFilter === 'all' || p.timelineFilter === 'unread') out.timelineFilter = p.timelineFilter;
  if (p.readerPrefs !== undefined) out.readerPrefs = sanitizeReaderPrefs(p.readerPrefs);
  return out;
}

/**
 * Ephemeral UI state plus the four persisted preferences. Articles, feeds and folders are
 * never stored here: they come from Dexie through live queries.
 *
 * Read with selector hooks from `@/store/selectors` in components, or with
 * `useUiStore.getState()` inside event handlers and effects.
 */
export const useUiStore = create<UIState>()(
  persist(
    subscribeWithSelector((set) => ({
      // navigation
      view: { type: 'all' },
      selectedArticleId: null,
      mobilePane: 'timeline',
      readerFullscreen: false,
      timelineOverlay: false,
      // persisted
      navCollapsed: false,
      readerPrefs: DEFAULT_READER_PREFS,
      timelineFilter: 'all',
      timelineSort: 'newest',
      // timeline
      timelineLimit: PAGE_SIZE,
      searchQuery: '',
      // dialogs
      dialogs: DIALOGS_CLOSED,
      // transient sync state
      syncing: false,
      syncProgress: null,
      syncingFeedIds: new Set<string>(),
      dbEpoch: 0,
      recentlyFetchedCutoff: 0,

      setView: (v) =>
        set((s) =>
          viewKey(s.view) === viewKey(v)
            ? { mobilePane: 'timeline' }
            : { view: v, timelineLimit: PAGE_SIZE, mobilePane: 'timeline' },
        ),

      selectArticle: (id, opts) =>
        set((s) => ({
          selectedArticleId: id,
          mobilePane: opts?.openOnMobile && id ? 'reader' : s.mobilePane,
        })),

      setMobilePane: (p) => set({ mobilePane: p }),
      toggleNavCollapsed: () => set((s) => ({ navCollapsed: !s.navCollapsed })),
      setReaderFullscreen: (on) => set({ readerFullscreen: on }),
      setTimelineOverlay: (open) => set({ timelineOverlay: open }),
      toggleTimelineOverlay: () => set((s) => ({ timelineOverlay: !s.timelineOverlay })),
      setTimelineFilter: (f) => set({ timelineFilter: f }),
      setTimelineSort: (s) => set({ timelineSort: s }),
      loadMore: () => set((s) => ({ timelineLimit: s.timelineLimit + PAGE_SIZE })),
      setSearchQuery: (q) => set({ searchQuery: q }),

      setReaderPrefs: (partial) => set((s) => ({ readerPrefs: { ...s.readerPrefs, ...partial } })),
      resetReaderPrefs: () => set({ readerPrefs: DEFAULT_READER_PREFS }),

      openDialog: <K extends DialogName>(name: K, ...args: OpenDialogArgs<K>) => {
        const payload = (args[0] ?? {}) as DialogPayloads[K];
        set((s) => ({ dialogs: { ...s.dialogs, [name]: payload } as DialogSlots }));
      },
      closeDialog: (name) =>
        set((s) => ({ dialogs: { ...s.dialogs, [name]: DIALOGS_CLOSED[name] } as DialogSlots })),
      closeAllDialogs: () => set({ dialogs: { ...DIALOGS_CLOSED } }),

      setSyncing: (on, progress) => set({ syncing: on, syncProgress: on ? (progress ?? null) : null }),
      markFeedSyncing: (feedId, on) =>
        set((s) => {
          if (s.syncingFeedIds.has(feedId) === on) return {};
          const next = new Set(s.syncingFeedIds);
          if (on) next.add(feedId);
          else next.delete(feedId);
          return { syncingFeedIds: next };
        }),
      bumpDbEpoch: () => set((s) => ({ dbEpoch: s.dbEpoch + 1 })),
      setRecentlyFetchedCutoff: (ts) => set({ recentlyFetchedCutoff: ts }),
    })),
    {
      name: UI_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): PersistedUiState => ({
        navCollapsed: s.navCollapsed,
        readerPrefs: s.readerPrefs,
        timelineSort: s.timelineSort,
        timelineFilter: s.timelineFilter,
      }),
      merge: (persisted, current) => ({ ...current, ...sanitizePersisted(persisted) }),
    },
  ),
);

/** Alias matching the name used in ARCHITECTURE §4/§10. Same store. */
export const useUIStore = useUiStore;
