import { describe, expect, it } from 'vitest';
import { formatBytes } from './bytes';

describe('formatBytes', () => {
  it('shows bytes below one kibibyte as whole bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023.4)).toBe('1023 B');
  });

  it('uses one decimal below 100 and whole numbers from 100 up', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(12.3 * 1024 * 1024)).toBe('12.3 MB');
    expect(formatBytes(150 * 1024)).toBe('150 KB');
    expect(formatBytes(5.1 * 1024 ** 3)).toBe('5.1 GB');
  });

  it('moves to the next unit exactly at each boundary and drops a trailing .0', () => {
    expect(formatBytes(1024 ** 2)).toBe('1 MB');
    expect(formatBytes(1.5 * 1024 ** 2)).toBe('1.5 MB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2 GB');
  });

  it('falls back to "0 B" for invalid input', () => {
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(Number.NaN)).toBe('0 B');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('0 B');
  });
});
