import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

interface FieldFlags {
  /** Marks the field invalid: danger border, aria-invalid. */
  invalid?: boolean;
  /** id of the element with the error text; wired to aria-describedby when invalid. */
  errorId?: string;
}

export interface InputProps extends ComponentPropsWithoutRef<'input'>, FieldFlags {}
export interface TextareaProps extends ComponentPropsWithoutRef<'textarea'>, FieldFlags {}

const FIELD =
  'w-full rounded-sm border bg-bg px-3 text-base text-text shadow-[var(--inner-well)] placeholder:text-text-faint focus-ring disabled:opacity-50 disabled:pointer-events-none';

function fieldState(invalid: boolean | undefined, errorId: string | undefined, describedBy: string | undefined) {
  return {
    'aria-invalid': invalid || undefined,
    'aria-describedby': invalid && errorId ? [describedBy, errorId].filter(Boolean).join(' ') : describedBy,
  };
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, errorId, className, 'aria-describedby': describedBy, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      {...rest}
      {...fieldState(invalid, errorId, describedBy)}
      className={cn(FIELD, 'h-9', invalid ? 'border-danger' : 'border-border-strong', className)}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, errorId, className, 'aria-describedby': describedBy, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      {...rest}
      {...fieldState(invalid, errorId, describedBy)}
      className={cn(FIELD, 'min-h-20 resize-y py-2', invalid ? 'border-danger' : 'border-border-strong', className)}
    />
  );
});
