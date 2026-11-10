import { useSyncExternalStore } from 'react';
import { en, type MessageKey } from './en';
import { translate } from './format';
import { directionOf } from './locale';
import type { Locale, MessageParams, Messages, PluralCategory } from './types';

/*
 * Runtime translation. en is bundled; ro and ar load with dynamic import() from page code only
 * (never from the service worker) and English is shown until they arrive. Not for use in sw.ts.
 */

type Dictionary = Messages<typeof en>;

/** `plural.x.one` gives `plural.x` (distributes over every plural variant key). */
type PluralBaseOf<K> = K extends `plural.${infer Group}.${PluralCategory}` ? `plural.${Group}` : never;
type PluralBase = PluralBaseOf<MessageKey>;

/** Any key `t` accepts: a message key, or the base of a plural group (picked by `count`). */
export type TranslationKey = MessageKey | PluralBase;

const loaders: Record<Locale, () => Promise<Dictionary>> = {
  en: () => Promise.resolve(en),
  ro: () => import('./ro').then((m) => m.ro),
  ar: () => import('./ar').then((m) => m.ar),
};

const english: Dictionary = en;
const dictionaries: Partial<Record<Locale, Dictionary>> = { en: english };
let current: Locale = 'en';
let requested: Locale = 'en';
const listeners = new Set<() => void>();

function applyDocumentLocale(locale: Locale): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.lang = locale;
  root.dir = directionOf(locale);
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

/**
 * Switch the UI language. Resolves once the dictionary is loaded and applied. A later call
 * supersedes an earlier one still loading. A failed load falls back to English.
 */
export async function setLocale(next: Locale): Promise<void> {
  requested = next;
  if (!dictionaries[next]) {
    try {
      dictionaries[next] = await loaders[next]();
    } catch {
      if (requested === next) {
        current = 'en';
        applyDocumentLocale('en');
        notify();
      }
      return;
    }
  }
  if (requested !== next) return;
  const changed = current !== next;
  current = next;
  applyDocumentLocale(next);
  if (changed) notify();
}

/** Active locale (synchronous; reflects the last dictionary that finished loading). */
export function getLocale(): Locale {
  return current;
}

/** Translate a key in the active locale. Falls back to English, then to the key itself. */
export function t(key: TranslationKey, params?: MessageParams): string {
  return translate(dictionaries[current], english, current, key, params);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Subscribes the caller to locale changes and returns the translator. */
export function useT(): typeof t {
  useLocale();
  return t;
}

/** The active locale; re-renders the caller when it changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale, () => 'en');
}

/** True when the active locale is written right to left. */
export function useIsRtl(): boolean {
  return directionOf(useLocale()) === 'rtl';
}
