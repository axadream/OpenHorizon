import { useMemo, useState } from 'react';
import { FileCode, Globe, Link, Upload } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/Tabs';
import { useDialog } from '@/store/selectors';
import { useUiStore } from '@/store/uiStore';
import type { AddFeedTab, OpmlFilePayload } from '@/store/types';
import { AddByUrlTab } from '@/components/dialogs/tabs/AddByUrlTab';
import { DiscoverTab } from '@/components/dialogs/tabs/DiscoverTab';
import { PasteXmlTab } from '@/components/dialogs/tabs/PasteXmlTab';
import { ImportOpmlTab } from '@/components/dialogs/tabs/ImportOpmlTab';

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
    setNotice("That address is a web page, not a feed. Looking for feeds on it…");
    setTab('discover');
  };

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as AddFeedTab)} className="gap-4">
      <TabList label="Add feed source">
        <Tab value="url" icon={Link}>
          URL
        </Tab>
        <Tab value="discover" icon={Globe}>
          Discover
        </Tab>
        <Tab value="xml" icon={FileCode}>
          Paste XML
        </Tab>
        <Tab value="opml" icon={Upload}>
          Import OPML
        </Tab>
      </TabList>

      <TabPanel value="url" className="pt-1">
        <AddByUrlTab initialUrl={initialUrl} onNotAFeed={onNotAFeed} />
      </TabPanel>
      <TabPanel value="discover" className="pt-1">
        <DiscoverTab initialUrl={discoverUrl} notice={notice} />
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
      title="Add feed"
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
