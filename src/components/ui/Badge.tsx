import { cn } from '@/lib/cn';

export interface BadgeProps {
  /** Number shown in the pill. Ignored when `label` is set. */
  count?: number;
  /** Text shown instead of the count (for example "unverified"). */
  label?: string;
  tone?: 'neutral' | 'accent';
  /** Render even when count is 0. Default false (badge hidden). */
  showZero?: boolean;
  className?: string;
}

/** Count pill, or a short text pill when `label` is given. Caps numeric display at 999+. Renders nothing for 0 unless showZero. */
export function Badge({ count = 0, label, tone = 'neutral', showZero = false, className }: BadgeProps) {
  if (label === undefined && count === 0 && !showZero) return null;
  const text = label ?? (count > 999 ? '999+' : String(count));
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
        tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-card text-silver',
        className,
      )}
    >
      {text}
    </span>
  );
}
