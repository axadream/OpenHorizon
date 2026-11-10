import { useId } from 'react';
import { Info, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Settings } from '@/db/schema';
import { useSetting } from '@/features/settings/settings';
import { runSyncFromPage, useSyncStatus, type PeriodicState } from '@/features/sync/scheduler';
import { t, useT } from '@/i18n/i18n';
import { formatFull } from '@/lib/time';
import { ChoiceGroup, type ChoiceOption } from './ChoiceGroup';
import { Row, Section, save } from './SettingsParts';

/** Built per render so the labels follow the active language. */
function frequencyOptions(): readonly ChoiceOption<Settings['syncFrequency']>[] {
  return [
    { value: '15m', label: t('settings.freq15') },
    { value: '30m', label: t('settings.freq30') },
    { value: '1h', label: t('settings.freq1h') },
    { value: 'manual', label: t('settings.freqManual') },
  ];
}

const RETENTION_OPTIONS: readonly Settings['retentionPerFeed'][] = [100, 200, 500, 1000];

function periodicText(state: PeriodicState): string {
  switch (state) {
    case 'unknown':
      return t('settings.periodicUnknown');
    case 'registered':
      return t('settings.periodicRegistered');
    case 'unregistered':
      return t('settings.periodicUnregistered');
    case 'denied':
      return t('settings.periodicDenied');
    case 'unsupported':
      return t('settings.periodicUnsupported');
  }
}

export function SyncSettings() {
  useT();
  const frequency = useSetting('syncFrequency');
  const storedLastSync = useSetting('lastSyncAt');
  const retention = useSetting('retentionPerFeed');
  const status = useSyncStatus();
  const retentionId = useId();
  const backgroundId = useId();
  const lastSyncAt = status.lastRunAt ?? storedLastSync;

  return (
    <Section id="sync" title={t('settings.sync')}>
      <ChoiceGroup
        label={t('settings.refreshFrequency')}
        value={frequency}
        options={frequencyOptions()}
        onChange={(v) => save('syncFrequency', v)}
      />

      <Row
        label={
          <span id={backgroundId} className="inline-flex items-center gap-1.5">
            {t('settings.background')}
            <Tooltip content={t('settings.backgroundHelp')}>
              <span tabIndex={0} role="img" aria-label={t('settings.aboutBackground')} className="focus-ring inline-flex rounded-xs text-text-muted">
                <Info aria-hidden="true" size={14} strokeWidth={1.75} />
              </span>
            </Tooltip>
          </span>
        }
        hint={periodicText(status.periodic)}
      />

      <Row label={t('settings.lastSync', { time: lastSyncAt ? formatFull(lastSyncAt) : t('settings.never') })}>
        <Button
          variant="steel"
          size="sm"
          leadingIcon={RefreshCw}
          loading={status.running}
          onClick={() => void runSyncFromPage({ manual: true })}
        >
          {t('settings.syncNow')}
        </Button>
      </Row>

      <Row label={<label htmlFor={retentionId}>{t('settings.keepPerFeed')}</label>} hint={t('settings.keepHint')}>
        <select
          id={retentionId}
          value={retention}
          onChange={(e) => save('retentionPerFeed', Number(e.target.value) as Settings['retentionPerFeed'])}
          className="h-[30px] rounded-sm border border-border-strong bg-bg px-2 text-sm text-text shadow-[var(--inner-well)] focus-ring"
        >
          {RETENTION_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {t('plural.articles', { count: n })}
            </option>
          ))}
        </select>
      </Row>
    </Section>
  );
}
