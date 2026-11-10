import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { describeSaveError } from '@/components/dialogs/saveActions';
import { onFeedSubscribed } from '@/components/dialogs/subscribe';
import { FeedAvatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { AlreadySubscribedError, addFeedFromUrl, type AddFeedStep } from '@/features/feeds/addFeed';
import { useFeeds } from '@/features/feeds/feedQueries';
import { t, useT, type TranslationKey } from '@/i18n/i18n';
import { YouTubeLayoutError, searchYouTubeChannels } from '@/lib/discovery/youtubeSearch';
import { toast } from '@/lib/toast';
import { normalizeFeedUrl } from '@/lib/url';
import type { YouTubeChannelHit } from '@/lib/youtube';
import { startActivity } from '@/store/activityStore';

/*
 * BEST-EFFORT channel search (see lib/discovery/youtubeSearch.ts). Shown for name-like input.
 * When YouTube changes its results page this stops working; the hint offers the address instead.
 */

export interface YouTubeChannelSearchProps {
  /** The text typed in the Discover field (a channel name, not an address). */
  query: string;
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; hits: YouTubeChannelHit[] }
  | { status: 'error'; title: string; detail?: string };

const STEP_PERCENT: Record<AddFeedStep, number> = { checking: 10, fetching: 40, parsing: 75, saving: 100 };
const STEP_KEY: Record<AddFeedStep, TranslationKey> = {
  checking: 'add.stepChecking',
  fetching: 'add.stepFetching',
  parsing: 'add.stepParsing',
  saving: 'add.stepSaving',
};

export function YouTubeChannelSearch({ query }: YouTubeChannelSearchProps) {
  useT();
  const feeds = useFeeds();
  const subscribedUrls = useMemo(() => new Set((feeds ?? []).map((f) => normalizeFeedUrl(f.url))), [feeds]);
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const [adding, setAdding] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function search(): Promise<void> {
    const q = query.trim();
    if (!q) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState({ status: 'loading' });
    const activity = startActivity({ label: t('yt.searching'), total: null });
    try {
      const hits = await searchYouTubeChannels(q, ctrl.signal);
      if (ctrl.signal.aborted) {
        activity.complete(t('add.cancelled'));
        return;
      }
      activity.complete(t('plural.channels', { count: hits.length }));
      setState({ status: 'done', hits });
    } catch (err) {
      if (ctrl.signal.aborted) {
        activity.complete(t('add.cancelled'));
        return;
      }
      const info = err instanceof YouTubeLayoutError ? { title: t('yt.layoutTitle') } : describeSaveError(err);
      activity.fail(info.title);
      setState({ status: 'error', title: info.title, detail: info.detail });
    }
  }

  async function addChannel(hit: YouTubeChannelHit): Promise<void> {
    setAdding(hit.channelId);
    const activity = startActivity({ label: t('add.stepChecking'), total: 100 });
    try {
      const feed = await addFeedFromUrl(hit.feedUrl, {
        onProgress: (step) => activity.update(STEP_PERCENT[step], 100, `${t(STEP_KEY[step])} (${STEP_PERCENT[step]}%)`),
      });
      activity.complete(t('add.added', { title: feed.title }));
      onFeedSubscribed(feed);
    } catch (err) {
      if (err instanceof AlreadySubscribedError) {
        activity.complete(t('add.alreadySubscribed'));
        toast.info(t('add.alreadySubscribed'));
      } else {
        const info = describeSaveError(err);
        activity.fail(info.title);
        toast.error(t('discover.couldNotAdd'), { description: info.detail ? `${info.title} ${info.detail}` : info.title });
      }
    } finally {
      setAdding(null);
    }
  }

  return (
    <section aria-label={t('yt.title')} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="steel"
          size="sm"
          leadingIcon={Search}
          loading={state.status === 'loading'}
          onClick={() => void search()}
        >
          {t('yt.searchButton')}
        </Button>
        <p className="w-full text-xs text-text-muted">{t('yt.bestEffort')}</p>
      </div>

      {state.status === 'loading' ? (
        <div className="flex flex-col gap-2" aria-busy="true">
          <span className="sr-only" role="status">
            {t('yt.searching')}
          </span>
          <Skeleton className="h-14 w-full rounded-md" />
          <Skeleton className="h-14 w-full rounded-md" />
        </div>
      ) : null}

      {state.status === 'error' ? (
        <div role="alert" className="flex flex-col gap-1 text-sm text-danger">
          <span className="font-semibold">{state.title}</span>
          {state.detail ? <span className="text-text">{state.detail}</span> : null}
          <span className="text-text">{t('yt.pasteAddress')}</span>
        </div>
      ) : null}

      {state.status === 'done' && state.hits.length === 0 ? (
        <p role="status" className="text-sm text-text-muted">
          {t('yt.noChannels', { query: query.trim() })}
        </p>
      ) : null}

      {state.status === 'done' && state.hits.length > 0 ? (
        <>
          <p role="status" className="text-sm text-text-muted">
            {t('plural.channels', { count: state.hits.length })}
          </p>
          <ul role="list" className="flex flex-col gap-2">
            {state.hits.map((hit) => {
              const subscribed = subscribedUrls.has(normalizeFeedUrl(hit.feedUrl));
              return (
                <li key={hit.channelId} className="steel-card flex items-center gap-3 rounded-md p-3">
                  <FeedAvatar title={hit.name} src={hit.avatarUrl} size={36} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text">{hit.name}</span>
                    {hit.subscribers ? <span className="block truncate text-xs text-text-muted">{hit.subscribers}</span> : null}
                  </div>
                  {subscribed ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-sm text-text-muted">
                      <Check aria-hidden="true" size={14} strokeWidth={2} />
                      {t('discover.subscribed')}
                    </span>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      loading={adding === hit.channelId}
                      aria-label={t('yt.addChannel', { name: hit.name })}
                      onClick={() => void addChannel(hit)}
                    >
                      {t('discover.add')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
