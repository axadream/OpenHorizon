const TRACKER = /pixel|tracker|1x1|spacer/i;
const MIN_IMAGE_PX = 48;

/** Attributes of an <img ...> tag, lower-cased names. */
function imgAttrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z][a-zA-Z0-9:_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? '';
  }
  return out;
}

function tooSmall(a: Record<string, string>): boolean {
  const w = parseInt(a.width ?? '', 10);
  const h = parseInt(a.height ?? '', 10);
  return (Number.isFinite(w) && w < MIN_IMAGE_PX) || (Number.isFinite(h) && h < MIN_IMAGE_PX);
}

/**
 * First usable <img> source in an HTML fragment (raw, possibly relative; callers resolve it).
 * Skips data: URIs (except via data-src), tracking pixels and images smaller than 48px.
 */
export function firstImgSrc(html: string): string | null {
  if (!html) return null;
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const a = imgAttrs(tag);
    if (tooSmall(a)) continue;
    let src = (a.src ?? '').trim();
    if (!src || src.toLowerCase().startsWith('data:')) src = (a['data-src'] ?? '').trim();
    if (!src || src.toLowerCase().startsWith('data:') || TRACKER.test(src)) continue;
    return src;
  }
  return null;
}

export function isImageType(type: string | null | undefined): boolean {
  return !!type && type.toLowerCase().startsWith('image/');
}

/** Pick the candidate with the largest width (candidates without width count as 0; first wins ties). */
export function largestByWidth<T extends { width?: number }>(items: T[]): T | undefined {
  let best: T | undefined;
  for (const it of items) {
    if (!best || (it.width ?? 0) > (best.width ?? 0)) best = it;
  }
  return best;
}

/** Parse a non-negative integer attribute value (enclosure length, width). */
export function toInt(v: string | null | undefined): number | undefined {
  if (!v) return undefined;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
