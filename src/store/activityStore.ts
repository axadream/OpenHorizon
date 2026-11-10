import { create } from 'zustand';

/**
 * Global activity list for long-running work (feed imports, syncs). Plain functions drive it,
 * so code outside React (feature modules, the scheduler) can start and report activities.
 * Components read it with useActivities().
 */

export type ActivityState = 'running' | 'done' | 'error';

export interface Activity {
  id: string;
  label: string;
  done: number;
  /** null when the amount of work is unknown (indeterminate). */
  total: number | null;
  state: ActivityState;
  message?: string;
  startedAt: number;
}

export interface ActivityHandle {
  /** Report progress. Omit `total` to keep the current one; pass null for indeterminate. */
  update(done: number, total?: number | null, label?: string): void;
  /** Mark the activity finished. Removed after ACTIVITY_DONE_MS. */
  complete(label?: string): void;
  /** Mark the activity failed. Removed after ACTIVITY_ERROR_MS. */
  fail(message: string): void;
}

export interface StartActivityOptions {
  label: string;
  total?: number | null;
}

export const ACTIVITY_DONE_MS = 1200;
export const ACTIVITY_ERROR_MS = 6000;

interface ActivityStoreState {
  activities: Activity[];
}

export const useActivityStore = create<ActivityStoreState>()(() => ({ activities: [] }));

const removalTimers = new Map<string, ReturnType<typeof setTimeout>>();
let seq = 0;

/** Whole-number percentage, or null when the total is unknown or zero. Clamped to 0..100. */
export function activityPercent(a: Pick<Activity, 'done' | 'total'>): number | null {
  if (!a.total) return null;
  const pct = Math.round((a.done / a.total) * 100);
  return Math.min(100, Math.max(0, pct));
}

function findActivity(id: string): Activity | undefined {
  return useActivityStore.getState().activities.find((a) => a.id === id);
}

function patchActivity(id: string, patch: Partial<Activity>): void {
  useActivityStore.setState((s) => ({
    activities: s.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  }));
}

function removeActivity(id: string): void {
  const timer = removalTimers.get(id);
  if (timer !== undefined) {
    clearTimeout(timer);
    removalTimers.delete(id);
  }
  useActivityStore.setState((s) => ({ activities: s.activities.filter((a) => a.id !== id) }));
}

function scheduleRemoval(id: string, ms: number): void {
  const previous = removalTimers.get(id);
  if (previous !== undefined) clearTimeout(previous);
  removalTimers.set(
    id,
    setTimeout(() => {
      removalTimers.delete(id);
      removeActivity(id);
    }, ms),
  );
}

/** Start a tracked activity and return the handle that reports its progress. */
export function startActivity(opts: StartActivityOptions): ActivityHandle {
  const id = `activity-${++seq}`;
  const activity: Activity = {
    id,
    label: opts.label,
    done: 0,
    total: opts.total ?? null,
    state: 'running',
    startedAt: Date.now(),
  };
  useActivityStore.setState((s) => ({ activities: [...s.activities, activity] }));

  const isRunning = (): boolean => findActivity(id)?.state === 'running';

  return {
    update(done, total, label) {
      if (!isRunning()) return;
      const current = findActivity(id);
      patchActivity(id, {
        done,
        total: total === undefined ? (current?.total ?? null) : total,
        ...(label !== undefined ? { label } : {}),
      });
    },
    complete(label) {
      if (!isRunning()) return;
      const current = findActivity(id);
      patchActivity(id, {
        state: 'done',
        done: current?.total ?? current?.done ?? 0,
        ...(label !== undefined ? { label } : {}),
      });
      scheduleRemoval(id, ACTIVITY_DONE_MS);
    },
    fail(message) {
      if (!isRunning()) return;
      patchActivity(id, { state: 'error', message });
      scheduleRemoval(id, ACTIVITY_ERROR_MS);
    },
  };
}

/** Live list of activities, oldest first. */
export function useActivities(): Activity[] {
  return useActivityStore((s) => s.activities);
}
