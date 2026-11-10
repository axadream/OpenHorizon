import { useId, useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Switch } from '@/components/ui/Switch';
import { useSetting } from '@/features/settings/settings';
import { isAppBadgeSupported } from '@/features/system/badge';
import { t, useT } from '@/i18n/i18n';
import { toast } from '@/lib/toast';
import { Row, Section, errorText, save } from './SettingsParts';

/* Notification text (title, body) stays English: it is built in the service worker path too (see features/sync/notifications.ts). */

type PermissionState = NotificationPermission | 'unsupported';

function readPermission(): PermissionState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

function permissionText(state: PermissionState): string {
  switch (state) {
    case 'granted':
      return t('settings.permGranted');
    case 'default':
      return t('settings.permDefault');
    case 'denied':
      return t('settings.permDenied');
    case 'unsupported':
      return t('settings.permUnsupported');
  }
}

export function NotificationSettings() {
  useT();
  const enabled = useSetting('notificationsEnabled');
  const [permission, setPermission] = useState<PermissionState>(readPermission);
  const [testing, setTesting] = useState(false);
  const switchLabelId = useId();

  const blocked = permission === 'denied' || permission === 'unsupported';

  async function toggle(next: boolean): Promise<void> {
    if (!next) {
      save('notificationsEnabled', false);
      return;
    }
    let current = permission;
    if (current === 'unsupported') {
      toast.warning(t('settings.notifUnsupported'));
      return;
    }
    if (current === 'default') {
      current = await Notification.requestPermission();
      setPermission(current);
    }
    if (current === 'granted') save('notificationsEnabled', true);
    else toast.warning(t('settings.notifBlockedToast'));
  }

  async function sendTest(): Promise<void> {
    setTesting(true);
    try {
      if (!('serviceWorker' in navigator)) throw new Error('Service workers are not available here.');
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('OpenHorizon test', {
        body: 'Notifications are working.',
        icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
        badge: `${import.meta.env.BASE_URL}icons/icon-192.png`,
        tag: 'oh-test',
      });
      toast.success(t('settings.testSent'));
    } catch (err) {
      toast.error(t('settings.testFailed'), { description: errorText(err) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Section id="notifications" title={t('settings.notifications')}>
      <Row
        label={<span id={switchLabelId}>{t('settings.notifyFavorites')}</span>}
        hint={permission === 'denied' ? t('settings.notifyBlocked') : t('settings.notifyHint')}
      >
        <Switch
          checked={enabled && !blocked}
          disabled={blocked}
          onCheckedChange={(next) => void toggle(next)}
          aria-labelledby={switchLabelId}
        />
      </Row>
      <Row label={t('settings.permission')} hint={permissionText(permission)}>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={Bell}
          loading={testing}
          disabled={permission !== 'granted'}
          onClick={() => void sendTest()}
        >
          {t('settings.sendTest')}
        </Button>
      </Row>

      <AppBadgeRow />
    </Section>
  );
}

/** Unread count on the installed app icon. Disabled with an explanation where the Badging API is missing. */
function AppBadgeRow() {
  const appBadge = useSetting('appBadge');
  const supported = isAppBadgeSupported();
  const badgeLabelId = useId();
  return (
    <Row
      label={<span id={badgeLabelId}>{t('settings.appBadge')}</span>}
      hint={supported ? t('settings.badgeHint') : t('settings.badgeUnsupported')}
    >
      <Switch
        checked={appBadge && supported}
        disabled={!supported}
        onCheckedChange={(next) => save('appBadge', next)}
        aria-labelledby={badgeLabelId}
      />
    </Row>
  );
}
