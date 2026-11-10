import { describe, expect, it } from 'vitest';
import { extractJsonObject, parseAiJson, parseBullets, parseTagList, partialSummary, plainModelText } from './parseAiJson';

describe('parseAiJson', () => {
  it('parses a clean JSON object', () => {
    const raw = '{"summary":"A short summary.","takeaways":["One","Two","Three"],"tags":["energy","grid"]}';
    expect(parseAiJson(raw)).toEqual({
      summary: 'A short summary.',
      takeaways: ['One', 'Two', 'Three'],
      tags: ['energy', 'grid'],
    });
  });

  it('finds the object inside code fences and surrounding prose', () => {
    const raw = 'Sure! Here you go:\n```json\n{"summary":"Done.","takeaways":["a"],"tags":["b"]}\n```\nHope this helps.';
    expect(parseAiJson(raw)?.summary).toBe('Done.');
  });

  it('removes trailing commas', () => {
    const raw = '{"summary":"S.","takeaways":["a","b",],"tags":["x",],}';
    expect(parseAiJson(raw)).toEqual({ summary: 'S.', takeaways: ['a', 'b'], tags: ['x'] });
  });

  it('recovers a truncated object (open string, array and brace)', () => {
    const raw = '{"summary":"The article explains the grid. It also","takeaways":["Prices rise","Supply is tight';
    const draft = parseAiJson(raw);
    expect(draft?.summary).toBe('The article explains the grid. It also');
    expect(draft?.takeaways).toEqual(['Prices rise', 'Supply is tight']);
  });

  it('caps takeaways and tags at six, dedupes tags and strips hashes', () => {
    const raw = JSON.stringify({
      summary: 'S.',
      takeaways: ['1', '2', '3', '4', '5', '6', '7', '8'],
      tags: ['#Energy', 'energy', 'ENERGY', 'b', 'c', 'd', 'e', 'f', 'g'],
    });
    const draft = parseAiJson(raw);
    expect(draft?.takeaways).toHaveLength(6);
    expect(draft?.tags).toEqual(['energy', 'b', 'c', 'd', 'e', 'f']);
  });

  it('accepts tags given as a comma-separated string', () => {
    expect(parseAiJson('{"summary":"S.","tags":"Rail, Trains; transit"}')?.tags).toEqual(['rail', 'trains', 'transit']);
  });

  it('removes HTML from every field', () => {
    const draft = parseAiJson('{"summary":"<b>Bold</b> <script>x()</script>text","takeaways":["<a href=\\"x\\">link</a> point"],"tags":["<i>t</i>"]}');
    expect(draft?.summary).toBe('Bold x() text');
    expect(draft?.summary).not.toMatch(/<\/?[a-z]/i);
    expect(draft?.takeaways[0]).toBe('link point');
    expect(draft?.tags).toEqual(['t']);
  });

  it('returns null for text, arrays and empty objects', () => {
    expect(parseAiJson('I cannot help with that.')).toBeNull();
    expect(parseAiJson('["a","b"]')).toBeNull();
    expect(parseAiJson('{}')).toBeNull();
    expect(parseAiJson('')).toBeNull();
  });
});

describe('extractJsonObject', () => {
  it('returns the first balanced object, ignoring braces inside strings', () => {
    expect(extractJsonObject('x {"a":"}{","b":1} tail {"c":2}')).toBe('{"a":"}{","b":1}');
  });
});

describe('partialSummary', () => {
  it('returns the summary decoded so far while the JSON streams in', () => {
    expect(partialSummary('{"summary": "The grid is')).toBe('The grid is');
  });

  it('decodes escapes and drops an unfinished one at the end', () => {
    expect(partialSummary('{"summary":"Line one\\nLine \\"two\\" \\')).toBe('Line one Line "two"');
  });

  it('returns null before the summary key has started', () => {
    expect(partialSummary('{"takeaways": [')).toBeNull();
  });
});

describe('parseBullets and parseTagList', () => {
  it('reads bullets, numbered items and plain lines', () => {
    expect(parseBullets('- **Price** rises\n- Supply is tight\n* Demand grows')).toEqual([
      'Price rises',
      'Supply is tight',
      'Demand grows',
    ]);
    expect(parseBullets('1. First\n2) Second')).toEqual(['First', 'Second']);
    expect(parseBullets('Plain line one\nPlain line two')).toEqual(['Plain line one', 'Plain line two']);
  });

  it('reads a free-form tag reply', () => {
    expect(parseTagList('Energy, Grid,\n#transit; x')).toEqual(['energy', 'grid', 'transit']);
  });
});

describe('plainModelText', () => {
  it('strips tags and comments and collapses whitespace', () => {
    expect(plainModelText('  <p>Hello <!-- x --> <em>world</em></p>  ')).toBe('Hello world');
  });
});
