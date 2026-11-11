import { describe, expect, it, beforeAll } from 'vitest';
import { setLocale } from '@/i18n/i18n';
import { brandedPayload, brandedShareText, copyShareText } from '@/features/sharing/share';
import { shareTargetHref } from '@/features/sharing/shareTargets';

beforeAll(async () => {
  await setLocale('en');
});

describe('branded sharing', () => {
  it('brands the share text with the app name', () => {
    expect(brandedShareText('Hello')).toBe('Shared via OpenHorizon app | Hello');
  });

  it('falls back to the app name for an empty title', () => {
    expect(brandedShareText('   ')).toBe('Shared via OpenHorizon app | OpenHorizon');
  });

  it('keeps title and url and brands the text', () => {
    const p = brandedPayload({ title: 'Hello', url: 'https://example.com/a' });
    expect(p.title).toBe('Hello');
    expect(p.url).toBe('https://example.com/a');
    expect(p.text).toBe('Shared via OpenHorizon app | Hello');
  });

  it('builds the copy text as branded line, newline, URL', () => {
    expect(copyShareText({ title: 'Hello', url: 'https://example.com/a' })).toBe(
      'Shared via OpenHorizon app | Hello\nhttps://example.com/a',
    );
  });

  it('puts the branded text into the WhatsApp template', () => {
    const href = shareTargetHref('whatsapp', brandedPayload({ title: 'Hello', url: 'https://example.com/a' }));
    expect(href).toContain(encodeURIComponent('Shared via OpenHorizon app | Hello'));
  });
});
