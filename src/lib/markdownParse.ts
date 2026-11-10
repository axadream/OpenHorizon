/**
 * Pure parser for the small Markdown subset used by CHANGELOG.md: headings (#, ##, ###),
 * `- ` lists, paragraphs, **bold**, `code` and [text](url) links. Produces a plain AST, so
 * rendering never touches innerHTML. Link reference definitions ([x]: url) are dropped.
 */

export type MdInline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: MdInline[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; children: MdInline[] };

export type MdBlock =
  | { type: 'heading'; level: 1 | 2 | 3; children: MdInline[] }
  | { type: 'paragraph'; children: MdInline[] }
  | { type: 'list'; items: MdInline[][] };

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const BULLET_RE = /^[-*]\s+(.*)$/;
const REF_DEF_RE = /^\[[^\]]+\]:\s*\S+\s*$/;
const INLINE_RE = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
const SAFE_HREF_RE = /^https?:\/\/\S+$/i;

/** Only absolute http(s) links become anchors; anything else is kept as plain text. */
export function isSafeHref(href: string): boolean {
  return SAFE_HREF_RE.test(href);
}

/** Inline spans: `code`, **bold** and [text](url). Nested bold may contain links and code. */
export function parseInline(text: string): MdInline[] {
  const out: MdInline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_RE)) {
    const index = m.index ?? 0;
    if (index > last) out.push({ type: 'text', value: text.slice(last, index) });
    const [whole, code, bold, linkText, href] = m;
    if (code !== undefined) {
      out.push({ type: 'code', value: code });
    } else if (bold !== undefined) {
      out.push({ type: 'strong', children: parseInline(bold) });
    } else if (linkText !== undefined && href !== undefined) {
      out.push(
        isSafeHref(href)
          ? { type: 'link', href, children: parseInline(linkText) }
          : { type: 'text', value: whole },
      );
    }
    last = index + whole.length;
  }
  if (last < text.length) out.push({ type: 'text', value: text.slice(last) });
  return out;
}

function flushParagraph(blocks: MdBlock[], lines: string[]): void {
  if (lines.length === 0) return;
  blocks.push({ type: 'paragraph', children: parseInline(lines.join(' ')) });
  lines.length = 0;
}

function flushList(blocks: MdBlock[], items: string[]): void {
  if (items.length === 0) return;
  blocks.push({ type: 'list', items: items.map(parseInline) });
  items.length = 0;
}

/** Parse Markdown source into blocks. Blank lines end the current paragraph or list. */
export function parseMarkdownLite(source: string): MdBlock[] {
  const blocks: MdBlock[] = [];
  const para: string[] = [];
  const items: string[] = [];

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trimEnd();

    if (line.trim() === '' || REF_DEF_RE.test(line)) {
      flushParagraph(blocks, para);
      flushList(blocks, items);
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushParagraph(blocks, para);
      flushList(blocks, items);
      const level = Math.min(3, (heading[1] ?? '#').length) as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, children: parseInline(heading[2] ?? '') });
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      flushParagraph(blocks, para);
      items.push(bullet[1] ?? '');
      continue;
    }

    // Indented text right after a bullet continues that item.
    if (items.length > 0 && /^\s+\S/.test(line)) {
      items[items.length - 1] += ` ${line.trim()}`;
      continue;
    }

    flushList(blocks, items);
    para.push(line.trim());
  }

  flushParagraph(blocks, para);
  flushList(blocks, items);
  return blocks;
}
