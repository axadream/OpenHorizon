import { db } from '@/db/db';
import { t } from '@/i18n/i18n';
import { diagnoseFetchError } from '@/lib/proxy/diagnose';
import { startActivity } from '@/store/activityStore';
import { ReadabilityError, fetchReadable } from './readability';

/** Short, user-facing description of a full-article failure. */
export interface LoadErrorInfo {
  title: string;
  detail?: string;
}

export function describeLoadError(err: unknown): LoadErrorInfo {
  if (err instanceof ReadabilityError) return { title: t('reader.fullFailed'), detail: t('save.noContent') };
  const diagnosis = diagnoseFetchError(err, { online: typeof navigator === 'undefined' ? true : navigator.onLine });
  return { title: t('reader.fullFailed'), detail: diagnosis.title || undefined };
}

/**
 * Fetch the original page of an article and store its readable text on the row (fullContent).
 * Runs as a global activity (indeterminate). Failures propagate; use describeLoadError to explain them.
 */
export async function loadFullArticle(articleId: string, link: string): Promise<void> {
  const activity = startActivity({ label: t('reader.loadingFull'), total: null });
  try {
    const full = await fetchReadable(link);
    const now = Date.now();
    // A new full text makes any cached AI summary stale: drop it in the same write.
    await db.articles.where(':id').equals(articleId).modify((a) => {
      a.fullContent = full.contentHtml;
      a.fullContentAt = now;
      delete a.ai;
    });
    activity.complete(t('reader.fullLoaded'));
  } catch (err) {
    activity.fail(describeLoadError(err).title);
    throw err;
  }
}
