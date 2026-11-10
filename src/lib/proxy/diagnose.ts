import { NotAFeedError } from '@/lib/parser/types';
import { FetchAllFailedError, type FetchAttemptError } from './fetchWithProxy';

export type DiagnosisKind =
  | 'offline'
  | 'timeout'
  | 'blocked'
  | 'not-found'
  | 'forbidden'
  | 'server'
  | 'not-a-feed'
  | 'invalid-xml'
  | 'unknown';

export interface Diagnosis {
  kind: DiagnosisKind;
  /** Short heading, rendered in bold. */
  title: string;
  /** One sentence of explanation, rendered as normal text. */
  detail: string;
}

export interface DiagnoseContext {
  /** Callers pass navigator.onLine. */
  online?: boolean;
}

/** Routes that fetch the origin itself, so their HTTP status describes the site. */
const ORIGIN_VIAS = new Set(['direct', 'jina', 'alloriginsget']);

/** Network-level failures: a fetch that never got a response (CORS block, offline route). */
const NETWORK_ERROR_RE = /failed to fetch|networkerror|load failed|network/i;
const TIMEOUT_RE = /timed out/i;
const NOT_A_FEED_RE = /unsupported document element|not a json feed|without <channel>|<html|<!doctype/i;

/** Lower number = more informative; the most informative attempt decides the diagnosis. */
type Category = 'not-found' | 'forbidden' | 'server' | 'timeout' | 'blocked' | 'other-http' | 'unknown';
const RANK: Record<Category, number> = {
  'not-found': 0,
  forbidden: 1,
  server: 2,
  timeout: 3,
  blocked: 4,
  'other-http': 5,
  unknown: 6,
};

interface Classified {
  category: Category;
  /** HTTP status when the error carries one. */
  status?: number;
  error: string;
}

function classify(a: FetchAttemptError): Classified {
  const http = /^HTTP (\d{3})/.exec(a.error);
  if (http) {
    const status = Number(http[1]);
    if (status === 404) return { category: 'not-found', status, error: a.error };
    if (status === 401 || status === 403) return { category: 'forbidden', status, error: a.error };
    if (status >= 500) return { category: 'server', status, error: a.error };
    return { category: 'other-http', status, error: a.error };
  }
  if (TIMEOUT_RE.test(a.error)) return { category: 'timeout', error: a.error };
  if (NETWORK_ERROR_RE.test(a.error)) return { category: 'blocked', error: a.error };
  return { category: 'unknown', error: a.error };
}

function diagnoseAttempts(attempts: FetchAttemptError[]): Diagnosis {
  const all = attempts.map(classify);
  // When the origin itself answered (any HTTP status), its answer decides; proxies may fail for their own reasons.
  const originAnswered = attempts.some((a, i) => ORIGIN_VIAS.has(a.via) && all[i]?.status !== undefined);
  const pool = originAnswered ? all.filter((_, i) => ORIGIN_VIAS.has(attempts[i]?.via ?? '')) : all;

  const best = pool.reduce<Classified | undefined>(
    (acc, c) => (acc === undefined || RANK[c.category] < RANK[acc.category] ? c : acc),
    undefined,
  );
  const last = all.at(-1)?.error ?? 'no route answered';

  switch (best?.category) {
    case 'not-found':
      return {
        kind: 'not-found',
        title: 'Address not found',
        detail: 'This address returned 404. Check the spelling of the URL.',
      };
    case 'forbidden':
      return {
        kind: 'forbidden',
        title: 'Access refused',
        detail: `The site refused access (${best.status}). It may block automated readers.`,
      };
    case 'server':
      return {
        kind: 'server',
        title: 'The site has a server problem',
        detail: `The site answered with a server error (${best.status}). Try again later.`,
      };
    case 'timeout':
      return {
        kind: 'timeout',
        title: 'The site is too slow',
        detail: 'The site and every fallback route took too long to answer.',
      };
    case 'blocked':
      return {
        kind: 'blocked',
        title: "Couldn't reach this website",
        detail: 'Your browser blocked the request (CORS) and the fallback routes were unreachable.',
      };
    case 'other-http':
      return {
        kind: 'unknown',
        title: "Couldn't fetch this address",
        detail: `The site answered with HTTP ${best.status}. Last error: ${last}`,
      };
    default:
      return {
        kind: 'unknown',
        title: "Couldn't fetch this address",
        detail: `Last error: ${last}`,
      };
  }
}

function diagnoseParse(err: NotAFeedError): Diagnosis {
  if (NOT_A_FEED_RE.test(err.message)) {
    return {
      kind: 'not-a-feed',
      title: 'This is not a feed',
      detail: 'This page is not a feed. Try Discover to look for feeds on it.',
    };
  }
  return {
    kind: 'invalid-xml',
    title: 'The feed is malformed',
    detail: `The XML is malformed: ${err.message.slice(0, 120)}`,
  };
}

/**
 * Turn a fetch, discovery or parse error into a short, user-facing diagnosis.
 * Offline wins over everything else; FetchAllFailedError is classified from its attempts.
 */
export function diagnoseFetchError(err: unknown, ctx: DiagnoseContext = {}): Diagnosis {
  if (ctx.online === false) {
    return { kind: 'offline', title: "You're offline", detail: 'Reconnect and try again.' };
  }
  if (err instanceof FetchAllFailedError) return diagnoseAttempts(err.attempts);
  if (err instanceof NotAFeedError) return diagnoseParse(err);
  const message = err instanceof Error ? err.message : '';
  return {
    kind: 'unknown',
    title: message || 'Something went wrong.',
    detail: '',
  };
}
