# OpenHorizon — Design System & Component Specification

Status: v1.0 (authoritative). Read together with `docs/ARCHITECTURE.md`.
Stack assumptions: Vite + React 18 + TypeScript, Tailwind v4 (`@tailwindcss/vite`), `lucide-react`, `clsx` + `tailwind-merge` (exposed as `cn()` in `src/lib/cn.ts`).

The visual identity is "dark brushed steel": near-black backgrounds, graphite panels, cool silver text, a single cyan accent used sparingly for state (selected, unread, focus, primary action). Surfaces are differentiated by *lightness steps* and *hairline borders*, not by colored fills. Nothing is pure black or pure white.

---

## 0. Conventions used in this document

- `--color-*` names are **Tailwind v4 `@theme` tokens**. Declaring `--color-panel` in `@theme` automatically produces `bg-panel`, `text-panel`, `border-panel`, `ring-panel`, etc.
- Non-color tokens (`--shadow-*`, `--radius-*`, `--font-*`, `--ease-*`, `--duration-*` as `--animate-*`/arbitrary) follow Tailwind v4 namespaces where one exists; others are plain CSS custom properties consumed with arbitrary values, e.g. `shadow-[var(--shadow-2)]` or via small utility classes defined in `@layer utilities`.
- All tokens live in **`src/app/theme.css`** (imported by `src/app/index.css`, which also contains `@import "tailwindcss";`). The coder may not hard-code hex values in components; use tokens.
- Sizes are in `px` in this doc for exactness; in CSS they are written as `rem` where noted (root = 16px).

---

## 1. Design Tokens

### 1.1 Color tokens (`@theme`)

Required palette (given): `#0F1115` bg, `#1A1D24` panel, `#2A2E39` card, `#C0C7D0` silver, `#00B4D8` accent. Everything else below is derived from those five.

```css
/* src/app/theme.css */
@import "tailwindcss";

@theme {
  /* ---- Surfaces (dark → light) ---- */
  --color-bg:            #0F1115;   /* app background, reader background */
  --color-bg-deep:       #0A0C10;   /* dialog backdrop base, deepest wells */
  --color-panel:         #1A1D24;   /* nav pane, timeline pane, toolbars */
  --color-panel-raised:  #20242D;   /* sticky headers inside panels, popover body */
  --color-card:          #2A2E39;   /* cards, selected rows, inputs, chips */
  --color-card-hover:    #313644;   /* card hover */
  --color-card-active:   #383D4C;   /* card pressed */

  /* ---- Text ---- */
  --color-silver:        #C0C7D0;   /* default body text */
  --color-text:          #E6EAF0;   /* headings, article titles, high-emphasis */
  --color-text-muted:    #949CA8;   /* secondary: feed names, timestamps, snippets (>= 4.5:1 on card) */
  --color-text-faint:    #6B7380;   /* tertiary/decorative only (placeholders, disabled); not for essential info */
  --color-text-inverse:  #0F1115;   /* text on accent-filled surfaces */

  /* ---- Borders ---- */
  --color-border:        rgba(255, 255, 255, 0.08);  /* hairline (required value) */
  --color-border-strong: rgba(255, 255, 255, 0.14);  /* inputs, focused cards, dividers in popovers */
  --color-border-accent: rgba(0, 180, 216, 0.45);

  /* ---- Accent (cyan) ---- */
  --color-accent:        #00B4D8;
  --color-accent-hover:  #22C3E3;
  --color-accent-active: #0097B8;
  --color-accent-soft:   rgba(0, 180, 216, 0.12);   /* selected row fill, chip fill */
  --color-accent-glow:   rgba(0, 180, 216, 0.35);   /* unread dot halo, focus ring outer */

  /* ---- Semantic ---- */
  --color-success:       #3DDC97;
  --color-success-soft:  rgba(61, 220, 151, 0.14);
  --color-danger:        #FF5C6C;
  --color-danger-soft:   rgba(255, 92, 108, 0.14);
  --color-warning:       #F5B84B;
  --color-warning-soft:  rgba(245, 184, 75, 0.14);

  /* ---- Focus ---- */
  --color-focus:         rgba(0, 180, 216, 0.70);   /* ring color; see 1.6 */

  /* ---- Scrollbar ---- */
  --color-scroll-thumb:  rgba(192, 199, 208, 0.18);
  --color-scroll-thumb-hover: rgba(192, 199, 208, 0.30);
}
```

Contrast guarantees (WCAG 2.2 AA, computed):
- `--color-silver` on `--color-bg`: ~11.2:1; on `--color-card`: ~7.5:1.
- `--color-text-muted` on `--color-card`: ~4.8:1 (pass); on `--color-panel`: ~5.6:1.
- `--color-accent` on `--color-bg`: ~7.5:1 (usable as text/icon on dark).
- `--color-text-inverse` on `--color-accent`: ~8.5:1 (primary button text).
- `--color-danger` on `--color-panel`: ~5.6:1.
- `--color-text-faint` is **not** AA for small text; use only for placeholders / disabled / decorative.

### 1.2 Gradients (plain custom properties, declared in `:root`)

```css
:root {
  /* Brushed steel: vertical lightness ramp + faint horizontal brush lines.
     Use on toolbars, bottom nav, dialog headers, primary "steel" buttons. */
  --gradient-steel:
    repeating-linear-gradient(90deg,
      rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px,
      transparent 1px, transparent 3px),
    linear-gradient(180deg, #30353F 0%, #252932 55%, #1C1F27 100%);

  /* Card: diagonal sheen, slightly lighter top-left. Use on ArticleRow (selected),
     popovers, dialogs, EmptyState illustration plate. */
  --gradient-card:
    linear-gradient(160deg, #2F3441 0%, #2A2E39 45%, #252934 100%);

  /* Accent sheen for the primary button */
  --gradient-accent:
    linear-gradient(180deg, #1FC2E2 0%, #00B4D8 60%, #009EC0 100%);

  /* Fade used at the bottom of truncated reader content / scroll hints */
  --gradient-fade-bg: linear-gradient(180deg, rgba(15,17,21,0) 0%, #0F1115 100%);
}
```

### 1.3 Inner-highlight recipe (the "machined edge")

Every raised steel surface gets a 1px lighter top edge and a 1px darker bottom edge via inset shadows. Combine with an elevation shadow when floating.

```css
:root {
  --inner-highlight:
    inset 0 1px 0 rgba(255,255,255,0.08),
    inset 0 -1px 0 rgba(0,0,0,0.35);
  --inner-highlight-strong:
    inset 0 1px 0 rgba(255,255,255,0.14),
    inset 0 -1px 0 rgba(0,0,0,0.45);
  --inner-well:                       /* pressed / input wells (reverse) */
    inset 0 1px 2px rgba(0,0,0,0.55),
    inset 0 -1px 0 rgba(255,255,255,0.04);
}
```

Utility classes (define in `@layer utilities` in `theme.css`):

```css
@layer utilities {
  .steel      { background: var(--gradient-steel); box-shadow: var(--inner-highlight); }
  .steel-card { background: var(--gradient-card);  box-shadow: var(--inner-highlight); }
  .well       { background: var(--color-bg);       box-shadow: var(--inner-well); }
  .hairline   { border: 1px solid var(--color-border); }
  .hairline-t { border-top: 1px solid var(--color-border); }
  .hairline-b { border-bottom: 1px solid var(--color-border); }
  .hairline-r { border-right: 1px solid var(--color-border); }
}
```

### 1.4 Glass surface recipe

Used by: `BottomNav`, `ReaderPane` toolbar when the reader is scrolled, popovers, toasts, dialog backdrop.

```css
@layer utilities {
  .glass {
    background: rgba(26, 29, 36, 0.72);                 /* panel @ 72% */
    -webkit-backdrop-filter: blur(16px) saturate(140%);
    backdrop-filter: blur(16px) saturate(140%);
    border: 1px solid var(--color-border);
    box-shadow: var(--inner-highlight), var(--shadow-2);
  }
  .glass-strong {                                        /* popovers / dialogs */
    background: rgba(32, 36, 45, 0.86);
    -webkit-backdrop-filter: blur(24px) saturate(150%);
    backdrop-filter: blur(24px) saturate(150%);
    border: 1px solid var(--color-border-strong);
    box-shadow: var(--inner-highlight), var(--shadow-3);
  }
  .backdrop {                                            /* dialog scrim */
    background: rgba(10, 12, 16, 0.65);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
  }
  @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .glass        { background: rgba(26, 29, 36, 0.96); }
    .glass-strong { background: #20242D; }
    .backdrop     { background: rgba(10, 12, 16, 0.85); }
  }
}
```

### 1.5 Elevation shadows (3 levels)

```css
@theme {
  --shadow-1: 0 1px 2px rgba(0,0,0,0.40), 0 1px 1px rgba(0,0,0,0.30);                /* rows, chips, hover lift */
  --shadow-2: 0 4px 12px rgba(0,0,0,0.45), 0 1px 3px rgba(0,0,0,0.40);               /* popovers, toasts, bottom nav */
  --shadow-3: 0 16px 40px rgba(0,0,0,0.60), 0 4px 12px rgba(0,0,0,0.45);             /* dialogs, share sheet */
  --shadow-accent: 0 0 0 1px rgba(0,180,216,0.45), 0 4px 16px rgba(0,180,216,0.25);  /* primary button hover */
}
```
Tailwind: `shadow-1`, `shadow-2`, `shadow-3`, `shadow-accent`.

### 1.6 Focus ring

```css
@theme { --color-focus: rgba(0,180,216,0.70); }
:root  { --focus-ring: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-focus); }

@layer base {
  :focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: var(--radius-sm); }
  /* Elements that already carry an inset/elevation shadow combine both: */
  .steel:focus-visible, .steel-card:focus-visible, .glass:focus-visible {
    box-shadow: var(--inner-highlight), var(--focus-ring);
  }
}
```
Utility: `focus-ring` class = `focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`. Ring is 2px bg gap + 2px cyan = visible on every surface (>= 3:1 against all surfaces).

### 1.7 Radii, spacing, sizes

```css
@theme {
  --radius-xs: 4px;    /* badges, unread dot container */
  --radius-sm: 6px;    /* buttons, inputs, chips */
  --radius-md: 10px;   /* rows, cards */
  --radius-lg: 14px;   /* popovers, dialogs */
  --radius-xl: 20px;   /* share sheet (mobile top corners) */
  --radius-full: 9999px;
}
:root {
  --nav-w: 260px;
  --nav-w-collapsed: 64px;
  --timeline-w: 380px;
  --toolbar-h: 52px;        /* every pane header/toolbar */
  --bottom-nav-h: 60px;     /* + env(safe-area-inset-bottom) */
  --row-h-comfortable: auto; /* ArticleRow min-height 84px */
  --row-h-compact: auto;     /* ArticleRow min-height 56px (no snippet, no thumb) */
  --hit-min: 40px;           /* minimum pointer target (44px on touch via media query) */
}
@media (pointer: coarse) { :root { --hit-min: 44px; } }
```
Spacing uses Tailwind's default 4px scale. Panel inner padding: 12px (`p-3`); row horizontal padding: 12px; dialog padding: 20px (`p-5`); gaps between icon and label: 8px (`gap-2`).

### 1.8 Scrollbars

```css
@layer base {
  * { scrollbar-width: thin; scrollbar-color: var(--color-scroll-thumb) transparent; }
  *::-webkit-scrollbar { width: 10px; height: 10px; }
  *::-webkit-scrollbar-thumb { background: var(--color-scroll-thumb); border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
  *::-webkit-scrollbar-thumb:hover { background-color: var(--color-scroll-thumb-hover); }
  *::-webkit-scrollbar-track { background: transparent; }
}
```

---

## 2. Typography

### 2.1 Font stacks

```css
@theme {
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Inter", "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --font-reading: "Iowan Old Style", "Palatino Linotype", Palatino, "Source Serif 4", Charter, "Literata", Georgia, Cambria, "Times New Roman", serif;
  --font-mono: ui-monospace, "Cascadia Code", "JetBrains Mono", Menlo, Consolas, "Liberation Mono", monospace;
}
```
UI uses `font-sans` everywhere. The reader body uses `--font-reading` *or* `--font-sans` based on the user's reader preference (see 2.4). Code blocks inside articles use `font-mono`.

Base: `html { font-family: var(--font-sans); font-size: 16px; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; font-feature-settings: "cv11", "ss01"; }` (feature settings are harmless no-ops for fonts that lack them). `body { background: var(--color-bg); color: var(--color-silver); }`

### 2.2 UI type scale (Tailwind class → size/line-height/weight → where)

| Token | Size / LH | Weight | Usage |
|---|---|---|---|
| `text-xs` | 12 / 16 | 500 | badges, timestamps, chip labels, bottom-nav labels |
| `text-sm` | 13 / 18 | 400 | feed names in rows, snippets, secondary text, nav rows |
| `text-base` | 14 / 20 | 400 | default UI text, inputs, buttons, dialog body |
| `text-md` (custom `--text-md: 15px; --text-md--line-height: 22px`) | 15 / 22 | 600 | ArticleRow title |
| `text-lg` | 17 / 24 | 600 | pane titles (TimelinePane header), dialog titles |
| `text-xl` | 20 / 28 | 600 | EmptyState title |
| `text-2xl` | 24 / 32 | 700 | reader article title on mobile |
| `text-3xl` | 30 / 36 | 700 | reader article title on desktop |

Letter-spacing: headings `tracking-[-0.01em]`; uppercase section labels in NavPane (`SMART VIEWS`, `FOLDERS`) are `text-xs font-semibold tracking-[0.08em] uppercase text-text-faint`.

Tabular numerals for counts/timestamps: `tabular-nums`.

### 2.3 Reader content styles (`.reader-content`)

Defined in `src/app/reader.css`. Applied to the `<div>` holding sanitized HTML.

```css
.reader-content {
  font-family: var(--reader-font);
  font-size: var(--reader-font-size);
  line-height: var(--reader-line-height);
  max-width: var(--reader-measure);
  margin-inline: auto;
  color: var(--color-silver);
  overflow-wrap: anywhere;
  hyphens: auto;
}
.reader-content h1, .reader-content h2, .reader-content h3, .reader-content h4 { color: var(--color-text); font-family: var(--font-sans); line-height: 1.25; margin: 1.6em 0 0.6em; font-weight: 650; }
.reader-content h1 { font-size: 1.6em } .reader-content h2 { font-size: 1.35em } .reader-content h3 { font-size: 1.15em } .reader-content h4 { font-size: 1em }
.reader-content p, .reader-content ul, .reader-content ol, .reader-content blockquote, .reader-content pre, .reader-content table, .reader-content figure { margin: 0 0 1.1em; }
.reader-content a { color: var(--color-accent); text-decoration: underline; text-decoration-color: rgba(0,180,216,0.4); text-underline-offset: 2px; }
.reader-content a:hover { color: var(--color-accent-hover); text-decoration-color: currentColor; }
.reader-content img, .reader-content video, .reader-content iframe { max-width: 100%; height: auto; border-radius: var(--radius-md); display: block; margin: 1.2em auto; background: var(--color-panel); }
.reader-content iframe { aspect-ratio: 16 / 9; width: 100%; border: 0; }
.reader-content figcaption { font-size: 0.85em; color: var(--color-text-muted); text-align: center; margin-top: -0.6em; }
.reader-content blockquote { border-left: 3px solid var(--color-accent); padding: 0.2em 0 0.2em 1em; color: var(--color-text-muted); font-style: italic; }
.reader-content pre { font-family: var(--font-mono); font-size: 0.85em; line-height: 1.55; background: var(--color-panel); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 14px 16px; overflow-x: auto; }
.reader-content code { font-family: var(--font-mono); font-size: 0.88em; background: var(--color-card); padding: 0.1em 0.35em; border-radius: var(--radius-xs); }
.reader-content pre code { background: transparent; padding: 0; font-size: inherit; }
.reader-content hr { border: 0; border-top: 1px solid var(--color-border); margin: 2em 0; }
.reader-content table { width: 100%; border-collapse: collapse; font-size: 0.9em; display: block; overflow-x: auto; }
.reader-content th, .reader-content td { border: 1px solid var(--color-border); padding: 6px 10px; text-align: left; }
.reader-content th { background: var(--color-panel); color: var(--color-text); }
.reader-content ul { list-style: disc; padding-left: 1.4em } .reader-content ol { list-style: decimal; padding-left: 1.4em }
.reader-content li + li { margin-top: 0.3em }
```

### 2.4 Reader preference variables (set inline by `ReaderPane`)

`ReaderPane` reads `readerPrefs` from the zustand store and sets `style={{ "--reader-font-size": ..., "--reader-line-height": ..., "--reader-font": ..., "--reader-measure": ... }}` on the content wrapper.

**Text size — 5 steps** (`fontSize: 0..4`, default `2`):

| Step | `--reader-font-size` | Label |
|---|---|---|
| 0 | `15px` | XS |
| 1 | `17px` | S |
| 2 | `19px` | M (default) |
| 3 | `21px` | L |
| 4 | `24px` | XL |

**Line spacing — 3 steps** (`lineHeight: 0..2`, default `1`):

| Step | `--reader-line-height` | Label |
|---|---|---|
| 0 | `1.5` | Compact |
| 1 | `1.7` | Normal (default) |
| 2 | `1.9` | Relaxed |

**Font** (`font: "serif" | "sans"`, default `"serif"`): `--reader-font: var(--font-reading)` or `var(--font-sans)`.

**Measure** (`width: "narrow" | "wide"`, default `"narrow"`): `--reader-measure: 68ch` or `92ch`. On viewports < 768px measure is ignored (`max-width: 100%`).

Defaults are declared on `:root` too so the reader renders correctly before hydration:
```css
:root { --reader-font-size: 19px; --reader-line-height: 1.7; --reader-font: var(--font-reading); --reader-measure: 68ch; }
```

---

## 3. Motion

### 3.1 Tokens

```css
:root {
  --duration-instant: 80ms;    /* color changes on hover */
  --duration-fast:   120ms;    /* press scale, chip toggles */
  --duration-base:   200ms;    /* hover lift, fade-in, popover */
  --duration-slow:   320ms;    /* pane slide (mobile), dialog enter */
  --duration-pulse:  2400ms;   /* unread dot pulse cycle */

  --ease-standard: cubic-bezier(0.2, 0, 0, 1);       /* most transitions */
  --ease-out:      cubic-bezier(0, 0, 0.2, 1);       /* enter */
  --ease-in:       cubic-bezier(0.4, 0, 1, 1);       /* exit */
  --ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);/* press release, toast enter */
}
@theme {
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-spring:   cubic-bezier(0.34, 1.56, 0.64, 1);
  --animate-fade-in:   fade-in var(--duration-base) var(--ease-out) both;
  --animate-fade-up:   fade-up var(--duration-base) var(--ease-out) both;
  --animate-pop-in:    pop-in var(--duration-base) var(--ease-spring) both;
  --animate-pulse-dot: pulse-dot var(--duration-pulse) ease-in-out infinite;
  --animate-shimmer:   shimmer 1.6s linear infinite;
  --animate-spin-slow: spin 1.2s linear infinite;

  @keyframes fade-in   { from { opacity: 0 } to { opacity: 1 } }
  @keyframes fade-up   { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
  @keyframes pop-in    { from { opacity: 0; transform: scale(0.96) translateY(4px) } to { opacity: 1; transform: none } }
  @keyframes pulse-dot { 0%,100% { box-shadow: 0 0 0 0 var(--color-accent-glow) } 50% { box-shadow: 0 0 0 4px rgba(0,180,216,0) } }
  @keyframes shimmer   { from { background-position: -200% 0 } to { background-position: 200% 0 } }
}
```
Tailwind usage: `ease-standard`, `ease-spring`, `animate-fade-in`, `animate-fade-up`, `animate-pop-in`, `animate-pulse-dot`, `animate-shimmer`, `duration-[var(--duration-base)]` (or add `--duration-*` as arbitrary values; keep durations as CSS vars so reduced-motion can zero them).

### 3.2 Micro-animations (exhaustive list)

| Name | Where | Recipe |
|---|---|---|
| Hover lift | `ArticleRow`, `FeedRow`, cards, `IconButton` | `transition: background-color var(--duration-instant), transform var(--duration-base) var(--ease-standard), box-shadow var(--duration-base)`; hover: `background: card-hover; transform: translateY(-1px); box-shadow: var(--shadow-1)`. Rows lift only on `@media (hover: hover)`. |
| Press scale | all buttons, rows, bottom nav tabs | `:active { transform: scale(0.97); transition-duration: var(--duration-fast) }` (rows use `scale(0.995)`). |
| Pane slide (mobile) | `AppShell` pane switching | see 4.5. |
| List item fade-in | newly rendered `ArticleRow`/`FeedRow` after a sync or view change | `animate-fade-up` with stagger `style={{ animationDelay: Math.min(index, 12) * 18 + "ms" }}`; stagger only for the first 12 items. |
| Unread dot pulse | `ArticleRow` unread dot **only for articles fetched in the last 10 minutes** (`fetchedAt > now-10min`) | `animate-pulse-dot`. Plain unread dots do not animate. |
| Popover / dialog enter | `Popover`, `Dialog`, `ShareSheet` | `animate-pop-in`; mobile `ShareSheet` slides from bottom: `translateY(100%) → 0`, `--duration-slow`, `--ease-out`. Exit: `opacity 1→0`, `--duration-fast`, `--ease-in` (implemented by keeping the node mounted for the exit duration via a `useExitTransition` hook). |
| Toast enter/exit | `Toast` | enter `animate-pop-in` (spring); exit fade + `translateY(8px)` `--duration-fast`. |
| Star / Read-later toggle | `IconButton` with `active` | icon `scale(1) → 1.25 → 1` over `--duration-base` `--ease-spring`, fill transitions to accent. |
| Mark-read sweep | `ArticleRow` when going unread→read | unread dot `scale(1)→0` and title weight `600→500` over `--duration-base`. |
| Refresh | `TimelinePane` refresh icon while `syncing` | `animate-spin-slow`. |
| Skeleton shimmer | `Skeleton` | `animate-shimmer`, background `linear-gradient(90deg, card 25%, card-hover 50%, card 75%)`, `background-size: 200% 100%`. |
| Nav collapse | `NavPane` width 260→64 | `transition: width var(--duration-slow) var(--ease-standard)`; labels `opacity` 1→0 over `--duration-fast`, then `display:none` (via `inert`/`hidden` after transition). |

### 3.3 Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  :root { --duration-instant: 0ms; --duration-fast: 0ms; --duration-base: 0ms; --duration-slow: 0ms; }
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
  .animate-pulse-dot { animation: none !important; box-shadow: 0 0 0 2px var(--color-accent-glow); } /* static halo replaces pulse */
}
```
Also expose `usePrefersReducedMotion()` hook (`src/hooks/usePrefersReducedMotion.ts`) so pane slides use an instant swap instead of translating.

---

## 4. Layout

### 4.1 Breakpoints

| Name | Range | Tailwind prefix | Pane model |
|---|---|---|---|
| mobile | `< 768px` | (none) | 1 pane visible + `BottomNav` |
| tablet | `768px – 1023px` | `md:` | 3 panes: nav **forced** to 64px rail, timeline 340px, reader flex |
| desktop | `1024px – 1439px` | `lg:` | 3 panes: nav 260px (collapsible to 64px), timeline 380px, reader flex |
| wide | `>= 1440px` | `xl:` | same as desktop; timeline 420px; reader measure centered |

```css
@theme { --breakpoint-md: 768px; --breakpoint-lg: 1024px; --breakpoint-xl: 1440px; }
```
(Do not use Tailwind's default `sm`/`2xl` in layout code; only `md`, `lg`, `xl`.)

### 4.2 Desktop / tablet grid

`AppShell` root:
```css
.app-grid {
  display: grid;
  height: 100dvh;
  grid-template-columns: var(--nav-w) var(--timeline-w) minmax(0, 1fr);
  grid-template-areas: "nav timeline reader";
  background: var(--color-bg);
}
.app-grid[data-nav="collapsed"] { --nav-w: var(--nav-w-collapsed); }
@media (min-width: 768px) and (max-width: 1023.98px) { .app-grid { --nav-w: var(--nav-w-collapsed); --timeline-w: 340px; } }
@media (min-width: 1440px) { .app-grid { --timeline-w: 420px; } }
.app-grid[data-reader="fullscreen"] { grid-template-columns: 0 0 minmax(0,1fr); }  /* nav+timeline hidden with `inert` */
```
- `NavPane` and `TimelinePane` have `border-right: 1px solid var(--color-border)` and `background: var(--color-panel)`.
- `ReaderPane` background is `--color-bg` (darker than panels: the content sits in a "well", the chrome around it is the steel).
- Each pane is `min-height: 0; overflow: hidden; display: flex; flex-direction: column;` with its own scrolling body (`overflow-y: auto; overscroll-behavior: contain`). The page itself never scrolls.
- Nav collapse toggle lives in the NavPane footer (icon `PanelLeftClose` / `PanelLeftOpen`); state `navCollapsed` persisted. On tablet the toggle is hidden (rail is forced).

### 4.3 Mobile single-pane stack

```css
@media (max-width: 767.98px) {
  .app-grid { display: block; position: relative; height: 100dvh; overflow: hidden; }
  .pane { position: absolute; inset: 0 0 calc(var(--bottom-nav-h) + env(safe-area-inset-bottom)) 0;
          transition: transform var(--duration-slow) var(--ease-standard), opacity var(--duration-slow) var(--ease-standard);
          will-change: transform; }
  .pane[data-state="active"] { transform: translateX(0); opacity: 1; pointer-events: auto; }
  .pane[data-state="left"]   { transform: translateX(-30%); opacity: 0; pointer-events: none; visibility: hidden; transition-delay: 0s, 0s, var(--duration-slow); }
  .pane[data-state="right"]  { transform: translateX(100%); opacity: 0; pointer-events: none; visibility: hidden; }
  .app-grid[data-reader="fullscreen"] .pane { inset-block-end: 0; }   /* bottom nav hidden in fullscreen */
}
```
Pane order is Feeds (nav) → Timeline → Reader. `mobilePane` in store ∈ `'nav' | 'timeline' | 'reader'`. A pane is `left` if its index < active index, `right` if greater. Result: moving forward slides the new pane in from the right (`100% → 0`) while the old recedes left and fades; moving back reverses. Inactive panes also get `inert` (attribute) so they are removed from tab order and AT.

Default mobile pane on first load: `timeline`. Selecting an article sets `mobilePane = 'reader'`. Back button (`ArrowLeft`) in reader toolbar sets `mobilePane = 'timeline'`. Selecting a feed/view in nav sets `mobilePane = 'timeline'`. Browser back: `AppShell` pushes a history entry `{ pane }` on forward moves and listens to `popstate` to go back one pane (mobile only).

Safe areas: `BottomNav` padding-bottom `env(safe-area-inset-bottom)`; toolbars padding-top `env(safe-area-inset-top)`. `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.

### 4.4 Pane internal layout (all breakpoints)

Each pane = `header` (`--toolbar-h` 52px, `.steel`, `hairline-b`, `sticky top-0 z-sticky`) + `body` (scroll) + optional `footer` (NavPane only, 56px, `.steel`, `hairline-t`).

### 4.5 z-index layers

```css
@theme {
  --z-base: 0;
  --z-sticky: 10;      /* pane headers/toolbars */
  --z-pane: 20;        /* mobile pane stack (active pane) */
  --z-bottom-nav: 30;
  --z-popover: 40;     /* ReaderPrefsPopover, sort menu, context menus */
  --z-backdrop: 50;    /* dialog scrim */
  --z-dialog: 51;      /* Dialog, ShareSheet */
  --z-toast: 60;
  --z-skip-link: 70;
}
```
Use `z-[var(--z-popover)]` etc. (or declare `--z-*` and use `z-(--z-popover)` Tailwind v4 shorthand). Popovers and dialogs render through a React portal into `#portal-root` (a `<div>` after `#root` in `index.html`).

---

## 5. Shared primitives (`src/components/ui/`)

Before the area components, these primitives exist. All accept `className` (merged with `cn()`), forward refs, and spread rest props.

| File | Component | Notes |
|---|---|---|
| `Button.tsx` | `Button` | `variant: 'primary' \| 'steel' \| 'ghost' \| 'danger'`, `size: 'sm' \| 'md'`, `leadingIcon?`, `loading?`. Primary: `bg-[var(--gradient-accent)] text-text-inverse font-semibold shadow-[var(--inner-highlight-strong)] hover:shadow-accent`. Steel: `.steel text-text hover:brightness-110`. Ghost: `text-silver hover:bg-card`. Danger: `bg-danger-soft text-danger hover:bg-danger/20`. Height 36px (`md`) / 30px (`sm`), `rounded-sm px-3 text-base`. `aria-busy` when loading (Loader2 spin replaces leading icon). |
| `IconButton.tsx` | `IconButton` | square `--hit-min`, `rounded-sm`, `text-text-muted hover:text-text hover:bg-card active:scale-95`; `active` prop → `text-accent bg-accent-soft`; **requires** `label` (→ `aria-label` + `title`); `pressed?: boolean` → `aria-pressed`. Icon 18px (`size={18} strokeWidth={1.75}`). |
| `Badge.tsx` | `Badge` | count pill: `min-w-[20px] h-5 px-1.5 rounded-full text-xs font-semibold tabular-nums bg-card text-silver`; `tone: 'neutral' \| 'accent'` (accent → `bg-accent-soft text-accent`). Caps display at `999+`. |
| `Chip.tsx` | `Chip` | toggle chip used for filters/tabs: `h-7 px-3 rounded-full text-xs font-medium hairline bg-transparent text-text-muted`; selected: `bg-accent-soft text-accent border-border-accent`. `role="radio"` within `role="radiogroup"` (filter) or `role="tab"` (tabs). |
| `Switch.tsx` | `Switch` | `role="switch" aria-checked`; track 36×20 `bg-card .well`, thumb 16px `bg-silver`; checked: track `bg-accent`, thumb `bg-text-inverse`, `translate-x-4`. |
| `Input.tsx` | `Input`, `Textarea` | `h-9 rounded-sm bg-bg .well border border-border-strong px-3 text-base text-text placeholder:text-text-faint focus-ring`; `invalid` → `border-danger` + `aria-invalid` + `aria-describedby` to error text. |
| `Tabs.tsx` | `Tabs`, `TabList`, `Tab`, `TabPanel` | WAI-ARIA tabs (roving arrow keys, `aria-selected`, `aria-controls`). Visual: underline tabs on `.steel` strip; selected tab has 2px `bg-accent` underline. |
| `Popover.tsx` | `Popover` | anchored to trigger via `getBoundingClientRect` (no lib) with flip when overflowing; `.glass-strong rounded-lg p-2 min-w-[220px] z-popover animate-pop-in`; closes on Esc / outside click / focus-out; `role="dialog"` (non-modal) + `aria-labelledby`. Focus moves into popover on open and returns to trigger on close. |
| `Dialog.tsx` | `Dialog` | modal via native `<dialog>` element + `showModal()` (gives focus trap and Esc for free). `::backdrop` → `.backdrop`. Panel: `.glass-strong rounded-lg w-[min(560px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] p-0 overflow-hidden animate-pop-in`; header `.steel h-13 px-5 flex items-center justify-between` with title `text-lg font-semibold text-text` and close `IconButton` (`X`). Body `p-5 overflow-y-auto`. Footer `hairline-t p-4 flex justify-end gap-2`. On mobile (<768): full-width bottom sheet `rounded-t-xl` sliding up, `max-h-[92dvh]`. `aria-labelledby` title id. Body scroll lock via `<dialog>` natively. |
| `Menu.tsx` | `Menu`, `MenuItem` | `role="menu"`/`menuitem`, arrow-key roving, used for sort selector and FeedRow context actions. Styled like Popover; items `h-9 px-3 rounded-sm text-base hover:bg-card focus:bg-card`. Destructive items `text-danger`. |
| `Tooltip.tsx` | `Tooltip` | hover/focus delay 500ms, `role="tooltip"`, `.glass text-xs px-2 py-1 rounded-sm`; only on `(hover: hover)` devices. Used for collapsed nav rail labels and icon buttons. |
| `Avatar.tsx` | `FeedAvatar` | 20px (rows) / 16px (reader meta) rounded-xs image with `onError` fallback to letter avatar: first letter of title, `bg-card text-text-muted text-[10px] font-semibold`, background hue derived from `hash(title) % 360` at `hsl(h 25% 30%)`. `alt=""` (decorative; title is adjacent). |
| `VisuallyHidden.tsx` | `VisuallyHidden` | `sr-only` wrapper. |

---

## 6. Components (area components)

For each: file, props, states, class recipe, ARIA. "Store" refers to `useUIStore` (see ARCHITECTURE §4).

### 6.1 `AppShell` — `src/components/layout/AppShell.tsx`

Purpose: root layout; owns grid, mobile pane switching, keyboard shortcuts, global dialogs, toasts, boot-time URL handling (`/?article=<id>`), sync scheduler, SW message bridge.

Props: none (reads store + hooks).

Structure:
```tsx
<a href="#main" className="skip-link">Skip to articles</a>           // sr-only until focused; z-skip-link; fixed top-2 left-2 steel px-3 py-2 rounded-sm
<div className="app-grid" data-nav={navCollapsed?'collapsed':'expanded'} data-reader={fullscreen?'fullscreen':'normal'}>
  <NavPane      className="pane" data-state={paneState('nav')}      inert={!isPaneActive('nav')} />
  <TimelinePane className="pane" data-state={paneState('timeline')} inert={...} />
  <ReaderPane   className="pane" data-state={paneState('reader')}   inert={...} />
</div>
<BottomNav />                 // rendered only < md (CSS hidden md:hidden + unmounted via useMediaQuery to save work)
<AddFeedDialog /> <SettingsDialog /> <ShareSheet />
<ToastRegion />
<UpdatePrompt />              // from useRegisterSW
```
- `inert` is applied only on mobile (on desktop all panes are active). On desktop, `paneState` is always `'active'`.
- Hooks mounted here: `useKeyboardShortcuts()`, `useSyncScheduler()`, `useServiceWorkerBridge()`, `useBootUrl()`, `useMobileHistory()`.
- Landmarks: NavPane renders `<nav aria-label="Feeds">`; TimelinePane renders `<section id="main" role="region" aria-label="Timeline">` wrapped in `<main>`? — Decision: `<main>` wraps **TimelinePane + ReaderPane** (`<main className="contents">` — `display: contents` so the grid still applies); ReaderPane is an `<article>` region. Exactly one `<main>`, one `<nav>`, one `<article>`.

States: `navCollapsed`, `fullscreen`, `mobilePane`. No visual of its own beyond the grid.

### 6.2 `NavPane` — `src/components/nav/NavPane.tsx`

Props: `className?`, `data-state?`, `inert?` (passed through).

Layout (260px): 
```
header (52px, .steel, hairline-b):  [Rss icon 20px accent] "OpenHorizon" text-lg font-semibold text-text   [IconButton Search (/ shortcut)]
body (scroll, p-2):
  <section aria-labelledby="nav-smart">  label "SMART VIEWS"
    NavRow  Inbox      "All"          badge(total unread)
    NavRow  CircleDot  "Unread"       badge(unread)
    NavRow  Star       "Favorites"    badge(unread in favorites)      // favorites = articles isFavorite
    NavRow  Bookmark   "Read Later"   badge(count readLater)
  <section aria-labelledby="nav-folders"> label "FOLDERS"   [IconButton FolderPlus "New folder"]
    FolderRow (ChevronRight/ChevronDown + Folder/FolderOpen + name + unread badge) — collapsible, children indented 12px
      FeedRow ...
    FeedRow ... (feeds without folder, after folders, under implicit label "UNFILED" only if both groups exist)
footer (56px, .steel, hairline-t, px-2, flex justify-between):
    [IconButton Settings "Settings"]  [Button primary sm leadingIcon=Plus "Add feed"]  [IconButton PanelLeftClose "Collapse sidebar" lg:only]
```
Collapsed rail (64px): header shows only Rss icon; smart views show icons only with `Tooltip`; folders collapse into a single `Folder` icon that opens a `Popover` listing the folder tree; footer stacks `Settings`, `Plus` (icon only), `PanelLeftOpen` vertically (footer becomes 3×44px). Unread badge in rail becomes a 6px accent dot at the icon's top-right.

NavRow recipe (`src/components/nav/NavRow.tsx`): `flex items-center gap-2 h-9 px-2 rounded-md text-sm text-silver hover:bg-card hover:text-text focus-ring cursor-pointer select-none`; icon 18px `text-text-muted`; selected: `bg-accent-soft text-text [&>svg]:text-accent` with a 2px left bar `before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:rounded-full before:bg-accent`. Badge right-aligned `ml-auto`, hidden when 0.

ARIA: `<nav aria-label="Feeds">`; each section is `<ul role="list">` of `<li>` containing `<button>` (or `<a href>`)—buttons, since selection is app state. Selected item: `aria-current="page"`. Folder toggles: `<button aria-expanded>` with the folder name; the folder's child list `<ul role="group" aria-label="{folder} feeds">`. Rail-mode tooltips are `aria-label`s on the buttons. Section labels are `<h2 id="nav-smart" className="sr-only md:not-sr-only ...">`. Arrow key navigation: a single roving tabindex across all NavRows/FeedRows (↑/↓ move, Home/End, → expands folder, ← collapses/moves to parent) via `useRovingFocus(containerRef, '[data-nav-item]')`.

Interactions: click selects `view`, sets `mobilePane='timeline'`. Right-click / long-press / `MoreHorizontal` on hover opens `Menu` (FeedRow: Rename, Move to folder…, Mark all read, Toggle "Favorite feed (notify)", Copy feed URL, Unsubscribe [danger]; FolderRow: Rename, Mark all read, Delete folder (feeds become unfiled) [danger]). Drag-and-drop ordering is out of scope v1.

### 6.3 `FeedRow` — `src/components/nav/FeedRow.tsx`

Props:
```ts
interface FeedRowProps {
  feed: Feed; unreadCount: number; selected: boolean; depth: 0 | 1;
  onSelect(feedId: string): void; onContextMenu(e: React.MouseEvent | React.KeyboardEvent, feed: Feed): void;
  collapsed?: boolean;  // rail mode
}
```
Recipe: NavRow recipe + `pl-[calc(8px+depth*12px)]`; left `FeedAvatar size=18`; title `truncate flex-1`; unread `Badge` (`tone='accent'` when selected else neutral). Error state (`feed.lastError`): tiny `AlertTriangle` 14px `text-warning` after title with `title={feed.lastError}` and `aria-label="Feed error: …"`. Syncing state (`syncingFeedIds.has(id)`): avatar replaced by `Loader2 animate-spin-slow` 14px. Favorite feed (`feed.isFavorite`): 10px `Star` fill accent in avatar corner.

States: default / hover / selected / focus-visible / error / syncing / `unreadCount===0` (title `text-text-muted`) / `>0` (title `text-silver font-medium`).

ARIA: `<li role="listitem"><button data-nav-item tabIndex={roving} aria-current={selected?'page':undefined} aria-label={`${feed.title}, ${unreadCount} unread`}>`. Context via `onContextMenu` and `Shift+F10`/`ContextMenu` key.

### 6.4 `TimelinePane` — `src/components/timeline/TimelinePane.tsx`

Props: `className?`, `data-state?`, `inert?`.

Header (52px `.steel hairline-b px-3 flex items-center gap-2`):
```
[mobile only: IconButton Menu "Feeds" -> mobilePane='nav']   (lucide: PanelLeft)
title: view name (text-lg font-semibold text-text truncate)  e.g. "All", "Unread", "The Verge"
ml-auto:
  <div role="radiogroup" aria-label="Filter"> Chip "All" | Chip "Unread" </div>      // timelineFilter
  IconButton ArrowUpDown "Sort"  -> Menu: Newest first (default) / Oldest first  (aria-haspopup="menu")
  IconButton CheckCheck  "Mark all as read" -> confirm Menu inline ("Mark N articles read?" [Confirm]) when N > 20
  IconButton RefreshCw   "Refresh" (animate-spin-slow while syncing; disabled while syncing; aria-busy)
```
On < 1024px widths the header overflows: filter chips remain, sort+mark-all move into a `MoreHorizontal` menu (`xl:` shows everything inline; `md`–`lg` collapse sort+mark-all; mobile collapses sort+mark-all).

Sub-header (optional, 28px, `text-xs text-text-muted px-3 flex items-center`): "{count} articles · {unread} unread · updated {timeAgo(lastSyncAt)}". Hidden while list empty. When offline (`navigator.onLine===false`): `WifiOff` 14px + "Offline — showing cached articles".

Body: `<ul role="listbox" aria-label="{view name} articles" aria-activedescendant={selectedArticleId ? `article-${id}` : undefined} tabIndex={0}>` with `ArticleRow`s separated by `hairline-b` (border on `li`). Virtualization: not required for v1 (page size 100 with "Load more" `Button steel` at the end; see ARCHITECTURE §4.4). Use `content-visibility: auto; contain-intrinsic-size: auto 84px` on `li` for cheap rendering.

States:
- Loading (first live query result undefined): 8× `Skeleton` rows.
- Empty: `EmptyState` variants: no feeds (`Rss`, "No feeds yet", "Add your first feed" → opens AddFeedDialog); no unread (`CheckCheck`, "You're all caught up"); no favorites (`Star`); no read later (`Bookmark`); no results in feed (`Inbox`, "Nothing here yet", "Refresh" action).
- Syncing: header icon spinning; a 2px indeterminate progress bar under the header (`bg-accent` segment 30% width sliding, `animate-[shimmer]`) — `role="progressbar" aria-label="Syncing feeds" aria-valuetext="{done} of {total}"`.

Keyboard (listbox focused): ↑/↓ or J/K move `aria-activedescendant` + select (selection = open in reader on desktop; on mobile Enter opens). Home/End. Enter/Space → open (mobile: `mobilePane='reader'`). Selected row scrolls into view (`scrollIntoView({block:'nearest'})`).

Auto-mark-read: when an article is selected (desktop) or opened (mobile), mark read after it has been the selection for 800ms (so rapid J/K skimming does not mark everything). Timer lives in `ReaderPane` effect.

### 6.5 `ArticleRow` — `src/components/timeline/ArticleRow.tsx`

Props:
```ts
interface ArticleRowProps {
  article: Article; feedTitle: string; feedFaviconUrl?: string; selected: boolean; index: number;
  density: 'comfortable' | 'compact';
  onSelect(id: string): void; onToggleFavorite(id: string): void; onToggleReadLater(id: string): void; onToggleRead(id: string): void;
}
```
Layout (comfortable, min-h 84px, `px-3 py-2.5 grid grid-cols-[14px_1fr_auto] gap-x-2.5`):
```
col1: unread dot (8px circle bg-accent, mt-[7px]; unread+recent → animate-pulse-dot; read → transparent with 1px hairline ring (keeps alignment))
col2: 
  line1 (flex items-center gap-1.5 text-xs text-text-muted): FeedAvatar 14 · feedTitle (truncate) · "·" · <time dateTime>timeAgo</time>  · [Star 12 fill accent if isFavorite] [Bookmark 12 accent if isReadLater]
  line2: title  text-md font-semibold text-text line-clamp-2 (read: font-medium text-silver)
  line3 (comfortable only): snippet text-sm text-text-muted line-clamp-2
col3 (comfortable only, if thumbnailUrl): <img 72x72 rounded-md object-cover bg-card loading="lazy" decoding="async" alt=""> ; hidden on error
quick actions: absolute right-2 top-2 (over thumbnail if present; else inline) flex gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [data-selected]:opacity-100 ; on touch devices always visible as 2 small 32px buttons under line3 (justify-end)
  IconButton size=sm Star     "Favorite" / "Remove favorite"   (pressed = isFavorite; fill-accent when pressed)
  IconButton size=sm Bookmark "Read later" / "Remove from read later"
  IconButton size=sm Circle/CircleCheck "Mark as read" / "Mark as unread"  (desktop hover only)
```
Compact: min-h 56px, no snippet, no thumbnail, title `line-clamp-1`, line1 and title on one row (`feed · time` right-aligned `ml-auto shrink-0`).

Recipe: `group relative cursor-pointer select-none transition-[background-color,transform] hover:bg-card-hover/60 active:scale-[0.995]`; selected: `bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]` (left accent bar), title `text-text`. Thumbnail gets `ring-1 ring-border`.

ARIA: `<li id={`article-${article.id}`} role="option" aria-selected={selected} aria-label={`${title}. ${feedTitle}, ${timeAgoFull}${isRead?'':' , unread'}`} tabIndex={-1}>`. Quick-action buttons are `tabIndex={-1}` inside the option (keyboard users use M/L/F shortcuts; the shortcuts are listed in the Settings → Keyboard section and in the reader toolbar tooltips). Clicking a quick action calls `e.stopPropagation()`. `<time dateTime={iso} title={fullDate}>`.

Time-ago format (`src/lib/time.ts`): `now`, `{n}m`, `{n}h`, `{n}d`, then `MMM d` (same year), else `MMM d, yyyy`. Full form for `title`/aria: `Intl.DateTimeFormat(undefined, {dateStyle:'medium', timeStyle:'short'})`.

### 6.6 `ReaderPane` — `src/components/reader/ReaderPane.tsx`

Props: `className?`, `data-state?`, `inert?`.

Toolbar (52px, `.steel hairline-b px-2 flex items-center gap-1`, becomes `.glass` sticky when body scrolled > 8px):
```
left:   IconButton ArrowLeft "Back to timeline"  (mobile only; also shown on desktop when fullscreen? no — fullscreen uses Minimize2)
        [desktop] IconButton ChevronUp "Previous article" / ChevronDown "Next article"  (K / J)
center: feed title · time (text-xs text-text-muted truncate, hidden < md)
right:  IconButton ExternalLink "Open original"        (anchor, target=_blank rel=noopener; also key O)
        IconButton Star "Favorite" (pressed)             F
        IconButton Bookmark "Read later" (pressed)       L
        IconButton Circle / CircleCheck "Mark as unread"/"Mark as read"   M   (icon shows the *action*: read article shows Circle "Mark as unread"; unread shows CircleCheck "Mark as read")
        IconButton Share2 "Share"                        S
        IconButton Type "Reading preferences" aria-haspopup="dialog" aria-expanded -> ReaderPrefsPopover
        IconButton Maximize2 / Minimize2 "Enter fullscreen"/"Exit fullscreen" (hidden on mobile)   (key: Shift+F)
        Overflow (< 420px wide pane): Share, Prefs, Fullscreen fold into MoreHorizontal menu.
```
Body (`overflow-y-auto`, `px-4 md:px-8 py-6 md:py-10`):
```
<article aria-labelledby="reader-title" style={readerVars}>
  <header class="max-w-[var(--reader-measure)] mx-auto mb-6">
    <div class="flex items-center gap-2 text-sm text-text-muted"> <FeedAvatar 16/> feedTitle · <time>full date</time> · author? </div>
    <h1 id="reader-title" class="mt-2 text-2xl lg:text-3xl font-bold text-text tracking-[-0.01em] leading-tight font-sans">
      <a href={link} target="_blank" rel="noopener noreferrer" class="hover:text-accent">title</a></h1>
    (hero image if thumbnailUrl and not already in first 600 chars of content: <img class="mt-5 w-full rounded-lg ring-1 ring-border" loading="lazy">)
  </header>
  <div class="reader-content" dangerouslySetInnerHTML={{__html: sanitizedHtml}} />
  <footer class="max-w-[var(--reader-measure)] mx-auto mt-10 pt-6 hairline-t flex flex-wrap gap-2">
    Button steel leadingIcon=ExternalLink "Read on {hostname}"   Button ghost Share2 "Share"   Button ghost Bookmark "Read later"
    [desktop] <p class="text-xs text-text-faint mt-4 w-full">J / K to move between articles</p>
  </footer>
</article>
```
Empty state (no selection): `EmptyState icon=BookOpen title="Select an article" description="Choose something from the timeline to start reading." ` centered; on mobile this pane is never shown without a selection.

States: idle/empty, article, loading (skeleton: title bar + 6 lines), fullscreen (`data-reader="fullscreen"`; Esc exits), scrolled (toolbar glass).

Behavior:
- Sanitized HTML computed with `useMemo(() => sanitizeHtml(article.contentRaw, article.link), [article.id])` (see ARCHITECTURE §6.4). Links inside content open in a new tab (enforced by sanitizer).
- Scroll to top on article change; restore nothing.
- Auto-mark-read after 800ms (see 6.4).
- Focus management: on article change (desktop) focus stays in the timeline listbox; on mobile open, focus moves to the toolbar Back button; `<article>` has `tabIndex={-1}` so `→` (switch pane focus) can focus it.
- Image click → open image URL in new tab (no lightbox in v1).

ARIA: `<section aria-label="Reader">` wrapper (region) containing `<article aria-labelledby="reader-title">`. Toolbar `role="toolbar" aria-label="Article actions"` with ←/→ arrow key roving among its buttons (standard toolbar pattern). `aria-pressed` on Star/Bookmark. Live announcement on mark-read toggle via the toast live region (polite, no visible toast: use `announce()` helper → sr-only live region).

### 6.7 `ReaderPrefsPopover` — `src/components/reader/ReaderPrefsPopover.tsx`

Props: `anchorRef: RefObject<HTMLElement>; open: boolean; onClose(): void`.

Content (`w-[280px] p-3 flex flex-col gap-3`):
```
Row "Text size":    [IconButton Minus "Smaller text" (disabled at 0)]  5 step dots (role="slider" host: a 5-notch track; current filled accent)  [IconButton Plus "Larger text" (disabled at 4)]   aria: <div role="slider" aria-label="Text size" aria-valuemin=0 aria-valuemax=4 aria-valuenow aria-valuetext="Medium" tabIndex=0> ←/→ adjust
Row "Line spacing": 3 Chips (role=radiogroup): Compact / Normal / Relaxed   (icons: AlignJustify with 3 line variants not available → text labels only)
Row "Font":         2 Chips (radiogroup): "Aa Serif" (font-reading) / "Aa Sans" (font-sans) — chip label rendered in the font it selects
Row "Width" (hidden < md): 2 Chips: Narrow / Wide
Footer: Button ghost sm RotateCcw "Reset"
```
Live preview: changes apply immediately to store (persisted). Popover `role="dialog" aria-label="Reading preferences"`. Esc/outside closes and returns focus to the `Type` button.

### 6.8 `BottomNav` — `src/components/layout/BottomNav.tsx`

Mobile only. `fixed inset-x-0 bottom-0 z-bottom-nav h-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] pb-[env(safe-area-inset-bottom)] .glass border-x-0 border-b-0 rounded-none`.

```
<nav aria-label="Primary">
  <ul role="list" class="grid grid-cols-3 h-[60px]">
    Tab Rss      "Feeds"     -> mobilePane='nav'
    Tab Newspaper "Timeline" -> mobilePane='timeline'   badge: total unread (Badge tone=accent, max 999+, positioned top-right of icon)
    Tab BookOpen "Reader"    -> mobilePane='reader'     disabled (aria-disabled, text-text-faint) when no selectedArticleId
```
Tab recipe: `<button aria-current={active?'page':undefined} class="flex flex-col items-center justify-center gap-1 h-full text-xs font-medium text-text-muted active:scale-95 focus-ring">`; active: `text-accent` with icon `strokeWidth=2.25` and a 20px×2px `bg-accent rounded-full` indicator at top. Icons 22px.

Hidden when `fullscreen` or when a dialog is open on mobile (dialog is a bottom sheet). Hidden when the on-screen keyboard is likely open (`visualViewport.height < 0.6 * screen.height`) to avoid overlap in AddFeedDialog—dialog is above it anyway, so this is optional polish.

### 6.9 `AddFeedDialog` — `src/components/dialogs/AddFeedDialog.tsx`

Opened by: nav footer "Add feed", EmptyState action, `A` shortcut, `?add=<url>` boot param (Web Share Target future). Store: `dialogs.addFeed: false | { initialUrl?: string; tab?: AddFeedTab }`.

Header title "Add feed". `Tabs` (`AddFeedTab = 'url' | 'discover' | 'xml' | 'opml'`): labels **URL** (`Link`), **Discover** (`Globe`), **Paste XML** (`FileCode`), **Import OPML** (`Upload`). Tab panels:

1. **URL** — `Input type="url" label="Feed URL" placeholder="https://example.com/feed.xml" autoFocus`, folder `<select>` ("No folder" + folders + "New folder…" inline input), `Switch` "Notify me about new articles (favorite feed)". Footer: `Button primary "Add feed" loading` → `addFeedFromUrl()`. Flow: fetch via proxy → if parses as feed → preview card (`steel-card p-3 flex gap-3`: FeedAvatar 32, title, site host, "{n} items", latest title) → confirm "Subscribe". If it's HTML → auto-switch to Discover flow with candidates. Errors shown inline below input (`text-danger text-sm` with `AlertTriangle`), `role="alert"`: "Couldn't reach this URL (tried direct and 2 proxies)", "This URL isn't a feed and no feeds were found on the page", "You're already subscribed to this feed" (link: "Show feed").
2. **Discover** — `Input` "Website URL" + `Button steel "Find feeds"`; results `<ul role="list">` of candidate rows (`steel-card`: `Rss` icon, title, URL truncated, type badge `RSS`/`Atom`/`JSON`, `Button primary sm "Add"` or `Check` "Added"). Skeleton 3 rows while searching; empty "No feeds found. Try pasting the feed URL directly."
3. **Paste XML** — `Textarea rows=10 font-mono text-sm` "Paste feed XML or JSON Feed", `Input` optional "Source URL (used to resolve relative links and refresh)". If no source URL, the feed is created with `url = "manual:<uuid>"` and `manual: true` (never refreshed; badge "Manual" in FeedRow context menu). Footer "Add feed".
4. **Import OPML** — drop zone (`hairline border-dashed rounded-lg p-8 text-center hover:bg-card/50`, `Upload` icon 28, "Drop an OPML file or click to browse", hidden `<input type=file accept=".opml,.xml,text/xml,text/x-opml">`). After parse: summary "{n} feeds in {m} folders ({k} already subscribed, skipped)" + checkbox list grouped by folder (all checked by default) + `Switch` "Fetch articles now". Footer "Import {n} feeds". Progress bar during import (progressbar with valuetext).

Common: Esc closes; closing while loading aborts via AbortController. On success: toast success "Subscribed to {title}", select the new feed view, close.

ARIA: Dialog `aria-labelledby`; tabs pattern; each error `role="alert"`; progress `role="progressbar"`; file input labelled by the drop zone text (`aria-labelledby`).

### 6.10 `SettingsDialog` — `src/components/dialogs/SettingsDialog.tsx`

Header "Settings". Body = vertical sections separated by `hairline-b pb-5 mb-5`, each `<section aria-labelledby>` with `h3 text-sm font-semibold text-text uppercase tracking-[0.06em] text-xs text-text-muted mb-3`:

1. **Sync** — "Refresh frequency" `Chip` radiogroup: `15 min` / `30 min` / `1 hour` / `Manual`. Row: "Background sync" status text: "Enabled by the browser" / "Not supported in this browser" / "Install the app to enable" (`text-text-muted text-sm`) with `Info` tooltip. Row: "Last sync: {time}" + `Button steel sm RefreshCw "Sync now"`. Row: "Keep per feed" `<select>`: 100 / 200 (default) / 500 / 1000 articles (favorites and read-later are always kept).
2. **Notifications** — `Switch` "Notify about new articles in favorite feeds". When turning on and `Notification.permission === 'default'` → request permission; `'denied'` → switch disabled + helper text "Notifications are blocked in your browser settings". Helper: "Mark a feed as favorite from its menu to get notified." Test button `Button ghost sm Bell "Send test notification"`.
3. **Appearance** — "Density" Chips: `Comfortable` / `Compact` (icons `Rows3` / `Rows4`). "Reading preferences" → `Button ghost sm Type "Open reading preferences"` (opens popover anchored to it). (Theme is dark-only by design; no light theme toggle in v1.)
4. **Data** — `Button steel Download "Export OPML"`; `Button steel Upload "Import OPML"` (opens AddFeedDialog on OPML tab); `Button ghost CheckCheck "Mark everything as read"`; `Button danger Trash2 "Delete all data"` (two-step confirm inline: button becomes "Confirm delete" for 5s).
5. **App** — Install row: if `canInstall` → `Button primary Download "Install OpenHorizon"`; if installed → "Installed" with `Check`. Version `text-xs text-text-faint` (`__APP_VERSION__` define). "Keyboard shortcuts" → expands a `<dl>` two-column table of the map in §8.4 (icon `Keyboard`). Links: "Source / About".

ARIA: each control labelled; Switch state announced; Chip groups `role="radiogroup" aria-label`.

### 6.11 `ShareSheet` — `src/components/sharing/ShareSheet.tsx`

Fallback modal when `navigator.share` is unavailable or `canShare` false. Store: `dialogs.share: null | { title: string; url: string; text?: string }`.

Dialog titled "Share". Body:
```
Preview: steel-card p-3 → title (line-clamp-2 text-text font-medium), url host (text-xs text-text-muted)
Grid (grid-cols-4 gap-3 md:grid-cols-7): round 48px tiles (.steel rounded-full flex items-center justify-center) with label under (text-xs text-text-muted)
  X (lucide: no brand icons → use text glyph "𝕏" or a 20px inline SVG from src/components/sharing/brandIcons.tsx; same for the others — ship 6 small inline SVG paths in that file; lucide provides none of these)
  WhatsApp · Telegram · Reddit · LinkedIn · Facebook · Copy link (lucide `Link`)
Row: Input readOnly value={url} + Button steel sm Copy "Copy" → success swaps to Check "Copied" for 2s + toast
Row (if available): Button ghost sm Mail "Email" (mailto)
```
Share URL templates (all parameters `encodeURIComponent`-ed; `T` = title, `U` = url, `X` = text ?? title):
| Target | Template |
|---|---|
| X | `https://x.com/intent/post?text={X}&url={U}` |
| WhatsApp | `https://wa.me/?text={X}%20{U}` (text and URL in one `text` param, space-separated) |
| Telegram | `https://t.me/share/url?url={U}&text={X}` |
| Reddit | `https://www.reddit.com/submit?url={U}&title={T}` |
| LinkedIn | `https://www.linkedin.com/sharing/share-offsite/?url={U}` |
| Facebook | `https://www.facebook.com/sharer/sharer.php?u={U}` |
| Email | `mailto:?subject={T}&body={X}%0A%0A{U}` |
| Copy link | `navigator.clipboard.writeText(U)` → fallback `document.execCommand('copy')` on a temporary textarea |

Open with `window.open(href, '_blank', 'noopener,noreferrer,width=640,height=560')`; on mobile just `_blank`. Each tile is `<a href target="_blank" rel="noopener noreferrer" aria-label="Share on X">`. Mobile: bottom sheet variant of `Dialog`.

### 6.12 `Toast` — `src/components/ui/Toast.tsx` (+ `ToastRegion`)

Store slice: `toasts: Toast[]` where `Toast = { id: string; tone: 'info'|'success'|'danger'|'warning'; title: string; description?: string; action?: { label: string; onClick(): void }; duration?: number /* default 5000; 0 = sticky */ }`. API: `toast.success('Subscribed', { description })`, `toast.error(...)`, `toast.info(...)`, `toast.dismiss(id)`; implemented as plain functions calling the store (`src/lib/toast.ts`).

`ToastRegion`: `fixed z-toast bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+12px)] md:bottom-4 right-4 left-4 md:left-auto md:w-[360px] flex flex-col gap-2 pointer-events-none`. Two live regions: `<div role="status" aria-live="polite" aria-atomic="false">` for info/success, `<div role="alert" aria-live="assertive">` for danger. Max 3 visible; older ones dismissed.

Toast: `.glass pointer-events-auto rounded-lg p-3 pl-3 flex gap-3 items-start animate-pop-in border-l-2` with left border color by tone (`border-l-accent` info, `border-l-success`, `border-l-danger`, `border-l-warning`); icon 18px by tone: `Info`, `CircleCheck`, `CircleX`, `AlertTriangle`; title `text-base text-text font-medium`; description `text-sm text-text-muted`; action `Button ghost sm` right; close `IconButton X size sm` (always present). Pauses auto-dismiss on hover/focus. Hitting `Esc` while a toast is focused dismisses it.

Standard toasts used by the app: "Subscribed to {feed}", "Unsubscribed from {feed}" (action Undo, 8s), "Marked {n} as read" (Undo), "Link copied", "Sync failed for {n} feeds" (action "Details" → opens Settings Sync section with syncLog), "Update available" (action "Reload", sticky), "You're offline" (info), "OpenHorizon is ready to work offline".

### 6.13 `EmptyState` — `src/components/ui/EmptyState.tsx`

Props: `icon: LucideIcon; title: string; description?: string; action?: { label: string; onClick(): void; icon?: LucideIcon }; secondaryAction?; className?`.
Recipe: `flex flex-col items-center justify-center text-center p-8 h-full animate-fade-in`; icon plate `size-16 rounded-lg steel-card flex items-center justify-center mb-4` with icon 28px `text-text-muted`; title `text-xl font-semibold text-text`; description `text-sm text-text-muted mt-1 max-w-[32ch]`; actions `mt-5 flex gap-2`. `role="status"` is **not** used (static content); plain `<div>`.

### 6.14 `Skeleton` — `src/components/ui/Skeleton.tsx`

Props: `className?` (shape via Tailwind: `h-4 w-3/4 rounded-sm`), `aria-hidden` always. Recipe: `bg-[linear-gradient(90deg,var(--color-card)_25%,var(--color-card-hover)_50%,var(--color-card)_75%)] bg-[length:200%_100%] animate-shimmer rounded-sm`. Composite presets exported from same file: `ArticleRowSkeleton` (dot + 3 lines + 72px square), `FeedRowSkeleton`, `ReaderSkeleton` (title 2 lines + 8 body lines of varying width). The containing list gets `aria-busy="true"` and a sr-only "Loading articles…".

---

## 7. Icons (lucide-react)

Default icon size 18px (`size={18}`), `strokeWidth={1.75}`; bottom nav 22px; empty state 28px; inline-in-text 14px. Import individually (`import { Star } from 'lucide-react'`).

| Action / Meaning | Icon |
|---|---|
| App logo / Feeds tab / feed generic | `Rss` |
| All articles | `Inbox` |
| Unread view / unread marker | `CircleDot` |
| Favorites view / favorite toggle | `Star` (fill when active: `fill="currentColor"`) |
| Read Later view / toggle | `Bookmark` (fill when active) |
| Folder closed / open | `Folder` / `FolderOpen` |
| New folder | `FolderPlus` |
| Expand / collapse folder | `ChevronRight` / `ChevronDown` |
| Settings | `Settings` |
| Add feed | `Plus` |
| Search | `Search` |
| Collapse / expand sidebar | `PanelLeftClose` / `PanelLeftOpen` |
| Open nav (mobile timeline header) | `PanelLeft` |
| Timeline tab | `Newspaper` |
| Reader tab / reader empty state | `BookOpen` |
| Refresh / sync | `RefreshCw` (spinning while syncing) |
| Mark all read | `CheckCheck` |
| Mark as read / mark as unread | `CircleCheck` / `Circle` |
| Sort | `ArrowUpDown` |
| Filter (overflow menus) | `Filter` |
| Back (mobile) | `ArrowLeft` |
| Previous / next article | `ChevronUp` / `ChevronDown` |
| Open original | `ExternalLink` |
| Share | `Share2` |
| Reading preferences | `Type` |
| Text smaller / larger | `Minus` / `Plus` (or `AArrowDown` / `AArrowUp` if available in installed lucide version) |
| Reset prefs | `RotateCcw` |
| Fullscreen enter / exit | `Maximize2` / `Minimize2` |
| More / overflow / context | `MoreHorizontal` |
| Rename | `Pencil` |
| Move to folder | `FolderInput` |
| Copy / copied | `Copy` / `Check` |
| Copy link | `Link` |
| Unsubscribe / delete | `Trash2` |
| Discover from website | `Globe` |
| Paste XML | `FileCode` |
| Import OPML / upload | `Upload` |
| Export OPML / install app / download | `Download` |
| Notifications on / off | `Bell` / `BellOff` |
| Density comfortable / compact | `Rows3` / `Rows4` |
| Keyboard shortcuts | `Keyboard` |
| Info / tooltip | `Info` |
| Warning / feed error | `AlertTriangle` |
| Error (toast) | `CircleX` |
| Success (toast) | `CircleCheck` |
| Offline | `WifiOff` |
| Loading | `Loader2` (spin) |
| Close | `X` |
| Email share | `Mail` |
| Image placeholder | `Image` |
| Manual feed (no URL) | `FileText` |
| Install PWA | `Download` (settings) / `MonitorDown` if available |
| Update available | `Sparkles` |

Brand share icons (X, WhatsApp, Telegram, Reddit, LinkedIn, Facebook) are **not** in lucide; ship them as inline SVG components in `src/components/sharing/brandIcons.tsx` (24×24 viewBox, `fill="currentColor"`, `aria-hidden`).

---

## 8. Accessibility

### 8.1 Landmarks and headings

| Pane | Element | Label |
|---|---|---|
| Skip link | `<a href="#main">` first in DOM | "Skip to articles" |
| NavPane | `<nav aria-label="Feeds">` | `h1` "OpenHorizon" (visually the logo text); `h2`s for "Smart views", "Folders" |
| TimelinePane + ReaderPane | one `<main id="main" className="contents">` | — |
| TimelinePane | `<section aria-labelledby="timeline-title">` with `h2#timeline-title` = view name | |
| ReaderPane | `<section aria-label="Reader">` → `<article aria-labelledby="reader-title">` with `h1#reader-title`? — Use `h2` for the article title to keep one `h1` per page? Decision: article title is `<h1>`; the logo is `<p>` with `aria-label`. Exactly one `h1` (the current article; when no article, none). | |
| BottomNav | `<nav aria-label="Primary">` | |
| Dialogs | native `<dialog aria-labelledby>` | |
| Toasts | `role="status"` + `role="alert"` regions, always mounted | |

### 8.2 Lists and roving focus

- Timeline: `role="listbox"` + `role="option"` with `aria-selected`, container `tabIndex=0`, `aria-activedescendant` (single tab stop; arrows move). This matches the "selection opens article" model.
- Nav: `<ul>` lists of buttons with a roving `tabIndex` (one tab stop for the whole nav tree), `aria-current="page"` on the selected view/feed; folders `aria-expanded`.
- Reader toolbar: `role="toolbar"` with roving arrow keys.
- Hook `useRovingFocus(ref, selector, { orientation, loop })` in `src/hooks/useRovingFocus.ts` implements the pattern once.

### 8.3 Focus and visibility rules

- Focus ring: `--focus-ring` (§1.6) on every interactive element via `:focus-visible`. Never remove outlines without the ring.
- Dialog open → focus first focusable (native `showModal`); close → restore to opener (store `openerRef` in Dialog).
- Popover open → focus first control; Esc returns to trigger.
- Inactive mobile panes get `inert` + `visibility:hidden` → not focusable, not read.
- Minimum target size 40×40 (44 on touch). Icon-only buttons have `aria-label` + `title`.
- Color is never the only indicator: unread = dot **and** bold title **and** "unread" in the option label; favorite/read-later = filled icon **and** `aria-pressed`.
- Images from feeds are `alt=""` if the feed provides none? — No: keep the feed's `alt`; if missing, set `alt=""` (decorative) rather than leaking file names.
- Motion respects `prefers-reduced-motion` (§3.3). Contrast respects `prefers-contrast: more` → `--color-border: rgba(255,255,255,0.18); --color-text-muted: #B4BBC6`.
- Language: `<html lang="en">`; article content containers get `lang={feed.language}` when the feed declares one.
- Announcements: `announce(text, { assertive? })` helper writes to the sr-only live region (used for "Marked as read", "Added to Read Later", "Syncing… / Sync complete, 12 new").

### 8.4 Keyboard map (implemented in `useKeyboardShortcuts`, see ARCHITECTURE §9)

Global (ignored when focus is in `input`, `textarea`, `select`, `[contenteditable]`, or when a `<dialog>` is open — except Esc):

| Key | Action |
|---|---|
| `↓` / `J` | Next article (select; on mobile also opens reader if already in timeline) |
| `↑` / `K` | Previous article |
| `Enter` / `O`(open in reader on mobile) | Open selected article (mobile: `mobilePane='reader'`) |
| `→` | Move focus to the pane on the right (nav → timeline → reader); desktop/tablet only |
| `←` | Move focus to the pane on the left; on mobile: `mobilePane` back one step |
| `M` | Toggle read/unread of selected article |
| `L` | Toggle Read Later |
| `F` | Toggle Favorite |
| `S` | Share selected article |
| `V` | Open original in new tab |
| `R` | Refresh (sync all; `Shift+R` sync current feed only) |
| `A` | Open Add Feed dialog |
| `/` | Focus search (nav header search field; filters feeds and, when ≥3 chars, article titles in the current view) |
| `Shift+A` | Mark all read in current view (with confirm if > 20) |
| `Shift+F` | Toggle reader fullscreen |
| `,` | Open Settings |
| `?` | Open the keyboard shortcuts panel (Settings → App → Shortcuts) |
| `1`–`4` | Smart views: All / Unread / Favorites / Read Later |
| `Esc` | Close dialog/popover/menu → exit fullscreen → (mobile) go back a pane → clear search |
| `Home` / `End` | First / last article (when listbox focused) |

Within `role="listbox"`, `role="toolbar"`, menus and nav tree, arrow keys are handled locally by the roving-focus hook and **not** by the global handler (global handler checks `event.defaultPrevented` first).

### 8.5 Testing checklist (per component PR)

- Tab through the component once with only the keyboard; every interactive element reachable and visibly focused.
- Screen-reader smoke test with the browser's accessibility tree: names, roles, states (`aria-pressed`, `aria-selected`, `aria-expanded`, `aria-current`) correct.
- `prefers-reduced-motion: reduce` emulated: no sliding/pulsing.
- 200% zoom and 320px width: no horizontal scroll, no clipped controls.
- Contrast: run axe DevTools; no AA failures on `text-muted`+ text.
