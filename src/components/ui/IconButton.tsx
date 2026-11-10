import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface IconButtonProps extends Omit<ComponentPropsWithoutRef<'button'>, 'children' | 'aria-label'> {
  /** Required: becomes aria-label and title. */
  label: string;
  icon: LucideIcon;
  size?: 'sm' | 'md';
  /** Highlighted state (e.g. active view or sort). */
  active?: boolean;
  /** Toggle state; sets aria-pressed. */
  pressed?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon: Icon, size = 'md', active = false, pressed, className, type = 'button', ...rest },
  ref,
) {
  const box = size === 'sm' ? 'h-8 w-8' : 'h-[var(--hit-min)] w-[var(--hit-min)] min-h-10 min-w-10';
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        'focus-ring inline-flex shrink-0 items-center justify-center rounded-sm select-none',
        'transition-[background-color,color,transform] duration-[var(--duration-instant)] ease-standard',
        'active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
        active ? 'bg-accent-soft text-accent' : 'text-text-muted hover:bg-card hover:text-text',
        box,
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden="true" size={size === 'sm' ? 16 : 18} strokeWidth={1.75} />
    </button>
  );
});
