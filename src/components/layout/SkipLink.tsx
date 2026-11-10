/** First focusable element: jumps past the navigation pane to the timeline. Hidden until focused. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="focus-ring sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[var(--z-skip-link)] steel rounded-sm px-3 py-2 text-base font-medium text-text"
    >
      Skip to articles
    </a>
  );
}
