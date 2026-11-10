import { useShallow } from 'zustand/react/shallow';
import type { ReaderPrefs } from '@/features/reader/readerPrefs';
import { useUiStore } from './uiStore';
import type { DialogName, DialogSlots, MobilePane, SharePayload, SyncProgress, TimelineFilter, TimelineSort, UIState, View } from './types';

/*
 * Typed selector hooks (ARCHITECTURE §4.1). Each hook subscribes to one primitive or one
 * stable reference. Use useShallow for several values at once.
 */

export const useSelectedArticleId = (): string | null => useUiStore((s) => s.selectedArticleId);
export const useView = (): View => useUiStore((s) => s.view);
export const useMobilePane = (): MobilePane => useUiStore((s) => s.mobilePane);
export const useNavCollapsed = (): boolean => useUiStore((s) => s.navCollapsed);
export const useReaderFullscreen = (): boolean => useUiStore((s) => s.readerFullscreen);
export const useTimelineFilter = (): TimelineFilter => useUiStore((s) => s.timelineFilter);
export const useTimelineSort = (): TimelineSort => useUiStore((s) => s.timelineSort);
export const useTimelineLimit = (): number => useUiStore((s) => s.timelineLimit);
export const useSearchQuery = (): string => useUiStore((s) => s.searchQuery);
export const useReaderPrefs = (): ReaderPrefs => useUiStore((s) => s.readerPrefs);

/** Filter and sort together, shallow-compared. */
export const useTimelineOptions = (): { filter: TimelineFilter; sort: TimelineSort } =>
  useUiStore(useShallow((s) => ({ filter: s.timelineFilter, sort: s.timelineSort })));

/** Current state of one dialog: its payload when open, its closed value otherwise. */
export function useDialog<K extends DialogName>(name: K): DialogSlots[K] {
  return useUiStore((s) => s.dialogs[name]);
}

export const useShareTarget = (): SharePayload | null => useUiStore((s) => s.dialogs.share);
export const useSyncing = (): boolean => useUiStore((s) => s.syncing);
export const useSyncProgress = (): SyncProgress | null => useUiStore((s) => s.syncProgress);
export const useSyncingFeedIds = (): Set<string> => useUiStore((s) => s.syncingFeedIds);
export const useDbEpoch = (): number => useUiStore((s) => s.dbEpoch);
export const useRecentlyFetchedCutoff = (): number => useUiStore((s) => s.recentlyFetchedCutoff);

/*
 * Named selectors for use with getState() or useUiStore(selector). Module-level so the
 * function identity is stable.
 */
export const selectIsDialogOpen = (s: UIState, name: DialogName): boolean => {
  const v = s.dialogs[name];
  return v !== false && v !== null;
};
export const selectShareTarget = (s: UIState): SharePayload | null => s.dialogs.share;
export const selectReaderPrefs = (s: UIState): ReaderPrefs => s.readerPrefs;

/*
 * Ordered article ids of the timeline currently on screen. Kept outside the store so that
 * ArticleList can publish them on every render without re-rendering subscribers.
 * Keyboard navigation (J/K, arrows) reads them with getTimelineIds().
 */
let timelineIds: readonly string[] = [];

export function setTimelineIds(ids: readonly string[]): void {
  timelineIds = ids;
}

export function getTimelineIds(): readonly string[] {
  return timelineIds;
}
