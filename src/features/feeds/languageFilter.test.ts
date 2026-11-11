import { describe, expect, it } from 'vitest';
import { filterFeedsByLanguage, type LanguageFilterable } from './languageFilter';

const feed = (id: string, extra: Partial<LanguageFilterable> = {}): LanguageFilterable & { id: string } => ({
  id,
  language: undefined,
  listKind: undefined,
  manual: 0,
  ...extra,
});

describe('filterFeedsByLanguage', () => {
  it('keeps local list feeds, unknown-language feeds and matching feeds; hides mismatched feeds', () => {
    const feeds = [
      feed('saved', { listKind: 'saved', language: 'ro' }),
      feed('watch', { listKind: 'watch' }),
      feed('unknown'),
      feed('english', { language: 'en-GB' }),
      feed('romanian', { language: 'ro' }),
    ];
    const visible = filterFeedsByLanguage(feeds, 'en-US').map((f) => f.id);
    expect(visible).toEqual(['saved', 'watch', 'unknown', 'english']);
  });

  it('hides feeds in other languages for a different app language', () => {
    const feeds = [feed('a', { language: 'de' }), feed('b')];
    expect(filterFeedsByLanguage(feeds, 'ro-RO').map((f) => f.id)).toEqual(['b']);
  });
});
