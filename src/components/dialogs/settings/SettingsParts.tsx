import { useId, type ReactNode } from 'react';
import type { Settings } from '@/db/schema';
import { setSetting } from '@/features/settings/settings';
import { t } from '@/i18n/i18n';
import { toast } from '@/lib/toast';

/** Save a setting; a failed write shows a toast instead of an unhandled rejection. */
export function save<K extends keyof Settings>(key: K, value: Settings[K]): void {
  setSetting(key, value).catch(() => toast.error(t('settings.saveFailed')));
}

export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : t('diag.genericTitle');
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section id={`settings-${id}`} aria-labelledby={headingId} className="hairline-b mb-5 pb-5 last:mb-0 last:border-b-0 last:pb-0">
      <h3 id={headingId} className="mb-3 text-xs font-semibold tracking-[0.06em] text-text-muted uppercase">
        {title}
      </h3>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm text-silver">{label}</div>
        {hint ? <div className="text-xs text-text-muted">{hint}</div> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}
