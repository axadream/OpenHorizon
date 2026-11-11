/*
 * Language tags for feeds: normalisation of declared tags, and a cheap offline detector for article
 * text (script counts first, then stop-word votes for Latin-script languages). Pure: no imports from
 * features/ or React.
 */

const MIN_LETTERS = 20;
const MIN_LATIN_HITS = 4;
const MIN_RATIO = 1.4;

/**
 * Normalise a declared language tag: `en_us` gives `en-US`, `ZH-cn` gives `zh-CN`, `zh-hans` gives
 * `zh-Hans`. Undefined when empty or when the primary subtag is not 2 to 3 letters.
 */
export function normalizeLanguageTag(raw: string | undefined | null): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim().replace(/_/g, '-');
  if (!trimmed) return undefined;
  const [primary = '', ...rest] = trimmed.split('-');
  if (!/^[a-zA-Z]{2,3}$/.test(primary)) return undefined;
  const subtags = rest
    .filter((part) => part.length > 0)
    .map((part) => {
      if (/^[a-zA-Z]{2}$/.test(part)) return part.toUpperCase();
      if (/^[a-zA-Z]{4}$/.test(part)) return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      return part;
    });
  return [primary.toLowerCase(), ...subtags].join('-');
}

/** Primary subtag, lowercased. Local copy so this lib module does not depend on i18n. */
function primarySubtag(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/)[0] ?? '';
}

/** True when the feed language matches the app language by primary subtag. Unknown feed language always matches. */
export function languageMatches(feedLanguage: string | undefined, appTag: string): boolean {
  if (!feedLanguage) return true;
  return primarySubtag(feedLanguage) === primarySubtag(appTag);
}

/** Sample text for detection: `title. summary` of the first items, joined by spaces. */
export function sampleFeedText(items: readonly { title: string; summary: string }[], max = 25): string {
  return items
    .slice(0, max)
    .map((item) => `${item.title}. ${item.summary}`)
    .join(' ');
}

/** Lowercase and strip diacritics (ș -> s, ă -> a, ü -> u). */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/* Stop-word sets (folded). Function words that are rare outside the language, plus a few shared ones. */
const STOP_WORDS: Record<string, string> = {
  en: `the and of to is are was were with that this for on it as be have has not but they from or by which an at you
    their will would there been what about also these those who when where had can more most been`,
  ro: `si de la cu pentru este sunt din care nu pe un o lui sa intr dupa fost sau mai cum cat ce acest aceasta unei
    unui ca foarte deja acum prin fara lor ale cei cele aceste mai despre fiind doar avea`,
  es: `el la de que y en los las del se por con para una un es su al lo como mas pero sus muy esta este son tambien
    fue ha si entre sobre desde hay cuando ya`,
  fr: `le la les de des du et est un une pour que qui dans pas sur avec ce cette au aux sont ne plus par il elle
    nous vous ils mais ou leur comme tres`,
  de: `und der die das nicht ist mit sich auf fur ein eine den dem von zu auch wird oder ich sie wir bei aber noch wie
    einen einer sind haben hat`,
  it: `il lo gli che di del della delle dei per con non una sono come anche ma questo questa nel nella sul alla dal
    dalla tra tutti hanno molto sua suo degli piu essere`,
  pt: `o os do da dos das em um uma para com nao que se mais mas como foi ao ele ela isso esta ser pelo pela muito
    tambem seu sua entre ja voce ou`,
  nl: `het een en van is dat niet zijn op te met voor ook als maar bij nog aan wat dit die er naar door over uit
    worden werd geen hebben zich kan wel omdat deze`,
  pl: `i w na nie sie z do ze jest to jak po za od dla co o tak przez ale jego jej ich sa byc lub czy tez tylko juz
    moze ten ta te jeszcze przy`,
  tr: `ve bir bu da de icin ile cok ne gibi daha olarak ancak ama sonra hem kadar o en ki mi degil var yok her sey
    olan oldu ya sadece bile ise uzerine`,
  sv: `och det att i en ar som pa for av med den till inte har jag han hon vi men om sa fran ett kan var skulle aven
    nu efter under eller sig`,
  da: `og i at det en er til pa af med for som den har ikke jeg hun men fra blev efter sig hvad meget mig ogsa eller
    kan skal`,
  no: `og i at det en er til pa av med for som den har ikke jeg han hun men fra ble etter seg hva veldig meg ogsa
    eller kan skal bare`,
  fi: `ja ei etta se ole oli kun mutta tai joka jotka myos han ne sen kuin niin tama tassa olla kanssa jos vain seka
    ovat kuten mukaan miten hanen`,
  cs: `a je se na ze to v ve z do neni jsou jako take pro ale jeho jsem tak byl byla bylo ktera ktere ktery mezi pak
    kdyz jsme nebo jen uz pri`,
  hu: `az hogy nem egy volt mint csak azt ezt van ezen amely utan kozott vagy mert nagyon meg de ez ami mar`,
  id: `dan yang ini itu dengan untuk tidak dari dalam akan pada ke bisa ada juga saya kami mereka oleh sudah telah
    karena atau seperti sebagai lebih bahwa tersebut adalah`,
};

const STOP_SETS: readonly { lang: string; words: ReadonlySet<string> }[] = Object.entries(STOP_WORDS).map(
  ([lang, list]) => ({ lang, words: new Set(list.split(/\s+/).filter(Boolean).map(fold)) }),
);

type Script = 'latin' | 'han' | 'kana' | 'heb' | 'arab' | 'cyr' | 'greek' | 'hangul' | 'thai' | 'deva';

/** Non-Latin script to the language it implies (Han and kana are handled separately). */
const SCRIPT_LANG: Partial<Record<Script, string>> = {
  heb: 'he',
  arab: 'ar',
  cyr: 'ru',
  greek: 'el',
  hangul: 'ko',
  thai: 'th',
  deva: 'hi',
};

function scriptOf(ch: string): Script | undefined {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp >= 0x0590 && cp <= 0x05ff) return 'heb';
  if ((cp >= 0x0600 && cp <= 0x06ff) || (cp >= 0x0750 && cp <= 0x077f)) return 'arab';
  if (cp >= 0x0400 && cp <= 0x04ff) return 'cyr';
  if (cp >= 0x0370 && cp <= 0x03ff) return 'greek';
  if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf)) return 'han';
  if (cp >= 0x3040 && cp <= 0x30ff) return 'kana';
  if (cp >= 0xac00 && cp <= 0xd7af) return 'hangul';
  if (cp >= 0x0e00 && cp <= 0x0e7f) return 'thai';
  if (cp >= 0x0900 && cp <= 0x097f) return 'deva';
  if (/\p{Script=Latin}/u.test(ch)) return 'latin';
  return undefined;
}

/** Ignore links: their letters say nothing about the language of the prose. */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/gi;

/**
 * Best-guess BCP 47 primary tag for the text, or undefined when unsure. Non-Latin scripts decide
 * first; Latin-script text is decided by stop-word votes with a 1.4x margin over the runner-up.
 */
export function detectLanguage(text: string): string | undefined {
  const clean = text.replace(URL_PATTERN, ' ');
  const counts: Record<Script, number> = {
    latin: 0,
    han: 0,
    kana: 0,
    heb: 0,
    arab: 0,
    cyr: 0,
    greek: 0,
    hangul: 0,
    thai: 0,
    deva: 0,
  };
  let letters = 0;
  for (const ch of clean) {
    if (!/\p{L}/u.test(ch)) continue;
    letters++;
    const script = scriptOf(ch);
    if (script) counts[script]++;
  }
  if (letters < MIN_LETTERS) return undefined;

  const half = letters / 2;
  if (counts.han + counts.kana > half) return counts.kana > letters * 0.05 ? 'ja' : 'zh';

  for (const script of Object.keys(SCRIPT_LANG) as Script[]) {
    if (counts[script] > half) return SCRIPT_LANG[script];
  }

  const tokens = fold(clean).match(/[\p{L}']+/gu) ?? [];
  const hits = STOP_SETS.map(({ lang, words }) => ({
    lang,
    count: tokens.reduce((n, word) => (words.has(word) ? n + 1 : n), 0),
  })).sort((a, b) => b.count - a.count);
  const winner = hits[0];
  const runnerUp = hits[1]?.count ?? 0;
  if (!winner || winner.count < MIN_LATIN_HITS) return undefined;
  if (runnerUp > 0 && winner.count < runnerUp * MIN_RATIO) return undefined;
  return winner.lang;
}
