import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import { getSetting, setSetting } from '@/features/settings/settings';
import { clearApiKey, getApiKey, setApiKey } from './apiKey';

beforeEach(async () => {
  await db.settings.clear();
  sessionStorage.clear();
  await clearApiKey();
});

describe('API key storage', () => {
  it('keeps the key for this tab only when remembering is off', async () => {
    await setSetting('aiRememberKey', false);
    await setApiKey('  sk-session-only  ', false);

    expect(await getApiKey()).toBe('sk-session-only');
    expect(sessionStorage.getItem('oh-ai-key')).toBe('sk-session-only');
    expect(await getSetting('aiApiKey')).toBe('');
  });

  it('writes the key to the settings table only when remembering is on', async () => {
    await setSetting('aiRememberKey', true);
    await setApiKey('sk-remembered', true);

    expect(await getSetting('aiApiKey')).toBe('sk-remembered');
    expect(sessionStorage.getItem('oh-ai-key')).toBeNull();
    expect(await getApiKey()).toBe('sk-remembered');
  });

  it('clears the key from every place', async () => {
    await setSetting('aiRememberKey', true);
    await setApiKey('sk-gone', true);
    await clearApiKey();
    expect(await getSetting('aiApiKey')).toBe('');
    expect(await getApiKey()).toBe('');
  });
});
