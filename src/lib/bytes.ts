const UNITS = ['KB', 'MB', 'GB', 'TB', 'PB'] as const;

/**
 * Human-readable byte count with binary steps: 512 -> "512 B", 12.3 MB -> "12.3 MB".
 * One decimal below 100 in each unit, whole numbers from 100 up. Invalid or negative input reads as "0 B".
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit++;
  } while (value >= 1024 && unit < UNITS.length - 1);
  const digits = value < 100 ? 1 : 0;
  return `${Number(value.toFixed(digits))} ${UNITS[unit]}`;
}
