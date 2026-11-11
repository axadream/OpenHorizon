import { useId, useState, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  Download,
  ExternalLink,
  Hand,
  Keyboard,
  Pointer,
  ScrollText,
  Undo2,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { KEYMAP } from '@/hooks/useKeyboardShortcuts';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { t, useT } from '@/i18n/i18n';
import { toast } from '@/lib/toast';
import { useUiStore } from '@/store/uiStore';
import { Row, Section } from './SettingsParts';

/** Touch gestures (DESIGN 8.5). Each icon sits before the gesture name; the swipe arrows mirror in RTL. */
interface GestureEntry {
  key: string;
  icon: LucideIcon;
  mirror?: boolean;
  name: string;
  description: string;
}

function gestureEntries(): GestureEntry[] {
  return [
    { key: 'tap', icon: Pointer, name: t('gesture.tap'), description: t('gesture.tapDesc') },
    { key: 'longPress', icon: Hand, name: t('gesture.longPress'), description: t('gesture.longPressDesc') },
    { key: 'swipeRight', icon: ArrowRight, mirror: true, name: t('gesture.swipeRight'), description: t('gesture.swipeRightDesc') },
    { key: 'swipeLeft', icon: ArrowLeft, mirror: true, name: t('gesture.swipeLeft'), description: t('gesture.swipeLeftDesc') },
    { key: 'pullDown', icon: ArrowDown, name: t('gesture.pullDown'), description: t('gesture.pullDownDesc') },
    { key: 'back', icon: Undo2, name: t('gesture.back'), description: t('gesture.backDesc') },
  ];
}

/** Install, keyboard shortcuts or touch gestures (by device), version and changelog. */
export function AppSettings() {
  useT();
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const isTouch = useMediaQuery('(hover: none) and (pointer: coarse)');
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showGestures, setShowGestures] = useState(false);
  const shortcutsId = useId();
  const gesturesId = useId();
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

      {isTouch ? (
        <div className="flex flex-col gap-3">
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={Hand}
            aria-expanded={showGestures}
            aria-controls={gesturesId}
            className="self-start"
            onClick={() => setShowGestures((v) => !v)}
          >
            {showGestures ? t('settings.gesturesHide') : t('settings.gesturesShow')}
          </Button>
          {showGestures ? (
            <>
              <dl id={gesturesId} className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-sm">
                {gestureEntries().map((g) => {
                  const Icon = g.icon;
                  return (
                    <div key={g.key} className="contents">
                      <dt className="flex items-center gap-1.5 text-silver">
                        <Icon
                          aria-hidden="true"
                          size={14}
                          strokeWidth={1.75}
                          className={g.mirror ? 'shrink-0 rtl:-scale-x-100' : 'shrink-0'}
                        />
                        {g.name}
                      </dt>
                      <dd className="text-text-muted">{g.description}</dd>
                    </div>
                  );
                })}
              </dl>
              <p className="text-xs text-text-muted">{t('gesture.rtlNote')}</p>
            </>
          ) : null}
        </div>
      ) : (
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
      )}

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
