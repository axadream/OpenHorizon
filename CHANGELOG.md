# Changelog

All notable changes to OpenHorizon are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

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

### Changed

- Feed syncs report progress as "Syncing feed X of Y".
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

[Unreleased]: https://github.com/axadream/OpenHorizon/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/axadream/OpenHorizon/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/axadream/OpenHorizon/releases/tag/v0.1.0
