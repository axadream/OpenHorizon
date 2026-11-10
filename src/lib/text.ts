const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  copy: '©',
  reg: '®',
  trade: '™',
  laquo: '«',
  raquo: '»',
  bull: '•',
  middot: '·',
};

const BLOCK_TAGS = /^(p|div|br|li|ul|ol|h[1-6]|tr|td|th|table|blockquote|pre|section|article|header|footer|figure|figcaption|dd|dt|dl)$/i;

/** Decode HTML entities in a single pass (named + decimal + hex). Unknown names are left as-is. */
export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/**
 * Remove HTML markup and return text. Script/style contents are dropped.
 * Block-level tags become spaces so adjacent paragraphs do not glue together.
 * Entities are NOT decoded here (see decodeEntities / cleanText).
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?([a-z][a-z0-9:-]*)\b[^>]*>/gi, (_m, tag: string) => (BLOCK_TAGS.test(tag) ? ' ' : ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Plain text for titles and snippets: strip markup, decode entities, collapse whitespace. */
export function cleanText(input: string | null | undefined): string {
  if (!input) return '';
  return decodeEntities(stripHtml(input)).replace(/\s+/g, ' ').trim();
}

/** Truncate to at most `max` characters (including the ellipsis). */
export function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return s.slice(0, Math.max(0, max));
  return s.slice(0, max - 1).trimEnd() + '…';
}

/** Escape text for use in XML/HTML text nodes and attribute values. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const MAX_CONTENT_CHARS = 1_000_000;

/** Cap stored HTML at 1,000,000 characters, appending a visible marker when cut. */
export function capContent(html: string): string {
  if (html.length <= MAX_CONTENT_CHARS) return html;
  return html.slice(0, MAX_CONTENT_CHARS) + '<p>…</p>';
}

/** Title with fallbacks: summary-derived (80 chars + ellipsis), then "(untitled)". Max 500 chars. */
export function finishTitle(title: string, summary: string): string {
  const t = title || (summary ? truncate(summary, 81) : '') || '(untitled)';
  return truncate(t, 500);
}
