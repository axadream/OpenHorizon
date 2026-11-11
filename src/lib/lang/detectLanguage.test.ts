import { describe, expect, it } from 'vitest';
import { detectLanguage, languageMatches, normalizeLanguageTag, sampleFeedText } from './detectLanguage';

const EN = 'The quick brown fox jumps over the lazy dog. This is a test of the language detection, and it should be able to tell that this text is written in English because of the common words that appear in it.';
const RO = 'Acesta este un text în limba română, scris pentru a testa detectarea limbii. Nu este foarte lung, dar conține multe cuvinte care sunt specifice românei și care nu apar în alte limbi.';
const RO_PLAIN = 'Acesta e un text scris si de la inceput pentru a testa limba, si este din care nu lipseste nimic. Ele sunt pe un drum lung.';
const DE = 'Das ist ein Text und die Sprache ist Deutsch. Wir sind nicht sicher, ob er auch von anderen Leuten verstanden wird, aber es ist auf jeden Fall ein guter Test für die Erkennung.';
const ES = 'Este es un texto escrito en español para probar la detección del idioma. Los resultados deben ser claros, y las palabras de uso común son muy útiles para distinguir entre lenguas.';
const HE = 'זהו טקסט בעברית על נושא חשוב מאוד והוא נכתב כדי לבדוק את הזיהוי של השפה בתוך המערכת.';
const ZH = '今天我们在北京讨论了新的技术发展问题，这个问题对于整个行业都非常重要，我们需要认真对待。';
const JA = '今日は東京で新しい技術についての記事を読みました。これは日本のニュースサイトの記事です。テストの結果は良好でした。';
const RU = 'Это статья о новых технологиях, которые меняют то, как люди работают и живут в современном мире.';

describe('detectLanguage', () => {
  it('detects English', () => {
    expect(detectLanguage(EN)).toBe('en');
  });

  it('detects Romanian with diacritics', () => {
    expect(detectLanguage(RO)).toBe('ro');
  });

  it('detects Romanian without diacritics', () => {
    expect(detectLanguage(RO_PLAIN)).toBe('ro');
  });

  it('detects German', () => {
    expect(detectLanguage(DE)).toBe('de');
  });

  it('detects Spanish', () => {
    expect(detectLanguage(ES)).toBe('es');
  });

  it('detects Hebrew by script', () => {
    expect(detectLanguage(HE)).toBe('he');
  });

  it('detects Chinese by script', () => {
    expect(detectLanguage(ZH)).toBe('zh');
  });

  it('detects Japanese when kana are present', () => {
    expect(detectLanguage(JA)).toBe('ja');
  });

  it('detects Russian by script', () => {
    expect(detectLanguage(RU)).toBe('ru');
  });

  it('returns undefined for a short text', () => {
    expect(detectLanguage('Hello')).toBeUndefined();
  });

  it('returns undefined for numbers and URLs only', () => {
    expect(detectLanguage('12 45 2024 https://example.com/a/b/c 3.14 www.example.org/page 99%')).toBeUndefined();
  });
});

describe('normalizeLanguageTag', () => {
  it('normalises region and case', () => {
    expect(normalizeLanguageTag('en_us')).toBe('en-US');
    expect(normalizeLanguageTag('ZH-cn')).toBe('zh-CN');
    expect(normalizeLanguageTag('zh-hans')).toBe('zh-Hans');
    expect(normalizeLanguageTag('  RO  ')).toBe('ro');
  });

  it('returns undefined for empty or invalid tags', () => {
    expect(normalizeLanguageTag('')).toBeUndefined();
    expect(normalizeLanguageTag('   ')).toBeUndefined();
    expect(normalizeLanguageTag(undefined)).toBeUndefined();
    expect(normalizeLanguageTag(null)).toBeUndefined();
    expect(normalizeLanguageTag('1234')).toBeUndefined();
  });
});

describe('languageMatches', () => {
  it('keeps unknown languages', () => {
    expect(languageMatches(undefined, 'en')).toBe(true);
    expect(languageMatches('', 'en')).toBe(true);
  });

  it('compares primary subtags', () => {
    expect(languageMatches('en-GB', 'en')).toBe(true);
    expect(languageMatches('ro', 'en-US')).toBe(false);
    expect(languageMatches('zh-Hans', 'zh-CN')).toBe(true);
  });
});

describe('sampleFeedText', () => {
  it('joins title and summary of the first items', () => {
    const items = [
      { title: 'A', summary: 'one' },
      { title: 'B', summary: 'two' },
      { title: 'C', summary: 'three' },
    ];
    expect(sampleFeedText(items, 2)).toBe('A. one B. two');
  });
});
