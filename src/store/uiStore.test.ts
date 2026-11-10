import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_READER_PREFS } from '@/features/reader/readerPrefs';
import { PAGE_SIZE, UI_PERSIST_KEYS, UI_STORAGE_KEY, sanitizeReaderPrefs, useUiStore } from './uiStore';
import { getTimelineIds, setTimelineIds } from './selectors';

const INITIAL = useUiStore.getState();

function readPersisted(): { state: Record<string, unknown>; version?: number } | null {
  const raw = localStorage.getItem(UI_STORAGE_KEY);
  return raw === null ? null : (JSON.parse(raw) as { state: Record<string, unknown>; version?: number });
}

beforeEach(() => {
  localStorage.clear();
  useUiStore.setState(INITIAL, true);
  localStorage.clear();
});

describe('persistence', () => {
  it('persists only navCollapsed, readerPrefs, timelineSort and timelineFilter', () => {
    const s = useUiStore.getState();
    s.toggleNavCollapsed();
    s.setTimelineSort('oldest');
    s.setTimelineFilter('unread');
    s.setReaderPrefs({ fontSize: 4 });
    // Transient state changes must not reach storage.
    s.selectArticle('art-1', { openOnMobile: true });
    s.setSearchQuery('rust');
    s.setView({ type: 'feed', feedId: 'feed-0' });
    s.openDialog('settings', { section: 'sync' });
    s.bumpDbEpoch();
    s.setSyncing(true, { done: 1, total: 4 });
    s.markFeedSyncing('feed-0', true);
    s.loadMore();

    const persisted = readPersisted();
    expect(persisted).not.toBeNull();
    expect(Object.keys(persisted!.state).sort()).toEqual([...UI_PERSIST_KEYS].sort());
    expect(persisted!.state).toEqual({
      navCollapsed: true,
      readerPrefs: { ...DEFAULT_READER_PREFS, fontSize: 4 },
      timelineSort: 'oldest',
      timelineFilter: 'unread',
    });
  });

  it('uses the oh-ui storage key', () => {
    useUiStore.getState().setTimelineSort('oldest');
    expect(localStorage.getItem('oh-ui')).not.toBeNull();
  });

  it('sanitizes malformed persisted reader prefs on rehydrate', async () => {
    localStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({
        state: { readerPrefs: { fontSize: 9, lineHeight: 1, font: 'comic', width: 'wide' }, timelineSort: 'sideways', navCollapsed: true },
        version: 0,
      }),
    );
    await useUiStore.persist.rehydrate();
    const s = useUiStore.getState();
    expect(s.readerPrefs).toEqual({ ...DEFAULT_READER_PREFS, width: 'wide' });
    expect(s.timelineSort).toBe('newest');
    expect(s.navCollapsed).toBe(true);
  });

  it('sanitizeReaderPrefs falls back for non-objects', () => {
    expect(sanitizeReaderPrefs(undefined)).toEqual(DEFAULT_READER_PREFS);
    expect(sanitizeReaderPrefs('x')).toEqual(DEFAULT_READER_PREFS);
  });
});

describe('navigation actions', () => {
  it('setView resets the timeline limit and keeps the selection; the same view is a no-op for the limit', () => {
    const s = useUiStore.getState();
    s.setView({ type: 'feed', feedId: 'feed-1' });
    s.loadMore();
    s.loadMore();
    expect(useUiStore.getState().timelineLimit).toBe(PAGE_SIZE * 3);

    s.selectArticle('art-9');
    s.setView({ type: 'feed', feedId: 'feed-1' });
    expect(useUiStore.getState().timelineLimit).toBe(PAGE_SIZE * 3);

    s.setView({ type: 'folder', folderId: 'folder-a' });
    expect(useUiStore.getState().timelineLimit).toBe(PAGE_SIZE);
    expect(useUiStore.getState().selectedArticleId).toBe('art-9');
    expect(useUiStore.getState().mobilePane).toBe('timeline');
  });

  it('selectArticle opens the reader on mobile only when asked', () => {
    const s = useUiStore.getState();
    s.selectArticle('art-2');
    expect(useUiStore.getState().mobilePane).toBe('timeline');
    s.selectArticle('art-2', { openOnMobile: true });
    expect(useUiStore.getState().mobilePane).toBe('reader');
    s.selectArticle(null, { openOnMobile: true });
    expect(useUiStore.getState().selectedArticleId).toBeNull();
  });
});

describe('dialogs', () => {
  it('opens with a payload and closes back to its closed value', () => {
    const s = useUiStore.getState();
    s.openDialog('addFeed', { initialUrl: 'https://example.com', tab: 'url' });
    expect(useUiStore.getState().dialogs.addFeed).toEqual({ initialUrl: 'https://example.com', tab: 'url' });
    s.closeDialog('addFeed');
    expect(useUiStore.getState().dialogs.addFeed).toBe(false);

    s.openDialog('addFeed');
    expect(useUiStore.getState().dialogs.addFeed).toEqual({});

    s.openDialog('share', { title: 'T', url: 'https://example.com/a' });
    expect(useUiStore.getState().dialogs.share).toEqual({ title: 'T', url: 'https://example.com/a' });
    s.closeAllDialogs();
    expect(useUiStore.getState().dialogs).toEqual({
      addFeed: false,
      settings: false,
      share: null,
      changelog: false,
      articleActions: false,
    });
  });
});

describe('transient state', () => {
  it('markFeedSyncing is idempotent and keeps the same Set when nothing changes', () => {
    const s = useUiStore.getState();
    s.markFeedSyncing('feed-0', true);
    const after = useUiStore.getState().syncingFeedIds;
    s.markFeedSyncing('feed-0', true);
    expect(useUiStore.getState().syncingFeedIds).toBe(after);
    expect([...after]).toEqual(['feed-0']);
    s.markFeedSyncing('feed-0', false);
    s.markFeedSyncing('feed-0', false);
    expect(useUiStore.getState().syncingFeedIds.size).toBe(0);
  });

  it('setSyncing clears progress when stopped and bumpDbEpoch increments', () => {
    const s = useUiStore.getState();
    s.setSyncing(true, { done: 2, total: 5 });
    expect(useUiStore.getState().syncProgress).toEqual({ done: 2, total: 5 });
    s.setSyncing(false);
    expect(useUiStore.getState().syncing).toBe(false);
    expect(useUiStore.getState().syncProgress).toBeNull();

    const epoch = useUiStore.getState().dbEpoch;
    s.bumpDbEpoch();
    expect(useUiStore.getState().dbEpoch).toBe(epoch + 1);
  });

  it('setReaderPrefs merges partials and resetReaderPrefs restores defaults', () => {
    const s = useUiStore.getState();
    s.setReaderPrefs({ font: 'sans' });
    expect(useUiStore.getState().readerPrefs).toEqual({ ...DEFAULT_READER_PREFS, font: 'sans' });
    s.resetReaderPrefs();
    expect(useUiStore.getState().readerPrefs).toEqual(DEFAULT_READER_PREFS);
  });
});

describe('timeline ids handoff', () => {
  it('stores ids outside the React store', () => {
    setTimelineIds(['a', 'b']);
    expect(getTimelineIds()).toEqual(['a', 'b']);
    setTimelineIds([]);
  });
});
