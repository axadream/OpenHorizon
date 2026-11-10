import { describe, expect, it } from 'vitest';
import {
  CHIME_ATTACK_S,
  CHIME_NAMES,
  CHIME_THROTTLE_MS,
  chimeDuration,
  chimeNotes,
  masterGain,
  shouldPlayChime,
  type PlayGate,
} from './chimes';

const open: PlayGate = { now: 10_000, lastAllowedAt: 0, hidden: false, allowed: true };

describe('chimeNotes', () => {
  it('defines a plan for every chime with positive frequencies, durations and peaks', () => {
    for (const name of CHIME_NAMES) {
      const notes = chimeNotes(name);
      expect(notes.length, name).toBeGreaterThan(0);
      for (const note of notes) {
        expect(note.frequency, name).toBeGreaterThan(0);
        expect(note.duration, name).toBeGreaterThan(0);
        expect(note.start, name).toBeGreaterThanOrEqual(0);
        expect(note.peak, name).toBeGreaterThan(0);
        expect(note.peak, name).toBeLessThanOrEqual(0.5);
        expect(['sine', 'triangle', 'square', 'sawtooth']).toContain(note.type);
      }
    }
  });

  it('rises for refresh and falls for delete', () => {
    const [a, b] = chimeNotes('refresh');
    expect(b!.frequency).toBeGreaterThan(a!.frequency);
    const [hi, lo] = chimeNotes('delete');
    expect(lo!.frequency).toBeLessThan(hi!.frequency);
  });

  it('plays the low error tones below the soft refresh chime', () => {
    expect(Math.max(...chimeNotes('error').map((n) => n.frequency))).toBeLessThan(
      Math.min(...chimeNotes('refresh').map((n) => n.frequency)),
    );
  });

  it('keeps the done chime quieter than refresh', () => {
    const peak = (name: (typeof CHIME_NAMES)[number]) => Math.max(...chimeNotes(name).map((n) => n.peak));
    expect(peak('done')).toBeLessThan(peak('refresh'));
  });

  it('returns fresh copies so callers cannot change the table', () => {
    const first = chimeNotes('bookmark');
    first[0]!.frequency = 1;
    expect(chimeNotes('bookmark')[0]!.frequency).toBe(1318.51);
  });

  it('uses a 5 ms attack and reports the total length', () => {
    expect(CHIME_ATTACK_S).toBeCloseTo(0.005, 6);
    expect(chimeDuration('refresh')).toBeCloseTo(0.12 + 0.5, 6);
    expect(chimeDuration('bookmark')).toBeLessThan(0.1);
  });
});

describe('masterGain', () => {
  it('maps 0..100 onto 0..0.8 and clamps outside that range', () => {
    expect(masterGain(0)).toBe(0);
    expect(masterGain(100)).toBeCloseTo(0.8, 6);
    expect(masterGain(40)).toBeCloseTo(0.32, 6);
    expect(masterGain(-20)).toBe(0);
    expect(masterGain(500)).toBeCloseTo(0.8, 6);
    expect(masterGain(Number.NaN)).toBe(0);
  });
});

describe('shouldPlayChime', () => {
  it('plays when sound is on, the page is visible and the throttle window is clear', () => {
    expect(shouldPlayChime(open)).toBe(true);
  });

  it('never plays while the document is hidden', () => {
    expect(shouldPlayChime({ ...open, hidden: true })).toBe(false);
  });

  it('does nothing when sounds are off', () => {
    expect(shouldPlayChime({ ...open, allowed: false })).toBe(false);
  });

  it('allows at most one chime per throttle window', () => {
    expect(shouldPlayChime({ ...open, now: 1000, lastAllowedAt: 1000 - (CHIME_THROTTLE_MS - 1) })).toBe(false);
    expect(shouldPlayChime({ ...open, now: 1000, lastAllowedAt: 1000 - CHIME_THROTTLE_MS })).toBe(true);
  });
});
