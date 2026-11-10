import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

export interface ChipProps extends ComponentPropsWithoutRef<'button'> {
  selected?: boolean;
  /** 'radio' inside a role="radiogroup" (filters, default), or 'tab' inside a role="tablist". */
  role?: 'radio' | 'tab';
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected = false, role = 'radio', className, type = 'button', tabIndex, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      role={role}
      aria-checked={role === 'radio' ? selected : undefined}
      aria-selected={role === 'tab' ? selected : undefined}
      tabIndex={tabIndex ?? (selected ? 0 : -1)}
      className={cn(
        'focus-ring inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium select-none',
        'transition-[background-color,color,border-color,transform] duration-[var(--duration-fast)] ease-standard',
        'active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none',
        selected
          ? 'border-border-accent bg-accent-soft text-accent'
          : 'border-border bg-transparent text-text-muted hover:bg-card hover:text-silver',
        className,
      )}
      {...rest}
    />
  );
});
