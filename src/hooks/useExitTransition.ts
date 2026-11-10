import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export interface ExitTransitionState {
  /** Node should stay in the DOM (open, or still playing its exit animation). */
  mounted: boolean;
  /** Closed but still mounted: apply the exit animation classes. */
  exiting: boolean;
}

/**
 * Keeps a node mounted for `durationMs` after `open` becomes false so an exit
 * animation can play. Duration is forced to 0 under prefers-reduced-motion.
 */
export function useExitTransition(open: boolean, durationMs = 120): ExitTransitionState {
  const reduced = usePrefersReducedMotion();
  const duration = reduced ? 0 : durationMs;
  const [present, setPresent] = useState(open);

  useEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    if (!present) return;
    const t = window.setTimeout(() => setPresent(false), duration);
    return () => window.clearTimeout(t);
  }, [open, present, duration]);

  return { mounted: open || present, exiting: !open && present };
}
