const MIN_YEAR = 1990;
const FUTURE_TOLERANCE_MS = 2 * 24 * 3600 * 1000;

/** Common North American zone abbreviations that Date.parse does not understand. */
const ZONES: Record<string, string> = {
  UT: 'UTC',
  GMT: 'GMT',
  UTC: 'UTC',
  Z: 'Z',
  EST: '-0500',
  EDT: '-0400',
  CST: '-0600',
  CDT: '-0500',
  MST: '-0700',
  MDT: '-0600',
  PST: '-0800',
  PDT: '-0700',
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function tryParse(s: string): number {
  return Date.parse(s);
}

function repairs(s: string): string[] {
  const out: string[] = [];
  // strip leading weekday: "Tue, 10 Nov 2026 ..." -> "10 Nov 2026 ..."
  const noWeekday = s.replace(/^[A-Za-z]{3,9},?\s+/, '');
  out.push(noWeekday);
  // "UT" zone name
  out.push(noWeekday.replace(/\bUT$/, 'UTC'));
  // named zone at the end: "... 12:00:00 EST" -> "... 12:00:00 -0500"
  const zone = noWeekday.match(/\s([A-Za-z]{1,4})$/);
  if (zone && ZONES[zone[1].toUpperCase()] !== undefined) {
    out.push(noWeekday.replace(/\s([A-Za-z]{1,4})$/, ' ' + ZONES[zone[1].toUpperCase()]));
  }
  // "YYYY-MM-DD HH:mm:ss" -> ISO-like with T
  out.push(noWeekday.replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, '$1T$2'));
  // "dd Mon yyyy" without a time
  const dmy = noWeekday.match(/^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})$/);
  if (dmy) {
    const idx = MONTHS.indexOf(dmy[2].toLowerCase());
    if (idx >= 0) out.push(`${dmy[3]}-${String(idx + 1).padStart(2, '0')}-${dmy[1].padStart(2, '0')}T00:00:00Z`);
  }
  return out;
}

/**
 * Parse a feed date (RFC 822/2822, RFC 3339/ISO 8601 and common quirks) to epoch ms.
 * Returns null when unparseable, before 1990, or more than 2 days in the future.
 * Dates up to 2 days ahead are clamped to `now`.
 */
export function parseDate(input: string | null | undefined, now: number = Date.now()): number | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;

  let ms = tryParse(s);
  if (Number.isNaN(ms)) {
    for (const candidate of repairs(s)) {
      ms = tryParse(candidate);
      if (!Number.isNaN(ms)) break;
    }
  }
  if (Number.isNaN(ms)) return null;
  if (new Date(ms).getUTCFullYear() < MIN_YEAR) return null;
  if (ms > now + FUTURE_TOLERANCE_MS) return null;
  return ms > now ? now : ms;
}
