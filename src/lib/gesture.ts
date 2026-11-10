/*
 * Pure helpers for the touch gesture hooks (src/hooks/useLongPress, useSwipeActions,
 * usePullToRefresh). No React and no DOM reads, so they are unit-tested directly.
 */

/** Share of the finger travel past the commit threshold that the row actually moves. */
export const RUBBER_BAND = 0.35;

/** Horizontal travel (px) a row needs before it locks to a horizontal swipe. */
export const SWIPE_LOCK_PX = 10;

/** Indicator travel per pixel of finger travel while pulling to refresh. */
export const PULL_RESISTANCE = 0.5;

/** Pen counts as touch: both report contact-driven gestures without a hover state. */
export function isTouchPointer(pointerType: string): boolean {
  return pointerType === 'touch' || pointerType === 'pen';
}

/** Commit threshold in px for a row of the given width. */
export function swipeThreshold(width: number, thresholdRatio: number): number {
  return Math.max(0, width) * thresholdRatio;
}

/**
 * Translate for the row content. Inside the threshold the row follows the finger 1:1; beyond it
 * the extra travel is rubber-banded: threshold + (|dx| - threshold) * 0.35, keeping the sign.
 */
export function computeSwipeOffset(dx: number, width: number, thresholdRatio = 0.3): number {
  const threshold = swipeThreshold(width, thresholdRatio);
  const magnitude = Math.abs(dx);
  if (magnitude <= threshold) return dx;
  const eased = threshold + (magnitude - threshold) * RUBBER_BAND;
  return dx < 0 ? -eased : eased;
}

/** Raw travel relative to the threshold, clamped to 0..1. Drives the action background opacity. */
export function swipeProgress(dx: number, width: number, thresholdRatio = 0.3): number {
  const threshold = swipeThreshold(width, thresholdRatio);
  if (threshold <= 0) return dx === 0 ? 0 : 1;
  return Math.min(1, Math.abs(dx) / threshold);
}

/** True once the raw travel has reached the commit threshold (and the finger has moved at all). */
export function isSwipeArmed(dx: number, width: number, thresholdRatio = 0.3): boolean {
  return dx !== 0 && Math.abs(dx) >= swipeThreshold(width, thresholdRatio);
}

/** A row locks to horizontal only when the travel is mostly sideways, so vertical scroll is left alone. */
export function shouldLockHorizontal(dx: number, dy: number): boolean {
  return Math.abs(dx) > SWIPE_LOCK_PX && Math.abs(dx) > 1.5 * Math.abs(dy);
}

/** Indicator distance for a downward pull. Upward movement pulls nothing. */
export function pullDistance(dy: number): number {
  return dy > 0 ? dy * PULL_RESISTANCE : 0;
}

/** Haptic pulse where the platform supports it. Never throws. */
export function vibrate(ms: number): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(ms);
  } catch {
    // Some browsers reject vibration outside a user gesture; haptics are optional.
  }
}
