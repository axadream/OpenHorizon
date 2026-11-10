import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db/db';
import type { Feed } from '@/db/schema';
import { setSetting } from '@/features/settings/settings';
import { exportOpmlWithStats } from './exportOpml';

const SECRET = 'sk-export-secret-XYZ-123';

function feed(): Feed {
  return {
    id: 'f-ai',
    url: 'https://example.com/feed.xml',
    title: 'Example',
    folderId: null,
    sortOrder: 0,
    isFavorite: 0,
    manual: 0,
    titleCustomized: 0,
    errorCount: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('OPML export and AI settings', () => {
  beforeEach(async () => {
    await db.feeds.clear();
    await db.settings.clear();
  });

  it('never contains the API key or any AI setting', async () => {
    await db.feeds.add(feed());
    await setSetting('aiEnabled', true);
    await setSetting('aiProvider', 'openai');
    await setSetting('aiBaseUrl', 'https://llm.example.com/v1');
    await setSetting('aiModel', 'model-secret-name');
    await setSetting('aiInstructions', 'Private instructions text');
    await setSetting('aiRememberKey', true);
    await setSetting('aiApiKey', SECRET);
    await setSetting('aiCloudConsent', { openai: 1700000000000 });

    const { xml, feedCount } = await exportOpmlWithStats();

    expect(feedCount).toBe(1);
    expect(xml).toContain('https://example.com/feed.xml');
    expect(xml).not.toContain(SECRET);
    expect(xml).not.toContain('aiApiKey');
    expect(xml).not.toContain('model-secret-name');
    expect(xml).not.toContain('Private instructions text');
    expect(xml).not.toContain('llm.example.com');
  });
});
