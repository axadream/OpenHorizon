# OpenHorizon — Architecture & Implementation Guide

Status: v1.0 (authoritative). Read together with `docs/DESIGN.md`.

Stack (fixed): Vite, React 18, TypeScript (strict), Tailwind v4 via `@tailwindcss/vite`, `vite-plugin-pwa` (**injectManifest**, `src/sw.ts`), `dexie` + `dexie-react-hooks`, `zustand`, `dompurify`, `lucide-react`, `clsx`, `tailwind-merge`.

One additional dev/runtime decision made in this document (see §8.2 for the reasoning): **`@xmldom/xmldom`** is added as a dependency and imported **only** from the service-worker bundle, so the same feed parser can run in the SW (which has no `DOMParser`). The page bundle uses the native `DOMParser`. If the scaffolding agent prefers not to add it, follow the "Fallback A" in §8.2 (SW delegates sync to an open client and only does lightweight fetching otherwise); everything else stays identical.

Guiding principles:
1. **IndexedDB (Dexie) is the single source of truth** for feeds, folders, articles, settings. React reads it through `useLiveQuery`. UI never keeps a copy of article data in React state or zustand.
2. **zustand holds only ephemeral UI state** (selection, panes, dialogs, toasts) plus two persisted UI preferences (`readerPrefs`, `navCollapsed`).
3. **Sync code is isomorphic**: `features/sync`, `lib/parser`, `lib/proxy`, `db` must not touch `window`, `document`, or React, so they run in the SW too.
4. **Sanitize at render time**, not at store time (so sanitizer upgrades apply retroactively and the SW does not need DOMPurify). Raw HTML is only ever rendered through `sanitizeHtml()`.
5. Small, boring, typed modules. No class hierarchies, no custom event buses beyond the SW message protocol.

---

## 1. Folder layout (`src/`)

```
src/
  main.tsx                      # createRoot, <App/>, SW registration happens via useRegisterSW inside AppShell
  vite-env.d.ts                 # + declares VITE_CORS_PROXY, __APP_VERSION__, virtual:pwa-register/react
  sw.ts                         # service worker (injectManifest entry)
  app/
    App.tsx                     # providers (none needed besides ErrorBoundary) + <AppShell/>
    index.css                   # @import "tailwindcss"; @import "./theme.css"; @import "./reader.css";
    theme.css                   # tokens (DESIGN.md §1, §3), base layer, utilities
    reader.css                  # .reader-content styles (DESIGN.md §2.3)
    ErrorBoundary.tsx
  components/
    ui/        Button.tsx IconButton.tsx Badge.tsx Chip.tsx Switch.tsx Input.tsx Tabs.tsx Popover.tsx Dialog.tsx Menu.tsx Tooltip.tsx Avatar.tsx VisuallyHidden.tsx Toast.tsx EmptyState.tsx Skeleton.tsx
    layout/    AppShell.tsx BottomNav.tsx UpdatePrompt.tsx SkipLink.tsx
    nav/       NavPane.tsx NavRow.tsx FeedRow.tsx FolderRow.tsx NavSearch.tsx FeedContextMenu.tsx
    timeline/  TimelinePane.tsx TimelineHeader.tsx ArticleRow.tsx ArticleList.tsx
    reader/    ReaderPane.tsx ReaderToolbar.tsx ReaderContent.tsx ReaderPrefsPopover.tsx
    dialogs/   AddFeedDialog.tsx SettingsDialog.tsx tabs/AddByUrlTab.tsx tabs/DiscoverTab.tsx tabs/PasteXmlTab.tsx tabs/ImportOpmlTab.tsx
    sharing/   ShareSheet.tsx brandIcons.tsx
  features/
    feeds/     addFeed.ts (addFeedFromUrl, addFeedFromXml, subscribe) removeFeed.ts folders.ts (createFolder, renameFolder, deleteFolder, moveFeed) feedQueries.ts (live-query helpers: useFeeds, useFolders, useUnreadCounts) favicon.ts
    articles/  articleQueries.ts (useArticles(view, filter, sort, limit), useArticle(id), useCounts) articleActions.ts (markRead, markUnread, toggleFavorite, toggleReadLater, markAllRead(view), undo helpers) retention.ts dedup.ts
    reader/    sanitize.ts (DOMPurify config) readerPrefs.ts (steps tables, defaults)
    settings/  settings.ts (typed get/set over db.settings, useSetting hook) defaults.ts
    sharing/   share.ts (share(), shareTargets.ts URL templates)
    sync/      syncAll.ts syncFeed.ts scheduler.ts (useSyncScheduler) swBridge.ts (message types + useServiceWorkerBridge) notifications.ts (buildNotifications, showNewArticleNotifications) limit.ts (concurrency limiter)
  lib/
    cn.ts time.ts (timeAgo, formatFull) hash.ts (fnv1a) url.ts (resolveUrl, hostname, normalizeFeedUrl) text.ts (stripHtml, truncate, decodeEntities)
    xml/       dom.ts (XmlDocument adapter: parseXml(text) → Document using native DOMParser or xmldom; helper fns byTagNS, firstText…)
    parser/    parseFeed.ts rss2.ts atom.ts rss1.ts jsonfeed.ts types.ts (ParsedFeed, ParsedItem) dates.ts media.ts
    proxy/     fetchWithProxy.ts proxies.ts (ordered list, templates) failureMemory.ts
    discovery/ discoverFeeds.ts
    opml/      parseOpml.ts exportOpml.ts
  db/
    schema.ts  (interfaces + Dexie class + indexes) db.ts (singleton `db`) migrations.ts (version chain; v1 only now) seed.ts (optional starter feeds, dev only)
  store/
    uiStore.ts (zustand store, slices in one file) selectors.ts (memoized selector helpers) types.ts
  hooks/
    useMediaQuery.ts useIsMobile.ts usePrefersReducedMotion.ts useRovingFocus.ts useKeyboardShortcuts.ts useInstallPrompt.ts useOnlineStatus.ts useBootUrl.ts useMobileHistory.ts useExitTransition.ts useDebouncedValue.ts
```

Path alias: `@/` → `src/` (tsconfig `paths` + vite `resolve.alias`). Import order: react → third-party → `@/…` → relative.

---

## 2. Data model (Dexie) — `src/db/schema.ts`

IndexedDB cannot index `boolean`, so every flag that needs an index is `0 | 1` (`type Flag = 0 | 1`). Dates are epoch milliseconds (`number`) so they sort as keys. IDs are `crypto.randomUUID()` strings (available in window and SW).

```ts
export type Flag = 0 | 1;

export interface Feed {
  id: string;                 // uuid
  url: string;                // canonical feed URL (normalized, see lib/url.normalizeFeedUrl). For pasted XML without a source: "manual:<uuid>"
  siteUrl?: string;           // <link> of the channel, resolved absolute
  title: string;              // user-editable; initial from feed
  description?: string;
  faviconUrl?: string;        // resolved (see §7); undefined → letter avatar
  folderId: string | null;    // null = unfiled
  sortOrder: number;          // within folder; default = Date.now() at creation
  isFavorite: Flag;           // "favorite feed" = notify on new items
  manual: Flag;               // 1 = created from pasted XML without URL; never synced
  language?: string;          // from <language> / xml:lang
  etag?: string;
  lastModified?: string;
  lastFetchedAt?: number;     // last attempt
  lastSuccessAt?: number;     // last 200/304
  lastError?: string | null;  // human-readable; null/undefined when healthy
  errorCount: number;         // consecutive failures; reset to 0 on success
  createdAt: number;
  updatedAt: number;
}

export interface Folder {
  id: string;
  name: string;
  sortOrder: number;
  collapsed: Flag;            // nav UI state, persisted with the folder
  createdAt: number;
}

export interface Article {
  id: string;                 // uuid (primary key)
  feedId: string;
  guid: string;               // dedup key — NEVER empty (see §2.3)
  link: string;               // absolute URL; "" if the item had none
  title: string;              // plain text, entities decoded, max 500 chars
  author?: string;
  summary: string;            // plain-text snippet, max 280 chars (derived from content at parse time)
  contentRaw: string;         // best available HTML (see §6.3), UNSANITIZED, max 1 MB; sanitized at render
  thumbnailUrl?: string;
  publishedAt: number;        // epoch ms; falls back to fetchedAt when the feed gives none
  fetchedAt: number;          // when we first stored it
  isRead: Flag;
  isReadLater: Flag;
  isFavorite: Flag;
  readAt?: number;
  enclosures?: { url: string; type?: string; length?: number }[];  // audio/video; shown as links in reader footer (v1)
}

export interface SettingRow<K extends keyof Settings = keyof Settings> { key: K; value: Settings[K]; }

export interface Settings {
  syncFrequency: '15m' | '30m' | '1h' | 'manual';   // default '30m'
  notificationsEnabled: boolean;                    // default false
  density: 'comfortable' | 'compact';               // default 'comfortable'
  retentionPerFeed: 100 | 200 | 500 | 1000;         // default 200
  lastSyncAt: number | null;                        // default null
  onboardingDone: boolean;                          // default false
  installDismissedAt: number | null;                // default null
}

export interface SyncLogEntry {
  id?: number;                // auto-increment
  feedId: string;
  startedAt: number;
  finishedAt: number;
  status: 'ok' | 'notModified' | 'error';
  newCount: number;
  via: 'direct' | 'env' | 'local' | 'allorigins' | 'corsproxy' | 'codetabs' | 'rss2json' | 'cache';
  error?: string;
  origin: 'page' | 'sw';
}
```

### 2.1 Dexie class and indexes

```ts
import Dexie, { type Table } from 'dexie';

export class OpenHorizonDB extends Dexie {
  feeds!: Table<Feed, string>;
  folders!: Table<Folder, string>;
  articles!: Table<Article, string>;
  settings!: Table<SettingRow, string>;
  syncLog!: Table<SyncLogEntry, number>;

  constructor() {
    super('openhorizon');
    this.version(1).stores({
      feeds:    'id, &url, folderId, [folderId+sortOrder], isFavorite, lastFetchedAt',
      folders:  'id, sortOrder',
      articles: 'id, &[feedId+guid], feedId, publishedAt, [feedId+publishedAt], [isRead+publishedAt], [feedId+isRead+publishedAt], [isRead+feedId], [isReadLater+publishedAt], [isFavorite+publishedAt], link',
      settings: 'key',
      syncLog:  '++id, feedId, startedAt, [feedId+startedAt]',
    });
  }
}
```

Why these indexes (the coder must use them, not table scans):
| Query | Index |
|---|---|
| Timeline "All", newest first | `publishedAt` (`orderBy('publishedAt').reverse()`) |
| Timeline "Unread" | `[isRead+publishedAt]` between `[0, Dexie.minKey]`..`[0, Dexie.maxKey]` |
| Timeline for one feed | `[feedId+publishedAt]` |
| Timeline for one feed, unread only | `[feedId+isRead+publishedAt]` |
| Timeline for a folder | run the per-feed query for each feed in the folder (`Promise.all`), merge-sort in memory, slice to `limit` |
| Favorites / Read Later | `[isFavorite+publishedAt]` / `[isReadLater+publishedAt]` with first key `1` |
| Unread counts per feed (one query) | `[isRead+feedId]` between `[0,minKey]`..`[0,maxKey]` → `.keys()` → reduce by `key[1]` |
| Dedup | `&[feedId+guid]` (unique compound) |
| Retention | `[feedId+publishedAt]` reversed, `offset(limit)` |
| Feed lookup by URL when subscribing | `&url` |

`guid` is **unique per feed** (`&[feedId+guid]`), not globally: the same story in two feeds is legitimately two articles with independent read state. The spec's "guid unique" is satisfied at the per-feed level, which is the only level at which it is meaningful.

`src/db/db.ts`: `export const db = new OpenHorizonDB();` — one instance, imported everywhere (including `sw.ts`; Dexie works in workers).

### 2.2 Settings access — `features/settings/settings.ts`

```ts
export const DEFAULT_SETTINGS: Settings = { syncFrequency: '30m', notificationsEnabled: false, density: 'comfortable', retentionPerFeed: 200, lastSyncAt: null, onboardingDone: false, installDismissedAt: null };
export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]>;   // row?.value ?? DEFAULT_SETTINGS[key]
export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void>; // db.settings.put({key, value})
export async function getAllSettings(): Promise<Settings>;
export function useSetting<K extends keyof Settings>(key: K): Settings[K];  // useLiveQuery(() => getSetting(key), [key], DEFAULT_SETTINGS[key])
```

### 2.3 Article dedup — `features/articles/dedup.ts`

The `guid` stored on an `Article` is computed from a `ParsedItem` as:
1. `item.id` (RSS `<guid>`, Atom `<id>`, RSS1 `rdf:about`, JSON Feed `id`) trimmed, if non-empty;
2. else `item.link` (absolute, with `#fragment` and `utm_*` params removed by `lib/url.normalizeArticleUrl`), if non-empty;
3. else `"h:" + fnv1a32(title.trim().toLowerCase() + "|" + (publishedAt ?? ""))` (`lib/hash.ts`, sync, hex string).

Insert procedure (`syncFeed.ts`, inside `db.transaction('rw', db.articles, …)`):
```ts
const keys = items.map(i => [feedId, i.guid] as [string, string]);
const existing = await db.articles.where('[feedId+guid]').anyOf(keys).toArray();
const existingByGuid = new Map(existing.map(a => [a.guid, a]));
const toAdd: Article[] = []; const toUpdate: Article[] = [];
for (const item of items) {
  const prev = existingByGuid.get(item.guid);
  if (!prev) toAdd.push(toArticle(item, feedId, now));
  else if (prev.title !== item.title || prev.contentRaw !== item.contentRaw) toUpdate.push({ ...prev, title: item.title, contentRaw: item.contentRaw, summary: item.summary, thumbnailUrl: prev.thumbnailUrl ?? item.thumbnailUrl });
  // read/favorite/readLater flags are never touched on update
}
await db.articles.bulkAdd(toAdd); await db.articles.bulkPut(toUpdate);
return toAdd;  // new articles (for notifications + counts)
```
Also dedup **within** one fetch: if two items in the same response collapse to the same guid, keep the first.

### 2.4 Retention — `features/articles/retention.ts`

Run after each successful `syncFeed` and once on app start (`pruneAll()`):
```ts
export async function pruneFeed(feedId: string, keep: number) {
  const victims = await db.articles.where('[feedId+publishedAt]')
    .between([feedId, Dexie.minKey], [feedId, Dexie.maxKey])
    .reverse()           // newest first
    .offset(keep)        // everything beyond the newest `keep`
    .filter(a => a.isReadLater === 0 && a.isFavorite === 0)   // never delete read-later/favorite
    .primaryKeys();
  if (victims.length) await db.articles.bulkDelete(victims);
}
```
Rules: `keep = settings.retentionPerFeed` (default 200). Unread articles **are** eligible (otherwise a dead unread feed grows forever); the user keeps items by starring or read-later. Unsubscribing a feed deletes all its articles (including read-later/favorite — confirm dialog says so) and its syncLog rows. Deleting a folder sets `folderId = null` on its feeds. `syncLog` keeps the last 50 entries per feed (prune in `syncFeed`).

---

## 3. Live queries — `features/*/…Queries.ts`

All reads from the DB in React go through `useLiveQuery` from `dexie-react-hooks`. Conventions:
- Return `undefined` while loading (Dexie default) → components show `Skeleton`. Pass a default (third arg) only for counts (`0`).
- Dependencies array must include every input (`[view, filter, sort, limit]`).
- Queries are **pure** functions in `features/articles/articleQueries.ts` so the SW/tests can reuse them without React.

```ts
export type View =
  | { type: 'all' } | { type: 'unread' } | { type: 'favorites' } | { type: 'readLater' }
  | { type: 'feed'; feedId: string } | { type: 'folder'; folderId: string };

export async function queryArticles(view: View, filter: 'all'|'unread', sort: 'newest'|'oldest', limit: number): Promise<Article[]>;
export function useArticles(view, filter, sort, limit) { return useLiveQuery(() => queryArticles(view, filter, sort, limit), [JSON.stringify(view), filter, sort, limit]); }
export function useArticle(id: string | null) { return useLiveQuery(() => id ? db.articles.get(id) : undefined, [id]); }
export function useUnreadCounts(): { total: number; byFeed: Map<string, number>; byFolder: Map<string, number> } | undefined;
export function useFeeds(): Feed[] | undefined;          // orderBy('[folderId+sortOrder]')
export function useFolders(): Folder[] | undefined;      // orderBy('sortOrder')
export function useFeedMap(): Map<string, Feed>;          // derived with useMemo from useFeeds
```
`queryArticles` implementation notes: `view.type==='unread'` ignores `filter`; `filter==='unread'` on `all` uses `[isRead+publishedAt]`; sort `'oldest'` drops `.reverse()`; folder views fetch per feed and merge. Article `contentRaw` can be large: timeline queries should **not** load it. Dexie has no projection, so the timeline uses `Article` rows as-is in v1 (acceptable up to a few thousand articles); if profiling shows issues, split content into an `articleBodies` table in db version 2 (`id` = article id). Keep this in mind: the `ReaderPane` reads via `useArticle(id)`, so a future split is a one-file change.

Cross-context updates: Dexie ≥3.2 propagates change notifications between tabs and workers through `BroadcastChannel`, so `useLiveQuery` refreshes when the SW writes. If a browser does not deliver them, the page also handles the SW `SYNC_COMPLETE` message by bumping `uiStore.dbEpoch`, which is included in every `useLiveQuery` deps array via a tiny wrapper `useLive(fn, deps)` in `hooks/useLive.ts` — use that wrapper everywhere instead of `useLiveQuery` directly.

---

## 4. UI state — `src/store/uiStore.ts` (zustand)

```ts
export interface UIState {
  // navigation
  view: View;                          // default { type: 'all' }
  selectedArticleId: string | null;
  mobilePane: 'nav' | 'timeline' | 'reader';   // default 'timeline'
  navCollapsed: boolean;               // persisted
  readerFullscreen: boolean;
  // timeline
  timelineFilter: 'all' | 'unread';    // default 'all'
  timelineSort: 'newest' | 'oldest';   // default 'newest'
  timelineLimit: number;               // default 100; "Load more" adds 100; reset to 100 on view change
  searchQuery: string;
  // reader prefs (persisted)
  readerPrefs: { fontSize: 0|1|2|3|4; lineHeight: 0|1|2; font: 'serif'|'sans'; width: 'narrow'|'wide' };
  // dialogs
  dialogs: { addFeed: false | { initialUrl?: string; tab?: 'url'|'discover'|'xml'|'opml' }; settings: false | { section?: string }; share: null | { title: string; url: string; text?: string } };
  // transient
  toasts: Toast[];
  syncing: boolean; syncProgress: { done: number; total: number } | null; syncingFeedIds: Set<string>;
  dbEpoch: number;
  recentlyFetchedCutoff: number;       // Date.now()-10min, refreshed each sync; ArticleRow pulse uses it
  // actions
  setView(v: View): void;              // also: selectedArticleId=null? NO — keep selection if still in view (checked by TimelinePane effect); timelineLimit=100; mobilePane='timeline'
  selectArticle(id: string | null, opts?: { openOnMobile?: boolean }): void;
  setMobilePane(p): void; toggleNavCollapsed(): void; setReaderFullscreen(b): void;
  setTimelineFilter(f): void; setTimelineSort(s): void; loadMore(): void; setSearchQuery(q): void;
  setReaderPrefs(partial): void; resetReaderPrefs(): void;
  openDialog(name, payload?): void; closeDialog(name): void; closeAllDialogs(): void;
  pushToast(t: Omit<Toast,'id'>): string; dismissToast(id): void;
  setSyncing(b, progress?): void; markFeedSyncing(id, b): void; bumpDbEpoch(): void;
}
```
- Create with `create<UIState>()(persist(subscribeWithSelector(set => ({...})), { name: 'oh-ui', storage: createJSONStorage(() => localStorage), partialize: s => ({ navCollapsed: s.navCollapsed, readerPrefs: s.readerPrefs, timelineSort: s.timelineSort, timelineFilter: s.timelineFilter }) }))`. Only those four keys hit `localStorage`.
- `Set` is not JSON-serializable; `syncingFeedIds` is excluded by `partialize` so that's fine.

### 4.1 Selectors (avoid re-render storms)

Rules every component follows:
1. **Never** `const state = useUIStore()` (subscribes to everything).
2. Select primitives one at a time: `const id = useUIStore(s => s.selectedArticleId)`.
3. For several values, use `useShallow`: `const { filter, sort } = useUIStore(useShallow(s => ({ filter: s.timelineFilter, sort: s.timelineSort })))`.
4. Actions are stable; select them individually or via `useShallow` too. Prefer calling `useUIStore.getState().action()` inside event handlers/effects that don't need re-rendering (e.g. keyboard hook).
5. `ArticleRow` receives `selected: boolean` from `ArticleList` (which selects `selectedArticleId` once) — rows do not subscribe to the store. `ArticleRow` is `React.memo`'d; `onSelect`/`onToggle*` callbacks come from `useCallback` with stable deps or are module-level functions taking `id`.
6. `FeedRow` similarly receives `unreadCount` and `selected` as props from `NavPane`, which subscribes once to `view`.
7. `store/selectors.ts` exports named selectors (`selectIsDialogOpen`, `selectShareTarget`, …) to avoid recreating inline functions that return new objects.

### 4.2 Reader prefs persistence

`readerPrefs` persist via the zustand `persist` partialize above (`localStorage` key `oh-ui`). The reader applies them as inline CSS variables (DESIGN §2.4). On first paint before hydration, `:root` defaults apply, so there is no flash. `features/reader/readerPrefs.ts` exports `FONT_SIZES = [15,17,19,21,24]`, `LINE_HEIGHTS = [1.5,1.7,1.9]`, `MEASURES = { narrow: '68ch', wide: '92ch' }`, `DEFAULT_READER_PREFS`.

### 4.3 Boot URL handling — `hooks/useBootUrl.ts`

On mount: `const p = new URLSearchParams(location.search)`. If `p.get('article')` → `selectArticle(id, { openOnMobile: true })`, verify it exists (`db.articles.get`) — if missing, toast "That article is no longer available". If `p.get('add')` → `openDialog('addFeed', { initialUrl })`. If `p.get('view')` in `all|unread|favorites|readLater` → `setView`. Then `history.replaceState(null, '', '/')`. The SW `notificationclick` posts `OPEN_ARTICLE` to an existing client instead, which goes through the same `selectArticle` call.

### 4.4 Paging

Timeline shows `timelineLimit` articles (100). The list footer renders `Button steel "Load more"` when `articles.length === timelineLimit`. No virtualization in v1 (`content-visibility: auto` makes 100–300 rows cheap).

---

## 5. Feed fetching — `src/lib/proxy/`

### 5.1 Proxy list — `proxies.ts`

```ts
export type ProxyId = 'env' | 'local' | 'allorigins' | 'corsproxy' | 'codetabs' | 'rss2json';
export interface ProxyDef { id: ProxyId; build(url: string): string; passesHeaders: boolean; kind?: 'raw' | 'rss2json'; timeoutMs?: number; }
export function getProxies(): ProxyDef[] {
  const list: ProxyDef[] = [];
  const env = import.meta.env.VITE_CORS_PROXY as string | undefined;   // e.g. "https://my-proxy.example.com/?url={url}" ; "{url}" is replaced with encodeURIComponent(url); if no "{url}" placeholder, the encoded URL is appended
  if (env) list.push({ id: 'env', passesHeaders: true, build: u => env.includes('{url}') ? env.replace('{url}', encodeURIComponent(u)) : env + encodeURIComponent(u) });
  if (import.meta.env.VITE_DISABLE_LOCAL_PROXY !== '1') list.push({ id: 'local', passesHeaders: true, build: u => `/api/proxy?url=${encodeURIComponent(u)}` });
  list.push({ id: 'allorigins', passesHeaders: false, timeoutMs: 8000, build: u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` });
  list.push({ id: 'corsproxy',  passesHeaders: false, timeoutMs: 8000, build: u => `https://corsproxy.io/?${encodeURIComponent(u)}` });
  list.push({ id: 'codetabs',   passesHeaders: false, timeoutMs: 8000, build: u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` });
  list.push({ id: 'rss2json',   passesHeaders: false, timeoutMs: 8000, kind: 'rss2json', build: u => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(u)}` });
  return list;
}
```
```
Order of attempts: **direct → env (if set) → local (unless disabled) → jina → alloriginsget → allorigins → corsproxy → codetabs → rss2json**. Attempts are hedged: the next route starts when the running one fails or has not settled after `HEDGE_MS` = 2500 ms; the first success wins and the others are aborted (aborted losers are not recorded as failures). rss2json is skipped when `expectHtml` is set (discovery of HTML pages). ("Env goes first" means first among proxies; a direct CORS-enabled fetch is always cheaper and preserves headers, so it is tried before any proxy.) In the SW, `import.meta.env.VITE_CORS_PROXY` is also available (Vite injects env into the SW build with vite-plugin-pwa injectManifest).

### 5.2 Failure memory — `failureMemory.ts`

Module-level `Map<ProxyDef['id'] | 'direct', { consecutiveFailures: number; lastFailureAt: number; lastSuccessAt: number }>`.
- `shouldSkip(id)`: `consecutiveFailures >= 3 && Date.now() - lastFailureAt < 5 * 60_000` → skip for 5 minutes (then one retry; success resets).
- `recordSuccess(id)`, `recordFailure(id)`.
- Ordering: proxies are tried in the fixed order above, skipping cooled-down ones; if **all** are in cooldown, ignore the cooldown and try all anyway.
- Direct fetch is also tracked **per feed host** (`Map<hostname, …>`) because CORS failure is a property of the host: after 2 direct failures for a host, skip direct for that host for 24h (persisted in `sessionStorage`? — no: in-memory only; in the SW it lives as long as the SW does, which is fine).

### 5.3 `fetchWithProxy` — `fetchWithProxy.ts`

```ts
export interface FetchOptions { etag?: string; lastModified?: string; timeoutMs?: number /* 15000 */; signal?: AbortSignal; accept?: string /* default feed accept header */ }
export interface FetchResult {
  status: number;                       // 200 or 304
  text: string;                         // "" on 304
  etag?: string; lastModified?: string; // only when via === 'direct' | 'env'
  contentType?: string;
  finalUrl: string;                     // response.url when available, else requested
  via: 'direct' | 'env' | 'local' | 'allorigins' | 'corsproxy' | 'codetabs' | 'rss2json';
}
export class FetchAllFailedError extends Error { attempts: { via: string; error: string }[] }
export async function fetchWithProxy(url: string, opts: FetchOptions = {}): Promise<FetchResult>
```
Algorithm:
1. Build attempt list: `['direct', ...getProxies()]` minus skipped (§5.2).
2. For each attempt: `const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000); if (opts.signal) opts.signal.addEventListener('abort', () => ctrl.abort(), { once: true });`
3. Headers: `Accept: application/rss+xml, application/atom+xml, application/feed+json, application/json, application/xml, text/xml, text/html;q=0.8, */*;q=0.5`. Add `If-None-Match`/`If-Modified-Since` **only** when `passesHeaders` (direct/env) and values exist. Do **not** add custom `X-*` headers (they force a CORS preflight that many feed servers fail).
4. `fetch(target, { method: 'GET', headers, signal: ctrl.signal, mode: 'cors', credentials: 'omit', redirect: 'follow', cache: 'no-store' })`. (`cache: 'no-store'` keeps the browser HTTP cache out; our SW `NetworkFirst` runtime cache handles offline fallback — see §8.4.)
5. On `304` → return `{ status: 304, text: '', via, finalUrl: url }`. On `!response.ok` → record failure, continue. On ok: `text = await response.text()`. **Sanity check**: if `text.length === 0`, or (via proxy and text looks like the proxy's own HTML error page: `/^\s*<!doctype html/i.test(text) && !/<(rss|feed|rdf:RDF)\b/i.test(text)` **and** the caller expects a feed) → treat as failure. (Discovery passes `accept: 'text/html,…'` and `expectHtml: true` to bypass this check.)
6. Record success; return. On exception (`AbortError`, `TypeError` network/CORS): record failure, push to `attempts`, continue. After the loop throw `FetchAllFailedError` with the attempts list (surfaces in the AddFeedDialog error and in `syncLog.error`).
7. `finally { clearTimeout(t) }`.

Rate hygiene: `syncAll` limits concurrency to 4 (§8.1); the same feed is never fetched twice concurrently (`inFlight: Set<feedId>` in `syncAll`).

---

## 6. Parsing — `src/lib/parser/`

### 6.1 XML adapter — `lib/xml/dom.ts`

```ts
export interface XmlEnv { parse(text: string, mime: 'text/xml' | 'text/html'): Document; }
let env: XmlEnv | null = null;
export function setXmlEnv(e: XmlEnv) { env = e; }
export function parseXml(text: string): Document  // uses env ?? native: new DOMParser().parseFromString(text, 'text/xml'); throws ParseError if a <parsererror> element is present (native) or xmldom reports a fatal error
export function parseHtml(text: string): Document // native 'text/html'; in SW, xmldom 'text/html'
// Namespace-safe helpers (work on both native DOM and xmldom; NO querySelector anywhere in the parser):
export const NS = { atom: 'http://www.w3.org/2005/Atom', content: 'http://purl.org/rss/1.0/modules/content/', dc: 'http://purl.org/dc/elements/1.1/', media: 'http://search.yahoo.com/mrss/', rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', rss1: 'http://purl.org/rss/1.0/', itunes: 'http://www.itunes.com/dtds/podcast-1.0.dtd' };
export function children(el: Element, localName: string, ns?: string): Element[];   // direct children only
export function child(el: Element, localName: string, ns?: string): Element | null;
export function text(el: Element | null): string;   // textContent trimmed, '' if null
export function attr(el: Element | null, name: string): string;
```
Page: `main.tsx` does nothing (native). SW: `sw.ts` calls `setXmlEnv({ parse: (t, m) => new (await import('@xmldom/xmldom')).DOMParser().parseFromString(t, m) })` — statically imported, no dynamic import, keep it simple. xmldom's `Document` implements the standard `getElementsByTagNameNS`, `childNodes`, `getAttribute`, `textContent`, which is all the helpers use.

### 6.2 Normalized shapes — `types.ts`

```ts
export type FeedKind = 'rss2' | 'atom' | 'rss1' | 'json';
export interface ParsedFeed {
  kind: FeedKind; title: string; description?: string; siteUrl?: string; feedUrl: string /* self link or sourceUrl */;
  language?: string; iconUrl?: string /* <image><url>, atom <icon>/<logo>, json icon/favicon */; items: ParsedItem[];
}
export interface ParsedItem {
  guid: string;                 // per §2.3 (computed by parser via dedup.computeGuid)
  id?: string; link: string; title: string; author?: string;
  contentRaw: string;           // chosen HTML (see 6.3), '' if none
  summary: string;              // plain text ≤ 280 chars
  publishedAt: number | null;   // null if unparseable/missing
  thumbnailUrl?: string;
  enclosures: { url: string; type?: string; length?: number }[];
  categories: string[];
}
```

### 6.3 `parseFeed(text, sourceUrl)` — `parseFeed.ts`

Detection order:
1. `const t = text.replace(/^﻿/, '').trimStart()`; if `t.startsWith('{')` → `JSON.parse`; if `obj.version` startsWith `https://jsonfeed.org/version/` or has `items` array with `title` → `jsonfeed.ts`.
2. Else `doc = parseXml(t)`; `root = doc.documentElement`; by `root.localName` (and namespace): `rss` → `rss2.ts` (also handles RSS 0.9x); `feed` with ns Atom → `atom.ts`; `RDF` (rdf ns) → `rss1.ts`. Otherwise throw `NotAFeedError` (AddFeedDialog then tries discovery if content looks like HTML).

Field selection per format:

| Field | RSS 2.0 | Atom | RSS 1.0 | JSON Feed |
|---|---|---|---|---|
| feed title | `channel>title` | `feed>title` | `channel>title` | `title` |
| siteUrl | `channel>link` (first text link) | `link[rel=alternate]` or first `link` w/o rel, `href` | `channel>link` | `home_page_url` |
| feedUrl | `atom:link[rel=self]` or sourceUrl | `link[rel=self]` or sourceUrl | sourceUrl | `feed_url` or sourceUrl |
| iconUrl | `channel>image>url` | `icon` then `logo` | `channel>image` rdf:resource | `icon` then `favicon` |
| language | `channel>language` | `xml:lang` on root | `dc:language` | `language` |
| items | `channel>item` (also `rss>item` for 0.91) | `feed>entry` | `rdf:RDF>item` (not inside channel) | `items[]` |
| item id | `guid` | `id` | `rdf:about` | `id` |
| link | `link`; if missing, `guid[isPermaLink!=false]` if it looks like a URL; else `enclosure url` | `link[rel=alternate]` or first `link` w/o rel → `href` | `link` | `url` or `external_url` |
| title | `title` → strip HTML, decode entities | `title` (type text/html/xhtml → to plain text) | `title` | `title` (or first 80 chars of content) |
| author | `dc:creator` > `author` (strip email form `a@b (Name)` → Name) | `author>name` | `dc:creator` | `authors[0].name` or `author.name` |
| content (**priority**) | `content:encoded` > `description` | `content` (xhtml → serialize child nodes; html/text → text) > `summary` | `content:encoded` > `description` | `content_html` > `content_text` (wrapped in `<p>`, escaped) > `summary` |
| summary text | `stripHtml(description ?? contentRaw)` truncated 280 | `stripHtml(summary ?? contentRaw)` | same | `summary ?? stripHtml(contentRaw)` |
| date | `pubDate` > `dc:date` > `lastBuildDate`(channel, last resort) | `published` > `updated` | `dc:date` | `date_published` > `date_modified` |
| image (**priority**) | `media:content[medium=image or type^=image/]` (largest by width attr) > `media:thumbnail` > `enclosure[type^=image/]` > `itunes:image href` > first `<img src>` in contentRaw | `media:*` same > `link[rel=enclosure type^=image/]` > first `<img>` | `media:*` > first `<img>` | `image` > `banner_image` > first `<img>` in content_html |
| enclosures | `enclosure` (url,type,length) + `media:content` non-image | `link[rel=enclosure]` | — | `attachments[]` |
| categories | `category` texts | `category term` | `dc:subject` | `tags` |

Generic content priority is as required: **`content:encoded` > `content` > `summary` > `description`**, applied as the table shows per format. All URLs (`link`, image, enclosures, siteUrl) are resolved with `resolveUrl(href, baseUrl)` where `baseUrl = xml:base ?? siteUrl ?? sourceUrl`. `<img>` inside `contentRaw` are **not** rewritten at parse time; the sanitizer resolves relative `src` against `article.link` at render time. Titles and summaries: `decodeEntities(stripHtml(x)).replace(/\s+/g,' ').trim()`; `title` falls back to `summary.slice(0, 80) + '…'` then to `'(untitled)'`. Cap `contentRaw` at 1,000,000 chars (truncate + append `<p>…</p>`). Cap items per fetch at 500 (newest first).

`dates.ts`: `parseDate(s): number | null` → trim; `Date.parse`; if NaN, fix common RFC 822 quirks: replace `UT$`→`UTC`, `(\d) ([A-Z]{3,4})$` zone names via table (`EST,-0500` etc.), strip weekday, handle `YYYY-MM-DD HH:mm:ss` (insert `T`), handle `dd Mon yyyy` without time. Reject years < 1990 or > now+2 days (clamp future to now). Return `null` when unparseable — `syncFeed` then uses `fetchedAt` (and keeps the first value on later updates so ordering stays stable).

`media.ts`: `firstImgSrc(html)` uses regex `/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i` (also check `data-src` when `src` is a data: URI or 1×1 tracker like `/pixel|tracker|1x1|spacer/i`); ignore images < 48px by `width`/`height` attrs when present.

### 6.4 Sanitization — `features/reader/sanitize.ts` (DOMPurify, page only)

```ts
import DOMPurify from 'dompurify';
const ALLOWED_TAGS = ['a','abbr','address','article','aside','b','bdi','bdo','blockquote','br','caption','cite','code','col','colgroup','dd','del','details','dfn','div','dl','dt','em','figcaption','figure','footer','h1','h2','h3','h4','h5','h6','header','hr','i','img','ins','kbd','li','main','mark','nav','ol','p','picture','pre','q','rp','rt','ruby','s','samp','section','small','source','span','strong','sub','summary','sup','table','tbody','td','tfoot','th','thead','time','tr','u','ul','var','wbr','video','audio','iframe'];
const ALLOWED_ATTR = ['href','src','srcset','sizes','alt','title','width','height','loading','decoding','referrerpolicy','colspan','rowspan','scope','datetime','cite','lang','dir','start','reversed','type','controls','poster','preload','allow','allowfullscreen','frameborder','sandbox','media'];
const FORBID_TAGS = ['script','style','link','meta','base','form','input','button','select','textarea','object','embed','applet','svg','math','template','noscript','canvas','map','area'];
const YT_HOSTS = ['www.youtube.com','youtube.com','www.youtube-nocookie.com','youtube-nocookie.com'];

export function sanitizeHtml(html: string, baseUrl?: string): string {
  const purifier = DOMPurify();  // own instance so hooks don't leak
  purifier.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'iframe') {
      const src = (node as Element).getAttribute('src') ?? '';
      let ok = false;
      try { const u = new URL(src); ok = u.protocol === 'https:' && YT_HOSTS.includes(u.hostname) && u.pathname.startsWith('/embed/'); } catch {}
      if (!ok) node.parentNode?.removeChild(node);
      else { const el = node as Element; el.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation allow-popups'); el.setAttribute('loading', 'lazy'); el.setAttribute('referrerpolicy', 'no-referrer'); el.setAttribute('allow', 'fullscreen; picture-in-picture'); el.removeAttribute('width'); el.removeAttribute('height'); }
    }
  });
  purifier.addHook('afterSanitizeAttributes', node => {
    const el = node as Element;
    if (el.tagName === 'A') { if (el.hasAttribute('href')) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer nofollow ugc'); resolveAttr(el, 'href', baseUrl); } else { /* anchor without href stays as text */ } }
    if (el.tagName === 'IMG') { el.setAttribute('loading', 'lazy'); el.setAttribute('decoding', 'async'); el.setAttribute('referrerpolicy', 'no-referrer'); resolveAttr(el, 'src', baseUrl); if (!el.hasAttribute('alt')) el.setAttribute('alt', ''); el.removeAttribute('width'); el.removeAttribute('height'); /* CSS controls size */ }
    if (el.tagName === 'SOURCE') resolveAttr(el, 'src', baseUrl), resolveAttr(el, 'srcset', baseUrl /* per candidate */);
    if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') { el.setAttribute('controls', ''); el.setAttribute('preload', 'none'); el.removeAttribute('autoplay'); }
  });
  return purifier.sanitize(html, {
    ALLOWED_TAGS, ALLOWED_ATTR, FORBID_TAGS,
    ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,  // DOMPurify default minus ftp/tel; blocks javascript:, data: except handled by img check below
    FORCE_BODY: true, RETURN_TRUSTED_TYPE: false, WHOLE_DOCUMENT: false,
  });
}
```
Also: strip `style` attributes (not in `ALLOWED_ATTR` → removed automatically), drop `data:` image URIs larger than 50 KB (hook: if `src` starts with `data:` and length > 50_000 → remove element). Result is memoized per article id in `ReaderContent` via `useMemo`. Never render `contentRaw` or `summary` with `dangerouslySetInnerHTML` elsewhere (summary is plain text; render as text).

### 6.5 Feed discovery — `lib/discovery/discoverFeeds.ts`

```ts
export interface FeedCandidate { url: string; title?: string; kind?: FeedKind; source: 'link-tag' | 'anchor' | 'well-known' | 'direct'; }
export async function discoverFeeds(input: string, opts?: { signal?: AbortSignal; validate?: boolean /* default true */ }): Promise<FeedCandidate[]>
```
1. Normalize input: prepend `https://` if no scheme; `new URL()` must succeed.
2. `res = await fetchWithProxy(url, { accept: 'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,*/*', expectHtml: true })`.
3. If `res.text` parses as a feed (`parseFeed` succeeds) → return `[{ url: res.finalUrl, kind, title, source: 'direct' }]`.
4. Else parse HTML (`parseHtml`); `base = <base href>` or `res.finalUrl`. Collect `<link rel~="alternate" type in {application/rss+xml, application/atom+xml, application/feed+json, application/json (only if title/href contains 'feed'|'json'), text/xml, application/xml}>` → `{ url: resolveUrl(href, base), title, source: 'link-tag' }`. Then `<a href>` whose href matches `/(\/feed|\/rss|\/atom|\.rss|\.xml|feed\.json|\/feeds?\/)(\?|$|\/)/i` (max 10) → `source: 'anchor'`.
5. Well-known fallbacks appended (deduped) relative to the **origin** and to the input path: `/feed`, `/feed/`, `/rss`, `/rss.xml`, `/atom.xml`, `/feed.xml`, `/index.xml`, `/feed.json`, `/feeds/posts/default` (Blogger), `/?feed=rss2` (WordPress). Platform hints: YouTube channel/user pages → `https://www.youtube.com/feeds/videos.xml?channel_id=…` (extract `channelId` from HTML `"channelId":"UC…"` / `<meta itemprop="channelId">`); `reddit.com/r/x` → `/r/x/.rss`; `medium.com/@u` → `medium.com/feed/@u`; `github.com/o/r` → `/o/r/releases.atom` + `/commits.atom`; `substack` → `/feed`.
6. Validate (`validate=true`): for `link-tag`/`anchor`/`direct` candidates plus **at most 4** well-known candidates (stop after first success among well-knowns), run `fetchWithProxy` + `parseFeed` with concurrency 3 and 10 s timeout; keep only those that parse; fill `kind`/`title`; dedup by normalized URL (`normalizeFeedUrl`: lowercase host, strip hash, strip `utm_*`, strip trailing slash). Return in order: link-tag, direct, anchor, well-known.
7. Errors in step 2 throw `FetchAllFailedError`; step 4 with zero candidates and step 6 with zero valid → return `[]` (caller shows the empty message).

### 6.6 Favicons — `features/feeds/favicon.ts`

```ts
export function faviconCandidates(feed: Pick<Feed,'siteUrl'|'url'>, parsedIconUrl?: string): string[] {
  const host = hostname(feed.siteUrl ?? feed.url);        // '' for manual feeds
  const list = [];
  if (parsedIconUrl) list.push(parsedIconUrl);
  if (host) list.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`, `https://icons.duckduckgo.com/ip3/${host}.ico`);
  return list;
}
```
`feed.faviconUrl` is set to the first candidate at subscribe time (Google S2 preferred over the feed's own `<image>` only when the feed image is wider than 2:1 — feed "images" are often banners; simple heuristic: use parsed icon only if URL ends in `.ico|.png` and path contains `icon|logo|favicon`; otherwise Google). `FeedAvatar` tries `faviconUrl`, on `onError` tries the next candidate (`data-fallback-index`), finally renders the letter avatar. Successful fallbacks write back `faviconUrl` (fire-and-forget `db.feeds.update`). The SW caches favicon responses `StaleWhileRevalidate` (§8.4).

---

## 7. OPML — `src/lib/opml/`

### 7.1 Import — `parseOpml.ts`

```ts
export interface OpmlFeed { title: string; xmlUrl: string; htmlUrl?: string; folder: string | null; }
export interface OpmlResult { title?: string; feeds: OpmlFeed[]; folders: string[]; }
export function parseOpml(text: string): OpmlResult
```
- `parseXml`; root `opml`; `body>outline*`. Walk recursively with `folder` context: an `<outline>` with `xmlUrl` (case-insensitive attr lookup: `xmlUrl`, `xmlurl`, `url`) is a feed (title = `text` ?? `title` ?? xmlUrl host); an `<outline>` without `xmlUrl` but with children is a folder (name = `text` ?? `title`). **Nested folders flatten** to the top-level folder name joined with ` / ` (e.g. `Tech / Apple`) because the data model has one folder level. Feeds directly under `body` → `folder: null`. Dedup by `normalizeFeedUrl`.
- Import procedure (`features/feeds/addFeed.ts → importOpml(result, { selected, fetchNow })`): create missing folders; for each feed not already subscribed (`db.feeds.where('url').equals(norm)`), insert a `Feed` with `title` from OPML, `faviconUrl` from `htmlUrl` host, `errorCount 0`; then if `fetchNow`, `syncAll({ feedIds })`. Progress reported via a callback `(done, total)`.

### 7.2 Export — `exportOpml.ts`

```ts
export async function exportOpml(): Promise<string>  // returns XML string; caller downloads as `openhorizon-YYYY-MM-DD.opml` (Blob, type 'text/x-opml')
```
Format (exactly):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>OpenHorizon subscriptions</title>
    <dateCreated>Mon, 10 Nov 2026 12:00:00 GMT</dateCreated>
  </head>
  <body>
    <outline text="Folder name" title="Folder name">
      <outline type="rss" text="Feed title" title="Feed title" xmlUrl="https://…/feed.xml" htmlUrl="https://…"/>
    </outline>
    <outline type="rss" text="Unfiled feed" title="Unfiled feed" xmlUrl="…" htmlUrl="…"/>
  </body>
</opml>
```
Escape `&<>"'` in attributes (`lib/text.escapeXml`). Folders sorted by `sortOrder`, feeds by `[folderId+sortOrder]`. Manual feeds (`manual=1`) are skipped (no URL) — the dialog mentions "{n} manual feeds were not exported".

---

## 8. Sync — `src/features/sync/`

### 8.1 `syncAll` and `syncFeed`

```ts
// limit.ts
export function createLimiter(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T>;  // simple queue; no dependency

// syncFeed.ts
export interface SyncFeedResult { feedId: string; status: 'ok'|'notModified'|'error'; newArticles: Article[]; error?: string; via?: FetchResult['via'] }
export async function syncFeed(feed: Feed, ctx: { origin: 'page'|'sw'; signal?: AbortSignal; retention: number }): Promise<SyncFeedResult>
```
`syncFeed` steps: (1) if `feed.manual` → return `notModified`; (2) `fetchWithProxy(feed.url, { etag, lastModified, signal })`; (3) 304 → update `lastFetchedAt/lastSuccessAt`, `errorCount=0`, log `notModified`; (4) 200 → `parseFeed(text, feed.url)`; (5) dedup/insert (§2.3) in one transaction, then feed update: `title` only if the user hasn't renamed it (track `titleCustomized: Flag` — add to `Feed` interface; default 0), `siteUrl`, `language`, `etag`, `lastModified` (only when `via` passes headers), `lastSuccessAt`, `lastFetchedAt`, `lastError: null`, `errorCount: 0`; `faviconUrl` if missing; (6) `pruneFeed(feed.id, retention)`; (7) write `syncLog`; prune `syncLog` for this feed to 50. Errors: catch everything → update `lastFetchedAt`, `lastError: message`, `errorCount+1`, write log, return `error`. Never throw.

```ts
// syncAll.ts
export interface SyncAllOptions { feedIds?: string[]; origin: 'page'|'sw'; signal?: AbortSignal; onProgress?(done: number, total: number, feedId: string): void; force?: boolean }
export interface SyncAllResult { startedAt: number; finishedAt: number; results: SyncFeedResult[]; newArticles: Article[]; errorCount: number }
export async function syncAll(opts: SyncAllOptions): Promise<SyncAllResult>
```
- Guard: module-level `let running: Promise<SyncAllResult> | null` — if a sync is running, return the same promise (no parallel syncs in one context).
- Load feeds (`feedIds` filter or all non-manual), **backoff**: skip feeds with `errorCount >= 5` unless `force` or `Date.now() - lastFetchedAt > 6h` (and `errorCount >= 10` → 24h). Order: oldest `lastFetchedAt` first.
- `limit = createLimiter(4)`; `await Promise.all(feeds.map(f => limit(() => syncFeed(f, ctx))))`, calling `onProgress`.
- After: `setSetting('lastSyncAt', finishedAt)`; collect `newArticles`; return. The caller (page scheduler or SW) decides about notifications.
- Page wrapper `runSyncFromPage(opts)` (in `scheduler.ts`) sets `uiStore.syncing/syncProgress/syncingFeedIds`, bumps `recentlyFetchedCutoff`, shows toasts: errors → "Sync failed for {n} feeds" (action: open Settings→Sync); on manual refresh with 0 new → `announce('No new articles')`. It also calls `showNewArticleNotifications(newArticles, 'page')` (§8.3) when permission is granted and the page is **hidden** (`document.visibilityState === 'hidden'`) — don't notify about things the user is looking at.

### 8.2 Scheduling

**In-page scheduler — `scheduler.ts → useSyncScheduler()`** (mounted once in `AppShell`):
- On mount: if `lastSyncAt` is null or older than the frequency → `runSyncFromPage()` after 1.5 s (let first paint happen).
- `setInterval(tick, 60_000)`; `tick()`: read `syncFrequency` (live via `useSetting`), if `'manual'` return; `intervalMs = {15m: 900e3, 30m: 1800e3, 1h: 3600e3}`; if `Date.now() - (lastSyncAt ?? 0) >= intervalMs && navigator.onLine && document.visibilityState === 'visible'` → run.
- Also run on `visibilitychange → visible` and `online` events if due. Debounce 5 s.
- Multi-tab: use `navigator.locks.request('oh-sync', { ifAvailable: true }, cb)` when available so only one tab syncs; the others see results via live queries.

**Service worker periodic sync — `sw.ts` + `swBridge.ts`**:
- Page, after SW ready and when `syncFrequency !== 'manual'`: 
  ```ts
  const reg = await navigator.serviceWorker.ready;
  if ('periodicSync' in reg) {
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName }).catch(() => null);
    if (status?.state === 'granted') await (reg as any).periodicSync.register('feed-sync', { minInterval: intervalMs });  // re-register on frequency change; unregister on 'manual'
  }
  ```
  (Chromium grants this only for installed PWAs with sufficient site engagement; the Settings dialog shows the resulting status string.)
- SW: `self.addEventListener('periodicsync', e => { if (e.tag === 'feed-sync') e.waitUntil(swSync()); })` where `swSync()`:
  1. `const clients = await self.clients.matchAll({ type: 'window' })`; if any client is visible (`client.visibilityState === 'visible'`) → `client.postMessage({ type: 'SYNC_REQUEST' })` and return (the page has fresher failure memory and shows progress).
  2. Else run `syncAll({ origin: 'sw' })` directly (Dexie + xmldom work in the SW), then `showNewArticleNotifications(result.newArticles, 'sw')`, then `postToAllClients({ type: 'SYNC_COMPLETE', newCount, errorCount })`.
- **Fallback A (if `@xmldom/xmldom` is not added)**: in step 2, the SW cannot parse; instead it fetches nothing and simply schedules: `self.registration.showNotification` is **not** shown; the SW stores `{ pendingSyncAt: Date.now() }` in `db.settings` so the page syncs immediately on next open (`useBootUrl` checks it). Document this limitation in Settings ("Background sync runs when the app is open").
- Also handle one-off `sync` event (`'feed-sync-once'`) registered by the page when a manual refresh fails because offline: `reg.sync.register('feed-sync-once')` → same `swSync()`.

### 8.3 Message protocol (page ⇄ SW) — `swBridge.ts`

```ts
export type PageToSw =
  | { type: 'SYNC_NOW' }                       // page asks SW to sync (used only when the page is about to be hidden? not in v1; reserved)
  | { type: 'GET_VERSION' }
  | { type: 'SKIP_WAITING' };                  // handled by vite-plugin-pwa's prompt flow; kept for completeness
export type SwToPage =
  | { type: 'SYNC_REQUEST' }                   // SW periodicsync found a visible client → page runs runSyncFromPage()
  | { type: 'SYNC_STARTED'; origin: 'sw' }
  | { type: 'SYNC_COMPLETE'; origin: 'sw'; newCount: number; errorCount: number }
  | { type: 'OPEN_ARTICLE'; articleId: string } // from notificationclick when a window exists
  | { type: 'VERSION'; version: string };
```
Page side `useServiceWorkerBridge()`: `navigator.serviceWorker.addEventListener('message', e => …)`; `SYNC_REQUEST → runSyncFromPage()`; `SYNC_COMPLETE → bumpDbEpoch(); toast.info("{n} new articles")` if `n>0`; `OPEN_ARTICLE → selectArticle(id, { openOnMobile: true }); setMobilePane('reader')`. Send with `(await navigator.serviceWorker.ready).active?.postMessage(msg)`. SW side: `self.addEventListener('message', e => …)` and `postToAllClients(msg)` helper via `clients.matchAll({ includeUncontrolled: true })`.

### 8.4 Notifications — `notifications.ts`

```ts
export async function showNewArticleNotifications(newArticles: Article[], origin: 'page'|'sw'): Promise<void>
```
1. Preconditions: `settings.notificationsEnabled === true`; `Notification.permission === 'granted'` (page) / `self.Notification?.permission === 'granted'` (SW; if undefined, attempt anyway and catch).
2. Filter to articles whose feed has `isFavorite === 1` (load favorite feeds once: `db.feeds.where('isFavorite').equals(1).toArray()`).
3. Group by feed. For each feed with `n` new: `reg.showNotification(n === 1 ? article.title : `${n} new articles`, { body: n === 1 ? feed.title : `${feed.title}: ${titles.slice(0,3).join(' · ')}`, icon: feed.faviconUrl ?? '/pwa-192x192.png', badge: '/badge-72x72.png' (monochrome), tag: `feed-${feed.id}` (replaces previous notification for that feed), renotify: true, data: { articleId: newest.id, url: `/?article=${newest.id}` }, timestamp: newest.publishedAt })`. Max 5 notifications per sync (then one summary "{total} new articles in your favorite feeds", `tag: 'summary'`, `data: { url: '/?view=favorites' }`).
4. `reg` = `await navigator.serviceWorker.ready` on the page, `self.registration` in the SW. (Always go through the registration so clicks are handled uniformly by the SW.)
5. SW `notificationclick`: `e.notification.close(); const url = e.notification.data?.url ?? '/'; e.waitUntil((async () => { const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); const c = all[0]; if (c) { await c.focus(); if (e.notification.data?.articleId) c.postMessage({ type: 'OPEN_ARTICLE', articleId }); else c.navigate?.(url); } else await self.clients.openWindow(url); })())`.
6. Permission request happens **only** from the Settings switch (user gesture). Test notification button uses the same path with a fake article.

### 8.5 Service worker caching — `src/sw.ts`

```ts
/// <reference lib="webworker" />
declare let self: ServiceWorkerGlobalScope;
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { StaleWhileRevalidate, NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

precacheAndRoute(self.__WB_MANIFEST);           // app shell: cache-first (precache) — index.html, JS/CSS chunks, fonts, icons, manifest
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }));   // SPA navigations → cached shell; `/?article=…` resolves here

// Favicons (Google S2 / DuckDuckGo) + any cross-origin image → SWR
registerRoute(
  ({ url, request }) => request.destination === 'image' || url.hostname === 'www.google.com' && url.pathname.startsWith('/s2/favicons') || url.hostname === 'icons.duckduckgo.com',
  new StaleWhileRevalidate({ cacheName: 'oh-images', plugins: [new CacheableResponsePlugin({ statuses: [0, 200] }), new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 30 * 24 * 3600, purgeOnQuotaError: true })] })
);
// Feed / proxy requests (any cross-origin GET fetch() that is not an image) → NetworkFirst, 24h
registerRoute(
  ({ url, request }) => request.method === 'GET' && request.destination === '' && url.origin !== self.location.origin,
  new NetworkFirst({ cacheName: 'oh-feeds', networkTimeoutSeconds: 15, plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 24 * 3600, purgeOnQuotaError: true })] })
);
```
Notes for the coder:
- `fetchWithProxy` uses `cache: 'no-store'` which bypasses the HTTP cache but **not** the SW; the SW's NetworkFirst gives offline fallback (stale feed text → `parseFeed` → dedup makes re-insert idempotent). `via` is still accurate because the SW returns the cached response for the same proxy URL. 304s are not cached (statuses `[200]`).
- `CacheFirst` is only used implicitly by precaching. Do not add runtime caching for article `<img>` beyond the SWR above (quota).
- `registerType: 'prompt'` in the Vite PWA config; `UpdatePrompt.tsx` uses `useRegisterSW({ onRegisteredSW(url, reg) { /* start hourly reg.update() */ setInterval(() => reg?.update(), 60 * 60 * 1000) } })` and shows a sticky toast "Update available" with action "Reload" → `updateServiceWorker(true)`; `offlineReady` → toast "Ready to work offline".
- `self.skipWaiting()` on `message {type:'SKIP_WAITING'}` is provided by vite-plugin-pwa's generated glue only in generateSW mode; in injectManifest add it manually: `self.addEventListener('message', e => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); })`. `clientsClaim()` from `workbox-core` after activation.
- `vite.config.ts` (scaffolding agent): `VitePWA({ strategies: 'injectManifest', srcDir: 'src', filename: 'sw.ts', registerType: 'prompt', injectManifest: { globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,webmanifest}'], maximumFileSizeToCacheInBytes: 4 * 1024 * 1024 }, manifest: { name: 'OpenHorizon', short_name: 'OpenHorizon', start_url: '/', display: 'standalone', background_color: '#0F1115', theme_color: '#1A1D24', icons: [192, 512, 512-maskable], shortcuts: [{ name: 'Unread', url: '/?view=unread' }] }, devOptions: { enabled: true, type: 'module' } })`. `define: { __APP_VERSION__: JSON.stringify(pkg.version) }`.

---

## 9. Sharing — `features/sharing/share.ts`

```ts
export interface ShareData { title: string; url: string; text?: string }
export async function share(data: ShareData): Promise<'native' | 'sheet' | 'cancelled'> {
  const payload = { title: data.title, text: data.text ?? data.title, url: data.url };
  if (typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare(payload))) {
    try { await navigator.share(payload); return 'native'; }
    catch (e) { if ((e as DOMException).name === 'AbortError') return 'cancelled'; /* NotAllowedError etc → fall through */ }
  }
  useUIStore.getState().openDialog('share', data); return 'sheet';
}
```
Share an article: `share({ title: article.title, url: article.link || feed.siteUrl, text: article.title })`. `shareTargets.ts` exports the template builders from DESIGN §6.11 and `copyToClipboard(text)` with the execCommand fallback. Must be invoked from a user gesture (click or the `S` key handler — keydown counts as a gesture).

---

## 10. Keyboard — `hooks/useKeyboardShortcuts.ts`

Mounted once in `AppShell`. `window.addEventListener('keydown', handler, { capture: false })`.

```ts
function isEditable(t: EventTarget | null) { const el = t as HTMLElement | null; if (!el) return false; const tag = el.tagName; return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable || el.closest('[contenteditable="true"]') !== null; }
handler(e) {
  if (e.defaultPrevented) return;                                   // roving-focus hooks already handled arrows
  if (e.key === 'Escape') { return escapeChain(); }                 // see DESIGN §8.4
  if (isEditable(e.target) || document.querySelector('dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return;
  const s = useUIStore.getState();
  switch (e.key) {                                                  // use e.key, compare case-insensitively for letters; shift variants checked via e.shiftKey
    case 'j': case 'ArrowDown': if (listboxHasFocus()) return; moveSelection(+1); break;   // when listbox is focused, ArticleList handles arrows itself; J/K are global
    ...
  }
  e.preventDefault();
}
```
`moveSelection(delta)` needs the current ordered article ids — `ArticleList` publishes them to a module-level ref `timelineIdsRef` (`store/selectors.ts: setTimelineIds(ids)`), not to the store (avoids re-renders). Actions call `features/articles/articleActions.ts` functions directly with `s.selectedArticleId`. Pane focus switching (`←`/`→`) focuses `#nav-pane`, `#timeline-listbox`, `#reader-article` (`tabIndex=-1` on the latter two). `escapeChain()`: close topmost popover/menu (they listen themselves; the hook checks `s.dialogs` next) → `closeAllDialogs()` → `readerFullscreen=false` → mobile back one pane → `setSearchQuery('')`.

Shortcut help: `KEYMAP` constant exported (`[{ keys: ['J','↓'], label: 'Next article' }, …]`) and rendered by SettingsDialog.

---

## 11. PWA install — `hooks/useInstallPrompt.ts`

```ts
export function useInstallPrompt(): { canInstall: boolean; isInstalled: boolean; promptInstall(): Promise<'accepted'|'dismissed'|'unavailable'> }
```
- Module-level `deferredPrompt: BeforeInstallPromptEvent | null`; `window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; notify(); })` registered **at module load in `main.tsx`** (before React mounts, so the event isn't missed). Hook subscribes via a tiny listener set.
- `isInstalled`: `matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true`; also `appinstalled` event sets it true and clears `deferredPrompt`.
- `promptInstall()`: `await deferredPrompt.prompt(); const { outcome } = await deferredPrompt.userChoice; deferredPrompt = null; return outcome`.
- UI: Settings → App section (DESIGN §6.10) and an `Download` icon button in the NavPane footer when `canInstall && !installDismissedAt` (dismiss sets `installDismissedAt`). iOS Safari has no prompt → Settings shows "Use Share → Add to Home Screen" text when `isIOS && !isInstalled`.

---

## 12. Error handling, logging, misc

- `app/ErrorBoundary.tsx` wraps `AppShell`; fallback = `EmptyState` with "Something went wrong" + "Reload" + "Reset local data" (danger, two-step; calls `db.delete()` then reload).
- `lib/log.ts`: `log.debug/info/warn/error` no-ops in production except `error`. No external telemetry.
- All async UI actions (`articleActions`, `addFeed`, OPML import) are optimistic: they write to Dexie and let live queries update the UI; failures toast.
- Undo: `markAllRead(view)` first collects affected ids, then updates; the toast action calls `markUnread(ids)`. `removeFeed` keeps the feed + articles in memory for 8 s (toast Undo re-inserts them with `bulkAdd`), then they are gone.
- Time: `lib/time.ts` uses `Intl.RelativeTimeFormat` where needed; `timeAgo` re-renders via a `useNow(60_000)` hook in `ArticleList` (one timer for the whole list, passed as prop `now` to rows so memoization stays effective).
- `features/feeds/addFeed.ts` validates URLs (`http(s)` only), rejects duplicates (by normalized URL) with a typed `AlreadySubscribedError { feedId }`.

---

## 13. Implementation order (batches)

Each batch is independently reviewable; the coder gets one at a time. "AC" = acceptance criteria (all must hold). Files listed are the ones created/edited in that batch. The scaffolding agent has already produced `package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/sw.ts` (stub), `tsconfig*`.

**Batch 1 — Tokens, base styles, UI primitives**
Files: `src/app/index.css`, `src/app/theme.css`, `src/app/reader.css`, `src/lib/cn.ts`, `src/components/ui/{Button,IconButton,Badge,Chip,Switch,Input,Tabs,Popover,Dialog,Menu,Tooltip,Avatar,VisuallyHidden,Skeleton,EmptyState,Toast}.tsx`, `src/lib/toast.ts`, `src/hooks/{useMediaQuery,useIsMobile,usePrefersReducedMotion,useExitTransition,useRovingFocus}.ts`, `src/app/ErrorBoundary.tsx`, a throwaway `src/app/DevGallery.tsx` rendered at `/?gallery=1` showing every primitive in every state.
AC: every token from DESIGN §1–3 exists in `theme.css` and `bg-panel`, `text-silver`, `shadow-2`, `animate-pop-in`, `ease-spring` compile; gallery shows all primitives; `Dialog` traps focus and closes on Esc with focus returned; `Popover` flips when near viewport edge; keyboard-only run through gallery has visible focus everywhere; `prefers-reduced-motion` emulation removes animations; `tsc --noEmit` clean; no hex literals outside `theme.css`.

**Batch 2 — Database, settings, pure libs**
Files: `src/db/{schema,db}.ts`, `src/features/settings/{settings,defaults}.ts`, `src/lib/{hash,url,text,time}.ts`, `src/lib/xml/dom.ts`, `src/lib/parser/{types,dates,media,rss2,atom,rss1,jsonfeed,parseFeed}.ts`, `src/features/articles/{dedup,retention}.ts`, `src/features/reader/{sanitize,readerPrefs}.ts`, test fixtures under `src/lib/parser/__fixtures__/` (one RSS2 with content:encoded + media, one Atom with xhtml content, one RSS1, one JSON Feed, one broken XML) and Vitest tests (`vitest` + `jsdom` dev deps are allowed).
AC: `parseFeed` returns the exact normalized shapes for all fixtures (content priority, image priority, date fallbacks, guid rules verified by assertions); `sanitizeHtml` strips `<script>`, `onerror`, `javascript:` hrefs, non-YouTube iframes, adds `target/rel` and `loading="lazy"`, keeps YouTube embed with sandbox; `pruneFeed` keeps favorites/read-later; DB opens with version 1 and all indexes listed in §2.1 (assert via `db.tables[...].schema.indexes`).

**Batch 3 — Fetching, discovery, OPML**
Files: `src/lib/proxy/{proxies,failureMemory,fetchWithProxy}.ts`, `src/lib/discovery/discoverFeeds.ts`, `src/lib/opml/{parseOpml,exportOpml}.ts`, `src/features/feeds/{favicon,addFeed,removeFeed,folders}.ts`, tests with mocked `fetch`.
AC: `fetchWithProxy` tries direct → env → local → allorigins → corsproxy → codetabs → rss2json in order (mock asserts call order and URL templates exactly as §5.1); aborts after 15 s; honors failure cooldown; sends `If-None-Match` only on direct/env; `discoverFeeds` finds link-tag feeds, resolves relative hrefs, falls back to well-known paths, validates and dedups; `parseOpml` flattens nested folders with ` / `; `exportOpml` output round-trips through `parseOpml`; `addFeedFromUrl` rejects duplicates with `AlreadySubscribedError`.

**Batch 4 — Store, live queries, actions**
Files: `src/store/{uiStore,selectors,types}.ts`, `src/hooks/useLive.ts`, `src/features/articles/{articleQueries,articleActions}.ts`, `src/features/feeds/feedQueries.ts`.
AC: store persists only `navCollapsed`, `readerPrefs`, `timelineSort`, `timelineFilter` to `localStorage['oh-ui']`; `queryArticles` uses the indexes in §2.1 for each view (unit tests seed 1k articles across 5 feeds and assert results and that no `.filter()` scan is used for `unread`/`feed` views — check via Dexie `Collection` debug or by timing); `markAllRead` returns ids for undo; `toggleFavorite/ReadLater/Read` are idempotent.

**Batch 5 — App shell and navigation pane**
Files: `src/app/App.tsx`, `src/components/layout/{AppShell,SkipLink}.tsx`, `src/components/nav/{NavPane,NavRow,FeedRow,FolderRow,NavSearch,FeedContextMenu}.tsx`, `src/hooks/{useBootUrl,useMobileHistory,useOnlineStatus}.ts`.
AC: 3-pane grid at ≥1024 with 260/380/flex, collapsible to 64 rail (persisted); tablet forces rail; nav shows smart views with live unread counts, folders with collapse state persisted in DB, feeds with favicons/letter avatars and badges; context menu actions work (rename, move, favorite, mark read, unsubscribe with Undo toast); roving focus + `aria-current`; `/?view=unread` boot param selects the view.

**Batch 6 — Timeline**
Files: `src/components/timeline/{TimelinePane,TimelineHeader,ArticleRow,ArticleList}.tsx`, `src/hooks/useNow.ts`.
AC: list renders from live queries with skeletons/empty states per DESIGN §6.4; filter chips, sort menu, mark-all-read (confirm >20, Undo), refresh (spinner + progress bar); `role="listbox"` with `aria-activedescendant`, arrows/Home/End/Enter; quick actions on hover/focus-within and always on touch; new items fade-up staggered; recently fetched unread dots pulse; compact density honored; "Load more" after 100; 500 rows scroll at 60 fps on a mid-range laptop (DevTools performance check).

**Batch 7 — Reader**
Files: `src/components/reader/{ReaderPane,ReaderToolbar,ReaderContent,ReaderPrefsPopover}.tsx`, `src/features/sharing/{share,shareTargets}.ts`, `src/components/sharing/{ShareSheet,brandIcons}.tsx`.
AC: sanitized content renders with `.reader-content` styles; prefs popover changes size/spacing/font/width live and persists across reload; toolbar actions (open original, star, read later, read/unread, share, fullscreen) work with `aria-pressed`; auto-mark-read after 800 ms; `navigator.share` used when available, else ShareSheet with the exact URL templates from DESIGN §6.11; copy link works; Esc exits fullscreen; relative image URLs in content resolve against the article link.

**Batch 8 — Mobile layout and keyboard**
Files: `src/components/layout/BottomNav.tsx`, `src/hooks/useKeyboardShortcuts.ts`, updates to `AppShell`, `TimelinePane`, `ReaderPane` for pane states/`inert`.
AC: <768px shows one pane with slide transitions per DESIGN §4.3 (transform+opacity, 320 ms, reduced motion = instant); bottom nav with unread badge, Reader tab disabled without selection; hardware/browser back goes back a pane; `inert` applied to inactive panes; the full keyboard map in DESIGN §8.4 works and is ignored inside inputs/dialogs; Esc chain order correct.

**Batch 9 — Dialogs: Add feed, Settings**
Files: `src/components/dialogs/{AddFeedDialog,SettingsDialog}.tsx`, `src/components/dialogs/tabs/*.tsx`, `src/hooks/useInstallPrompt.ts`.
AC: all four add-feed tabs work end-to-end against real feeds (verify with at least 3 public feeds and one website URL); HTML URL auto-switches to discovery; duplicate detection message; OPML import with folder grouping, skip-already-subscribed, progress, and "fetch now"; Settings persists frequency/notifications/density/retention; notification permission flow and test notification; OPML export downloads a valid file; install button appears when `beforeinstallprompt` fired; keyboard shortcuts table rendered.

**Batch 10 — Sync, scheduler, service worker, notifications, update prompt**
Files: `src/features/sync/{limit,syncFeed,syncAll,scheduler,swBridge,notifications}.ts`, `src/sw.ts` (full), `src/components/layout/UpdatePrompt.tsx`, `src/vite-env.d.ts` additions; (scaffolding agent) confirm `vite.config.ts` PWA options from §8.5.
AC: `syncAll` runs ≤4 concurrent fetches (assert with mocked fetch), skips backoff feeds, writes `syncLog`, prunes retention; scheduler respects 15m/30m/1h/manual, runs on visible/online when due, uses `navigator.locks`; SW precaches shell and the app loads offline after first visit (DevTools offline); favicons served SWR; feed/proxy requests NetworkFirst with 24h cache (verify cache entries in DevTools → Cache Storage `oh-feeds`); `periodicSync.register` called when permission granted (log in Settings status); SW `periodicsync` with a visible client posts `SYNC_REQUEST`, without one syncs itself (test via DevTools → Application → Service Workers → "Periodic Sync" trigger); notifications for favorite feeds shown via registration with `tag` grouping; click opens/focuses app at the article (`/?article=<id>` → selected in reader); update prompt toast appears on new build and reloads.

**Batch 11 — Polish and audit**
Files: touch-ups across components; `README.md` usage notes.
AC: axe DevTools shows zero serious/critical issues on all three panes and every dialog; Lighthouse PWA installable + a11y ≥ 95 + performance ≥ 90 (desktop); 320px width no horizontal scroll; `prefers-contrast: more` overrides apply; bundle: main chunk < 250 KB gzip (DOMPurify + Dexie included; xmldom only in the SW chunk); no console errors in a full manual run: add feed → sync → read → star → share → OPML export → import → offline reload.

---

## 14. Decisions log (why)

| Decision | Alternatives considered | Reason |
|---|---|---|
| Dexie live queries as source of truth; zustand only for UI | Redux/RTK Query mirror of the DB; React Query | Avoids double caching and invalidation bugs; Dexie's `liveQuery` already does fine-grained change tracking across tabs/SW. |
| `0 \| 1` flags | booleans | IndexedDB can't index booleans; compound indexes `[isRead+publishedAt]` need numbers. |
| Sanitize at render, store raw | Sanitize at ingest | SW has no DOM for DOMPurify; sanitizer upgrades apply to old content; render-time cost is negligible for one article. |
| `@xmldom/xmldom` in the SW, native DOMParser in page | `fast-xml-parser` (different API → two parsers), regex parsing, SW delegating to page only | One parser code path; xmldom is DOM-compatible for the subset we use; only loaded in the SW bundle. Fallback A documented if the dependency is refused. |
| Native `<dialog>` for modals | headless UI libs | Zero deps, built-in focus trap/Esc/top-layer; styled fully with tokens. |
| Direct fetch before proxies | Proxy-first | Preserves `ETag` conditional requests and avoids third-party rate limits for CORS-enabled feeds. |
| `role="listbox"` for the timeline | `list` + `aria-current` | Selection semantics (↑/↓ selects and opens) map exactly to listbox; single tab stop. Nav uses `list` + `aria-current` because items are navigation targets. |
| Per-feed unique guid | Global unique guid | Same URL in two feeds must be two independent articles. |
| No virtualization in v1 | react-window | 100-item pages + `content-visibility: auto` are enough; virtualization complicates `aria-activedescendant` and keyboard focus. Revisit if lists exceed ~1k. |
