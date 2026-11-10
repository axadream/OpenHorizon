import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Check, Rss } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { useFeeds } from '@/features/feeds/feedQueries';
import { AlreadySubscribedError, addFeedFromUrl } from '@/features/feeds/addFeed';
import { discoverFeeds, type FeedCandidate } from '@/lib/discovery/discoverFeeds';
import { diagnoseFetchError } from '@/lib/proxy/diagnose';
import { hostname, normalizeFeedUrl } from '@/lib/url';
import type { FeedKind } from '@/lib/parser/types';
import { toast } from '@/lib/toast';
import { onFeedSubscribed } from '@/components/dialogs/subscribe';

export interface DiscoverTabProps {
  /** Website to search on mount (set when an HTML page was pasted in the URL tab). */
  initialUrl?: string;
  /** Explanation shown above the form when the tab was opened automatically. */
  notice?: string;
}

const KIND_LABEL: Record<FeedKind, string> = {
  rss2: 'RSS',
  rss1: 'RSS',
  atom: 'Atom',
  json: 'JSON',
};

/** Message shown in the search alert: a bold title and an optional explanation. */
interface SearchError {
  title: string;
  detail?: string;
}

function describeError(err: unknown): SearchError {
  const diagnosis = diagnoseFetchError(err, { online: navigator.onLine });
  return { title: diagnosis.title, detail: diagnosis.detail || undefined };
}

interface CandidateRowProps {
  candidate: FeedCandidate;
  subscribed: boolean;
  busy: boolean;
  onAdd(candidate: FeedCandidate): void;
}

function CandidateRow({ candidate, subscribed, busy, onAdd }: CandidateRowProps) {
  const title = candidate.title || hostname(candidate.url) || candidate.url;
  return (
    <li className="steel-card flex items-center gap-3 rounded-md p-3">
      <Rss aria-hidden="true" size={18} strokeWidth={1.75} className="shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-text">{title}</span>
          {candidate.kind ? (
            <span className="shrink-0 rounded-xs bg-card px-1.5 text-[10px] font-semibold uppercase text-silver">
              {KIND_LABEL[candidate.kind]}
            </span>
          ) : null}
          {candidate.verified === false ? <Badge label="unverified" className="shrink-0 text-[10px]" /> : null}
        </div>
        <p className="truncate text-xs text-text-muted">{candidate.url}</p>
      </div>
      {subscribed ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-sm text-text-muted">
          <Check aria-hidden="true" size={14} strokeWidth={2} />
          Subscribed
        </span>
      ) : (
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          aria-label={`Add ${title}`}
          onClick={() => onAdd(candidate)}
        >
          Add
        </Button>
      )}
    </li>
  );
}

export function DiscoverTab({ initialUrl = '', notice }: DiscoverTabProps) {
  const uid = useId();
  const inputId = `${uid}-site`;
  const feeds = useFeeds();
  const subscribedUrls = useMemo(() => new Set((feeds ?? []).map((f) => normalizeFeedUrl(f.url))), [feeds]);

  const [site, setSite] = useState(initialUrl);
  const [results, setResults] = useState<FeedCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<SearchError | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (input: string): Promise<void> => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);
    setError(null);
    setResults(null);
    try {
      const found = await discoverFeeds(input, { signal: ctrl.signal });
      if (!ctrl.signal.aborted) setResults(found);
    } catch (err) {
      if (!ctrl.signal.aborted) setError(describeError(err));
    } finally {
      if (!ctrl.signal.aborted) setSearching(false);
    }
  }, []);

  // Automatic search when the URL tab handed over a page.
  useEffect(() => {
    if (initialUrl.trim()) void run(initialUrl);
  }, [initialUrl, run]);

  function submit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!site.trim()) {
      setError({ title: 'Enter a website address' });
      return;
    }
    void run(site);
  }

  async function addCandidate(candidate: FeedCandidate): Promise<void> {
    setAdding(candidate.url);
    try {
      const feed = await addFeedFromUrl(candidate.url);
      onFeedSubscribed(feed);
    } catch (err) {
      if (err instanceof AlreadySubscribedError) {
        toast.info("You're already subscribed to this feed.");
      } else {
        const { title, detail } = describeError(err);
        toast.error("Couldn't add this feed", { description: detail ? `${title} ${detail}` : title });
      }
    } finally {
      setAdding(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {notice ? (
        <p role="status" className="text-sm text-text-muted">
          {notice}
        </p>
      ) : null}

      <form onSubmit={submit} noValidate className="flex flex-col gap-2">
        <label htmlFor={inputId} className="text-sm font-medium text-silver">
          Website URL
        </label>
        <div className="flex items-start gap-2">
          <Input
            id={inputId}
            type="text"
            inputMode="url"
            autoComplete="off"
            placeholder="example.com"
            value={site}
            disabled={searching}
            className="min-w-0 flex-1"
            onChange={(e) => setSite(e.target.value)}
          />
          <Button type="submit" variant="steel" loading={searching}>
            Find feeds
          </Button>
        </div>
      </form>

      {error ? (
        <div role="alert" className="flex flex-col gap-1 text-sm text-danger">
          <span className="font-semibold">{error.title}</span>
          {error.detail ? <span className="text-text">{error.detail}</span> : null}
        </div>
      ) : null}

      {searching ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <span className="sr-only" role="status">
            Searching for feeds
          </span>
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
        </div>
      ) : null}

      {!searching && results && results.length > 0 ? (
        <ul role="list" className="flex flex-col gap-2">
          {results.map((c) => (
            <CandidateRow
              key={c.url}
              candidate={c}
              subscribed={subscribedUrls.has(normalizeFeedUrl(c.url))}
              busy={adding === c.url}
              onAdd={(cand) => void addCandidate(cand)}
            />
          ))}
        </ul>
      ) : null}

      {!searching && results && results.length === 0 && !error ? (
        <p role="status" className="text-sm text-text-muted">
          <span className="font-semibold text-text">No feeds found on this page.</span> Try the feed URL directly.
        </p>
      ) : null}
    </div>
  );
}
