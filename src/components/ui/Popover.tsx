import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { useExitTransition } from '@/hooks/useExitTransition';

const MARGIN = 8;
const GAP = 6;
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface PopoverProps extends Omit<ComponentPropsWithoutRef<'div'>, 'role'> {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Element the popover is anchored to; focus returns here on close. */
  triggerRef: RefObject<HTMLElement | null>;
  /** 'dialog' (non-modal, default) or 'menu' (used by Menu). */
  role?: 'dialog' | 'menu';
  label?: string;
  labelledBy?: string;
  align?: 'start' | 'end';
  /** Selector (inside the popover) of the element to focus on open. Defaults to the first focusable. */
  initialFocusSelector?: string;
}

/**
 * Non-modal anchored panel. Positioned from the trigger's bounding rect, flips above
 * when there is no room below, and clamps to the viewport. Rendered into #portal-root
 * (or document.body). Closes on Escape, outside pointer down and focus leaving the panel.
 */
export const Popover = forwardRef<HTMLDivElement, PopoverProps>(function Popover(
  {
    open,
    onOpenChange,
    triggerRef,
    role = 'dialog',
    label,
    labelledBy,
    align = 'start',
    initialFocusSelector,
    className,
    children,
    ...rest
  },
  ref,
) {
  const contentRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => contentRef.current as HTMLDivElement);

  const { mounted, exiting } = useExitTransition(open, 120);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wasOpen = useRef(false);

  // Position before paint. Re-run on resize and any scroll.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trigger = triggerRef.current;
      const el = contentRef.current;
      if (!trigger || !el) return;
      const t = trigger.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      const spaceBelow = vh - t.bottom - GAP - MARGIN;
      const spaceAbove = t.top - GAP - MARGIN;
      let top = t.bottom + GAP;
      if (h > spaceBelow && spaceAbove > spaceBelow) top = t.top - GAP - h; // flip

      let left = align === 'end' ? t.right - w : t.left;
      left = Math.min(Math.max(left, MARGIN), Math.max(MARGIN, vw - w - MARGIN));
      top = Math.min(Math.max(top, MARGIN), Math.max(MARGIN, vh - h - MARGIN));
      setPos({ top, left });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, align, triggerRef]);

  // Move focus into the panel on open.
  useEffect(() => {
    if (!open) return;
    const el = contentRef.current;
    if (!el) return;
    const target =
      (initialFocusSelector && el.querySelector<HTMLElement>(initialFocusSelector)) ||
      el.querySelector<HTMLElement>(FOCUSABLE) ||
      el;
    target.focus({ preventScroll: true });
  }, [open, initialFocusSelector]);

  // Return focus to the trigger when closing (if focus was inside or lost).
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const active = document.activeElement;
    if (!active || active === document.body || contentRef.current?.contains(active)) {
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [open, triggerRef]);

  // Escape and outside pointer down.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onOpenChange(false);
    };
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (contentRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, onOpenChange, triggerRef]);

  // Focus leaving the panel for somewhere else closes it.
  const handleBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget as Node | null;
    if (!next || !open) return;
    if (contentRef.current?.contains(next) || triggerRef.current?.contains(next)) return;
    onOpenChange(false);
  };

  if (!mounted || typeof document === 'undefined') return null;
  const container = document.getElementById('portal-root') ?? document.body;

  return createPortal(
    <div
      {...rest}
      ref={contentRef}
      role={role}
      aria-label={label}
      aria-labelledby={labelledBy}
      tabIndex={-1}
      data-state={exiting ? 'closed' : 'open'}
      onBlur={handleBlur}
      style={{
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        visibility: pos ? 'visible' : 'hidden',
        ...rest.style,
      }}
      className={cn(
        'glass-strong fixed z-[var(--z-popover)] min-w-[220px] rounded-lg p-2 outline-none',
        exiting ? 'pointer-events-none animate-fade-out' : 'animate-pop-in',
        className,
      )}
    >
      {children}
    </div>,
    container,
  );
});
