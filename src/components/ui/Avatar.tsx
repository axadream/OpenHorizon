import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';

export interface FeedAvatarProps {
  /** Feed title; used for the letter fallback and its hue. */
  title: string;
  /** Primary image URL (favicon). */
  src?: string;
  /** Further candidates tried in order after `src` fails. */
  fallbackSrcs?: string[];
  /** Square size in px. Rows use 20, reader meta uses 16. */
  size?: number;
  className?: string;
}

/** FNV-1a 32-bit hash, used only to derive a stable hue for letter avatars. */
function hueOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 360;
}

/**
 * Feed favicon with fallbacks: tries src, then each fallback on error, and finally a
 * letter avatar. Decorative (alt="") because the feed title is rendered next to it.
 */
export function FeedAvatar({ title, src, fallbackSrcs = [], size = 20, className }: FeedAvatarProps) {
  const candidates = [src, ...fallbackSrcs].filter((s): s is string => !!s);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [src]);

  const current = candidates[index];
  const letter = (title.trim().charAt(0) || '?').toUpperCase();
  const box = { width: size, height: size };

  if (!current) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex shrink-0 items-center justify-center rounded-xs text-[10px] font-semibold text-text-muted',
          className,
        )}
        style={{ ...box, background: `hsl(${hueOf(title)} 25% 30%)` }}
      >
        {letter}
      </span>
    );
  }

  return (
    <img
      key={current}
      src={current}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      data-fallback-index={index}
      onError={() => setIndex((i) => i + 1)}
      className={cn('shrink-0 rounded-xs bg-card object-cover', className)}
      style={box}
    />
  );
}
