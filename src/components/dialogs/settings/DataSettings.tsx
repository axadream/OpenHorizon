import { useEffect, useRef, useState } from 'react';
import { CheckCheck, Download, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { db } from '@/db/db';
import { markAllRead, undoMarkAllRead } from '@/features/articles/articleActions';
import { requestStoragePersistence, useStorageStatus } from '@/features/system/storage';
import { t, useT } from '@/i18n/i18n';
import { formatBytes } from '@/lib/bytes';
import { exportOpml } from '@/lib/opml/exportOpml';
import { toast } from '@/lib/toast';
import { useUiStore } from '@/store/uiStore';
import { Row, Section, errorText } from './SettingsParts';

/** Persistence state and usage. Best effort means the browser may evict data under storage pressure. */
function StorageRow() {
  useT();
  const status = useStorageStatus();
  const [requesting, setRequesting] = useState(false);

  const usageText =
    status.usage === null
      ? t('settings.usageUnknown')
      : status.quota === null
        ? t('settings.usage', { used: formatBytes(status.usage) })
        : t('settings.usageOf', { used: formatBytes(status.usage), quota: formatBytes(status.quota) });

  async function request(): Promise<void> {
    setRequesting(true);
    try {
      const granted = await requestStoragePersistence();
      if (granted) toast.success(t('settings.persistGranted'));
      else toast.info(t('settings.persistDenied'));
    } catch (err) {
      toast.error(t('settings.persistFailed'), { description: errorText(err) });
    } finally {
      setRequesting(false);
      status.refresh();
    }
  }

  return (
    <Row label={t('settings.storage')} hint={usageText}>
      <span className="text-sm text-silver">{status.persisted ? t('settings.persistent') : t('settings.bestEffort')}</span>
      {status.persisted ? null : (
        <Button variant="ghost" size="sm" leadingIcon={ShieldCheck} loading={requesting} onClick={() => void request()}>
          {t('settings.requestPersistence')}
        </Button>
      )}
    </Row>
  );
}

export function DataSettings() {
  useT();
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
      .catch((err: unknown) => toast.error(t('settings.exportFailed'), { description: errorText(err) }));
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
        toast.info(t('settings.nothingToMark'));
        return;
      }
      toast.undo(t('plural.marked', { count: ids.length }), {
        label: t('common.undo'),
        onUndo: () => {
          void undoMarkAllRead(ids);
        },
      });
    } catch (err) {
      toast.error(t('settings.markFailed'), { description: errorText(err) });
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
    Promise.all(db.tables.map((table) => table.clear()))
      .then(() => window.location.reload())
      .catch((err: unknown) => {
        setDeleting(false);
        setConfirming(false);
        toast.error(t('settings.deleteFailed'), { description: errorText(err) });
      });
  }

  return (
    <Section id="data" title={t('settings.data')}>
      <div className="flex flex-wrap gap-2">
        <Button variant="steel" size="sm" leadingIcon={Download} onClick={exportFile}>
          {t('settings.exportOpml')}
        </Button>
        <Button variant="steel" size="sm" leadingIcon={Upload} onClick={importFile}>
          {t('settings.importOpml')}
        </Button>
        <Button variant="ghost" size="sm" leadingIcon={CheckCheck} onClick={() => void markEverythingRead()}>
          {t('settings.markEverything')}
        </Button>
      </div>

      <StorageRow />

      <Row label={t('settings.deleteAll')} hint={t('settings.deleteHint')}>
        <Button variant="danger" size="sm" leadingIcon={Trash2} loading={deleting} onClick={onDeleteClick}>
          {confirming ? t('settings.confirmDelete') : t('settings.deleteAll')}
        </Button>
      </Row>
    </Section>
  );
}
