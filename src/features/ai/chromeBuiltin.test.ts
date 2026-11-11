import { afterEach, describe, expect, it, vi } from 'vitest';
import { getChromeAiSupport, mapAvailability, outputLanguageFor, chromeBuiltinProvider } from './providers/chromeBuiltin';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mapAvailability', () => {
  it('maps the four states and the older Chrome names', () => {
    expect(mapAvailability('available')).toBe('available');
    expect(mapAvailability('readily')).toBe('available');
    expect(mapAvailability('downloadable')).toBe('downloadable');
    expect(mapAvailability('after-download')).toBe('downloadable');
    expect(mapAvailability('downloading')).toBe('downloading');
    expect(mapAvailability('unavailable')).toBe('unavailable');
  });

  it('treats unknown or non-string values as unavailable', () => {
    expect(mapAvailability('something-new')).toBe('unavailable');
    expect(mapAvailability(undefined)).toBe('unavailable');
    expect(mapAvailability(null)).toBe('unavailable');
  });
});

describe('getChromeAiSupport', () => {
  it('reports unavailable when the APIs are missing', async () => {
    vi.stubGlobal('Summarizer', undefined);
    vi.stubGlobal('LanguageModel', undefined);
    expect(await getChromeAiSupport()).toEqual({ summarizer: 'unavailable', prompt: 'unavailable' });
  });

  it('maps the mocked Summarizer and LanguageModel availability', async () => {
    vi.stubGlobal('Summarizer', { availability: vi.fn(async () => 'downloadable'), create: vi.fn() });
    vi.stubGlobal('LanguageModel', { availability: vi.fn(async () => 'available'), create: vi.fn() });
    expect(await getChromeAiSupport()).toEqual({ summarizer: 'downloadable', prompt: 'available' });
  });

  it('treats a throwing availability() as unavailable instead of failing', async () => {
    vi.stubGlobal('Summarizer', {
      availability: vi.fn(async () => {
        throw new Error('boom');
      }),
      create: vi.fn(),
    });
    expect((await getChromeAiSupport()).summarizer).toBe('unavailable');
  });

  it('asks the summarizer for English output, the only language the UI can request here', async () => {
    const availability = vi.fn(async () => 'available');
    vi.stubGlobal('Summarizer', { availability, create: vi.fn() });
    await getChromeAiSupport();
    expect(availability).toHaveBeenCalledWith({ outputLanguage: 'en' });
  });
});

describe('outputLanguageFor', () => {
  it('uses the UI language when the browser supports it', () => {
    expect(outputLanguageFor('en')).toEqual({ language: 'en', fellBack: false });
  });

  it('falls back to English and says so for languages the summarizer does not support', () => {
    expect(outputLanguageFor('ro')).toEqual({ language: 'en', fellBack: true });
    expect(outputLanguageFor('he')).toEqual({ language: 'en', fellBack: true });
  });
});

describe('chromeBuiltinProvider.generate with a mocked Summarizer', () => {
  it('runs tldr and key-points, parses the bullets and marks the English fallback', async () => {
    const summarize = vi.fn(async (_text: string, opts?: { context?: string }) => {
      void opts;
      return 'Short English summary.';
    });
    const create = vi.fn(async (options: { type: string }) => ({
      summarize: async (text: string) => {
        if (options.type === 'key-points') return '- One point\n- Two point\n- Three point';
        return summarize(text);
      },
      destroy: vi.fn(),
    }));
    vi.stubGlobal('Summarizer', { availability: vi.fn(async () => 'available'), create });
    vi.stubGlobal('LanguageModel', undefined);

    const partials: unknown[] = [];
    const result = await chromeBuiltinProvider.generate({
      title: 'T',
      url: 'https://example.com/a',
      text: 'Some article text about things.',
      locale: 'ro',
      instructions: 'Be brief.',
      signal: new AbortController().signal,
      onPartial: (p) => partials.push(p),
    });

    expect(result.summary).toBe('Short English summary.');
    expect(result.takeaways).toEqual(['One point', 'Two point', 'Three point']);
    expect(result.provider).toBe('chrome-builtin');
    expect(result.privacy).toBe('on-device');
    expect(result.notes).toContain('ai.note.englishOutput');
    expect(result.notes).toContain('ai.note.heuristicTags');
    expect(create.mock.calls.map((c) => (c[0] as { type: string }).type)).toEqual(['tldr', 'key-points']);
    expect(create.mock.calls[0]?.[0]).toMatchObject({ outputLanguage: 'en', format: 'markdown' });
    expect(partials.length).toBeGreaterThan(0);
  });
});
