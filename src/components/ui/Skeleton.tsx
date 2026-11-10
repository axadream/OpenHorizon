import { cn } from '@/lib/cn';

export interface SkeletonProps {
  /** Shape and size via Tailwind, e.g. "h-4 w-3/4 rounded-sm". */
  className?: string;
}

/** Shimmering placeholder block. Always aria-hidden; the list container announces loading. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-shimmer rounded-sm bg-[image:linear-gradient(90deg,var(--color-card)_25%,var(--color-card-hover)_50%,var(--color-card)_75%)] bg-[length:200%_100%]',
        className,
      )}
    />
  );
}

/** Timeline row placeholder: dot, three text lines, 72px thumbnail square. */
export function ArticleRowSkeleton() {
  return (
    <div aria-hidden="true" className="grid grid-cols-[14px_1fr_auto] gap-x-2.5 px-3 py-2.5 min-h-[84px]">
      <Skeleton className="mt-1.5 size-2 rounded-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      <Skeleton className="size-[72px] rounded-md" />
    </div>
  );
}

/** Nav row placeholder: avatar and label. */
export function FeedRowSkeleton() {
  return (
    <div aria-hidden="true" className="flex h-9 items-center gap-2 px-2">
      <Skeleton className="size-[18px] rounded-xs" />
      <Skeleton className="h-3 flex-1" />
    </div>
  );
}

/** Reader placeholder: title (2 lines) plus body lines of varying width. */
export function ReaderSkeleton() {
  const widths = ['w-full', 'w-11/12', 'w-full', 'w-10/12', 'w-full', 'w-9/12', 'w-11/12', 'w-2/3'];
  return (
    <div aria-hidden="true" className="mx-auto flex w-full max-w-[68ch] flex-col gap-3">
      <Skeleton className="h-7 w-full" />
      <Skeleton className="h-7 w-2/3" />
      <div className="mt-4 flex flex-col gap-3">
        {widths.map((w, i) => (
          <Skeleton key={i} className={cn('h-3.5', w)} />
        ))}
      </div>
    </div>
  );
}
