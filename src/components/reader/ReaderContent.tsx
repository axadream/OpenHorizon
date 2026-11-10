import { useMemo, type CSSProperties } from 'react';
import type { Article } from '@/db/schema';
import { sanitizeHtml } from '@/features/reader/sanitize';
import { readerPrefsToCssVars, type ReaderPrefs } from '@/features/reader/readerPrefs';
import { cn } from '@/lib/cn';

export interface ReaderContentProps {
  article: Article;
  prefs: ReaderPrefs;
  showImages: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sanitized article body (ARCHITECTURE §6.4). Raw HTML only reaches the DOM through
 * sanitizeHtml(). Plain-text summaries are escaped first, so they render as text.
 */
export function ReaderContent({ article, prefs, showImages }: ReaderContentProps) {
  const source = article.contentRaw.trim() ? article.contentRaw : `<p>${escapeHtml(article.summary)}</p>`;
  const html = useMemo(() => sanitizeHtml(source, article.link || undefined), [article.id, article.link, source]);

  const vars = readerPrefsToCssVars(prefs) as CSSProperties;

  return (
    <div
      className={cn(
        'reader-content',
        // Images, video and embeds are hidden with arbitrary variants. The important modifier is
        // needed because reader.css (unlayered) sets display on img.
        !showImages && '[&_img]:hidden! [&_picture]:hidden! [&_video]:hidden! [&_iframe]:hidden!',
      )}
      style={vars}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
