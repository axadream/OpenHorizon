import type { RefObject } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { cn } from '@/lib/cn';

/** Pull distance that arms the refresh (DESIGN motion: pull follows the finger). */
export const PULL_THRESHOLD_PX = 70;

/** Resting position: the pill sits fully above the list, out of sight. */
const HIDDEN_TOP = -44;
/** Settled position while pulling or refreshing, just below the top edge. */
const SETTLED_TOP = 12;

export interface PullToRefreshIndicatorProps {
  /** The scroll container the gesture is read from. */
  scrollRef: RefObject<HTMLElement | null>;
  /** Refresh action; may return a promise that keeps the indicator spinning. */
  onRefresh(): unknown;
  className?: string;
}

/**
 * Steel pill above the timeline list. It follows the pull, rotates with it, and spins while the
 * refresh runs. Spinning is stopped by the global reduced-motion rule. Touch only (see the hook).
 */
export function PullToRefreshIndicator({ scrollRef, onRefresh, className }: PullToRefreshIndicatorProps) {
  const { distance, armed, refreshing } = usePullToRefresh(scrollRef, { onRefresh, thresholdPx: PULL_THRESHOLD_PX });
  const visible = refreshing || distance > 0;
  const progress = Math.min(1, distance / PULL_THRESHOLD_PX);
  const top = refreshing ? SETTLED_TOP : Math.min(HIDDEN_TOP + distance, SETTLED_TOP);
  const label = refreshing ? 'Refreshing' : armed ? 'Release to refresh' : 'Pull to refresh';

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-[var(--z-sticky)] flex justify-center',
        className,
      )}
    >
      <span role="status" aria-live="polite" className="sr-only">
        {refreshing ? 'Refreshing feeds' : ''}
      </span>
      <div
        aria-hidden={!visible || undefined}
        className="steel flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium text-silver"
        style={{
          transform: `translate3d(0, ${top}px, 0)`,
          opacity: refreshing ? 1 : progress,
        }}
      >
        <RefreshCw
          aria-hidden="true"
          size={16}
          strokeWidth={1.75}
          className={cn(refreshing ? 'animate-spin-slow' : armed && 'text-accent')}
          style={refreshing ? undefined : { transform: `rotate(${distance * 3}deg)` }}
        />
        <span>{label}</span>
      </div>
    </div>
  );
}
