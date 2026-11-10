import { useId } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { CHIME_NAMES, previewChime, type ChimeName } from '@/features/audio/chimes';
import { useSetting } from '@/features/settings/settings';
import { t, useT } from '@/i18n/i18n';
import { Row, Section, save } from './SettingsParts';

function chimeLabel(name: ChimeName): string {
  switch (name) {
    case 'refresh':
      return t('sound.refresh');
    case 'done':
      return t('sound.done');
    case 'bookmark':
      return t('sound.bookmark');
    case 'error':
      return t('sound.error');
    case 'delete':
      return t('sound.delete');
  }
}

/** Synthesized chimes (features/audio/chimes.ts). Off by default; previews play even when off. */
export function SoundSettings() {
  useT();
  const enabled = useSetting('soundsEnabled');
  const volume = useSetting('soundVolume');
  const switchId = useId();
  const volumeId = useId();

  return (
    <Section id="sound" title={t('settings.sound')}>
      <Row label={<span id={switchId}>{t('settings.soundsEnabled')}</span>} hint={t('settings.soundsHint')}>
        <Switch checked={enabled} onCheckedChange={(on) => save('soundsEnabled', on)} aria-labelledby={switchId} />
      </Row>

      <Row label={<label htmlFor={volumeId}>{t('settings.volume')}</label>}>
        <input
          id={volumeId}
          type="range"
          min={0}
          max={100}
          step={5}
          value={volume}
          onChange={(e) => save('soundVolume', Number(e.target.value))}
          className="focus-ring w-40 accent-[var(--color-accent)]"
        />
        <span className="w-10 text-end text-xs text-text-muted tabular-nums">{volume}%</span>
      </Row>

      <div className="flex flex-wrap gap-2">
        {CHIME_NAMES.map((name) => (
          <Button
            key={name}
            variant="ghost"
            size="sm"
            leadingIcon={Play}
            aria-label={t('settings.previewSound', { name: chimeLabel(name) })}
            onClick={() => void previewChime(name)}
          >
            {chimeLabel(name)}
          </Button>
        ))}
      </div>
    </Section>
  );
}
