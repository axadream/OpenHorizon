import { useRef, useState, type ComponentPropsWithoutRef, type CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Tooltip } from '@/components/ui/Tooltip';
import { t, useT } from '@/i18n/i18n';

export interface NavRowButtonProps extends ComponentPropsWithoutRef<'button'> {
  selected?: boolean;
  /** Icon-only rail mode (64 px). */
  rail?: boolean;
  /** Indent level for feeds inside folders. */
  depth?: 0 | 1;
}

/** Shared look of every nav item (smart view, folder, feed). Roving focus is applied by NavPane. */
export function NavRowButton({
  selected = false,
  rail = false,
  depth = 0,
  className,
  style,
  children,
  type = 'button',
  ...rest
}: NavRowButtonProps) {
  const indent: CSSProperties = rail ? {} : { paddingInlineStart: 8 + depth * 12 };
  return (
    <button
      type={type}
      aria-current={selected ? 'page' : undefined}
      style={{ ...indent, ...style }}
      className={cn(
        'focus-ring group relative flex h-9 min-w-0 items-center gap-2 rounded-md px-2 text-start text-sm select-none',
        'text-silver transition-[background-color,transform] duration-[var(--duration-instant)] ease-standard',
        'hover:bg-card hover:text-text active:scale-[0.995]',
        selected &&
          'bg-accent-soft text-text [&>svg]:text-accent before:absolute before:top-2 before:bottom-2 before:start-0 before:w-0.5 before:rounded-full before:bg-accent',
        rail && 'w-10 justify-center px-0',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/** Unread count pill, or the accent dot used in rail mode. Renders nothing for zero. */
export function NavRowBadge({ count, selected = false, rail = false }: { count: number; selected?: boolean; rail?: boolean }) {
  if (count <= 0) return null;
  if (rail) return <span aria-hidden="true" className="absolute top-1.5 end-1.5 size-1.5 rounded-full bg-accent" />;
  return <Badge count={count} tone={selected ? 'accent' : 'neutral'} className="ms-auto shrink-0" />;
}

export interface NavRowProps {
  icon: LucideIcon;
  label: string;
  count: number;
  selected: boolean;
  rail: boolean;
  onSelect(): void;
}

/** Smart view row (All, Unread, Favorites, Read Later). */
export function NavRow({ icon: Icon, label, count, selected, rail, onSelect }: NavRowProps) {
  useT();
  const button = (
    <NavRowButton
      data-nav-item
      selected={selected}
      rail={rail}
      aria-label={count > 0 ? t('nav.unreadLabel', { label, count }) : label}
      onClick={onSelect}
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.75} className="shrink-0 text-text-muted" />
      {rail ? null : <span className="min-w-0 flex-1 truncate">{label}</span>}
      <NavRowBadge count={count} selected={selected} rail={rail} />
    </NavRowButton>
  );
  return (
    <li className={cn('relative', rail && 'flex justify-center')}>
      {rail ? <Tooltip content={label}>{button}</Tooltip> : button}
    </li>
  );
}

export interface InlineRenameProps {
  label: string;
  initial: string;
  onCommit(value: string): void;
  onCancel(): void;
}

/**
 * Inline rename field. Enter or blur commits (when the value changed and is not empty),
 * Escape cancels. Commit and cancel are guarded so only one of them runs.
 */
export function InlineRename({ label, initial, onCommit, onCancel }: InlineRenameProps) {
  const [value, setValue] = useState(initial);
  const doneRef = useRef(false);

  const finish = (commit: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    const next = value.trim();
    if (commit && next && next !== initial) onCommit(next);
    else onCancel();
  };

  return (
    <Input
      aria-label={label}
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      className="h-8 min-w-0 flex-1 text-sm"
    />
  );
}
