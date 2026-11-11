# Changelog

All notable changes to OpenHorizon are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The Arabic translation was removed. Hebrew (right-to-left) and Simplified Chinese were added.
- Shared text now reads `Shared via OpenHorizon app | Article title` in the system share sheet, the in-app share sheet and "Copy link".
- The "Chrome built-in AI" provider is now called "On this device" and chains three engines: the browser's built-in model, the optional on-device Transformers.js model, and the offline summarizer. Settings shows which one is in use and explains why when the browser has no built-in model.

### Added

- On-device AI for phones and other browsers: Settings → AI summaries → "Download and use" fetches a compact summarization model once (roughly 250 MB, cached) and runs it in the browser with Transformers.js (WebGPU where available, WebAssembly otherwise). No key or account. Off until you opt in.
- Custom translations: export the English strings as JSON from Settings → Appearance, translate them, and import the file. The app switches to it at once; missing keys fall back to English, and the file can be removed again.
- Feed language filter: feeds are tagged with their language (declared by the feed, otherwise detected from article text at sync time). Settings → Appearance → Feed languages can hide feeds that are not in the app language; feeds without a known language stay visible, and the feed list says how many are hidden.
- Touch gesture guide: on touch devices Settings → App shows the gestures (tap, long press, swipe right to delete, swipe left to favorite, pull to refresh, back) instead of the keyboard shortcuts.
- App shortcuts "Sync feeds" and "Share app" (long-press or right-click the installed icon), with the matching `?action=sync` and `?action=share` launch links.

## [0.2.0] - 2026-11-11

### Fixed

- YouTube handle pages (such as `@veritasium`) resolved to a featured channel instead of the page's own channel. The channel id now comes from the page's own RSS and canonical links first.

### Added

- AI summaries (off by default): a Summarize button in the reader and an "AI summary" action on articles show a summary, key takeaways and tags. Chrome's built-in AI runs on the device by default; an offline heuristic is the fallback. Ollama, LM Studio and other OpenAI-compatible servers run locally, and OpenAI, Mistral, DeepSeek, Gemini or a custom endpoint are opt-in cloud providers that need a key and a one-time consent dialog. Results are cached per article. Settings > AI summaries has the provider, privacy badge, endpoint, model, key, instructions and a connection test. AI settings and keys are never exported.
- Themes: Metallic (the default), OLED black (true black surfaces), Sepia (warm light paper), High contrast (black and white, strong borders, a yellow focus ring) and System (follows the light scheme, and switches to High contrast when more contrast is requested). The browser's theme colour follows the theme.
- Custom accent colour: pick any colour, type a #rrggbb value, or use one of eight presets. Hover, pressed, focus and soft tints are derived from it, and the text on top of it is black or white, whichever reads better (at least 4.5:1).
- Fonts: Sans, Serif, Mono and Dyslexic (OpenDyslexic) for the whole interface. The reader's font switch offers the same four. The OpenDyslexic font files (SIL Open Font License) are bundled with the app and cached for offline use.
- Layouts for the timeline: Comfortable (the look you had before), List (one line per article: title, feed and time), Cards (a larger thumbnail and a three-line summary) and Reading (the reader takes the full width and the article list opens as a slide-over from a toolbar button, closed with Esc). Density only changes the spacing between rows.
- Sounds: short synthesized chimes for a sync that finds new articles, a quiet sync that finds nothing, bookmarks, deletes and errors. Off by default; Settings → Sound has a switch, a volume slider and a preview for each chime. Chimes stay silent while the app is in the background.
- Languages: English, Romanian and Arabic, chosen in Settings → Appearance (Automatic follows your browser). Dates, times and plurals follow the language. Arabic and right-to-left layout: navigation, swipe actions, arrow keys and the sheet all follow the writing direction, and article text is shown in its own direction.
- Activity bar: a slim progress strip at the top of the screen shows feed imports, feed additions and syncs, with counts and percentages.
- The version number in Settings links to the project on GitHub, and a "What's new" button opens these release notes.
- Installed app integration: a share target (share a link from another app to add a feed), app shortcuts for Add feed, Unread and Favorites, an OPML file handler, and a `web+rss:` protocol handler. The manifest also declares an app id, categories, language and text direction.
- Launch links: `?feed=`, share links (`?url=`, `?text=`, `?title=`), `?action=add` and `?view=unread` / `?view=favorites` open the matching dialog or view, then clear the address bar.
- Add feed and Discover accept `feed://`, `feed:https://` and `web+rss:` addresses and convert them to https.
- App icon badge: the installed app icon shows the unread count, updated after reading and after background syncs. Switch it off in Settings → Notifications; the switch is disabled where the browser has no Badging API.
- Storage: the app asks the browser for persistent storage (at most once every 14 days). Settings → Data shows Persistent or Best effort, the space in use, and a Request persistence button.
- Keep screen on while reading: an article open in the reader keeps the screen awake. On by default, switch in Reading preferences, hidden where the browser has no Screen Wake Lock API.
- Window Controls Overlay: an installed desktop app draws its title bar with the window buttons on top of it, and the content starts below.
- Gestures: swipe right on an article to delete it (with undo), swipe left to toggle its favorite, long press for the article action sheet with haptic feedback, and pull to refresh the timeline.
- Readability: "Load full article" in the reader fetches the original page and keeps its readable text offline (Mozilla Readability, Apache-2.0, loaded as its own lazy chunk). A toggle switches between the feed text and the full article.
- Save page: save the readable text of any web page as an article in a local "Saved pages" list, from the new Save page tab of Add feed, or from the "Save this page as an article" button shown when Discover finds no feeds. Saved pages are never synced or exported to OPML.
- YouTube: channel, @handle, /c/ and /user/ addresses, playlist links and video links (watch, shorts, embed, live, youtu.be) resolve to their Atom feeds. Discover offers the uploader's channel and a `list=` playlist for video links. Searching YouTube channels by name is best-effort.
- Watch lists: local lists of YouTube videos ("Watch later" by default, and more on request). Add a video from the Save page tab, the Add video item of a watch list's menu, the reader toolbar or the article action sheet. Each video shows its YouTube title and thumbnail, fetched through YouTube's oEmbed endpoint with a fallback.
- Embedded video player: a YouTube video article shows a privacy-first player. The thumbnail and a play button load first; the YouTube player (youtube-nocookie.com) loads only when you press play. "Play YouTube videos here" in Reading preferences switches the player off, leaving a link.
- YouTube Atom feeds show thumbnails and descriptions: media:group is read, and the hqdefault thumbnail is derived from yt:videoId when a feed omits media:thumbnail.

### Changed

- Feed syncs report progress as "Syncing feed X of Y".
- Retention keeps articles whose full text was loaded, like favorites and Read Later articles. Local lists (saved pages and watch lists) are never pruned.
- The service worker answers navigations only for the app's own origin, so third-party frames such as the YouTube player are never answered with the app shell.
- Adding a feed by URL reports each step: checking the address, fetching, reading and saving.
- OPML imports start their article sync through the same path as a manual refresh, so it shows as its own activity.
- The keyboard shortcut list in Settings is generated from the hotkey table, and now includes Delete, Menu / Shift+F10 and Home / End.
- The Import OPML count and button only include feeds that are not already subscribed.

### Fixed

- A search or add that is cancelled no longer leaves its progress running.

## [0.1.1] - 2026-11-10

### Added

- Fallback proxies corsproxy and rss2json for fetching feeds.
- Discovery results that could not be checked are listed as unverified, so you can still try them.

### Fixed

- Pasted XML now stores its articles.
- Feed discovery fetches through jina and allorigins-get.
- Proxy requests are hedged: a slow proxy no longer holds up a fast one.
- Fetch errors are classified and explained (offline, blocked, not found, timed out) instead of showing a generic message.

## [0.1.0] - 2026-11-10

### Added

- Initial release: an RSS, Atom and JSON Feed reader that runs as a PWA.
- Folders, OPML import and export, offline reading and notifications.
- Metallic dark interface.

[Unreleased]: https://github.com/axadream/OpenHorizon/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/axadream/OpenHorizon/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/axadream/OpenHorizon/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/axadream/OpenHorizon/releases/tag/v0.1.0
