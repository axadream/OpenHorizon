import { getLocale, t } from '@/i18n/i18n';
import { intlTag } from '@/i18n/locale';
import type { Locale } from '@/i18n/types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Formatters per locale, created on first use. */
const shortDates = new Map<string, { day: Intl.DateTimeFormat; dayYear: Intl.DateTimeFormat }>();

function dateFormats(locale: Locale): { day: Intl.DateTimeFormat; dayYear: Intl.DateTimeFormat } {
  const tag = intlTag(locale);
  let entry = shortDates.get(tag);
  if (!entry) {
    entry = {
      day: new Intl.DateTimeFormat(tag, { month: 'short', day: 'numeric' }),
      dayYear: new Intl.DateTimeFormat(tag, { month: 'short', day: 'numeric', year: 'numeric' }),
    };
    shortDates.set(tag, entry);
  }
  return entry;
}

/**
 * Compact relative time: "now", "5m", "3h", "2d", then a short date (same year) or a date with the
 * year. Units and dates follow the active locale unless `locale` is given. Future timestamps read as "now".
 */
export function timeAgo(ts: number, now: number = Date.now(), locale: Locale = getLocale()): string {
  const diff = now - ts;
  if (diff < MINUTE) return t('time.now');
  if (diff < HOUR) return t('time.minutes', { count: Math.floor(diff / MINUTE) });
  if (diff < DAY) return t('time.hours', { count: Math.floor(diff / HOUR) });
  if (diff < 7 * DAY) return t('time.days', { count: Math.floor(diff / DAY) });
  const d = new Date(ts);
  const n = new Date(now);
  const formats = dateFormats(locale);
  return d.getFullYear() === n.getFullYear() ? formats.day.format(d) : formats.dayYear.format(d);
}

/** Full locale date and time, used for tooltips and aria labels. */
export function formatFull(ts: number, locale: Locale = getLocale()): string {
  return new Intl.DateTimeFormat(intlTag(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(ts);
}
