import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/*
 * Brand glyphs for the share sheet. lucide-react ships none of these. Each is a 24x24 filled
 * path with fill="currentColor", aria-hidden (the tile carries the accessible name).
 */

export interface BrandIconProps {
  className?: string;
  size?: number;
}

function Brand({
  className,
  size = 20,
  children,
  fillRule,
}: BrandIconProps & { children: ReactNode; fillRule?: 'evenodd' | 'nonzero' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      fillRule={fillRule}
      aria-hidden="true"
      focusable="false"
      className={cn('shrink-0', className)}
    >
      {children}
    </svg>
  );
}

export function XBrandIcon(props: BrandIconProps) {
  return (
    <Brand {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </Brand>
  );
}

export function WhatsAppBrandIcon(props: BrandIconProps) {
  // Speech bubble with a tail; the handset cut-out is omitted at this size.
  return (
    <Brand {...props}>
      <path d="M12.04 2a9.94 9.94 0 0 0-8.5 15.1L2 22l5.05-1.52A9.95 9.95 0 1 0 12.04 2zm0 1.8a8.16 8.16 0 1 1-4.2 15.17l-.3-.18-2.99.9.93-2.92-.2-.31A8.16 8.16 0 0 1 12.04 3.8z" />
    </Brand>
  );
}

export function TelegramBrandIcon(props: BrandIconProps) {
  return (
    <Brand {...props}>
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </Brand>
  );
}

export function RedditBrandIcon(props: BrandIconProps) {
  // Head with antennae and two eye cut-outs (evenodd).
  return (
    <Brand {...props} fillRule="evenodd">
      <path d="M12 6.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM9.2 14.6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm5.6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM14.6 3.1l-.6 3.1 3.7 1.4a1.9 1.9 0 1 0 .5-1.3L14.8 4.4z" />
    </Brand>
  );
}

export function LinkedInBrandIcon(props: BrandIconProps) {
  return (
    <Brand {...props}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </Brand>
  );
}

export function FacebookBrandIcon(props: BrandIconProps) {
  return (
    <Brand {...props}>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </Brand>
  );
}
