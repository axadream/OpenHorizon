import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, type ButtonVariant } from '@/components/ui/Button';

export interface EmptyStateAction {
  label: string;
  onClick(): void;
  icon?: LucideIcon;
  variant?: ButtonVariant;
}

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
}

/** Centred placeholder for empty lists and error screens. Static content, so no live region. */
export function EmptyState({ icon: Icon, title, description, action, secondaryAction, className }: EmptyStateProps) {
  return (
    <div className={cn('flex h-full flex-col items-center justify-center p-8 text-center animate-fade-in', className)}>
      <div className="steel-card mb-4 flex size-16 items-center justify-center rounded-lg">
        <Icon aria-hidden="true" size={28} strokeWidth={1.75} className="text-text-muted" />
      </div>
      <h2 className="text-xl font-semibold tracking-[-0.01em] text-text">{title}</h2>
      {description ? <p className="mt-1 max-w-[32ch] text-sm text-text-muted">{description}</p> : null}
      {action || secondaryAction ? (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {action ? (
            <Button variant={action.variant ?? 'primary'} leadingIcon={action.icon} onClick={action.onClick}>
              {action.label}
            </Button>
          ) : null}
          {secondaryAction ? (
            <Button
              variant={secondaryAction.variant ?? 'ghost'}
              leadingIcon={secondaryAction.icon}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
