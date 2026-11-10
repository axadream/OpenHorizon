# Changelog

All notable changes to OpenHorizon are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Activity bar: a slim progress strip at the top of the screen shows feed imports, feed additions and syncs, with counts and percentages.
- The version number in Settings links to the project on GitHub, and a "What's new" button opens these release notes.

### Changed

- Feed syncs report progress as "Syncing feed X of Y".
- Adding a feed by URL reports each step: checking the address, fetching, reading and saving.
- OPML imports start their article sync through the same path as a manual refresh, so it shows as its own activity.

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
