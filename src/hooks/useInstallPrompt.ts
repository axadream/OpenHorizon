import { useSyncExternalStore } from 'react';

/** Chromium-only event; not in lib.dom, so declared here. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export interface InstallPromptState {
  /** True once the browser has offered an install prompt and it has not been used yet. */
  canInstall: boolean;
  /** True when running as an installed app (standalone display mode). */
  installed: boolean;
  promptInstall(): Promise<InstallOutcome>;
}

function detectInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const standalone = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return standalone || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// Module-level state. The listener is registered when this module loads, which happens
// before the app mounts, so the event is not missed (ARCHITECTURE §11).
let deferred: BeforeInstallPromptEvent | null = null;
let snapshot: { canInstall: boolean; installed: boolean } = { canInstall: false, installed: detectInstalled() };
const listeners = new Set<() => void>();

function publish(): void {
  snapshot = { canInstall: deferred !== null, installed: snapshot.installed };
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    publish();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    snapshot = { canInstall: false, installed: true };
    listeners.forEach((l) => l());
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): { canInstall: boolean; installed: boolean } {
  return snapshot;
}

async function promptInstall(): Promise<InstallOutcome> {
  const event = deferred;
  if (!event) return 'unavailable';
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    deferred = null;
    publish();
    return outcome;
  } catch {
    // prompt() can only be called once per event; treat a failed call as unavailable.
    deferred = null;
    publish();
    return 'unavailable';
  }
}

/** PWA install state. `promptInstall` resolves with the user's choice. */
export function useInstallPrompt(): InstallPromptState {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { canInstall: state.canInstall, installed: state.installed, promptInstall };
}
