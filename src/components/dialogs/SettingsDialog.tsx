import { lazy, Suspense, useEffect } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { t, useT } from '@/i18n/i18n';
import { useDialog } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import { AppSettings } from './settings/AppSettings';
import { AppearanceSettings } from './settings/AppearanceSettings';
import { DataSettings } from './settings/DataSettings';
import { NotificationSettings } from './settings/NotificationSettings';
import { SoundSettings } from './settings/SoundSettings';
import { SyncSettings } from './settings/SyncSettings';

/* AI settings pull in the AI modules, so they load only when the dialog opens (page code, never sw.ts). */
const AiSettings = lazy(() => import('./settings/AiSettings').then((m) => ({ default: m.AiSettings })));

function SettingsBody({ section }: { section?: string }) {
  useEffect(() => {
    if (!section) return;
    // The AI section is lazy-loaded, so retry briefly until its element exists.
    let tries = 0;
    const timer = setInterval(() => {
      const el = document.getElementById(`settings-${section}`);
      if (el || ++tries > 20) {
        clearInterval(timer);
        el?.scrollIntoView({ block: 'start' });
      }
    }, 50);
    return () => clearInterval(timer);
  }, [section]);

  return (
    <div className="flex flex-col">
      <SyncSettings />
      <NotificationSettings />
      <AppearanceSettings />
      <SoundSettings />
      <Suspense fallback={null}>
        <AiSettings />
      </Suspense>
      <DataSettings />
      <AppSettings />
    </div>
  );
}

/** Settings dialog. Open state and payload live in `dialogs.settings` (store/uiStore). */
export function SettingsDialog() {
  useT();
  const payload = useDialog('settings');
  const open = payload !== false;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) useUiStore.getState().closeDialog('settings');
      }}
      title={t('settings.title')}
    >
      {payload === false ? null : <SettingsBody section={payload.section} />}
    </Dialog>
  );
}
