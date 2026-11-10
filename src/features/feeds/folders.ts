import { db } from '@/db/db';
import type { Folder } from '@/db/schema';

function cleanName(name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('Folder name is required');
  return clean;
}

/**
 * Create a folder, or return the existing one with the same name (case-insensitive).
 * Used by OPML import, so repeated names never duplicate folders.
 */
export async function createFolder(name: string): Promise<Folder> {
  const clean = cleanName(name);
  const all = await db.folders.toArray();
  const lower = clean.toLocaleLowerCase();
  const existing = all.find((f) => f.name.toLocaleLowerCase() === lower);
  if (existing) return existing;

  const now = Date.now();
  const maxSort = all.reduce((m, f) => Math.max(m, f.sortOrder), 0);
  const folder: Folder = {
    id: crypto.randomUUID(),
    name: clean,
    sortOrder: Math.max(now, maxSort + 1),
    collapsed: 0,
    createdAt: now,
  };
  await db.folders.add(folder);
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const clean = cleanName(name);
  const lower = clean.toLocaleLowerCase();
  const clash = (await db.folders.toArray()).find((f) => f.id !== id && f.name.toLocaleLowerCase() === lower);
  if (clash) throw new Error(`A folder named "${clean}" already exists`);
  await db.folders.update(id, { name: clean });
}

export async function setFolderCollapsed(id: string, collapsed: boolean): Promise<void> {
  await db.folders.update(id, { collapsed: collapsed ? 1 : 0 });
}

/** Delete a folder; its feeds become unfiled. Returns how many feeds were moved. */
export async function deleteFolder(id: string): Promise<number> {
  return db.transaction('rw', [db.folders, db.feeds], async () => {
    const moved = await db.feeds.where('folderId').equals(id).modify({ folderId: null });
    await db.folders.delete(id);
    return moved;
  });
}

/** Move a feed to a folder (or unfiled with null); the feed goes to the end of that folder. */
export async function moveFeedToFolder(feedId: string, folderId: string | null): Promise<void> {
  const now = Date.now();
  await db.feeds.update(feedId, { folderId, sortOrder: now, updatedAt: now });
}
