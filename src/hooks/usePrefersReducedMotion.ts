import { useMediaQuery } from '@/hooks/useMediaQuery';

/** True when the user asks for reduced motion. Use to swap animated transitions for instant ones. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
