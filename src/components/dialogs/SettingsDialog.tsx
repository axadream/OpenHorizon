import { useEffect } from 'react';
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

function SettingsBody({ section }: { section?: string }) {
  useEffect(() => {
    if (!section) return;
    document.getElementById(`settings-${section}`)?.scrollIntoView({ block: 'start' });
  }, [section]);

  return (
    <div className="flex flex-col">
      <SyncSettings />
      <NotificationSettings />
      <AppearanceSettings />
      <SoundSettings />
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
