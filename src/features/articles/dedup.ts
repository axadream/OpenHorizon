import { fnv1a32 } from '@/lib/hash';
import { normalizeArticleUrl } from '@/lib/url';
import type { ParsedItem } from '@/lib/parser/types';

export interface GuidInput {
  id?: string | null;
  link?: string | null;
  title: string;
  publishedAt: number | null;
}

/**
 * Dedup key of an item (ARCHITECTURE §2.3):
 * 1. trimmed feed id (RSS guid, Atom id, RDF about, JSON id) when non-empty;
 * 2. else the normalized absolute link;
 * 3. else "h:" + fnv1a32(lowercased trimmed title + "|" + publishedAt).
 * Unique per feed, not globally.
 */
export function computeGuid(item: GuidInput): string {
  const id = (item.id ?? '').trim();
  if (id) return id;
  const link = (item.link ?? '').trim();
  if (link) return normalizeArticleUrl(link);
  return 'h:' + fnv1a32(item.title.trim().toLowerCase() + '|' + (item.publishedAt ?? ''));
}

/** Within one fetch, items that collapse to the same guid: keep the first. */
export function dedupeWithinFetch<T extends Pick<ParsedItem, 'guid'>>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    if (seen.has(it.guid)) continue;
    seen.add(it.guid);
    out.push(it);
  }
  return out;
}
