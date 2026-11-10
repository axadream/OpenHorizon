import { useId, useState, type ReactNode } from 'react';
import { Check, Download, ExternalLink, Keyboard, ScrollText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { KEYMAP } from '@/hooks/useKeyboardShortcuts';
import { t, useT } from '@/i18n/i18n';
import { toast } from '@/lib/toast';
import { useUiStore } from '@/store/uiStore';
import { Row, Section } from './SettingsParts';

/** Install, keyboard shortcuts, version and changelog. */
export function AppSettings() {
  useT();
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const shortcutsId = useId();
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  async function install(): Promise<void> {
    const outcome = await promptInstall();
    if (outcome === 'accepted') toast.success(t('settings.installing'));
  }

  let installRow: ReactNode;
  if (installed) {
    installRow = (
      <span className="inline-flex items-center gap-1.5 text-sm text-text-muted">
        <Check aria-hidden="true" size={14} strokeWidth={2} />
        {t('settings.installed')}
      </span>
    );
  } else if (canInstall) {
    installRow = (
      <Button variant="primary" size="sm" leadingIcon={Download} onClick={() => void install()}>
        {t('settings.installNow')}
      </Button>
    );
  } else if (isIOS) {
    installRow = <span className="text-sm text-text-muted">{t('settings.installIos')}</span>;
  } else {
    installRow = <span className="text-sm text-text-muted">{t('settings.installNotOffered')}</span>;
  }

  return (
    <Section id="app" title={t('settings.app')}>
      <Row label={t('settings.install')}>{installRow}</Row>

      <div className="flex flex-col gap-3">
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={Keyboard}
          aria-expanded={showShortcuts}
          aria-controls={shortcutsId}
          className="self-start"
          onClick={() => setShowShortcuts((v) => !v)}
        >
          {showShortcuts ? t('settings.shortcutsHide') : t('settings.shortcutsShow')}
        </Button>
        {showShortcuts ? (
          <dl id={shortcutsId} className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-sm">
            {KEYMAP.map((s) => (
              <div key={s.label} className="contents">
                <dt className="flex flex-wrap gap-1">
                  {s.keys.map((k) => (
                    <kbd key={k} className="rounded-xs bg-card px-1.5 py-0.5 font-mono text-xs text-silver">
                      {k}
                    </kbd>
                  ))}
                </dt>
                <dd className="text-text-muted">{s.label}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href="https://github.com/axadream/OpenHorizon"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('settings.githubLabel', { version: __APP_VERSION__ })}
          className="focus-ring inline-flex items-center gap-1 rounded-xs text-xs text-text-muted underline-offset-2 hover:text-accent hover:underline"
        >
          {t('settings.version', { version: __APP_VERSION__ })}
          <ExternalLink aria-hidden="true" size={12} strokeWidth={1.75} className="rtl:-scale-x-100" />
        </a>
        <Button variant="ghost" size="sm" leadingIcon={ScrollText} onClick={() => useUiStore.getState().openDialog('changelog')}>
          {t('settings.whatsNew')}
        </Button>
      </div>
    </Section>
  );
}
