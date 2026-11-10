import { describe, expect, it } from 'vitest';
import { parseDate } from './dates';

const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);

describe('parseDate', () => {
  it('parses RFC 822 and RFC 3339 forms', () => {
    expect(parseDate('Tue, 10 Nov 2026 09:30:00 GMT', NOW)).toBe(Date.UTC(2026, 10, 10, 9, 30));
    expect(parseDate('2026-11-07T18:15:00+01:00', NOW)).toBe(Date.UTC(2026, 10, 7, 17, 15));
  });

  it('repairs US zone abbreviations', () => {
    expect(parseDate('Mon, 09 Nov 2026 10:00:00 EST', NOW)).toBe(Date.UTC(2026, 10, 9, 15, 0));
    expect(parseDate('Mon, 09 Nov 2026 10:00:00 PDT', NOW)).toBe(Date.UTC(2026, 10, 9, 17, 0));
  });

  it('repairs "UT" and "YYYY-MM-DD HH:mm:ss" and "dd Mon yyyy"', () => {
    expect(parseDate('Mon, 09 Nov 2026 10:00:00 UT', NOW)).toBe(Date.UTC(2026, 10, 9, 10, 0));
    expect(parseDate('2026-11-09 10:00:00', NOW)).toBe(new Date(2026, 10, 9, 10, 0, 0).getTime());
    // V8 accepts this form natively as local midnight; the repair path is only a fallback.
    expect(parseDate('09 Nov 2026', NOW)).toBe(new Date(2026, 10, 9).getTime());
  });

  it('returns null for empty, unparseable, too old, or too far in the future', () => {
    expect(parseDate(undefined, NOW)).toBeNull();
    expect(parseDate('   ', NOW)).toBeNull();
    expect(parseDate('not a date', NOW)).toBeNull();
    expect(parseDate('1980-01-01T00:00:00Z', NOW)).toBeNull();
    expect(parseDate('2030-01-01T00:00:00Z', NOW)).toBeNull();
  });

  it('clamps dates in the near future (up to 2 days ahead) to now', () => {
    expect(parseDate('2026-11-11T12:00:00Z', NOW)).toBe(NOW);
  });
});
