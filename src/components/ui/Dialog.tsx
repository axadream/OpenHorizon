import { forwardRef, useEffect, useId, useImperativeHandle, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from '@/components/ui/IconButton';

export interface DialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  /** Optional visible description, wired to aria-describedby. */
  description?: string;
  children?: ReactNode;
  /** Footer content, right-aligned. */
  footer?: ReactNode;
  /**
   * 'responsive' (default): centred panel, becomes a bottom sheet below md.
   * 'bottom': always a bottom sheet, with a drag handle. Used by the article action sheet.
   */
  placement?: 'responsive' | 'bottom';
  className?: string;
}

/**
 * Modal dialog on the native <dialog> element (showModal gives the focus trap, Escape
 * and the inert background). Escape and backdrop clicks report through onOpenChange.
 * Focus returns to the element that was focused before opening.
 * Below md it becomes a bottom sheet (placement 'responsive'); placement 'bottom' always does.
 */
export const Dialog = forwardRef<HTMLDialogElement, DialogProps>(function Dialog(
  { open, onOpenChange, title, description, children, footer, placement = 'responsive', className },
  ref,
) {
  const bottom = placement === 'bottom';
  const dialogRef = useRef<HTMLDialogElement>(null);
  useImperativeHandle(ref, () => dialogRef.current as HTMLDialogElement);
  const openerRef = useRef<HTMLElement | null>(null);
  const pointerDownOnBackdrop = useRef(false);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      el.showModal();
    } else if (!open && el.open) {
      el.close();
      openerRef.current?.focus({ preventScroll: true });
      openerRef.current = null;
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        // Escape: let React state decide whether to close.
        e.preventDefault();
        onOpenChange(false);
      }}
      onClose={() => {
        if (open) onOpenChange(false);
      }}
      onPointerDown={(e) => {
        pointerDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // Clicks on the ::backdrop target the <dialog> itself; the panel content is its children.
        if (e.target === e.currentTarget && pointerDownOnBackdrop.current) onOpenChange(false);
        pointerDownOnBackdrop.current = false;
      }}
      className={cn(
        'glass-strong m-auto max-h-[calc(100dvh_-_32px)] w-[min(560px,calc(100vw_-_32px))] max-w-none overflow-hidden rounded-lg p-0 text-silver',
        'animate-pop-in',
        // Mobile: bottom sheet.
        !bottom && 'max-md:mt-auto max-md:mb-0 max-md:max-h-[92dvh] max-md:w-full max-md:rounded-b-none max-md:rounded-t-xl',
        // Always bottom sheet.
        bottom && 'mt-auto mb-0 max-h-[92dvh] w-full rounded-t-xl rounded-b-none',
        className,
      )}
    >
      <div className={cn('flex max-h-[calc(100dvh_-_32px)] flex-col max-md:max-h-[92dvh]', bottom && 'max-h-[92dvh]')}>
        {bottom ? <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong" /> : null}
        <header className="steel hairline-b flex h-13 shrink-0 items-center justify-between gap-3 px-5">
          <h2 id={titleId} className="text-lg font-semibold tracking-[-0.01em] text-text">
            {title}
          </h2>
          <IconButton label="Close" icon={X} size="sm" onClick={() => onOpenChange(false)} />
        </header>
        {description ? (
          <p id={descId} className="px-5 pt-4 text-sm text-text-muted">
            {description}
          </p>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
        {footer ? <footer className="hairline-t flex shrink-0 justify-end gap-2 p-4">{footer}</footer> : null}
      </div>
    </dialog>
  );
});
