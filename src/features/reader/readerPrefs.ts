/** Reader preferences (DESIGN §2.4). Persisted by the UI store under localStorage 'oh-ui'. */

export const FONT_SIZES = [15, 17, 19, 21, 24] as const;        // px, step 0..4 (default 2)
export const LINE_HEIGHTS = [1.5, 1.7, 1.9] as const;           // step 0..2 (default 1)
export const MEASURES = { narrow: '68ch', wide: '92ch' } as const;

/** Reader body fonts, in the order the switch shows them. Same list as the UI font setting. */
export const READER_FONTS = ['serif', 'sans', 'mono', 'dyslexic'] as const;
export type ReaderFont = (typeof READER_FONTS)[number];

export const FONT_FAMILIES: Record<ReaderFont, string> = {
  serif: 'var(--font-reading)',
  sans: 'var(--font-sans-base)',
  mono: 'var(--font-mono)',
  dyslexic: 'var(--font-dyslexic)',
};

export type FontSizeStep = 0 | 1 | 2 | 3 | 4;
export type LineHeightStep = 0 | 1 | 2;

export interface ReaderPrefs {
  fontSize: FontSizeStep;
  lineHeight: LineHeightStep;
  font: ReaderFont;
  width: 'narrow' | 'wide';
  /** Show images and media in the article body and the hero image. */
  images: boolean;
  /** Hold a screen wake lock while an article is open in the reader (where the browser supports it). */
  keepScreenOn: boolean;
}

export const DEFAULT_READER_PREFS: ReaderPrefs = {
  fontSize: 2,
  lineHeight: 1,
  font: 'serif',
  width: 'narrow',
  images: true,
  keepScreenOn: true,
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
