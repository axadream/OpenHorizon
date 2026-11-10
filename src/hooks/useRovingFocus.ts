import { useEffect, useRef, type RefObject } from 'react';

export interface RovingFocusOptions {
  /** Which arrow keys move focus. Default 'vertical'. */
  orientation?: 'vertical' | 'horizontal' | 'both';
  /** Wrap from last to first and back. Default true. */
  loop?: boolean;
}

/**
 * Roving tabindex for a composite widget (menus, toolbars, tab lists, nav trees).
 * Only one item is in the tab order; arrows / Home / End move focus between items
 * matched by `itemSelector` inside `ref`. Disabled items are skipped.
 *
 * Re-attaches its listeners on every render of the host component, so it keeps
 * working for portaled content that mounts after the host.
 */
export function useRovingFocus(
  ref: RefObject<HTMLElement | null>,
  itemSelector: string,
  options: RovingFocusOptions = {},
): void {
  const optsRef = useRef(options);

  useEffect(() => {
    optsRef.current = options;
    const root = ref.current;
    if (!root) return;

    const items = (): HTMLElement[] =>
      Array.from(root.querySelectorAll<HTMLElement>(itemSelector)).filter(
        (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true',
      );

    // Guarantee exactly one tab stop.
    const initial = items();
    if (initial.length && !initial.some((el) => el.tabIndex === 0)) {
      initial.forEach((el, i) => {
        el.tabIndex = i === 0 ? 0 : -1;
      });
    }

    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const list = items();
      if (!list.includes(target)) return;
      list.forEach((el) => {
        el.tabIndex = el === target ? 0 : -1;
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const { orientation = 'vertical', loop = true } = optsRef.current;
      const list = items();
      if (!list.length) return;
      const idx = list.indexOf(document.activeElement as HTMLElement);
      if (idx < 0) return;
      const last = list.length - 1;

      const forward =
        (e.key === 'ArrowDown' && orientation !== 'horizontal') ||
        (e.key === 'ArrowRight' && orientation !== 'vertical');
      const backward =
        (e.key === 'ArrowUp' && orientation !== 'horizontal') ||
        (e.key === 'ArrowLeft' && orientation !== 'vertical');

      let next: number;
      if (forward) next = idx < last ? idx + 1 : loop ? 0 : idx;
      else if (backward) next = idx > 0 ? idx - 1 : loop ? last : idx;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = last;
      else return;

      e.preventDefault();
      list.forEach((el, i) => {
        el.tabIndex = i === next ? 0 : -1;
      });
      list[next].focus();
    };

    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('keydown', onKeyDown);
    return () => {
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('keydown', onKeyDown);
    };
  });
}
