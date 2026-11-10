import { useSyncExternalStore } from 'react';

export type ToastTone = 'info' | 'success' | 'danger' | 'warning';

export interface ToastAction {
  label: string;
  onClick(): void;
}

export interface ToastData {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: ToastAction;
  /** Auto-dismiss delay in ms; 0 = sticky. */
  duration: number;
  /** True while the exit animation plays before removal. */
  leaving: boolean;
}

export interface ToastOptions {
  description?: string;
  action?: ToastAction;
  /** Default 5000. 0 = sticky. */
  duration?: number;
}

const MAX_VISIBLE = 3;
const EXIT_MS = 120;
const DEFAULT_DURATION = 5000;
const UNDO_DURATION = 8000;

let toasts: ToastData[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const timers = new Map<string, { handle: number; remaining: number; startedAt: number }>();
const paused = new Map<string, number>();

function setToasts(next: ToastData[]): void {
  toasts = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ToastData[] {
  return toasts;
}

function clearTimer(id: string): void {
  const t = timers.get(id);
  if (t) {
    window.clearTimeout(t.handle);
    timers.delete(id);
  }
}

function schedule(id: string, ms: number): void {
  clearTimer(id);
  if (ms <= 0) return;
  const handle = window.setTimeout(() => dismiss(id), ms);
  timers.set(id, { handle, remaining: ms, startedAt: Date.now() });
}

function dismiss(id: string): void {
  const item = toasts.find((t) => t.id === id);
  if (!item || item.leaving) return;
  clearTimer(id);
  paused.delete(id);
  setToasts(toasts.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
  window.setTimeout(() => setToasts(toasts.filter((t) => t.id !== id)), EXIT_MS);
}

function pushToast(tone: ToastTone, title: string, opts: ToastOptions = {}, defaultDuration = DEFAULT_DURATION): string {
  const id = `toast-${++seq}`;
  const action = opts.action
    ? {
        label: opts.action.label,
        onClick: () => {
          opts.action?.onClick();
          dismiss(id);
        },
      }
    : undefined;
  const item: ToastData = {
    id,
    tone,
    title,
    description: opts.description,
    action,
    duration: opts.duration ?? defaultDuration,
    leaving: false,
  };
  setToasts([...toasts, item]);
  schedule(id, item.duration);

  // Keep at most MAX_VISIBLE; the oldest live toasts leave first.
  const live = toasts.filter((t) => !t.leaving);
  for (const old of live.slice(0, Math.max(0, live.length - MAX_VISIBLE))) dismiss(old.id);
  return id;
}

function pause(id: string): void {
  const t = timers.get(id);
  if (!t) return;
  const left = Math.max(0, t.remaining - (Date.now() - t.startedAt));
  clearTimer(id);
  paused.set(id, left);
}

function resume(id: string): void {
  const left = paused.get(id);
  if (left === undefined) return;
  paused.delete(id);
  schedule(id, left);
}

/** Imperative toast API. Safe to call from anywhere (no provider needed). */
export const toast = {
  success: (title: string, opts?: ToastOptions) => pushToast('success', title, opts),
  error: (title: string, opts?: ToastOptions) => pushToast('danger', title, opts),
  info: (title: string, opts?: ToastOptions) => pushToast('info', title, opts),
  warning: (title: string, opts?: ToastOptions) => pushToast('warning', title, opts),
  /** Info toast with an Undo action (default 8 s). */
  undo: (
    title: string,
    options: { onUndo(): void; description?: string; label?: string; duration?: number },
  ) =>
    pushToast(
      'info',
      title,
      {
        description: options.description,
        duration: options.duration ?? UNDO_DURATION,
        action: { label: options.label ?? 'Undo', onClick: options.onUndo },
      },
      UNDO_DURATION,
    ),
  dismiss,
  /** Stop the auto-dismiss timer (hover / focus). */
  pause,
  /** Restart the auto-dismiss timer with the remaining time. */
  resume,
};

/** All current toasts (including those playing their exit animation). */
export function useToasts(): ToastData[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
