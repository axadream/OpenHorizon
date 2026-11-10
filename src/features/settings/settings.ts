import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import type { Settings, SettingRow } from '@/db/schema';
import { DEFAULT_SETTINGS } from './defaults';

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const row = await db.settings.get(key);
  return row ? (row.value as Settings[K]) : DEFAULT_SETTINGS[key];
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Promise<void> {
  const row = { key, value } as SettingRow;
  await db.settings.put(row);
}

export async function getAllSettings(): Promise<Settings> {
  const rows = await db.settings.toArray();
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    if (row.key in DEFAULT_SETTINGS) {
      (out as unknown as Record<string, unknown>)[row.key] = row.value;
    }
  }
  return out;
}

/** Live value of one setting; falls back to the default while loading. */
export function useSetting<K extends keyof Settings>(key: K): Settings[K] {
  return useLiveQuery(() => getSetting(key), [key], DEFAULT_SETTINGS[key]) as Settings[K];
}
