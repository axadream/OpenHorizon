import { useMediaQuery } from '@/hooks/useMediaQuery';

/** True below the md breakpoint (< 768px), i.e. the single-pane mobile layout. */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767.98px)');
}
