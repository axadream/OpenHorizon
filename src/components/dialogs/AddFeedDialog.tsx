import { useMemo, useState } from 'react';
import { Bookmark, FileCode, Globe, Link, Upload } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/Tabs';
import { t, useT } from '@/i18n/i18n';
import { useDialog } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import type { AddFeedTab, OpmlFilePayload } from '@/store/types';
import { AddByUrlTab } from '@/components/dialogs/tabs/AddByUrlTab';
import { DiscoverTab } from '@/components/dialogs/tabs/DiscoverTab';
import { PasteXmlTab } from '@/components/dialogs/tabs/PasteXmlTab';
import { ImportOpmlTab } from '@/components/dialogs/tabs/ImportOpmlTab';
import { SavePageTab } from '@/components/dialogs/tabs/SavePageTab';

let sessionSeq = 0;

interface AddFeedBodyProps {
  initialUrl?: string;
  initialTab: AddFeedTab;
  opmlFile?: OpmlFilePayload;
}

/** Remounted on every open (via `key`), so each open starts from the payload. */
function AddFeedBody({ initialUrl, initialTab, opmlFile }: AddFeedBodyProps) {
  const [tab, setTab] = useState<AddFeedTab>(initialTab);
  const [discoverUrl, setDiscoverUrl] = useState(initialTab === 'discover' ? (initialUrl ?? '') : '');
  const [notice, setNotice] = useState<string | undefined>(undefined);

  const onNotAFeed = (url: string): void => {
    setDiscoverUrl(url);
    setNotice(t('add.notAFeed'));
    setTab('discover');
  };

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as AddFeedTab)} className="gap-4">
      <TabList label={t('add.sourceLabel')}>
        <Tab value="url" icon={Link}>
          {t('add.tabUrl')}
        </Tab>
        <Tab value="discover" icon={Globe}>
          {t('add.tabDiscover')}
        </Tab>
        <Tab value="save" icon={Bookmark}>
          {t('save.tab')}
        </Tab>
        <Tab value="xml" icon={FileCode}>
          {t('add.tabXml')}
        </Tab>
        <Tab value="opml" icon={Upload}>
          {t('add.tabOpml')}
        </Tab>
      </TabList>

      <TabPanel value="url" className="pt-1">
        <AddByUrlTab initialUrl={initialUrl} onNotAFeed={onNotAFeed} />
      </TabPanel>
      <TabPanel value="discover" className="pt-1">
        <DiscoverTab initialUrl={discoverUrl} notice={notice} />
      </TabPanel>
      <TabPanel value="save" className="pt-1">
        <SavePageTab />
      </TabPanel>
      <TabPanel value="xml" className="pt-1">
        <PasteXmlTab />
      </TabPanel>
      <TabPanel value="opml" className="pt-1">
        <ImportOpmlTab initialFile={opmlFile} />
      </TabPanel>
    </Tabs>
  );
}

/** Add feed dialog. Open state and payload live in `dialogs.addFeed` (store/uiStore). */
export function AddFeedDialog() {
  useT();
  const payload = useDialog('addFeed');
  const open = payload !== false;
  // A new session per open: a fresh object from openDialog gives a fresh key.
  const session = useMemo(() => (open ? ++sessionSeq : 0), [payload]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) useUiStore.getState().closeDialog('addFeed');
      }}
      title={t('add.title')}
    >
      {payload === false ? null : (
        <AddFeedBody
          key={session}
          initialUrl={payload.initialUrl}
          initialTab={payload.tab ?? 'url'}
          opmlFile={payload.opmlFile}
        />
      )}
    </Dialog>
  );
}
