import { useId, useState, type FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { db } from '@/db/db';
import { addManualFeedFromXml } from '@/features/feeds/addFeed';
import { onFeedSubscribed } from '@/components/dialogs/subscribe';

/** Subscribe to feed content pasted as text. The feed has no URL, so it is never refreshed. */
export function PasteXmlTab() {
  const uid = useId();
  const xmlId = `${uid}-xml`;
  const titleId = `${uid}-title`;
  const errorId = `${uid}-error`;

  const [xml, setXml] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (busy) return;
    if (!xml.trim()) {
      setError('Paste the feed XML or JSON first');
      return;
    }
    if (!title.trim()) {
      setError('Enter a title for this feed');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const feed = await addManualFeedFromXml(xml);
      const finalTitle = title.trim();
      await db.feeds.update(feed.id, { title: finalTitle, titleCustomized: 1 });
      onFeedSubscribed({ ...feed, title: finalTitle });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This does not look like a feed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={xmlId} className="text-sm font-medium text-silver">
          Paste feed XML or JSON Feed
        </label>
        <Textarea
          id={xmlId}
          rows={10}
          spellCheck={false}
          disabled={busy}
          placeholder="<rss version=&quot;2.0&quot;>…"
          className="font-mono text-sm"
          invalid={error !== null && !xml.trim()}
          value={xml}
          onChange={(e) => {
            setXml(e.target.value);
            if (error) setError(null);
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={titleId} className="text-sm font-medium text-silver">
          Feed title
        </label>
        <Input
          id={titleId}
          disabled={busy}
          maxLength={200}
          placeholder="My pasted feed"
          value={title}
          invalid={error !== null && !title.trim()}
          errorId={error ? errorId : undefined}
          onChange={(e) => {
            setTitle(e.target.value);
            if (error) setError(null);
          }}
        />
      </div>

      {error ? (
        <div id={errorId} role="alert" className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle aria-hidden="true" size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={busy}>
          Add feed
        </Button>
      </div>
    </form>
  );
}
