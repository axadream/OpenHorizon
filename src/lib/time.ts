const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const SHORT_DATE_YEAR = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Compact relative time: "now", "5m", "3h", "2d", then "Nov 10" (same year) or "Nov 10, 2025".
 * Future timestamps read as "now".
 */
export function timeAgo(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  if (diff < MINUTE) return 'now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d`;
  const d = new Date(ts);
  const n = new Date(now);
  return d.getFullYear() === n.getFullYear() ? SHORT_DATE.format(d) : SHORT_DATE_YEAR.format(d);
}

/** Full locale date and time, used for tooltips and aria labels. */
export function formatFull(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(ts);
}
