import { useMemo } from 'react';
import type { Feed } from '@/db/schema';
import { useSetting } from '@/features/settings/settings';
import { useLocale } from '@/i18n/i18n';
import { intlTag } from '@/i18n/locale';
import type { Locale } from '@/i18n/types';
import { languageMatches } from '@/lib/lang/detectLanguage';
import { useFeeds } from './feedQueries';

/** The fields the language filter reads. */
export type LanguageFilterable = Pick<Feed, 'language' | 'listKind' | 'manual'>;

/** BCP 47 tag of the interface language, used to compare against feed languages. */
export function appLanguageTag(locale: Locale): string {
  return intlTag(locale);
}

/** True when the feed stays visible for the app language. Local list feeds always stay. */
function keepFeed(feed: LanguageFilterable, appTag: string): boolean {
  return feed.listKind !== undefined || languageMatches(feed.language, appTag);
}

/** Pure: the feeds that pass the language filter for the app language tag. */
export function filterFeedsByLanguage<T extends LanguageFilterable>(feeds: readonly T[], tag: string): T[] {
  return feeds.filter((feed) => keepFeed(feed, tag));
}

/** App language tag while the feed language filter is on; null when it is off. */
export function useLanguageFilterTag(): string | null {
  const enabled = useSetting('feedLanguageFilter');
  const locale = useLocale();
  return useMemo(() => (enabled ? appLanguageTag(locale) : null), [enabled, locale]);
}

/** Predicate for the feed list: always true when the filter is off. */
export function useFeedLanguageFilter(): (feed: LanguageFilterable) => boolean {
  const tag = useLanguageFilterTag();
  return useMemo(() => {
    if (tag === null) return () => true;
    return (feed: LanguageFilterable) => keepFeed(feed, tag);
  }, [tag]);
}

/** Feeds after the language filter, and how many were hidden by it. */
export function useVisibleFeeds(): { feeds: Feed[] | undefined; hiddenCount: number } {
  const feeds = useFeeds();
  const tag = useLanguageFilterTag();
  return useMemo(() => {
    if (!feeds) return { feeds, hiddenCount: 0 };
    if (tag === null) return { feeds, hiddenCount: 0 };
    const visible = filterFeedsByLanguage(feeds, tag);
    return { feeds: visible, hiddenCount: feeds.length - visible.length };
  }, [feeds, tag]);
}
