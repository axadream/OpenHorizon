import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Bell, Check, CheckCheck, Download, Info, Keyboard, Rows3, Rows4, RefreshCw, Trash2, Upload, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Dialog } from '@/components/ui/Dialog';
import { Switch } from '@/components/ui/Switch';
import { Tooltip } from '@/components/ui/Tooltip';
import { db } from '@/db/db';
import type { Settings } from '@/db/schema';
import { markAllRead, undoMarkAllRead } from '@/features/articles/articleActions';
import { setSetting, useSetting } from '@/features/settings/settings';
import { runSyncFromPage, useSyncStatus, type PeriodicState } from '@/features/sync/scheduler';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import { exportOpml } from '@/lib/opml/exportOpml';
import { toast } from '@/lib/toast';
import { formatFull } from '@/lib/time';
import { useDialog } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';

/* ---------- helpers ---------- */

/** Save a setting; a failed write shows a toast instead of an unhandled rejection. */
function save<K extends keyof Settings>(key: K, value: Settings[K]): void {
  setSetting(key, value).catch(() => toast.error("Couldn't save the setting"));
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}

type PermissionState = NotificationPermission | 'unsupported';

function readPermission(): PermissionState {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

const PERMISSION_TEXT: Record<PermissionState, string> = {
  granted: 'Allowed in this browser',
  default: 'Not asked yet',
  denied: 'Blocked in your browser settings',
  unsupported: 'Not supported in this browser',
};

const PERIODIC_TEXT: Record<PeriodicState, string> = {
  unknown: 'Checking…',
  registered: 'Enabled by the browser',
  unregistered: 'Off in manual mode',
  denied: 'Install the app to enable',
  unsupported: 'Not supported in this browser',
};

const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ['↓', 'J'], label: 'Next article' },
  { keys: ['↑', 'K'], label: 'Previous article' },
  { keys: ['Enter', 'O'], label: 'Open article (mobile: in reader)' },
  { keys: ['→'], label: 'Focus the pane on the right' },
  { keys: ['←'], label: 'Focus the pane on the left' },
  { keys: ['M'], label: 'Toggle read / unread' },
  { keys: ['L'], label: 'Toggle Read Later' },
  { keys: ['F'], label: 'Toggle favorite' },
  { keys: ['S'], label: 'Share article' },
  { keys: ['V'], label: 'Open original in new tab' },
  { keys: ['R'], label: 'Refresh all feeds (Shift+R: current feed)' },
  { keys: ['A'], label: 'Add feed' },
  { keys: ['/'], label: 'Search' },
  { keys: ['Shift+A'], label: 'Mark all read in current view' },
  { keys: ['Shift+F'], label: 'Toggle reader fullscreen' },
  { keys: [','], label: 'Open settings' },
  { keys: ['?'], label: 'Keyboard shortcuts' },
  { keys: ['1–4'], label: 'Smart views: All, Unread, Favorites, Read Later' },
  { keys: ['Esc'], label: 'Close dialog, popover or menu' },
  { keys: ['Home', 'End'], label: 'First / last article' },
];

interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

/** Chip radiogroup with arrow-key navigation (only the selected chip is in the tab order). */
function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly ChoiceOption<T>[];
  onChange(value: T): void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, delta: number): void => {
    const next = (from + delta + options.length) % options.length;
    const opt = options[next];
    if (!opt) return;
    onChange(opt.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-2"
      onKeyDown={(e) => {
        const idx = options.findIndex((o) => o.value === value);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          move(idx, 1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          move(idx, -1);
        }
      }}
    >
      {options.map((o, i) => {
        const Icon = o.icon;
        return (
          <Chip
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            selected={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {Icon ? <Icon aria-hidden="true" size={14} strokeWidth={1.75} /> : null}
            {o.label}
          </Chip>
        );
      })}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
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

function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children?: ReactNode }) {
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

/* ---------- sections ---------- */

const FREQUENCY_OPTIONS: readonly ChoiceOption<Settings['syncFrequency']>[] = [
  { value: '15m', label: '15 min' },
  { value: '30m', label: '30 min' },
  { value: '1h', label: '1 hour' },
  { value: 'manual', label: 'Manual' },
];

const RETENTION_OPTIONS: readonly Settings['retentionPerFeed'][] = [100, 200, 500, 1000];

function SyncSection() {
  const frequency = useSetting('syncFrequency');
  const storedLastSync = useSetting('lastSyncAt');
  const retention = useSetting('retentionPerFeed');
  const status = useSyncStatus();
  const retentionId = useId();
  const backgroundId = useId();
  const lastSyncAt = status.lastRunAt ?? storedLastSync;

  return (
    <Section id="sync" title="Sync">
      <ChoiceGroup label="Refresh frequency" value={frequency} options={FREQUENCY_OPTIONS} onChange={(v) => save('syncFrequency', v)} />

      <Row
        label={
          <span id={backgroundId} className="inline-flex items-center gap-1.5">
            Background sync
            <Tooltip content="Runs while the app is closed, when the browser allows it.">
              <span tabIndex={0} role="img" aria-label="About background sync" className="focus-ring inline-flex rounded-xs text-text-muted">
                <Info aria-hidden="true" size={14} strokeWidth={1.75} />
              </span>
            </Tooltip>
          </span>
        }
        hint={PERIODIC_TEXT[status.periodic]}
      />

      <Row
        label={`Last sync: ${lastSyncAt ? formatFull(lastSyncAt) : 'never'}`}
      >
        <Button
          variant="steel"
          size="sm"
          leadingIcon={RefreshCw}
          loading={status.running}
          onClick={() => void runSyncFromPage({ manual: true })}
        >
          Sync now
        </Button>
      </Row>

      <Row label={<label htmlFor={retentionId}>Keep per feed</label>} hint="Favorites and Read Later articles are always kept.">
        <select
          id={retentionId}
          value={retention}
          onChange={(e) => save('retentionPerFeed', Number(e.target.value) as Settings['retentionPerFeed'])}
          className="h-[30px] rounded-sm border border-border-strong bg-bg px-2 text-sm text-text shadow-[var(--inner-well)] focus-ring"
        >
          {RETENTION_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} articles
            </option>
          ))}
        </select>
      </Row>
    </Section>
  );
}

function NotificationsSection() {
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
      toast.warning('Notifications are not supported in this browser');
      return;
    }
    if (current === 'default') {
      current = await Notification.requestPermission();
      setPermission(current);
    }
    if (current === 'granted') save('notificationsEnabled', true);
    else toast.warning('Notifications are blocked in your browser settings');
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
      toast.success('Test notification sent');
    } catch (err) {
      toast.error("Couldn't show a notification", { description: errorText(err) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Section id="notifications" title="Notifications">
      <Row
        label={<span id={switchLabelId}>Notify about new articles in favorite feeds</span>}
        hint={
          permission === 'denied'
            ? 'Notifications are blocked in your browser settings.'
            : 'Mark a feed as favorite from its menu to get notified.'
        }
      >
        <Switch
          checked={enabled && !blocked}
          disabled={blocked}
          onCheckedChange={(next) => void toggle(next)}
          aria-labelledby={switchLabelId}
        />
      </Row>
      <Row label="Permission" hint={PERMISSION_TEXT[permission]}>
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={Bell}
          loading={testing}
          disabled={permission !== 'granted'}
          onClick={() => void sendTest()}
        >
          Send test notification
        </Button>
      </Row>
    </Section>
  );
}

const DENSITY_OPTIONS: readonly ChoiceOption<Settings['density']>[] = [
  { value: 'comfortable', label: 'Comfortable', icon: Rows3 },
  { value: 'compact', label: 'Compact', icon: Rows4 },
];

function AppearanceSection() {
  const density = useSetting('density');
  return (
    <Section id="appearance" title="Appearance">
      <Row label="Density">
        <ChoiceGroup label="Density" value={density} options={DENSITY_OPTIONS} onChange={(v) => save('density', v)} />
      </Row>
    </Section>
  );
}

function DataSection() {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  function exportFile(): void {
    exportOpml()
      .then((xml) => {
        const url = URL.createObjectURL(new Blob([xml], { type: 'text/x-opml;charset=utf-8' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'openhorizon.opml';
        document.body.append(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      })
      .catch((err: unknown) => toast.error("Couldn't export OPML", { description: errorText(err) }));
  }

  function importFile(): void {
    const ui = useUiStore.getState();
    ui.closeDialog('settings');
    ui.openDialog('addFeed', { tab: 'opml' });
  }

  async function markEverythingRead(): Promise<void> {
    try {
      const ids = await markAllRead({ type: 'all' });
      if (ids.length === 0) {
        toast.info('Nothing to mark as read');
        return;
      }
      toast.undo(`Marked ${ids.length} ${ids.length === 1 ? 'article' : 'articles'} as read`, {
        onUndo: () => {
          void undoMarkAllRead(ids);
        },
      });
    } catch (err) {
      toast.error("Couldn't mark articles as read", { description: errorText(err) });
    }
  }

  function onDeleteClick(): void {
    if (!confirming) {
      setConfirming(true);
      timer.current = window.setTimeout(() => setConfirming(false), 5000);
      return;
    }
    if (timer.current !== null) window.clearTimeout(timer.current);
    setDeleting(true);
    Promise.all(db.tables.map((t) => t.clear()))
      .then(() => window.location.reload())
      .catch((err: unknown) => {
        setDeleting(false);
        setConfirming(false);
        toast.error("Couldn't delete the data", { description: errorText(err) });
      });
  }

  return (
    <Section id="data" title="Data">
      <div className="flex flex-wrap gap-2">
        <Button variant="steel" size="sm" leadingIcon={Download} onClick={exportFile}>
          Export OPML
        </Button>
        <Button variant="steel" size="sm" leadingIcon={Upload} onClick={importFile}>
          Import OPML
        </Button>
        <Button variant="ghost" size="sm" leadingIcon={CheckCheck} onClick={() => void markEverythingRead()}>
          Mark everything as read
        </Button>
      </div>

      <Row label="Delete all data" hint="Removes feeds, folders, articles and settings from this browser. This cannot be undone.">
        <Button variant="danger" size="sm" leadingIcon={Trash2} loading={deleting} onClick={onDeleteClick}>
          {confirming ? 'Confirm delete' : 'Delete all data'}
        </Button>
      </Row>
    </Section>
  );
}

function AppSection() {
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const shortcutsId = useId();
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  async function install(): Promise<void> {
    const outcome = await promptInstall();
    if (outcome === 'accepted') toast.success('OpenHorizon is being installed');
  }

  let installRow: ReactNode;
  if (installed) {
    installRow = (
      <span className="inline-flex items-center gap-1.5 text-sm text-text-muted">
        <Check aria-hidden="true" size={14} strokeWidth={2} />
        Installed
      </span>
    );
  } else if (canInstall) {
    installRow = (
      <Button variant="primary" size="sm" leadingIcon={Download} onClick={() => void install()}>
        Install OpenHorizon
      </Button>
    );
  } else if (isIOS) {
    installRow = <span className="text-sm text-text-muted">Use Share, then Add to Home Screen.</span>;
  } else {
    installRow = <span className="text-sm text-text-muted">Your browser has not offered an install yet.</span>;
  }

  return (
    <Section id="app" title="App">
      <Row label="Install">{installRow}</Row>

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
          {showShortcuts ? 'Hide keyboard shortcuts' : 'Keyboard shortcuts'}
        </Button>
        {showShortcuts ? (
          <dl id={shortcutsId} className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 gap-y-2 text-sm">
            {SHORTCUTS.map((s) => (
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

      <p className="text-xs text-text-faint">Version {__APP_VERSION__}</p>
    </Section>
  );
}

function SettingsBody({ section }: { section?: string }) {
  useEffect(() => {
    if (!section) return;
    document.getElementById(`settings-${section}`)?.scrollIntoView({ block: 'start' });
  }, [section]);

  return (
    <div className="flex flex-col">
      <SyncSection />
      <NotificationsSection />
      <AppearanceSection />
      <DataSection />
      <AppSection />
    </div>
  );
}

/** Settings dialog. Open state and payload live in `dialogs.settings` (store/uiStore). */
export function SettingsDialog() {
  const payload = useDialog('settings');
  const open = payload !== false;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) useUiStore.getState().closeDialog('settings');
      }}
      title="Settings"
    >
      {payload === false ? null : <SettingsBody section={payload.section} />}
    </Dialog>
  );
}
