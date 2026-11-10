import { AddFeedDialog } from '@/components/dialogs/AddFeedDialog';
import { SettingsDialog } from '@/components/dialogs/SettingsDialog';

/** Mounts the app's modal dialogs. Each reads its own open state from the UI store. */
export function AppDialogs() {
  return (
    <>
      <AddFeedDialog />
      <SettingsDialog />
    </>
  );
}
