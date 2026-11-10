import { describe, expect, it } from 'vitest';
import { extractKeywords, foldWord, heuristicDraft, isInformative, keySentences, leadSummary, splitSentences } from './heuristic';

const EN = `Battery life is the headline feature of the new phone. The battery lasts two days under normal use, and fast charging refills it in thirty minutes. Reviewers say the battery is the best part, while the camera is merely good. The price starts at 799 dollars.`;

const RO = `Bateria telefonului este foarte bună și durează mult. Bateria ține mai mult decât vechiul model, iar încărcarea este rapidă. Recenzenții laudă camera telefonului.`;

const EN_LEAD = `Yes. The city council approved a new budget for public transport on Monday. Buses will run more often on weekdays starting next spring. Critics argue that the plan ignores rural routes entirely.`;

const RO_LEAD = `Consiliul local a aprobat un buget nou pentru transportul public. Autobuzele vor circula mai des în zilele lucrătoare. Criticii spun că planul ignoră comunele.`;

describe('extractKeywords', () => {
  it('ranks the most frequent content word first and drops stop words (en)', () => {
    const tags = extractKeywords(EN, 'en', 5);
    expect(tags[0]).toBe('battery');
    expect(tags).not.toContain('the');
    expect(tags).not.toContain('is');
    expect(tags.length).toBeLessThanOrEqual(5);
  });

  it('finds Romanian keywords and drops Romanian stop words (ro)', () => {
    const tags = extractKeywords(RO, 'ro', 5);
    expect(tags).toContain('bateria');
    expect(tags).toContain('telefonului');
    for (const stop of ['este', 'mai', 'iar', 'foarte', 'și']) expect(tags).not.toContain(stop);
  });

  it('boosts a repeated two-word phrase into one tag', () => {
    const text = 'Machine learning models need data. Machine learning pipelines need care. Teams adopt machine learning slowly.';
    expect(extractKeywords(text, 'en', 5)[0]).toBe('machine learning');
  });

  it('never returns more than six tags, and never more than asked', () => {
    expect(extractKeywords(EN, 'en', 3).length).toBeLessThanOrEqual(3);
    expect(extractKeywords(EN, 'en', 50).length).toBeLessThanOrEqual(6);
  });

  it('returns an empty list for empty text', () => {
    expect(extractKeywords('', 'en')).toEqual([]);
    expect(extractKeywords('   ', 'ro')).toEqual([]);
  });

  it('folds diacritics for comparison', () => {
    expect(foldWord('Încărcarea')).toBe('incarcarea');
    expect(foldWord('și')).toBe('si');
  });
});

describe('leadSummary', () => {
  it('takes the first informative sentences in order and skips short fragments (en)', () => {
    expect(leadSummary(EN_LEAD, 'en', 2)).toBe(
      'The city council approved a new budget for public transport on Monday. Buses will run more often on weekdays starting next spring.',
    );
  });

  it('works for Romanian text (ro)', () => {
    expect(leadSummary(RO_LEAD, 'ro', 2)).toBe(
      'Consiliul local a aprobat un buget nou pentru transportul public. Autobuzele vor circula mai des în zilele lucrătoare.',
    );
  });

  it('returns an empty string for empty text', () => {
    expect(leadSummary('')).toBe('');
  });

  it('splits sentences with Intl.Segmenter when available', () => {
    expect(splitSentences('First one. Second one! Third?', 'en')).toEqual(['First one.', 'Second one!', 'Third?']);
  });

  it('rejects link lists and captions as informative', () => {
    expect(isInformative('Home | News | Sport | Weather')).toBe(false);
    expect(isInformative('Short.')).toBe(false);
    expect(isInformative('A genuine sentence that explains what happened in the city.')).toBe(true);
  });
});

describe('keySentences and heuristicDraft', () => {
  it('returns the sentences with the most keywords, in document order', () => {
    const picked = keySentences(EN, 'en', 2);
    expect(picked).toHaveLength(2);
    expect(picked.join(' ')).toContain('battery');
    const source = splitSentences(EN, 'en');
    expect(source.indexOf(picked[0] ?? '')).toBeLessThan(source.indexOf(picked[1] ?? ''));
  });

  it('builds the offline draft used when no model is available', () => {
    const draft = heuristicDraft(EN_LEAD, 'en');
    expect(draft.summary.length).toBeGreaterThan(0);
    expect(draft.takeaways.length).toBeGreaterThan(0);
    expect(draft.tags.length).toBeGreaterThan(0);
  });
});
