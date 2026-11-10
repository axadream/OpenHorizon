import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export interface TooltipProps {
  content: ReactNode;
  /** Single focusable element (usually an IconButton). Receives aria-describedby. */
  children: ReactElement<{ 'aria-describedby'?: string }>;
  side?: 'top' | 'bottom';
  /** Delay before showing, in ms. Default 500. */
  delay?: number;
  className?: string;
}

/**
 * Hover / focus label. Only active on devices with a fine pointer (hover: hover).
 * Escape hides it. The content is exposed as role="tooltip" and linked via aria-describedby.
 */
export function Tooltip({ content, children, side = 'top', delay = 500, className }: TooltipProps) {
  const id = useId();
  const canHover = useMediaQuery('(hover: hover)');
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const show = () => {
    if (!canHover) return;
    clear();
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clear();
    setOpen(false);
  };

  useEffect(() => clear, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hide();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const child = isValidElement(children)
    ? cloneElement(children, { 'aria-describedby': open ? id : undefined })
    : children;

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {child}
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'glass pointer-events-none absolute left-1/2 z-[var(--z-popover)] -translate-x-1/2 whitespace-nowrap rounded-sm px-2 py-1 text-xs text-text animate-fade-in',
            side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            className,
          )}
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}
