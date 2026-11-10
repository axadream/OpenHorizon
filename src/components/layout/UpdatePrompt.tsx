import { useEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { toast } from '@/lib/toast';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Service worker lifecycle UI (registerType 'prompt'). Renders nothing itself:
 * a sticky toast offers "Reload" when a new build is waiting, and a short toast
 * confirms the offline shell is ready. Mount once, inside AppShell.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Check for a new build hourly while the app stays open.
      window.setInterval(() => {
        void registration.update();
      }, UPDATE_CHECK_MS);
    },
  });

  // One sticky toast per page load; it stays until the user reloads or dismisses it.
  const shownRef = useRef(false);
  useEffect(() => {
    if (!needRefresh || shownRef.current) return;
    shownRef.current = true;
    toast.info('Update available', {
      description: 'A new version of OpenHorizon is ready.',
      duration: 0,
      action: {
        label: 'Reload',
        onClick: () => {
          void updateServiceWorker(true);
        },
      },
    });
  }, [needRefresh, updateServiceWorker]);

  useEffect(() => {
    if (!offlineReady) return;
    toast.success('Ready to work offline', { duration: 4000 });
    setOfflineReady(false);
  }, [offlineReady, setOfflineReady]);

  return null;
}
