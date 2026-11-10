import { useMemo, type CSSProperties } from 'react';
import type { Article } from '@/db/schema';
import { VideoPlayer } from '@/components/reader/VideoPlayer';
import { sanitizeHtml } from '@/features/reader/sanitize';
import { readerPrefsToCssVars, type ReaderPrefs } from '@/features/reader/readerPrefs';
import { cn } from '@/lib/cn';
import { youTubeVideoIdOf } from '@/lib/youtube';

export interface ReaderContentProps {
  article: Article;
  prefs: ReaderPrefs;
  showImages: boolean;
  /** Show the stored full article text (when loaded) instead of the feed text. */
  useFull?: boolean;
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
 * For YouTube video links the privacy-first player sits above the body, and embedded YouTube
 * iframes in the body are dropped so there is only one player.
 */
export function ReaderContent({ article, prefs, showImages, useFull = false }: ReaderContentProps) {
  const videoId = youTubeVideoIdOf(article.link);
  const body = useFull && article.fullContent ? article.fullContent : article.contentRaw;
  const source = body.trim() ? body : `<p>${escapeHtml(article.summary)}</p>`;
  const html = useMemo(
    () => sanitizeHtml(source, article.link || undefined, { dropYouTubeEmbeds: videoId !== null }),
    [article.id, article.link, source, videoId],
  );

  const vars = readerPrefsToCssVars(prefs) as CSSProperties;

  return (
    <>
      {videoId ? (
        <VideoPlayer videoId={videoId} title={article.title} thumbnailUrl={article.thumbnailUrl} embed={prefs.embedVideos} />
      ) : null}
      <div
        dir="auto"
        className={cn(
          'reader-content',
          // Images, video and embeds are hidden with arbitrary variants. The important modifier is
          // needed because reader.css (unlayered) sets display on img.
          !showImages && '[&_img]:hidden! [&_picture]:hidden! [&_video]:hidden! [&_iframe]:hidden!',
        )}
        style={vars}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
