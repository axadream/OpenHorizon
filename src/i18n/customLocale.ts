import { en } from './en';

/*
 * User-imported translation ("custom" locale). The pack is kept in localStorage so the inline boot
 * script in index.html can read its direction and tag before first paint (keep the key and shape in
 * step with that script). Page only; never imported by sw.ts.
 */

/** localStorage key of the imported translation pack. Shared with the boot script in index.html. */
export const CUSTOM_LOCALE_STORAGE_KEY = 'oh-custom-locale';

export interface CustomLocaleMeta {
  /** Display name shown in the language picker, e.g. "Deutsch". */
  name: string;
  /** BCP 47 tag used for dates and plural rules, e.g. "de" or "pt-BR". */
  tag: string;
  direction: 'ltr' | 'rtl';
}

export interface CustomLocalePack {
  meta: CustomLocaleMeta;
  messages: Record<string, string>;
}

/** Result of validating an imported file. `missing` are English base keys the file does not translate. */
export interface TranslationImport {
  pack: CustomLocalePack;
  missing: string[];
  /** Keys in the file that English does not have (kept out of the pack). */
  unknown: string[];
}

export class InvalidTranslationError extends Error {
  constructor(message = 'Invalid translation file') {
    super(message);
    this.name = 'InvalidTranslationError';
  }
}

const PLURAL_VARIANT = /^plural\.[^.]+\.(zero|one|two|few|many|other)$/;

function placeholders(text: string): string {
  return [...text.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1] ?? '')
    .sort()
    .join(',');
}

/** English `other` form of a plural variant key, or the key itself for a plain key. */
function englishReference(key: string): string | undefined {
  const dict = en as Record<string, string | undefined>;
  if (PLURAL_VARIANT.test(key)) return dict[`${key.replace(/\.[^.]+$/, '')}.other`];
  return dict[key];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The exportable English file: the same shape an import expects. */
export function buildExportFile(): string {
  const file: CustomLocalePack = {
    meta: { name: 'English', tag: 'en', direction: 'ltr' },
    messages: { ...en },
  };
  return JSON.stringify(file, null, 2);
}

/**
 * Validate a parsed JSON value as a translation file. Values must be strings and keep the English
 * placeholders of their key (a plural variant is checked against the English `other` form). Unknown
 * keys are dropped. Throws InvalidTranslationError when the shape is wrong.
 */
export function parseTranslationFile(raw: unknown): TranslationImport {
  if (!isPlainObject(raw) || !isPlainObject(raw.meta) || !isPlainObject(raw.messages)) {
    throw new InvalidTranslationError();
  }
  const name = typeof raw.meta.name === 'string' ? raw.meta.name.trim() : '';
  const tag = typeof raw.meta.tag === 'string' ? raw.meta.tag.trim() : '';
  if (!name || !tag || !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(tag)) throw new InvalidTranslationError();
  const direction = raw.meta.direction === 'rtl' ? 'rtl' : 'ltr';

  const messages: Record<string, string> = {};
  const unknown: string[] = [];
  for (const [key, value] of Object.entries(raw.messages)) {
    const reference = englishReference(key);
    if (reference === undefined) {
      unknown.push(key);
      continue;
    }
    if (typeof value !== 'string' || value.trim() === '') continue;
    if (placeholders(value) !== placeholders(reference)) continue;
    messages[key] = value;
  }

  const missing = Object.keys(en).filter((key) => !PLURAL_VARIANT.test(key) && !(key in messages));
  return { pack: { meta: { name, tag, direction }, messages }, missing, unknown };
}

/** The stored pack, or null when none is imported or the stored value is unreadable. */
export function loadCustomLocale(): CustomLocalePack | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CUSTOM_LOCALE_STORAGE_KEY);
    if (!raw) return null;
    return parseTranslationFile(JSON.parse(raw)).pack;
  } catch {
    return null;
  }
}

export function saveCustomLocale(pack: CustomLocalePack): void {
  localStorage.setItem(CUSTOM_LOCALE_STORAGE_KEY, JSON.stringify(pack));
}

export function clearCustomLocale(): void {
  localStorage.removeItem(CUSTOM_LOCALE_STORAGE_KEY);
}
