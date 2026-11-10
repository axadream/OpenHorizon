import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { DEFAULT_SETTINGS } from './defaults';
import { getAllSettings, getSetting, setSetting } from './settings';

describe('settings', () => {
  beforeEach(async () => {
    await db.settings.clear();
  });

  it('returns defaults when nothing is stored', async () => {
    expect(await getSetting('syncFrequency')).toBe('30m');
    expect(await getSetting('retentionPerFeed')).toBe(200);
    expect(await getSetting('lastSyncAt')).toBeNull();
    expect(await getAllSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips typed values through the settings table', async () => {
    await setSetting('syncFrequency', '1h');
    await setSetting('notificationsEnabled', true);
    await setSetting('retentionPerFeed', 500);
    await setSetting('lastSyncAt', 1234);

    expect(await getSetting('syncFrequency')).toBe('1h');
    expect(await getSetting('notificationsEnabled')).toBe(true);
    expect(await getSetting('retentionPerFeed')).toBe(500);

    const all = await getAllSettings();
    expect(all.lastSyncAt).toBe(1234);
    expect(all.density).toBe('comfortable');
  });

  it('overwrites an existing value with put semantics', async () => {
    await setSetting('density', 'compact');
    await setSetting('density', 'comfortable');
    expect(await getSetting('density')).toBe('comfortable');
    expect(await db.settings.count()).toBe(1);
  });
});
