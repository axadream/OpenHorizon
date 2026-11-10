import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { isTouchPointer, vibrate } from '@/lib/gesture';

export interface GesturePoint {
  x: number;
  y: number;
}

export interface UseLongPressOptions {
  /** Fires once the press has been held for `delayMs`, or on contextmenu (right click, Menu key). */
  onLongPress(point: GesturePoint): void;
  /** Hold time before a touch press counts as a long press. Default 400 ms. */
  delayMs?: number;
  /** Finger drift (px) that cancels a pending press. Default 8. */
  moveTolerancePx?: number;
}

/** Pointer handlers to spread on the element. Stable identities for the life of the component. */
export interface LongPressHandlers {
  onPointerDown(e: ReactPointerEvent<HTMLElement>): void;
  onPointerMove(e: ReactPointerEvent<HTMLElement>): void;
  onPointerUp(e: ReactPointerEvent<HTMLElement>): void;
  onPointerCancel(e: ReactPointerEvent<HTMLElement>): void;
  onContextMenu(e: ReactMouseEvent<HTMLElement>): void;
  onClickCapture(e: ReactMouseEvent<HTMLElement>): void;
}

interface Pending {
  pointerId: number;
  x: number;
  y: number;
  el: HTMLElement;
  timer: number;
}

/** A contextmenu this soon after a touch long press is the same gesture (Chromium on Android). */
const TOUCH_CONTEXT_GRACE_MS = 800;

/** Where a keyboard-triggered contextmenu reports clientX/Y = 0: anchor to the element instead. */
function contextPoint(e: ReactMouseEvent<HTMLElement>): GesturePoint {
  if (e.clientX === 0 && e.clientY === 0) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: rect.left + Math.min(rect.width, 48) / 2, y: rect.top + rect.height / 2 };
  }
  return { x: e.clientX, y: e.clientY };
}

/**
 * Long press for touch and pen, plus contextmenu for mouse and keyboard. Only touch and pen start
 * the timer, so mouse users keep the normal click. The pending press sets `data-long-press="pending"`
 * on the element (CSS suppresses the OS callout and text selection). Movement past the tolerance,
 * pointerup, pointercancel or any scroll cancels it. The click that follows a fired long press is
 * swallowed.
 */
export function useLongPress({ onLongPress, delayMs = 400, moveTolerancePx = 8 }: UseLongPressOptions): LongPressHandlers {
  const options = useRef({ onLongPress, delayMs, moveTolerancePx });
  useLayoutEffect(() => {
    options.current = { onLongPress, delayMs, moveTolerancePx };
  });

  const pending = useRef<Pending | null>(null);
  const lastFiredAt = useRef(0);
  const suppressClick = useRef(false);
  const cancelRef = useRef<() => void>(() => undefined);

  const handlers = useMemo<LongPressHandlers>(() => {
    const cancel = (): void => {
      const p = pending.current;
      if (!p) return;
      window.clearTimeout(p.timer);
      window.removeEventListener('scroll', cancel, { capture: true });
      p.el.removeAttribute('data-long-press');
      pending.current = null;
    };
    cancelRef.current = cancel;

    return {
      onPointerDown(e) {
        suppressClick.current = false;
        if (!isTouchPointer(e.pointerType)) return;
        cancel();
        const el = e.currentTarget;
        const x = e.clientX;
        const y = e.clientY;
        const timer = window.setTimeout(() => {
          window.removeEventListener('scroll', cancel, { capture: true });
          el.removeAttribute('data-long-press');
          pending.current = null;
          lastFiredAt.current = Date.now();
          suppressClick.current = true;
          vibrate(20);
          options.current.onLongPress({ x, y });
        }, options.current.delayMs);
        pending.current = { pointerId: e.pointerId, x, y, el, timer };
        el.setAttribute('data-long-press', 'pending');
        window.addEventListener('scroll', cancel, { capture: true, passive: true });
      },

      onPointerMove(e) {
        const p = pending.current;
        if (!p || e.pointerId !== p.pointerId) return;
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > options.current.moveTolerancePx) cancel();
      },

      onPointerUp(e) {
        const p = pending.current;
        if (p && e.pointerId === p.pointerId) cancel();
      },

      onPointerCancel(e) {
        const p = pending.current;
        if (p && e.pointerId === p.pointerId) cancel();
      },

      onContextMenu(e) {
        // A touch long press already opened the sheet; its trailing contextmenu must not open it again.
        const touchOwned = pending.current !== null || Date.now() - lastFiredAt.current < TOUCH_CONTEXT_GRACE_MS;
        cancel();
        // Rows own their context menu: the browser menu would hide the action sheet.
        e.preventDefault();
        if (touchOwned) return;
        options.current.onLongPress(contextPoint(e));
      },

      onClickCapture(e) {
        if (!suppressClick.current) return;
        suppressClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      },
    };
  }, []);

  useEffect(() => () => cancelRef.current(), []);

  return handlers;
}
