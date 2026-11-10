import { describe, expect, it } from 'vitest';
import { PERSIST_RETRY_MS, shouldAskForPersistence } from './storage';

const DAY = 24 * 60 * 60 * 1000;

describe('shouldAskForPersistence', () => {
  const now = 1_000_000_000_000;

  it('asks when the app has never asked', () => {
    expect(shouldAskForPersistence(null, now)).toBe(true);
  });

  it('does not ask again within 14 days', () => {
    expect(shouldAskForPersistence(now - DAY, now)).toBe(false);
    expect(shouldAskForPersistence(now - (PERSIST_RETRY_MS - 1), now)).toBe(false);
  });

  it('asks again once 14 days have passed', () => {
    expect(PERSIST_RETRY_MS).toBe(14 * DAY);
    expect(shouldAskForPersistence(now - PERSIST_RETRY_MS, now)).toBe(true);
  });

  it('asks when the stored timestamp is in the future (clock moved back)', () => {
    expect(shouldAskForPersistence(now + DAY, now)).toBe(true);
  });
});
