import { useRef, useState, type ReactNode } from 'react';
import { Bell, BookOpen, Bookmark, Download, Inbox, Plus, RefreshCw, Rss, Star, Type } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Badge } from '@/components/ui/Badge';
import { Chip } from '@/components/ui/Chip';
import { Switch } from '@/components/ui/Switch';
import { Input, Textarea } from '@/components/ui/Input';
import { Tab, TabList, TabPanel, Tabs } from '@/components/ui/Tabs';
import { Popover } from '@/components/ui/Popover';
import { Dialog } from '@/components/ui/Dialog';
import { Menu, MenuItem } from '@/components/ui/Menu';
import { Tooltip } from '@/components/ui/Tooltip';
import { FeedAvatar } from '@/components/ui/Avatar';
import { VisuallyHidden } from '@/components/ui/VisuallyHidden';
import { ArticleRowSkeleton, FeedRowSkeleton, ReaderSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ToastRegion } from '@/components/ui/Toast';
import { toast } from '@/lib/toast';
import { useRovingFocus } from '@/hooks/useRovingFocus';
import { useIsMobile } from '@/hooks/useIsMobile';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/** Throwaway: renders every primitive in every state. Open at /?gallery=1 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`g-${title.replace(/\W+/g, '-')}`} className="hairline-b py-6">
      <h2 id={`g-${title.replace(/\W+/g, '-')}`} className="mb-4 text-xs font-semibold tracking-[0.08em] text-text-faint uppercase">
        {title}
      </h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

function Demo({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 rounded-md bg-panel p-3">{children}</div>;
}

function RadioGroupDemo() {
  const [value, setValue] = useState('unread');
  const ref = useRef<HTMLDivElement>(null);
  useRovingFocus(ref, '[role="radio"]', { orientation: 'horizontal' });
  const options = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'fav', label: 'Favorites' },
  ];
  return (
    <div ref={ref} role="radiogroup" aria-label="Filter" className="flex gap-2">
      {options.map((o) => (
        <Chip
          key={o.id}
          selected={value === o.id}
          onClick={() => setValue(o.id)}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              e.preventDefault();
              setValue(o.id);
            }
          }}
        >
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

function TabsDemo() {
  const [value, setValue] = useState('url');
  return (
    <Tabs value={value} onValueChange={setValue} className="w-full max-w-md">
      <TabList label="Add feed">
        <Tab value="url" icon={Rss}>URL</Tab>
        <Tab value="discover">Discover</Tab>
        <Tab value="xml">Paste XML</Tab>
      </TabList>
      <TabPanel value="url" className="p-3 text-sm">URL panel content</TabPanel>
      <TabPanel value="discover" className="p-3 text-sm">Discover panel content</TabPanel>
      <TabPanel value="xml" className="p-3 text-sm">Paste XML panel content</TabPanel>
    </Tabs>
  );
}

function PopoverDemo() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button ref={triggerRef} variant="steel" size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)} leadingIcon={Type}>
        Reading preferences
      </Button>
      <Popover open={open} onOpenChange={setOpen} triggerRef={triggerRef} label="Reading preferences" className="w-[280px] p-3">
        <p className="text-sm text-silver">Popover content. Flips when near the viewport edge.</p>
        <Input aria-label="Sample field" placeholder="Focus lands here" className="mt-2" />
      </Popover>
    </>
  );
}

function MenuDemo() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <IconButton ref={triggerRef} label="More actions" icon={RefreshCw} aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      <Menu open={open} onOpenChange={setOpen} triggerRef={triggerRef} label="Feed actions">
        <MenuItem icon={Star} hint="F">Favorite feed</MenuItem>
        <MenuItem icon={Bookmark}>Mark all read</MenuItem>
        <MenuItem icon={Download} disabled>Export (disabled)</MenuItem>
        <MenuItem icon={Bell} destructive onClick={() => toast.error('Unsubscribed (demo)')}>
          Unsubscribe
        </MenuItem>
      </Menu>
    </>
  );
}

function DialogDemo() {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState('');
  return (
    <>
      <Button variant="steel" onClick={() => setOpen(true)}>Open dialog</Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Add feed"
        description="Esc or the backdrop closes; focus returns to this button."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => { toast.success('Subscribed (demo)'); setOpen(false); }}>Add feed</Button>
          </>
        }
      >
        <Input aria-label="Feed URL" type="url" placeholder="https://example.com/feed.xml" value={v} onChange={(e) => setV(e.target.value)} />
        <div className="mt-4 h-40 rounded-md bg-panel p-3 text-sm text-text-muted">Scrollable body placeholder</div>
      </Dialog>
    </>
  );
}

function ToastDemo() {
  return (
    <>
      <Button variant="steel" size="sm" onClick={() => toast.success('Subscribed to The Verge', { description: 'Fetched 24 articles' })}>Success</Button>
      <Button variant="steel" size="sm" onClick={() => toast.error('Sync failed for 2 feeds', { action: { label: 'Details', onClick: () => toast.info('Details opened') } })}>Error</Button>
      <Button variant="steel" size="sm" onClick={() => toast.info('You are offline')}>Info</Button>
      <Button variant="steel" size="sm" onClick={() => toast.warning('Feed is slow')}>Warning</Button>
      <Button variant="steel" size="sm" onClick={() => toast.undo('Marked 12 as read', { onUndo: () => toast.info('Undone') })}>Undo</Button>
      <Button variant="steel" size="sm" onClick={() => toast.info('Sticky toast', { duration: 0 })}>Sticky</Button>
    </>
  );
}

export function DevGallery() {
  const isMobile = useIsMobile();
  const reduced = usePrefersReducedMotion();
  const [sw, setSw] = useState(true);
  const [sw2, setSw2] = useState(false);
  const [loading, setLoading] = useState(false);

  return (
    <div className="min-h-dvh bg-bg text-silver">
      <header className="steel hairline-b sticky top-0 z-[var(--z-sticky)] flex h-[var(--toolbar-h)] items-center gap-3 px-4">
        <Rss aria-hidden="true" size={20} className="text-accent" />
        <h1 className="text-lg font-semibold text-text">Component gallery</h1>
        <span className="ml-auto text-xs text-text-muted">
          mobile: {String(isMobile)} · reduced motion: {String(reduced)}
        </span>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-24">
        <Section title="Button">
          <Demo>
            <Button variant="primary" leadingIcon={Plus}>Primary</Button>
            <Button variant="steel">Steel</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="primary" size="sm">Primary sm</Button>
            <Button variant="steel" size="sm" leadingIcon={Download}>Steel sm</Button>
            <Button variant="ghost" size="sm">Ghost sm</Button>
            <Button variant="danger" size="sm">Danger sm</Button>
          </Demo>
          <Demo>
            <Button disabled>Disabled</Button>
            <Button loading={loading} onClick={() => { setLoading(true); window.setTimeout(() => setLoading(false), 1200); }}>
              Click for loading
            </Button>
          </Demo>
        </Section>

        <Section title="IconButton">
          <Demo>
            <IconButton label="Star" icon={Star} />
            <IconButton label="Star pressed" icon={Star} pressed />
            <IconButton label="Refresh active" icon={RefreshCw} active />
            <IconButton label="Refresh sm" icon={RefreshCw} size="sm" />
            <IconButton label="Disabled" icon={Bookmark} disabled />
          </Demo>
        </Section>

        <Section title="Badge">
          <Demo>
            <Badge count={0} />
            <Badge count={0} showZero />
            <Badge count={5} />
            <Badge count={42} tone="accent" />
            <Badge count={1500} />
          </Demo>
        </Section>

        <Section title="Chip (radio group and tabs)">
          <RadioGroupDemo />
          <Chip role="tab" selected>Tab chip</Chip>
        </Section>

        <Section title="Switch">
          <Switch checked={sw} onCheckedChange={setSw} aria-label="Notify about new articles" />
          <Switch checked={sw2} onCheckedChange={setSw2} aria-label="Fetch now" />
          <Switch checked disabled aria-label="Disabled on" />
        </Section>

        <Section title="Input and Textarea">
          <div className="grid w-full gap-3 md:grid-cols-2">
            <Input aria-label="Plain input" placeholder="Feed URL" />
            <Input aria-label="Invalid input" invalid errorId="gal-err" defaultValue="not a url" />
            <p id="gal-err" className="text-sm text-danger md:col-span-2">Enter a valid http(s) URL.</p>
            <Textarea aria-label="Textarea" rows={3} placeholder="Paste feed XML" className="font-mono text-sm md:col-span-2" />
          </div>
        </Section>

        <Section title="Tabs">
          <TabsDemo />
        </Section>

        <Section title="Popover, Menu, Dialog, Tooltip">
          <PopoverDemo />
          <MenuDemo />
          <DialogDemo />
          <Tooltip content="Mark as read">
            <IconButton label="Mark as read" icon={Inbox} />
          </Tooltip>
        </Section>

        <Section title="Avatar">
          <Demo>
            <FeedAvatar title="The Verge" src="/__gallery_missing_1.png" fallbackSrcs={['/__gallery_missing_2.png']} size={20} />
            <FeedAvatar title="Letter fallback" size={16} />
            <FeedAvatar title="Hacker News" size={20} />
            <span className="text-sm">Feed title next to avatar</span>
          </Demo>
        </Section>

        <Section title="Skeleton">
          <div className="grid w-full gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-md bg-panel p-3">
              <ArticleRowSkeleton />
              <FeedRowSkeleton />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="rounded-md bg-panel p-3">
              <ReaderSkeleton />
            </div>
          </div>
        </Section>

        <Section title="EmptyState">
          <div className="hairline grid w-full rounded-lg bg-panel md:grid-cols-2">
            <EmptyState
              icon={BookOpen}
              title="Select an article"
              description="Choose something from the timeline to start reading."
            />
            <EmptyState
              icon={Rss}
              title="No feeds yet"
              description="Add your first feed to start reading."
              action={{ label: 'Add feed', icon: Plus, onClick: () => toast.info('Add feed (demo)') }}
              secondaryAction={{ label: 'Import OPML', onClick: () => toast.info('Import (demo)') }}
            />
          </div>
        </Section>

        <Section title="Toast">
          <ToastDemo />
        </Section>

        <Section title="VisuallyHidden">
          <p className="text-sm">
            Visible text
            <VisuallyHidden> (screen reader only text)</VisuallyHidden>
          </p>
        </Section>

        <Section title="Reader typography">
          <div className="reader-content w-full">
            <h2>Heading two</h2>
            <p>
              Body paragraph with a <a href="#gallery">link</a>. Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </p>
            <blockquote>A blockquote, styled with the accent rule.</blockquote>
            <pre><code>{'const answer = 42;'}</code></pre>
          </div>
        </Section>

        <Section title="Motion">
          <Button variant="steel" size="sm" onClick={() => setSw((v) => !v)} leadingIcon={Type}>Toggle to replay pop-in on Switch</Button>
          <span className="inline-flex items-center gap-2 text-sm">
            <span className="size-2 rounded-full bg-accent animate-pulse-dot" /> pulse-dot
          </span>
          <span className="inline-flex items-center gap-2 text-sm">
            <RefreshCw aria-hidden="true" size={16} className="animate-spin-slow" /> spin-slow
          </span>
        </Section>
      </main>

      <ToastRegion />
    </div>
  );
}
