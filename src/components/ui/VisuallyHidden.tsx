import { forwardRef, type ComponentPropsWithoutRef } from 'react';

/** Renders children for assistive technology only (sr-only). */
export const VisuallyHidden = forwardRef<HTMLSpanElement, ComponentPropsWithoutRef<'span'>>(function VisuallyHidden(
  { children, ...rest },
  ref,
) {
  return (
    <span ref={ref} className="sr-only" {...rest}>
      {children}
    </span>
  );
});
