import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { t, useT } from '@/i18n/i18n';
import { cn } from '@/lib/cn';
import { activityPercent, useActivities, type Activity } from '@/store/activityStore';

/** Activities shown at once; the rest are summarised as "+N more". */
const MAX_VISIBLE = 2;

interface ActivityRowProps {
  activity: Activity;
  reducedMotion: boolean;
}

function ActivityRow({ activity, reducedMotion }: ActivityRowProps) {
  const pct = activityPercent(activity);
  const failed = activity.state === 'error';
  const finished = activity.state === 'done';
  const indeterminate = pct === null && !failed && !finished;
  const text = failed ? (activity.message ?? activity.label) : activity.label;

  let fillClass = 'bg-accent';
  let fillStyle: { width: string } = { width: `${pct ?? 100}%` };
  if (failed) {
    fillClass = 'bg-danger';
    fillStyle = { width: '100%' };
  } else if (indeterminate) {
    if (reducedMotion) {
      // Static stand-in for the shimmer: a fixed segment with no motion.
      fillStyle = { width: '35%' };
    } else {
      fillClass = 'animate-shimmer bg-[image:linear-gradient(90deg,transparent_0%,var(--color-accent)_50%,transparent_100%)] bg-[length:200%_100%]';
      fillStyle = { width: '100%' };
    }
  }

  return (
    <div className="px-0">
      <div
        role="progressbar"
        aria-label={text}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        className="h-0.5 w-full overflow-hidden bg-card/70"
      >
        <div
          className={cn('h-full transition-[width] duration-[var(--duration-base)] ease-standard motion-reduce:transition-none', fillClass)}
          style={fillStyle}
        />
      </div>
      <p
        className={cn(
          'glass mt-1.5 ms-3 inline-flex max-w-[calc(100%-24px)] items-center rounded-xs px-2 py-0.5 text-xs tabular-nums',
          failed ? 'text-danger' : 'text-text-muted',
        )}
      >
        <span className="truncate">{text}</span>
      </p>
    </div>
  );
}

/**
 * Non-blocking progress strip pinned to the top of the viewport. Pointer events pass through it,
 * so nothing here is interactive. The wrapper is always mounted so screen readers catch changes.
 */
export function ActivityBar() {
  useT();
  const activities = useActivities();
  const reducedMotion = usePrefersReducedMotion();
  const visible = activities.slice(0, MAX_VISIBLE);
  const hidden = activities.length - visible.length;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[var(--z-popover)] flex flex-col pt-[env(safe-area-inset-top)] pe-[env(safe-area-inset-right)] ps-[env(safe-area-inset-left)]"
    >
      {visible.map((a) => (
        <ActivityRow key={a.id} activity={a} reducedMotion={reducedMotion} />
      ))}
      {hidden > 0 ? <p className="mt-1 ms-3 text-xs text-text-muted">{t('activity.more', { count: hidden })}</p> : null}
    </div>
  );
}
