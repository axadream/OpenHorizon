import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

export interface SwitchProps extends Omit<ComponentPropsWithoutRef<'button'>, 'role' | 'children' | 'onChange'> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, disabled, className, type = 'button', onClick, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) onCheckedChange?.(!checked);
      }}
      className={cn(
        'focus-ring relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full',
        'transition-colors duration-[var(--duration-base)] ease-standard disabled:opacity-50 disabled:pointer-events-none',
        checked ? 'bg-accent' : 'bg-card shadow-[var(--inner-well)]',
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          'block size-4 rounded-full shadow-1',
          'transition-transform duration-[var(--duration-base)] ease-spring',
          // The knob sits at the start edge; in RTL the travel is mirrored.
          checked
            ? 'translate-x-[18px] rtl:-translate-x-[18px] bg-text-inverse'
            : 'translate-x-0.5 rtl:-translate-x-0.5 bg-silver',
        )}
      />
    </button>
  );
});
