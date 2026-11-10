import { describe, expect, it } from 'vitest';
import {
  computeSwipeOffset,
  isSwipeArmed,
  isTouchPointer,
  pullDistance,
  shouldLockHorizontal,
  swipeProgress,
  swipeThreshold,
} from './gesture';

describe('computeSwipeOffset', () => {
  // Row width 300, ratio 0.3 gives a 90 px threshold.
  it('follows the finger 1:1 inside the threshold', () => {
    expect(computeSwipeOffset(50, 300, 0.3)).toBe(50);
    expect(computeSwipeOffset(-50, 300, 0.3)).toBe(-50);
    expect(computeSwipeOffset(90, 300, 0.3)).toBe(90);
    expect(computeSwipeOffset(0, 300, 0.3)).toBe(0);
  });

  it('rubber-bands beyond the threshold: threshold + (dx - threshold) * 0.35', () => {
    // 90 + (150 - 90) * 0.35 = 111
    expect(computeSwipeOffset(150, 300, 0.3)).toBeCloseTo(111, 6);
    expect(computeSwipeOffset(-150, 300, 0.3)).toBeCloseTo(-111, 6);
    // 90 + (300 - 90) * 0.35 = 163.5
    expect(computeSwipeOffset(300, 300, 0.3)).toBeCloseTo(163.5, 6);
  });

  it('uses the default ratio of 0.3 when none is given', () => {
    expect(computeSwipeOffset(150, 300)).toBeCloseTo(111, 6);
  });

  it('treats an unmeasured row (width 0) as a zero threshold', () => {
    expect(computeSwipeOffset(100, 0, 0.3)).toBeCloseTo(35, 6);
  });
});

describe('swipeThreshold and swipeProgress', () => {
  it('scales the threshold with the row width', () => {
    expect(swipeThreshold(300, 0.3)).toBeCloseTo(90, 6);
    expect(swipeThreshold(-10, 0.3)).toBe(0);
  });

  it('reports progress clamped to 0..1', () => {
    expect(swipeProgress(45, 300, 0.3)).toBeCloseTo(0.5, 6);
    expect(swipeProgress(-45, 300, 0.3)).toBeCloseTo(0.5, 6);
    expect(swipeProgress(400, 300, 0.3)).toBe(1);
    expect(swipeProgress(0, 300, 0.3)).toBe(0);
  });
});

describe('isSwipeArmed', () => {
  it('arms exactly at the threshold, in either direction', () => {
    expect(isSwipeArmed(89, 300, 0.3)).toBe(false);
    expect(isSwipeArmed(90, 300, 0.3)).toBe(true);
    expect(isSwipeArmed(-90, 300, 0.3)).toBe(true);
    expect(isSwipeArmed(-89, 300, 0.3)).toBe(false);
  });

  it('never arms without any movement', () => {
    expect(isSwipeArmed(0, 0, 0.3)).toBe(false);
  });
});

describe('shouldLockHorizontal', () => {
  it('locks only after more than 10 px and more than 1.5x the vertical travel', () => {
    expect(shouldLockHorizontal(12, 5)).toBe(true);
    expect(shouldLockHorizontal(-30, 10)).toBe(true);
    expect(shouldLockHorizontal(10, 0)).toBe(false); // not more than 10 px
    expect(shouldLockHorizontal(12, 10)).toBe(false); // 12 is not more than 15
    expect(shouldLockHorizontal(4, 0)).toBe(false);
  });
});

describe('pullDistance', () => {
  it('applies 0.5 resistance to downward travel', () => {
    expect(pullDistance(100)).toBe(50);
    expect(pullDistance(141)).toBe(70.5);
  });

  it('ignores upward and zero travel', () => {
    expect(pullDistance(-20)).toBe(0);
    expect(pullDistance(0)).toBe(0);
  });
});

describe('isTouchPointer', () => {
  it('accepts touch and pen, rejects mouse', () => {
    expect(isTouchPointer('touch')).toBe(true);
    expect(isTouchPointer('pen')).toBe(true);
    expect(isTouchPointer('mouse')).toBe(false);
    expect(isTouchPointer('')).toBe(false);
  });
});
