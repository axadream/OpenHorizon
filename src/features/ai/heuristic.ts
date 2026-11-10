/*
 * Offline text analysis with no model: keywords, lead sentences and key sentences. Pure and
 * deterministic. Uses Intl.Segmenter when available (word and sentence segmentation), with regex
 * fallbacks. Stop-word lists exist for English and Romanian only; other languages keep every word
 * of at least three letters.
 */

const STOP_EN = `a about above after again against all also am an and any are as at be because been before being below
between both but by can could did do does doing down during each few for from further had has have having he her here hers
herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or
other our ours ourselves out over own said same she should so some such than that the their theirs them themselves then
there these they this those through to too under until up very was we were what when where which while who whom why will
with would you your yours yourself yourselves may might must one two new also says say`;

const STOP_RO = `a al ale am ai are asa au ca cand care cei cel cele cum cu da daca dar de deci despre din dupa ea ei el ele
era erau este eu fi fost in intre intr iar il la le li lor ma mai mi mie mu nu o or pe pentru peste pot sa sau se si sunt
ta te tot toate toti tu un una unde unei unui va vor vom voi cu acest aceasta acesta aceste acel aceea acei acele foarte doar
deja acum inca numai atunci prin fara ce cine cat cata lui asupra catre contra incat ori caci iata poate fiind avea are avut
aceasta acum dintre orice noua nou nouă noi`;

/** Fold a word for comparison: lowercase and without diacritics (ș -> s, ă -> a). */
export function foldWord(word: string): string {
  return word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

const STOP_SETS: Record<string, ReadonlySet<string>> = {
  en: new Set(STOP_EN.split(/\s+/).map(foldWord)),
  ro: new Set(STOP_RO.split(/\s+/).map(foldWord)),
};

function stopSetFor(lang: string): ReadonlySet<string> {
  return STOP_SETS[lang.toLowerCase().split('-')[0] ?? ''] ?? new Set<string>();
}

/** Lowercased word-like tokens. */
export function tokenize(text: string, lang = 'en'): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(lang, { granularity: 'word' });
    const out: string[] = [];
    for (const part of segmenter.segment(text)) {
      if (part.isWordLike) out.push(part.segment.toLowerCase());
    }
    return out;
  }
  return text.toLowerCase().match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? [];
}

function isCandidate(word: string, stop: ReadonlySet<string>): boolean {
  if (word.length < 3) return false;
  if (!/\p{L}/u.test(word)) return false;
  return !stop.has(foldWord(word));
}

interface Scored {
  surface: string;
  words: string[];
  count: number;
  first: number;
  score: number;
}

/**
 * Up to `max` tags (1 to 6) from the text: the most frequent non-stop words, plus two-word phrases
 * that occur at least twice (boosted). Candidates that share a word with an already chosen tag are
 * skipped, so tags do not repeat each other.
 */
export function extractKeywords(text: string, lang = 'en', max = 5): string[] {
  const limit = Math.min(6, Math.max(1, Math.floor(max)));
  const words = tokenize(text, lang);
  const stop = stopSetFor(lang);
  const unigrams = new Map<string, Scored>();
  const bigrams = new Map<string, Scored>();

  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? '';
    if (isCandidate(word, stop)) {
      const key = foldWord(word);
      const entry = unigrams.get(key) ?? { surface: word, words: [key], count: 0, first: i, score: 0 };
      entry.count++;
      unigrams.set(key, entry);
    }
    const next = words[i + 1];
    if (next !== undefined && isCandidate(word, stop) && isCandidate(next, stop)) {
      const key = `${foldWord(word)} ${foldWord(next)}`;
      const entry = bigrams.get(key) ?? { surface: `${word} ${next}`, words: [foldWord(word), foldWord(next)], count: 0, first: i, score: 0 };
      entry.count++;
      bigrams.set(key, entry);
    }
  }

  const ranked: Scored[] = [];
  for (const u of unigrams.values()) ranked.push({ ...u, score: u.count });
  for (const b of bigrams.values()) {
    if (b.count >= 2) ranked.push({ ...b, score: b.count * 2 });
  }
  ranked.sort((a, b) => b.score - a.score || a.first - b.first);

  const chosen: Scored[] = [];
  const used = new Set<string>();
  for (const cand of ranked) {
    if (chosen.length >= limit) break;
    if (cand.words.some((w) => used.has(w))) continue;
    chosen.push(cand);
    for (const w of cand.words) used.add(w);
  }
  return chosen.map((c) => c.surface.toLowerCase());
}

/** Sentences of a text, whitespace collapsed. Intl.Segmenter when available. */
export function splitSentences(text: string, lang = 'en'): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  let parts: string[];
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(lang, { granularity: 'sentence' });
    parts = Array.from(segmenter.segment(clean), (p) => p.segment.trim());
  } else {
    parts = clean.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()) ?? [];
  }
  return parts.filter((s) => s.length > 0);
}

/** A sentence worth showing: long enough and mostly letters (not a link list, a date or a caption). */
export function isInformative(sentence: string): boolean {
  if (sentence.length < 40) return false;
  const letters = sentence.match(/\p{L}/gu)?.length ?? 0;
  return letters / sentence.length > 0.6;
}

/** The first informative sentences joined in order: an extractive lead summary. Empty when none. */
export function leadSummary(text: string, lang = 'en', max = 3): string {
  return splitSentences(text, lang).filter(isInformative).slice(0, Math.max(1, max)).join(' ');
}

/**
 * The informative sentences that carry the most frequent keywords, returned in document order.
 * Scores are normalised by sentence length so long sentences do not win by size alone.
 */
export function keySentences(text: string, lang = 'en', max = 3): string[] {
  const stop = stopSetFor(lang);
  const freq = new Map<string, number>();
  for (const word of tokenize(text, lang)) {
    if (!isCandidate(word, stop)) continue;
    const key = foldWord(word);
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }
  const sentences = splitSentences(text, lang).filter(isInformative);
  const scored = sentences.map((sentence, index) => {
    const tokens = tokenize(sentence, lang);
    const total = tokens.reduce((sum, w) => sum + (isCandidate(w, stop) ? (freq.get(foldWord(w)) ?? 0) : 0), 0);
    return { sentence, index, score: total / Math.sqrt(Math.max(1, tokens.length)) };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored
    .slice(0, Math.max(1, max))
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence);
}

/** Offline draft used when no model is available: lead summary, key sentences and keyword tags. */
export function heuristicDraft(text: string, lang = 'en'): { summary: string; takeaways: string[]; tags: string[] } {
  return {
    summary: leadSummary(text, lang, 3),
    takeaways: keySentences(text, lang, 3),
    tags: extractKeywords(text, lang, 5),
  };
}
