import { cn } from '@/lib/cn';

export interface BadgeProps {
  count: number;
  tone?: 'neutral' | 'accent';
  /** Render even when count is 0. Default false (badge hidden). */
  showZero?: boolean;
  className?: string;
}

/** Count pill. Caps display at 999+. Renders nothing for 0 unless showZero. */
export function Badge({ count, tone = 'neutral', showZero = false, className }: BadgeProps) {
  if (count === 0 && !showZero) return null;
  const label = count > 999 ? '999+' : String(count);
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
        tone === 'accent' ? 'bg-accent-soft text-accent' : 'bg-card text-silver',
        className,
      )}
    >
      {label}
    </span>
  );
}
