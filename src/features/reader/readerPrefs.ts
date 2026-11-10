/** Reader preferences (DESIGN §2.4). Persisted by the UI store under localStorage 'oh-ui'. */

export const FONT_SIZES = [15, 17, 19, 21, 24] as const;        // px, step 0..4 (default 2)
export const LINE_HEIGHTS = [1.5, 1.7, 1.9] as const;           // step 0..2 (default 1)
export const MEASURES = { narrow: '68ch', wide: '92ch' } as const;
export const FONT_FAMILIES = { serif: 'var(--font-reading)', sans: 'var(--font-sans)' } as const;

export type FontSizeStep = 0 | 1 | 2 | 3 | 4;
export type LineHeightStep = 0 | 1 | 2;

export interface ReaderPrefs {
  fontSize: FontSizeStep;
  lineHeight: LineHeightStep;
  font: 'serif' | 'sans';
  width: 'narrow' | 'wide';
  /** Show images and media in the article body and the hero image. */
  images: boolean;
}

export const DEFAULT_READER_PREFS: ReaderPrefs = {
  fontSize: 2,
  lineHeight: 1,
  font: 'serif',
  width: 'narrow',
  images: true,
};

/** Inline CSS custom properties consumed by .reader-content (reader.css). */
export function readerPrefsToCssVars(prefs: ReaderPrefs): Record<string, string> {
  return {
    '--reader-font-size': `${FONT_SIZES[prefs.fontSize]}px`,
    '--reader-line-height': String(LINE_HEIGHTS[prefs.lineHeight]),
    '--reader-font': FONT_FAMILIES[prefs.font],
    '--reader-measure': MEASURES[prefs.width],
  };
}
