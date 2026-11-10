import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from '@/features/reader/sanitize';
import { youtubeEmbedUrl } from '@/lib/youtube';

const EMBED = '<p>Intro</p><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" width="560" height="315"></iframe><p>After</p>';

describe('youtubeEmbedUrl', () => {
  it('uses the privacy-enhanced host with the reader parameters and the UI locale', () => {
    const url = new URL(youtubeEmbedUrl('dQw4w9WgXcQ', 'ro'));
    expect(url.origin).toBe('https://www.youtube-nocookie.com');
    expect(url.pathname).toBe('/embed/dQw4w9WgXcQ');
    expect(url.searchParams.get('autoplay')).toBe('1');
    expect(url.searchParams.get('rel')).toBe('0');
    expect(url.searchParams.get('modestbranding')).toBe('1');
    expect(url.searchParams.get('playsinline')).toBe('1');
    expect(url.searchParams.get('hl')).toBe('ro');
  });
});

describe('sanitizeHtml with dropYouTubeEmbeds', () => {
  it('keeps YouTube iframes by default (the body keeps its own embed)', () => {
    expect(sanitizeHtml(EMBED, 'https://example.com/')).toContain('<iframe');
  });

  it('removes YouTube iframes when the reader mounts its own player', () => {
    const out = sanitizeHtml(EMBED, 'https://example.com/', { dropYouTubeEmbeds: true });
    expect(out).not.toContain('<iframe');
    expect(out).toContain('Intro');
    expect(out).toContain('After');
  });
});
