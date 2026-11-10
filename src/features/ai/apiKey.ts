import { setSetting, getSetting } from '@/features/settings/settings';

/*
 * API key storage. The key is kept in sessionStorage (this tab only) unless the user chose to
 * remember it, in which case it is written to the settings table. It is never logged, never put in
 * a URL, and never exported (the OPML export does not read settings at all).
 */

const SESSION_KEY = 'oh-ai-key';

/** Fallback when sessionStorage is unavailable (private modes, tests). Lives as long as the page. */
let memoryKey = '';

function sessionRead(): string {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? memoryKey;
  } catch {
    return memoryKey;
  }
}

function sessionWrite(value: string): void {
  memoryKey = value;
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, value);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Keep the memory copy only.
  }
}

/** The key the user entered, from wherever it is kept. '' when none. */
export async function getApiKey(): Promise<string> {
  if (await getSetting('aiRememberKey')) {
    const stored = await getSetting('aiApiKey');
    if (stored) return stored;
  }
  return sessionRead();
}

/** Store the key in the place the remember flag selects, and clear it from the other place. */
export async function setApiKey(key: string, remember: boolean): Promise<void> {
  const value = key.trim();
  if (remember) {
    await setSetting('aiApiKey', value);
    sessionWrite('');
  } else {
    await setSetting('aiApiKey', '');
    sessionWrite(value);
  }
}

export async function clearApiKey(): Promise<void> {
  await setSetting('aiApiKey', '');
  sessionWrite('');
}
