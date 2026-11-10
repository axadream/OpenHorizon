import { db } from '@/db/db';
import type { Feed, Folder } from '@/db/schema';
import { hostname } from '@/lib/url';

export interface OpmlExportResult {
  xml: string;
  feedCount: number;
  folderCount: number;
  /** Manual feeds (pasted XML, no URL) are not exported. */
  skippedManual: number;
}

/** Escape for XML attribute values (also keeps newlines and tabs from being normalized away). */
function escAttr(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;')
    .replace(/\t/g, '&#9;');
}

function feedLine(f: Feed): string {
  const url = f.url;
  const title = escAttr(f.title || hostname(url) || url);
  const html = f.siteUrl ? ` htmlUrl="${escAttr(f.siteUrl)}"` : '';
  return `<outline type="rss" text="${title}" title="${title}" xmlUrl="${escAttr(url)}"${html}/>`;
}

export async function exportOpmlWithStats(now: Date = new Date()): Promise<OpmlExportResult> {
  const [folders, feeds] = await Promise.all([
    db.folders.orderBy('sortOrder').toArray(),
    db.feeds.toArray(),
  ]);

  const exportable = feeds.filter((f) => f.manual !== 1 && !f.url.startsWith('manual:'));
  const skippedManual = feeds.length - exportable.length;
  const folderIds = new Set(folders.map((f: Folder) => f.id));

  // Group feeds by folder; feeds pointing at a missing folder count as unfiled.
  const byFolder = new Map<string | null, Feed[]>();
  for (const f of exportable) {
    const key = f.folderId && folderIds.has(f.folderId) ? f.folderId : null;
    const list = byFolder.get(key) ?? [];
    list.push(f);
    byFolder.set(key, list);
  }
  for (const list of byFolder.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    '    <title>OpenHorizon subscriptions</title>',
    `    <dateCreated>${now.toUTCString()}</dateCreated>`,
    '  </head>',
    '  <body>',
  ];

  for (const folder of folders) {
    const name = escAttr(folder.name);
    const kids = byFolder.get(folder.id) ?? [];
    if (kids.length === 0) {
      lines.push(`    <outline text="${name}" title="${name}"></outline>`);
      continue;
    }
    lines.push(`    <outline text="${name}" title="${name}">`);
    for (const f of kids) lines.push(`      ${feedLine(f)}`);
    lines.push('    </outline>');
  }

  for (const f of byFolder.get(null) ?? []) lines.push(`    ${feedLine(f)}`);

  lines.push('  </body>', '</opml>', '');

  return {
    xml: lines.join('\n'),
    feedCount: exportable.length,
    folderCount: folders.length,
    skippedManual,
  };
}

/** Full OPML document as a string. Caller downloads it as `openhorizon-YYYY-MM-DD.opml`. */
export async function exportOpml(): Promise<string> {
  return (await exportOpmlWithStats()).xml;
}
