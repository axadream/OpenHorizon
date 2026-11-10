import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'steel' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: LucideIcon;
  loading?: boolean;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-[image:var(--gradient-accent)] text-text-inverse font-semibold shadow-[var(--inner-highlight-strong)] hover:shadow-accent',
  steel: 'steel text-text hover:brightness-110',
  ghost: 'bg-transparent text-silver hover:bg-card hover:text-text',
  danger: 'bg-danger-soft text-danger hover:bg-danger/20',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-[30px] px-2.5 text-sm gap-1.5',
  md: 'h-9 px-3 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'steel', size = 'md', leadingIcon: Icon, loading = false, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  const iconPx = size === 'sm' ? 14 : 16;
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'focus-ring inline-flex items-center justify-center gap-2 rounded-sm whitespace-nowrap select-none font-medium',
        'transition-[background-color,transform,box-shadow,filter,color] duration-[var(--duration-instant)] ease-standard',
        'active:scale-[0.97] active:duration-[var(--duration-fast)]',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 aria-hidden="true" size={iconPx} strokeWidth={1.75} className="animate-spin-slow" />
      ) : Icon ? (
        <Icon aria-hidden="true" size={iconPx} strokeWidth={1.75} />
      ) : null}
      {children}
    </button>
  );
});
