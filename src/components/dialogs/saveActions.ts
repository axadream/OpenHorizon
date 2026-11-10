import type { Article, Feed } from '@/db/schema';
import { addVideoToChoice, DuplicateListItemError } from '@/features/lists/lists';
import { DuplicateSavedPageError, savePageAsArticle } from '@/features/lists/saved';
import { ReadabilityError } from '@/features/reader/readability';
import { t } from '@/i18n/i18n';
import { diagnoseFetchError } from '@/lib/proxy/diagnose';
import { startActivity } from '@/store/activityStore';

/*
 * Page-side actions behind the Save page tab, the Discover tab's save button and the watch-list
 * dialog. Each runs as a global activity and returns an outcome instead of toasting, so the
 * caller decides what to show.
 */

export interface ErrorInfo {
  title: string;
  detail?: string;
}

/** Explain a save or add failure: readability first, then the fetch diagnosis. */
export function describeSaveError(err: unknown): ErrorInfo {
  if (err instanceof ReadabilityError) return { title: t('save.failed'), detail: t('save.noContent') };
  const diagnosis = diagnoseFetchError(err, { online: navigator.onLine });
  return { title: diagnosis.title, detail: diagnosis.detail || undefined };
}

export type SavePageOutcome =
  | { kind: 'saved'; article: Article }
  | { kind: 'duplicate'; feedId: string; articleId: string }
  | { kind: 'cancelled' };

/** Save a page as an article (Saved pages list). Throws on failure; duplicates come back as an outcome. */
export async function runSavePage(url: string, signal?: AbortSignal): Promise<SavePageOutcome> {
  const activity = startActivity({ label: t('save.stepFetching'), total: 100 });
  try {
    const article = await savePageAsArticle(url, {
      signal,
      onProgress: (step) => {
        if (step === 'fetching') activity.update(40, 100, t('save.stepFetching'));
        else activity.update(90, 100, t('save.stepSaving'));
      },
    });
    activity.complete(t('save.saved', { title: article.title }));
    return { kind: 'saved', article };
  } catch (err) {
    if (signal?.aborted) {
      activity.complete(t('add.cancelled'));
      return { kind: 'cancelled' };
    }
    if (err instanceof DuplicateSavedPageError) {
      activity.complete(t('save.duplicate'));
      return { kind: 'duplicate', feedId: err.feedId, articleId: err.articleId };
    }
    activity.fail(describeSaveError(err).title);
    throw err;
  }
}

export type AddVideoOutcome =
  | { kind: 'added'; list: Feed; article: Article }
  | { kind: 'duplicate'; feedId: string; articleId: string }
  | { kind: 'cancelled' };

/**
 * Add a YouTube video to a watch list (existing choice, or a new list named `newName`). A duplicate
 * comes back as an outcome so the caller can open the existing item.
 */
export async function runAddVideo(
  choice: string,
  newName: string,
  videoUrl: string,
  signal?: AbortSignal,
): Promise<AddVideoOutcome> {
  const activity = startActivity({ label: t('lists.adding'), total: null });
  try {
    const { list, article } = await addVideoToChoice(choice, newName, videoUrl, { signal });
    activity.complete(t('lists.added', { list: list.title }));
    return { kind: 'added', list, article };
  } catch (err) {
    if (signal?.aborted) {
      activity.complete(t('add.cancelled'));
      return { kind: 'cancelled' };
    }
    if (err instanceof DuplicateListItemError) {
      activity.complete(t('lists.alreadyIn'));
      return { kind: 'duplicate', feedId: err.feedId, articleId: err.articleId };
    }
    activity.fail(describeSaveError(err).title);
    throw err;
  }
}
