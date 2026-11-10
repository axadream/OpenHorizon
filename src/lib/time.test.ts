import { describe, expect, it } from 'vitest';
import { timeAgo } from './time';

const NOW = new Date(2026, 10, 10, 12, 0, 0).getTime();
const MIN = 60_000;

describe('timeAgo', () => {
  it('uses now, minutes, hours and days for recent times', () => {
    expect(timeAgo(NOW - 30_000, NOW)).toBe('now');
    expect(timeAgo(NOW + 5 * MIN, NOW)).toBe('now');
    expect(timeAgo(NOW - 5 * MIN, NOW)).toBe('5m');
    expect(timeAgo(NOW - 3 * 60 * MIN, NOW)).toBe('3h');
    expect(timeAgo(NOW - 2 * 24 * 60 * MIN, NOW)).toBe('2d');
  });

  it('uses a short date within the same year and adds the year otherwise', () => {
    expect(timeAgo(new Date(2026, 0, 3).getTime(), NOW)).toBe('Jan 3');
    expect(timeAgo(new Date(2025, 11, 25).getTime(), NOW)).toBe('Dec 25, 2025');
  });
});
