import { describe, expect, it } from 'vitest';
import { diagnoseFetchError } from './diagnose';
import { FetchAllFailedError, type FetchAttemptError } from './fetchWithProxy';
import { NotAFeedError } from '@/lib/parser/types';

function allFailed(attempts: FetchAttemptError[]): FetchAllFailedError {
  return new FetchAllFailedError('Could not fetch https://example.com/feed.xml', attempts);
}

describe('diagnoseFetchError', () => {
  it('reports offline first when the browser is offline, whatever the error', () => {
    const d = diagnoseFetchError(allFailed([{ via: 'direct', error: 'HTTP 404' }]), { online: false });
    expect(d).toEqual({ kind: 'offline', title: "You're offline", detail: 'Reconnect and try again.' });
  });

  it('classifies 404 from the origin as not-found', () => {
    const d = diagnoseFetchError(
      allFailed([
        { via: 'direct', error: 'HTTP 404' },
        { via: 'jina', error: 'HTTP 404' },
        { via: 'alloriginsget', error: 'HTTP 404' },
        { via: 'allorigins', error: 'HTTP 404' },
      ]),
      { online: true },
    );
    expect(d.kind).toBe('not-found');
    expect(d.detail).toBe('This address returned 404. Check the spelling of the URL.');
  });

  it('prefers the origin 404 over a blocked direct fetch and proxy failures', () => {
    const d = diagnoseFetchError(
      allFailed([
        { via: 'direct', error: 'Failed to fetch' },
        { via: 'jina', error: 'HTTP 404' },
        { via: 'corsproxy', error: 'HTTP 500' },
      ]),
    );
    expect(d.kind).toBe('not-found');
  });

  it('classifies 401 and 403 as forbidden with the status in the detail', () => {
    const d = diagnoseFetchError(
      allFailed([
        { via: 'direct', error: 'Failed to fetch' },
        { via: 'jina', error: 'HTTP 403' },
        { via: 'allorigins', error: 'HTTP 500' },
      ]),
    );
    expect(d.kind).toBe('forbidden');
    expect(d.detail).toBe('The site refused access (403). It may block automated readers.');

    expect(diagnoseFetchError(allFailed([{ via: 'direct', error: 'HTTP 401' }])).kind).toBe('forbidden');
  });

  it('classifies 5xx as server', () => {
    const d = diagnoseFetchError(
      allFailed([
        { via: 'direct', error: 'HTTP 503' },
        { via: 'jina', error: 'HTTP 502' },
      ]),
    );
    expect(d.kind).toBe('server');
    expect(d.detail).toContain('503');
  });

  it('classifies attempts that all timed out as timeout', () => {
    const d = diagnoseFetchError(
      allFailed([
        { via: 'direct', error: 'timed out after 15000 ms' },
        { via: 'local', error: 'timed out after 8000 ms' },
        { via: 'jina', error: 'timed out after 8000 ms' },
      ]),
    );
    expect(d).toEqual({
      kind: 'timeout',
      title: 'The site is too slow',
      detail: 'The site and every fallback route took too long to answer.',
    });
  });

  it('classifies network failures (Failed to fetch, TypeError) as blocked', () => {
    const d = diagnoseFetchError(
      allFailed([
        { via: 'direct', error: 'Failed to fetch' },
        { via: 'local', error: 'NetworkError when attempting to fetch resource.' },
        { via: 'jina', error: 'Load failed' },
      ]),
    );
    expect(d.kind).toBe('blocked');
    expect(d.detail).toBe('Your browser blocked the request (CORS) and the fallback routes were unreachable.');
  });

  it('falls back to unknown with the last error when nothing matches', () => {
    const d = diagnoseFetchError(allFailed([{ via: 'codetabs', error: 'proxy returned invalid JSON' }]));
    expect(d.kind).toBe('unknown');
    expect(d.detail).toContain('proxy returned invalid JSON');
  });

  it('classifies a non-feed page as not-a-feed', () => {
    const d = diagnoseFetchError(new NotAFeedError('Unsupported document element <html>'));
    expect(d).toEqual({
      kind: 'not-a-feed',
      title: 'This is not a feed',
      detail: 'This page is not a feed. Try Discover to look for feeds on it.',
    });
    expect(diagnoseFetchError(new NotAFeedError('Not a JSON Feed')).kind).toBe('not-a-feed');
    expect(diagnoseFetchError(new NotAFeedError('RSS document without <channel>')).kind).toBe('not-a-feed');
  });

  it('classifies other parse errors as invalid-xml and trims the message to 120 characters', () => {
    const long = 'x'.repeat(200);
    const d = diagnoseFetchError(new NotAFeedError(long));
    expect(d.kind).toBe('invalid-xml');
    expect(d.title).toBe('The feed is malformed');
    expect(d.detail).toBe(`The XML is malformed: ${'x'.repeat(120)}`);
  });

  it('uses the plain error message as the title for other errors', () => {
    expect(diagnoseFetchError(new Error('Enter a valid web address'))).toEqual({
      kind: 'unknown',
      title: 'Enter a valid web address',
      detail: '',
    });
    expect(diagnoseFetchError('boom').kind).toBe('unknown');
  });
});
