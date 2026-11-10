import { t } from '@/i18n/i18n';
import type { KeyboardEvent } from 'react';
import { AlertTriangle, CircleCheck, CircleX, Info, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { toast, useToasts, type ToastData, type ToastTone } from '@/lib/toast';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';

const TONE: Record<ToastTone, { icon: LucideIcon; iconClass: string; bar: string }> = {
  info: { icon: Info, iconClass: 'text-accent', bar: 'bg-accent' },
  success: { icon: CircleCheck, iconClass: 'text-success', bar: 'bg-success' },
  danger: { icon: CircleX, iconClass: 'text-danger', bar: 'bg-danger' },
  warning: { icon: AlertTriangle, iconClass: 'text-warning', bar: 'bg-warning' },
};

export interface ToastProps {
  toast: ToastData;
}

/** One toast card. Hover or focus pauses auto-dismiss; Escape dismisses. */
export function Toast({ toast: item }: ToastProps) {
  const tone = TONE[item.tone];
  const Icon = tone.icon;
  const dismiss = () => toast.dismiss(item.id);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      dismiss();
    }
  };

  return (
    <div
      onPointerEnter={() => toast.pause(item.id)}
      onPointerLeave={() => toast.resume(item.id)}
      onFocus={() => toast.pause(item.id)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) toast.resume(item.id);
      }}
      onKeyDown={onKeyDown}
      className={cn(
        'glass pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-lg py-3 pe-2 ps-4',
        item.leaving ? 'pointer-events-none animate-toast-out' : 'animate-pop-in',
      )}
    >
      <span aria-hidden="true" className={cn('absolute inset-y-2 start-0 w-0.5 rounded-full', tone.bar)} />
      <Icon aria-hidden="true" size={18} strokeWidth={1.75} className={cn('mt-0.5 shrink-0', tone.iconClass)} />
      <div className="min-w-0 flex-1">
        <p className="text-base font-medium text-text">{item.title}</p>
        {item.description ? <p className="mt-0.5 text-sm text-text-muted">{item.description}</p> : null}
      </div>
      {item.action ? (
        <Button variant="ghost" size="sm" onClick={item.action.onClick} className="shrink-0 self-center">
          {item.action.label}
        </Button>
      ) : null}
      <IconButton label={t('toast.dismiss')} icon={X} size="sm" onClick={dismiss} className="shrink-0" />
    </div>
  );
}

/**
 * Fixed toast stack. Two always-mounted live regions: role="status" (polite) for
 * info / success / warning, role="alert" (assertive) for danger.
 */
export function ToastRegion({ className }: { className?: string }) {
  const items = useToasts();
  const polite = items.filter((t) => t.tone !== 'danger');
  const urgent = items.filter((t) => t.tone === 'danger');

  return (
    <div
      className={cn(
        'pointer-events-none fixed inset-x-4 bottom-[calc(var(--bottom-nav-h)_+_env(safe-area-inset-bottom)_+_12px)] z-[var(--z-toast)] flex flex-col gap-2',
        'md:inset-x-auto md:end-4 md:bottom-4 md:w-[360px]',
        className,
      )}
    >
      <div role="status" aria-live="polite" className="flex flex-col gap-2">
        {polite.map((t) => (
          <Toast key={t.id} toast={t} />
        ))}
      </div>
      <div role="alert" aria-live="assertive" className="flex flex-col gap-2">
        {urgent.map((t) => (
          <Toast key={t.id} toast={t} />
        ))}
      </div>
    </div>
  );
}
