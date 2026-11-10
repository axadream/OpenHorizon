import { useState } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { t, useLocale, useT } from '@/i18n/i18n';
import { youtubeEmbedUrl, youtubeThumbnailUrl, youtubeWatchUrl } from '@/lib/youtube';

export interface VideoPlayerProps {
  videoId: string;
  title: string;
  /** Article thumbnail; falls back to YouTube's hqdefault image for the id. */
  thumbnailUrl?: string;
  /** False shows only the thumbnail link (no player at all). */
  embed: boolean;
}

/**
 * Privacy-first YouTube facade. Shows the thumbnail and a large play button; the iframe (and any
 * request to YouTube's player) is created only when the user activates it. "Open on YouTube" is
 * always available. Reduced motion is respected and every control is keyboard reachable.
 */
export function VideoPlayer({ videoId, title, thumbnailUrl, embed }: VideoPlayerProps) {
  useT();
  const locale = useLocale();
  const [playing, setPlaying] = useState(false);
  const thumb = thumbnailUrl || youtubeThumbnailUrl(videoId);
  const watch = youtubeWatchUrl(videoId);

  const openLink = (
    <a
      href={watch}
      target="_blank"
      rel="noopener noreferrer"
      className="focus-ring inline-flex items-center gap-1.5 rounded-xs px-1 text-accent hover:text-accent-hover"
    >
      {t('video.openOnYouTube')}
      <ExternalLink aria-hidden="true" size={14} strokeWidth={1.75} />
    </a>
  );

  return (
    <figure className="mx-auto mb-6 w-full max-w-[var(--reader-measure)]">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-panel ring-1 ring-border">
        {!embed ? (
          <a
            href={watch}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('video.openOnYouTube')}
            className="focus-ring group absolute inset-0 size-full"
          >
            <img
              src={thumb}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="size-full object-cover"
            />
          </a>
        ) : playing ? (
          <iframe
            src={youtubeEmbedUrl(videoId, locale)}
            title={t('video.iframeTitle', { title })}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
            loading="lazy"
            className="absolute inset-0 size-full border-0"
          />
        ) : (
          <button
            type="button"
            aria-label={t('video.playTitle', { title })}
            onClick={() => setPlaying(true)}
            className="focus-ring group absolute inset-0 size-full"
          >
            <img
              src={thumb}
              alt=""
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="size-full object-cover transition-[filter] duration-[var(--duration-base)] ease-standard group-hover:brightness-110 motion-reduce:transition-none"
            />
            <span aria-hidden="true" className="absolute inset-0 grid place-items-center">
              <span className="glass-strong grid size-16 place-items-center rounded-full text-text shadow-[var(--shadow-md)] transition-transform duration-[var(--duration-base)] ease-standard group-hover:scale-105 motion-reduce:transform-none">
                <Play size={28} strokeWidth={1.75} className="ms-1 fill-current" />
              </span>
            </span>
          </button>
        )}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
        {embed ? <span>{t('video.privacyNote')}</span> : <span />}
        {openLink}
      </figcaption>
    </figure>
  );
}
