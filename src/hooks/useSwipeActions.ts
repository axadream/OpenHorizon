import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import {
  computeSwipeOffset,
  isSwipeArmed,
  isTouchPointer,
  shouldLockHorizontal,
  swipeProgress,
  vibrate,
} from '@/lib/gesture';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export type SwipeDirection = 'left' | 'right';

export interface UseSwipeActionsOptions {
  /** Released beyond the threshold after a rightward drag. */
  onSwipeRight(): void;
  /** Released beyond the threshold after a leftward drag. */
  onSwipeLeft(): void;
  /** Commit distance as a share of the element width. Default 0.3. */
  thresholdRatio?: number;
}

export interface SwipeState {
  /** Rubber-banded translate in px (the value the content would move to). */
  offset: number;
  /** Raw travel / threshold, 0..1. Drives the action background opacity. */
  progress: number;
  /** Travel has reached the commit threshold. */
  armed: boolean;
  /** Null at rest, so no action background is shown. */
  direction: SwipeDirection | null;
  /** True while the finger is down and the drag is locked horizontal. */
  dragging: boolean;
}

export interface UseSwipeActionsResult {
  state: SwipeState;
  /** Put on the element that moves: transform and the transition (spring, or none). */
  contentStyle: CSSProperties;
  handlers: {
    onPointerDown(e: ReactPointerEvent<HTMLElement>): void;
    onPointerMove(e: ReactPointerEvent<HTMLElement>): void;
    onPointerUp(e: ReactPointerEvent<HTMLElement>): void;
    onPointerCancel(e: ReactPointerEvent<HTMLElement>): void;
  };
  /** True once after a horizontal swipe, so the click that may follow it is ignored. */
  consumeClick(): boolean;
}

const IDLE: SwipeState = { offset: 0, progress: 0, armed: false, direction: null, dragging: false };
const SPRING = 'transform 260ms cubic-bezier(.2,.9,.3,1.2)';

interface Gesture {
  pointerId: number;
  x: number;
  y: number;
  width: number;
  locked: 'h' | 'v' | null;
  dx: number;
  armed: boolean;
}

/**
 * Horizontal swipe actions for a list row (touch and pen only). The content follows the finger with
 * rubber-band resistance past the threshold, buzzes once when armed, and on release either commits
 * (armed) or springs back. Under prefers-reduced-motion the content stays still: progress is shown
 * only through the action background, and the release has no spring.
 */
export function useSwipeActions({ onSwipeRight, onSwipeLeft, thresholdRatio = 0.3 }: UseSwipeActionsOptions): UseSwipeActionsResult {
  const reduced = usePrefersReducedMotion();
  const [state, setState] = useState<SwipeState>(IDLE);
  const callbacks = useRef({ onSwipeRight, onSwipeLeft });
  useLayoutEffect(() => {
    callbacks.current = { onSwipeRight, onSwipeLeft };
  });
  const gesture = useRef<Gesture | null>(null);
  const suppress = useRef(false);

  const finish = (commit: boolean): void => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.locked !== 'h') return;
    suppress.current = true;
    setState(IDLE);
    if (!commit || !g.armed) return;
    if (g.dx > 0) callbacks.current.onSwipeRight();
    else callbacks.current.onSwipeLeft();
  };

  const handlers: UseSwipeActionsResult['handlers'] = {
    onPointerDown(e) {
      suppress.current = false;
      if (!isTouchPointer(e.pointerType) || !e.isPrimary) return;
      gesture.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        width: e.currentTarget.getBoundingClientRect().width,
        locked: null,
        dx: 0,
        armed: false,
      };
    },

    onPointerMove(e) {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId || g.locked === 'v') return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (g.locked === null) {
        if (shouldLockHorizontal(dx, dy)) g.locked = 'h';
        else if (Math.abs(dy) > 10) {
          // Clearly vertical: leave the scroll alone for the rest of this touch.
          g.locked = 'v';
          return;
        } else return;
      }
      g.dx = dx;
      const armed = isSwipeArmed(dx, g.width, thresholdRatio);
      if (armed && !g.armed) vibrate(10);
      g.armed = armed;
      setState({
        offset: computeSwipeOffset(dx, g.width, thresholdRatio),
        progress: swipeProgress(dx, g.width, thresholdRatio),
        armed,
        direction: dx > 0 ? 'right' : 'left',
        dragging: true,
      });
    },

    onPointerUp(e) {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      finish(true);
    },

    onPointerCancel(e) {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      finish(false);
    },
  };

  const translate = reduced ? 0 : state.offset;
  const contentStyle: CSSProperties = {
    transform: `translate3d(${translate}px, 0, 0)`,
    transition: state.dragging || reduced ? 'none' : SPRING,
  };

  const consumeClick = (): boolean => {
    const was = suppress.current;
    suppress.current = false;
    return was;
  };

  return { state, contentStyle, handlers, consumeClick };
}
