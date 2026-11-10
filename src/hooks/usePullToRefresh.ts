import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { isTouchPointer, pullDistance, vibrate } from '@/lib/gesture';

/** Finger travel (px) before a downward drag counts as a pull; keeps taps and jitter out. */
const PULL_SLOP_PX = 8;

export interface UsePullToRefreshOptions {
  /** Called on release while armed. A returned promise keeps `refreshing` true until it settles. */
  onRefresh(): unknown;
  /** Indicator distance at which the pull arms. Default 70. */
  thresholdPx?: number;
}

export interface PullToRefreshState {
  /** Indicator travel in px (resisted finger travel). Held at the threshold while refreshing. */
  distance: number;
  armed: boolean;
  refreshing: boolean;
}

interface Track {
  pointerId: number;
  startX: number;
  startY: number;
  pulling: boolean;
  armed: boolean;
}

/**
 * Pull-to-refresh for a scroll container. Touch and pen only (a mouse never pulls), and only while the
 * container sits at scrollTop 0. Pointer events drive the state; a non-passive touchmove listener stops
 * the browser from starting its own pan during a pull, which would otherwise cancel the pointer stream.
 * Pair with `overscroll-y-contain` on the container so the native refresh does not fire as well.
 */
export function usePullToRefresh(
  scrollRef: RefObject<HTMLElement | null>,
  { onRefresh, thresholdPx = 70 }: UsePullToRefreshOptions,
): PullToRefreshState {
  const [distance, setDistance] = useState(0);
  const [armed, setArmed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef({ onRefresh, thresholdPx });
  useLayoutEffect(() => {
    latest.current = { onRefresh, thresholdPx };
  });
  const busy = useRef(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let track: Track | null = null;

    const reset = (): void => {
      setDistance(0);
      setArmed(false);
    };

    const release = (): void => {
      const t = track;
      track = null;
      if (!t || !t.pulling) return;
      if (!t.armed || busy.current) {
        reset();
        return;
      }
      busy.current = true;
      setRefreshing(true);
      setArmed(false);
      setDistance(latest.current.thresholdPx);
      Promise.resolve()
        .then(() => latest.current.onRefresh())
        .catch(() => undefined)
        .finally(() => {
          busy.current = false;
          setRefreshing(false);
          setDistance(0);
        });
    };

    const onDown = (e: PointerEvent): void => {
      if (busy.current || !isTouchPointer(e.pointerType) || !e.isPrimary) return;
      if (el.scrollTop > 0) return;
      track = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, pulling: false, armed: false };
    };

    const onMove = (e: PointerEvent): void => {
      const t = track;
      if (!t || e.pointerId !== t.pointerId) return;
      if (el.scrollTop > 0) {
        // Scrolled away from the top mid-gesture: this is no longer a pull.
        track = null;
        if (t.pulling) reset();
        return;
      }
      const dx = e.clientX - t.startX;
      const dy = e.clientY - t.startY;
      if (!t.pulling) {
        if (dy > PULL_SLOP_PX && dy > Math.abs(dx)) t.pulling = true;
        else {
          // A sideways drag is a swipe on a row, not a pull: give up on this touch.
          if (Math.abs(dx) > PULL_SLOP_PX && Math.abs(dx) >= dy) track = null;
          return;
        }
      }
      const dist = pullDistance(dy);
      const nowArmed = dist >= latest.current.thresholdPx;
      if (nowArmed !== t.armed) {
        t.armed = nowArmed;
        if (nowArmed) vibrate(10);
        setArmed(nowArmed);
      }
      setDistance(dist);
    };

    const onUp = (e: PointerEvent): void => {
      if (track && e.pointerId === track.pointerId) release();
    };

    const onCancel = (e: PointerEvent): void => {
      if (!track || e.pointerId !== track.pointerId) return;
      const t = track;
      track = null;
      if (t.pulling) reset();
    };

    const onTouchMove = (e: TouchEvent): void => {
      if (track?.pulling && e.cancelable) e.preventDefault();
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('touchmove', onTouchMove);
    };
  }, [scrollRef]);

  return { distance, armed, refreshing };
}
