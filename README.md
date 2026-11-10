<h1 align="center">
  <img src="public/icons/icon.svg" width="120" alt="OpenHorizon app icon" />
  <br />
  OpenHorizon
</h1>

<p align="center">
  <em>A modern metallic-grey RSS reader PWA</em>
</p>

<p align="center">
  <a href="LICENSE"><img alt="License: GPL-3.0-or-later" src="https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg" /></a>
  <img alt="PWA" src="https://img.shields.io/badge/PWA-installable-5A6270" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" />
  <img alt="Tailwind CSS v4" src="https://img.shields.io/badge/Tailwind%20CSS-v4-06B6D4?logo=tailwindcss&logoColor=white" />
  <img alt="Dark Metallic Theme" src="https://img.shields.io/badge/Theme-Dark%20Metallic%20Theme-0F1115?labelColor=00B4D8" />
  <a href="https://github.com/axadream/OpenHorizon/actions/workflows/deploy.yml"><img alt="GitHub Pages deploy status" src="https://github.com/axadream/OpenHorizon/actions/workflows/deploy.yml/badge.svg" /></a>
</p>

<p align="center">
  <a href="https://axadream.github.io/OpenHorizon/"><strong>Open the live demo</strong></a>
</p>

---

OpenHorizon is a mobile-first, installable PWA RSS reader inspired by the free desktop app [Orizont RSS](https://grifnas.github.io/OrizontRSS/index.en.html) by Grigore Frișan. It is privacy-friendly by design: everything stays in your browser. There is no account and no server-side storage.

## Live demo and install

**Try it now at [axadream.github.io/OpenHorizon](https://axadream.github.io/OpenHorizon/).** Once the page is open, you can install OpenHorizon as an app on your phone or computer (see [Install on your phone](#install-on-your-phone)).

## Key features

- **Dark metallic grey aesthetic**: a `#0F1115` base with brushed-steel gradients, glass highlights and subtle micro-animations. Motion is reduced automatically when your system asks for it.
- **Responsive layout**: a three-pane view on desktop, a navigation rail on tablet, and a single-pane view with a bottom navigation bar on mobile.
- **Multiple feed formats**: RSS 2.0, Atom, RSS 1.0 and JSON Feed. Add a feed by direct URL, by pasting its XML, or by website auto-discovery.
- **Organisation**: OPML import and export, folders, favorites, an unread filter and Read Later.
- **Offline first**: articles are stored locally in IndexedDB (through Dexie), so you can read offline after your first visit.
- **Background sync**: refresh every 15 minutes, 30 minutes or 1 hour, or sync manually. Periodic Background Sync is used where the browser supports it. Favorite feeds can send system notifications.
- **Sharing**: the Web Share API, with a fallback sheet for X, WhatsApp, Telegram, Reddit, LinkedIn, Facebook, email and copy link.
- **Reader preferences**: text size, line height, column width, image display and fullscreen reading, with four fonts: Serif, Sans, Mono and Dyslexic.
- **Themes**: Metallic (default), OLED black, Sepia, High contrast and System, with a custom accent colour (any colour, or one of eight presets; the text on it is chosen for contrast).
- **Fonts**: Sans, Serif, Mono and Dyslexic (OpenDyslexic) for the whole interface, not only the reader.
- **Layouts**: Comfortable, List (one line per article), Cards (larger thumbnails and summaries) and Reading (full-width reader with the article list as a slide-over). Density adjusts the spacing.
- **Sounds**: optional, synthesized chimes for sync results, bookmarks, deletes and errors, with volume and preview. Off by default.
- **Languages**: English, Romanian and Arabic (with right-to-left layout), chosen in Settings or automatic from your browser.
- **Full articles and saved pages**: "Load full article" fetches the original page and keeps its readable text for offline reading (extraction by Mozilla Readability). "Save page" keeps any web page as an article in a local Saved pages list.
- **YouTube**: channel, handle, playlist and video links become feeds, channels can be searched by name (best-effort), videos can go to local watch lists, and video articles show a privacy-first player. See [YouTube support](#youtube-support).
- **Keyboard navigation**: every common action has a shortcut (see [Keyboard shortcuts](#keyboard-shortcuts)).
- **Accessible**: landmarks, listbox semantics for the article list, visible focus rings and high contrast and dyslexia-friendly options.

## Screenshots

| Main window (3-pane) | Reader | Mobile view |
| :---: | :---: | :---: |
| <img src="assets/screenshots/desktop.png" alt="Desktop view of OpenHorizon with the three panes: feeds on the left, the article list in the middle and the open article on the right" width="100%" /> | <img src="assets/screenshots/reader.png" alt="Reader view of OpenHorizon showing a full article with the reader toolbar and typography controls" width="100%" /> | <img src="assets/screenshots/mobile.png" alt="Mobile view of OpenHorizon with a single pane and the bottom navigation bar" width="100%" /> |

## Install on your phone

OpenHorizon runs in any modern browser, and you can add it to your home screen like a native app.

- **iOS (Safari)**: open the [live demo](https://axadream.github.io/OpenHorizon/), tap **Share**, choose **Add to Home Screen**, then tap **Add**.
- **Android (Chrome, Edge or Brave)**: tap the install banner when it appears, or open the **⋮** menu and choose **Install app** or **Add to Home screen**.
- **Desktop (Chrome or Edge)**: click the install icon in the address bar.

## Installing & OS integration

An installed OpenHorizon connects to the operating system where the browser supports it. Each integration is optional and feature-detected, so a browser without it simply does not show it. Support changes between browser releases; check your browser's documentation for the latest status.

| Integration | What it does | Where it works |
| --- | --- | --- |
| Share target | Share a link from another app to OpenHorizon. It opens **Add feed** on the Discover tab, which finds the feed on that page, or checks the link if it is already a feed. | Chromium (Chrome, Edge) on Android and ChromeOS, installed. Not iOS Safari or Firefox. |
| App shortcuts | Long-press or right-click the app icon for **Add feed**, **Unread** and **Favorites**. | Chromium when installed. Not Safari or Firefox. |
| OPML file handler | Open a `.opml` or `.xml` file with OpenHorizon. The **Import OPML** tab opens with the file loaded. | Chromium desktop (Windows, macOS, ChromeOS, Linux), installed. Not Android, iOS or Firefox. |
| `web+rss:` protocol handler | Links such as `web+rss:https://example.com/feed.xml` open **Add feed** with the address filled in. | Chromium when installed. Only the `web+rss` scheme can be registered. |
| App icon badge | The installed app icon shows the unread count. Turn it off in **Settings → Notifications → App icon badge**. | Where the Badging API exists: Chromium on desktop, installed; Safari 16.4 or later for apps added to the iOS and iPadOS Home Screen. Otherwise the switch is disabled and explains why. |
| Keep screen on | While an article is open in the reader the screen stays awake. Turn it off in **Reading preferences**. On phones it applies only while the reader is showing. | Browsers with the Screen Wake Lock API (Chromium, Safari 16.4 or later, Firefox). Otherwise the option is hidden. |
| Window Controls Overlay | An installed desktop app draws its own title bar. The window buttons sit over that bar, which drags the window, and the content starts below it. | Chromium desktop (Windows, macOS, ChromeOS, Linux), installed. Normal tabs and mobile layouts are unchanged. |

### Why `web+rss:` and not `feed:`

Browsers do not let a web page register the `feed:` scheme, so OpenHorizon registers `web+rss:`. Links that arrive as text in the app are converted, however they are written: `feed://example.com/feed.xml` and `feed:https://example.com/feed.xml` (pasted, shared, or typed into **Add feed**) both become `https://` addresses.

### Launch links

These query parameters are read when the app opens, then removed from the address bar. They are what the share target, shortcuts and protocol handler send.

| Parameter | Result |
| --- | --- |
| `?feed=<address>` | Add feed, URL tab, filled in |
| `?url=`, `?text=`, `?title=` | Share: the first web link is used. Add feed opens on the Discover tab and searches it. |
| `?action=add` | Add feed |
| `?view=unread` or `?view=favorites` | Opens that smart view |

### Storage

The app asks the browser to keep its data (persistent storage), at most once every 14 days. **Settings → Data** shows whether storage is **Persistent** or **Best effort**, the space in use, and a **Request persistence** button while it is not persistent. Browsers may still evict best-effort data when the disk is short.

## Feeds and CORS

Browsers block most feed requests made across websites (CORS), so OpenHorizon has to fetch feeds through a route that allows them. It tries each route in order and stops at the first one that works:

1. a direct fetch from your browser,
2. your own proxy, set with `VITE_CORS_PROXY`,
3. the built-in same-origin `/api/proxy`, when the app is hosted with serverless functions,
4. public proxies, in this order: jina reader (r.jina.ai), allorigins (JSON and raw), corsproxy, codetabs and rss2json (last, feeds only).

Routes are hedged: when a route has not answered after 2.5 seconds the next one starts too, and the first success wins.

The GitHub Pages demo has no server, so some feeds may fail there. For reliable results, host your own proxy. The repository includes these options:

- **Cloudflare Worker (free, recommended for the GitHub Pages demo)**: run `npx wrangler login` once, then `npm run worker:deploy`. It deploys `worker/index.mjs` and prints a `https://openhorizon-proxy.<account>.workers.dev` URL.
- **Standalone Node server**: run `npm run proxy` (listens on port 8787 by default).
- **Cloudflare Pages**: deploy `functions/api/proxy.js` with your site.
- **Vercel**: deploy `api/proxy.js` with your site.

Then point the app at your proxy by setting the build-time variable:

```sh
VITE_CORS_PROXY=https://openhorizon-proxy.<account>.workers.dev/api/proxy?url={url}
```

For a GitHub Pages build, add the same value as a repository variable named `VITE_CORS_PROXY` under **Settings → Secrets and variables → Actions → Variables**. The deploy workflow passes it to the build. The `{url}` placeholder is replaced with the encoded feed address.

## YouTube support

What works:

- **Channels, handles and legacy names**: `youtube.com/channel/UC…`, `youtube.com/@name`, `/c/name` and `/user/name` resolve to the channel's Atom feed. For handles and custom names the channel id is read from the channel page once.
- **Playlists**: `youtube.com/playlist?list=…` links, and `list=` on a video link.
- **Videos in Discover**: a watch, shorts, embed, live or youtu.be link offers the uploader's channel feed and, when `list=` is present, that playlist's feed.
- **Channel search by name (best-effort)**: type a name without a dot (for example `veritasium`) and press **Search YouTube channels**. The search reads YouTube's public results page, which is not an official API, so it can stop working whenever YouTube changes that page. If it fails, paste the channel address instead.
- **Watch lists**: "Watch later" and any number of lists you create. Each video is stored with its title and thumbnail, taken from YouTube's public oEmbed endpoint. Lists stay on this device.
- **Video articles**: a YouTube link in an article shows the video in the reader. Reading preferences turn the player off, leaving a link.

Privacy:

- The player is a facade. Only the thumbnail and a play button are shown at first; the player (youtube-nocookie.com, YouTube's privacy-enhanced embed host) loads when you press play.
- The thumbnail is an image from YouTube's image host (`i.ytimg.com`), requested when the article is displayed.
- Adding a video to a watch list asks YouTube's oEmbed endpoint for its title, and channel search asks YouTube's results page. Both go through the same proxy routes as feeds.

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `J` or `↓` | Next article |
| `K` or `↑` | Previous article |
| `Home` / `End` | First / last article (timeline list) |
| `Enter` or `O` | Open selected article (mobile: reader) |
| `←` / `→` | Move focus between panes |
| `M` | Toggle read |
| `L` | Toggle Read Later |
| `F` | Toggle favorite |
| `S` | Share article |
| `V` | Open original in a new tab |
| `Delete` | Delete article (undo available) |
| `Menu` or `Shift+F10` | Article actions (same sheet as a long press) |
| `R` | Refresh all feeds |
| `Shift+R` | Refresh current feed |
| `A` | Add feed |
| `Shift+A` | Mark all read in this view |
| `Shift+F` | Toggle reader fullscreen |
| `/` | Search feeds |
| `1` `2` `3` `4` | Smart views: All, Unread, Favorites, Read Later |
| `,` | Settings |
| `?` | Keyboard shortcuts (Settings, App section) |
| `Esc` | Close, exit fullscreen, go back a pane, clear search |

Shortcuts are ignored while you type in a text field or while a dialog is open. `Esc` always works. The list in **Settings → App** is generated from the same table as the hotkeys (`KEYMAP` in `src/hooks/useKeyboardShortcuts.ts`), so the two cannot drift apart.

## Developer setup

**Requirements:** Node.js 22 or newer and npm.

```sh
npm install
npm run dev            # development server at http://localhost:5173
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite development server |
| `npm test` | Run the Vitest test suite |
| `npm run typecheck` | Type-check the application code |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Serve the production build locally, including `/api/proxy` |
| `npm run build:pages` | Build for GitHub Pages with base path `/OpenHorizon/` |
| `npm run deploy` | Manual fallback: build for Pages and publish `dist/` to the `gh-pages` branch |
| `npm run proxy` | Run the standalone CORS proxy on port 8787 |

Copy `.env.example` to `.env.local` to configure the app. The variables are:

- `VITE_CORS_PROXY`: your own feed proxy (see [Feeds and CORS](#feeds-and-cors)).
- `VITE_DISABLE_LOCAL_PROXY`: set to `1` on static hosts without functions. `npm run build:pages` sets it for you.
- `VITE_BASE`: the public base path, for example `/OpenHorizon/` for a GitHub Pages project site.

**Automatic deployment.** The workflow in `.github/workflows/deploy.yml` runs on every push to `main`. It installs dependencies with `npm ci`, runs the type-check and tests, builds with `npm run build:pages`, and publishes `dist/` to GitHub Pages. Enable **Settings → Pages → Build and deployment → GitHub Actions** once for the repository.

## Tech stack

- **Language and UI**: TypeScript, React 19, Lucide icons, Tailwind CSS v4
- **Build**: Vite, `vite-plugin-pwa`
- **Offline and storage**: Workbox service worker, Dexie (IndexedDB), Zustand for UI state
- **Content safety**: DOMPurify for article HTML
- **Testing and quality**: Vitest, jsdom, oxlint

## Project structure

```text
OpenHorizon/
├── public/              static assets, including icons/icon.svg
├── src/
│   ├── app/             application shell and providers
│   ├── components/      reusable UI components
│   ├── features/        feature modules (feeds, articles, sync, sharing, settings)
│   ├── lib/             shared utilities (feed parsing, toast, helpers)
│   ├── db/              Dexie database schema
│   ├── store/           Zustand UI state
│   ├── hooks/           shared hooks (keyboard shortcuts, sync)
│   └── sw.ts            service worker (offline cache and background sync)
├── server/              standalone proxy and shared proxy handler
├── functions/           Cloudflare Pages function (/api/proxy)
├── api/                 Vercel function (/api/proxy)
├── docs/                design and architecture documents
└── .github/workflows/   GitHub Pages deployment
```

## Credits and acknowledgements

OpenHorizon exists because of **Orizont RSS**, a free desktop RSS reader created by **Grigore Frișan**. Its clear layout, reading experience and philosophy of simple, personal feed reading inspired this project. Thank you for making and sharing it.

- Original project: [Orizont RSS](https://grifnas.github.io/OrizontRSS/index.en.html) by Grigore Frișan

OpenHorizon also builds on excellent open-source work:

- [Lucide](https://lucide.dev/) for icons
- [Dexie](https://dexie.org/) for IndexedDB storage
- [Workbox](https://developer.chrome.com/docs/workbox/) for the service worker
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [Mozilla Readability](https://github.com/mozilla/readability) (Apache License 2.0) for extracting the article text of web pages. It is loaded only when you load a full article or save a page, as its own chunk.

A C# reference copy of a desktop RSS reader is kept in the local `OrizontRSS-main` folder. It is gitignored, not part of this repository, and not bundled with the app. The YouTube channel search was re-implemented in TypeScript from that reference's approach.
- [OpenDyslexic](https://opendyslexic.org/), the Dyslexic font, bundled through [@fontsource/opendyslexic](https://fontsource.org/fonts/opendyslexic). Licensed under the **SIL Open Font License 1.1** (the licence text ships in the package).
- Sans, Serif and Mono use the system font stacks; no other fonts are bundled.

## License

OpenHorizon is free software, licensed under the **GNU General Public License v3.0 or later (GPL-3.0-or-later)**. See the [LICENSE](LICENSE) file for the full text.
