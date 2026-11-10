import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITY_DONE_MS, ACTIVITY_ERROR_MS, activityPercent, startActivity, useActivityStore, type Activity } from './activityStore';

function current(): Activity[] {
  return useActivityStore.getState().activities;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  useActivityStore.setState({ activities: [] });
});

describe('activityPercent', () => {
  it('rounds done / total to a whole percentage', () => {
    expect(activityPercent({ done: 14, total: 48 })).toBe(29);
    expect(activityPercent({ done: 1, total: 3 })).toBe(33);
    expect(activityPercent({ done: 2, total: 3 })).toBe(67);
    expect(activityPercent({ done: 0, total: 10 })).toBe(0);
    expect(activityPercent({ done: 10, total: 10 })).toBe(100);
  });

  it('is null (indeterminate) when the total is null or zero', () => {
    expect(activityPercent({ done: 5, total: null })).toBeNull();
    expect(activityPercent({ done: 0, total: 0 })).toBeNull();
  });

  it('clamps to 0..100', () => {
    expect(activityPercent({ done: 12, total: 10 })).toBe(100);
  });
});

describe('activity lifecycle', () => {
  it('starts running with the given label and total', () => {
    startActivity({ label: 'Importing feeds', total: 4 });
    const [a] = current();
    expect(a).toMatchObject({ label: 'Importing feeds', done: 0, total: 4, state: 'running' });
  });

  it('defaults to an indeterminate total', () => {
    startActivity({ label: 'Reading XML' });
    expect(current()[0]?.total).toBeNull();
  });

  it('updates done, total and label; omitting total keeps it', () => {
    const h = startActivity({ label: 'x', total: 10 });
    h.update(3, undefined, 'Step 3');
    expect(current()[0]).toMatchObject({ done: 3, total: 10, label: 'Step 3' });
    h.update(4, null);
    expect(current()[0]).toMatchObject({ done: 4, total: null, label: 'Step 3' });
  });

  it('complete() fills the bar, keeps the label and removes after 1200 ms', () => {
    const h = startActivity({ label: 'Syncing feeds', total: 5 });
    h.update(2, 5, 'Syncing feed 2 of 5 (40%)');
    h.complete('Synced 5 feeds');
    const [a] = current();
    expect(a).toMatchObject({ state: 'done', done: 5, total: 5, label: 'Synced 5 feeds' });

    vi.advanceTimersByTime(ACTIVITY_DONE_MS - 1);
    expect(current()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(current()).toHaveLength(0);
  });

  it('fail() keeps the message and removes after 6000 ms', () => {
    const h = startActivity({ label: 'Adding feed', total: 100 });
    h.fail("Couldn't reach this site");
    expect(current()[0]).toMatchObject({ state: 'error', message: "Couldn't reach this site" });

    vi.advanceTimersByTime(ACTIVITY_ERROR_MS - 1);
    expect(current()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(current()).toHaveLength(0);
  });

  it('ignores updates after the activity has finished', () => {
    const h = startActivity({ label: 'x', total: 2 });
    h.complete();
    h.update(0, 2, 'late');
    h.fail('late');
    expect(current()[0]).toMatchObject({ state: 'done', label: 'x', done: 2 });
  });

  it('keeps several activities independent', () => {
    const a = startActivity({ label: 'A', total: 2 });
    startActivity({ label: 'B', total: 2 });
    a.complete();
    vi.advanceTimersByTime(ACTIVITY_DONE_MS);
    expect(current().map((x) => x.label)).toEqual(['B']);
  });
});
