import { getSetting } from '@/features/settings/settings';

/*
 * Synthesized UI chimes (Web Audio): no audio files. Page only, never imported by sw.ts.
 * chimeNotes() is the pure plan (frequencies, offsets, envelopes); playChime() consumes it.
 */

export const CHIME_NAMES = ['refresh', 'done', 'bookmark', 'error', 'delete'] as const;
export type ChimeName = (typeof CHIME_NAMES)[number];

export interface ChimeNote {
  /** Hz. */
  frequency: number;
  /** Seconds after the chime starts. */
  start: number;
  /** Seconds from start until the envelope has decayed. */
  duration: number;
  /** Peak gain before the master volume (0..1). */
  peak: number;
  type: OscillatorType;
}

/** Attack ramp in seconds (5 ms), then an exponential decay to silence over each note's duration. */
export const CHIME_ATTACK_S = 0.005;
/** Minimum gap between two chimes (ms). Requests inside the window are dropped. */
export const CHIME_THROTTLE_MS = 400;
/** Master gain at 100 % volume. Peaks are below 0.5, so the mix stays well under clipping. */
const MASTER_MAX = 0.8;

const PLANS: Record<ChimeName, readonly ChimeNote[]> = {
  // Soft two-note rising chime: a sync found new articles.
  refresh: [
    { frequency: 659.25, start: 0, duration: 0.32, peak: 0.5, type: 'sine' },
    { frequency: 987.77, start: 0.12, duration: 0.5, peak: 0.45, type: 'sine' },
  ],
  // Quieter single bell: a sync finished with nothing new.
  done: [
    { frequency: 880, start: 0, duration: 0.6, peak: 0.22, type: 'sine' },
    { frequency: 1760, start: 0, duration: 0.25, peak: 0.05, type: 'sine' },
  ],
  // Tiny tick: favorite or read later toggled.
  bookmark: [{ frequency: 1318.51, start: 0, duration: 0.06, peak: 0.18, type: 'triangle' }],
  // Low soft double tone: an error.
  error: [
    { frequency: 220, start: 0, duration: 0.18, peak: 0.35, type: 'sine' },
    { frequency: 196, start: 0.2, duration: 0.22, peak: 0.35, type: 'sine' },
  ],
  // Descending blip: an article was deleted.
  delete: [
    { frequency: 880, start: 0, duration: 0.1, peak: 0.3, type: 'triangle' },
    { frequency: 523.25, start: 0.08, duration: 0.14, peak: 0.3, type: 'triangle' },
  ],
};

/** The note plan of one chime. Returns fresh objects, so callers may not mutate the table. */
export function chimeNotes(name: ChimeName): ChimeNote[] {
  return PLANS[name].map((note) => ({ ...note }));
}

/** Total length of a chime in seconds (latest note end). */
export function chimeDuration(name: ChimeName): number {
  return Math.max(...PLANS[name].map((n) => n.start + n.duration));
}

/** Master gain for a volume setting (0..100). Out-of-range values are clamped. */
export function masterGain(volume: number): number {
  const v = Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : 0;
  return (v / 100) * MASTER_MAX;
}

export interface PlayGate {
  /** Epoch ms of this request. */
  now: number;
  /** Epoch ms of the last request that was allowed through (-Infinity at start). */
  lastAllowedAt: number;
  /** document.visibilityState is 'hidden'. */
  hidden: boolean;
  /** soundsEnabled, or true for a preview. */
  allowed: boolean;
}

/**
 * Whether a chime may play: never while the document is hidden, only when sound is on (or it is a
 * preview), and never more than one per CHIME_THROTTLE_MS.
 */
export function shouldPlayChime(gate: PlayGate): boolean {
  if (gate.hidden) return false;
  if (!gate.allowed) return false;
  return gate.now - gate.lastAllowedAt >= CHIME_THROTTLE_MS;
}

interface AudioWindow {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}

let context: AudioContext | null = null;
let lastRequestAt = Number.NEGATIVE_INFINITY;
let gestureHooked = false;

/** The single AudioContext, created on first use. Null where Web Audio is missing. */
function getContext(): AudioContext | null {
  if (context) return context;
  if (typeof window === 'undefined') return null;
  const w = window as Window & AudioWindow;
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    return null;
  }
  hookFirstGesture(context);
  return context;
}

/** Browsers start contexts suspended; resume on the first pointer or key gesture, then detach. */
function hookFirstGesture(audio: AudioContext): void {
  if (gestureHooked || typeof window === 'undefined') return;
  gestureHooked = true;
  const resume = (): void => {
    if (audio.state === 'running') {
      window.removeEventListener('pointerdown', resume, true);
      window.removeEventListener('keydown', resume, true);
      return;
    }
    void audio.resume().catch(() => undefined);
  };
  window.addEventListener('pointerdown', resume, true);
  window.addEventListener('keydown', resume, true);
}

function scheduleChime(audio: AudioContext, name: ChimeName, volume: number): void {
  const master = audio.createGain();
  master.gain.setValueAtTime(masterGain(volume), audio.currentTime);
  master.connect(audio.destination);
  const t0 = audio.currentTime + 0.01;

  for (const note of chimeNotes(name)) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const start = t0 + note.start;
    const end = start + note.duration;
    osc.type = note.type;
    osc.frequency.setValueAtTime(note.frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(note.peak, start + CHIME_ATTACK_S);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(end + 0.02);
  }
}

/**
 * Play one chime. Resolves true when it was scheduled. Never throws: an unsupported or suspended
 * context simply plays nothing. `preview` plays even when sounds are off (the Settings preview button).
 */
export async function playChime(name: ChimeName, opts: { preview?: boolean } = {}): Promise<boolean> {
  // Reserve the throttle slot before awaiting settings, so a burst of calls yields one chime.
  const now = Date.now();
  const previous = lastRequestAt;
  if (now - previous < CHIME_THROTTLE_MS) return false;
  lastRequestAt = now;

  try {
    const enabled = opts.preview ? true : await getSetting('soundsEnabled');
    const volume = await getSetting('soundVolume');
    const gate: PlayGate = {
      now,
      lastAllowedAt: previous,
      hidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
      allowed: enabled,
    };
    if (!shouldPlayChime(gate)) return false;

    const audio = getContext();
    if (!audio || audio.state !== 'running') {
      if (audio && audio.state === 'suspended') void audio.resume().catch(() => undefined);
      return false;
    }
    scheduleChime(audio, name, volume);
    return true;
  } catch {
    return false;
  }
}

/** Settings > Sound preview: plays the chime even when sounds are turned off. */
export function previewChime(name: ChimeName): Promise<boolean> {
  return playChime(name, { preview: true });
}
