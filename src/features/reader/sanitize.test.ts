import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitize';

function toDoc(html: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  return wrap;
}

describe('sanitizeHtml', () => {
  it('strips script elements and inline handlers', () => {
    const out = sanitizeHtml('<p onclick="x()">Hi</p><script>alert(1)</script><img src="a.png" onerror="alert(2)">');
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/onerror|onclick/i);
    expect(out).toContain('<p>Hi</p>');
  });

  it('removes javascript: hrefs', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">bad</a>', 'https://example.com/post');
    expect(out).not.toMatch(/javascript:/i);
    const link = toDoc(out).querySelector('a');
    expect(link?.getAttribute('href')).toBeNull();
  });

  it('removes iframes that are not YouTube embeds', () => {
    const out = sanitizeHtml('<iframe src="https://evil.example.com/embed/x"></iframe><p>after</p>');
    expect(out).not.toMatch(/<iframe/i);
    expect(out).toContain('<p>after</p>');
  });

  it('keeps YouTube embeds with a sandbox, lazy loading and no fixed size', () => {
    const out = sanitizeHtml('<iframe width="560" height="315" src="https://www.youtube.com/embed/abc123"></iframe>');
    const frame = toDoc(out).querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame?.getAttribute('src')).toBe('https://www.youtube.com/embed/abc123');
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin allow-presentation allow-popups');
    expect(frame?.getAttribute('loading')).toBe('lazy');
    expect(frame?.hasAttribute('width')).toBe(false);
  });

  it('rejects YouTube-looking hosts that are not embeds', () => {
    const out = sanitizeHtml('<iframe src="https://www.youtube.com/watch?v=abc"></iframe>');
    expect(out).not.toMatch(/<iframe/i);
  });

  it('adds target and rel to links and resolves relative hrefs against the base', () => {
    const out = sanitizeHtml('<a href="/posts/next">next</a>', 'https://blog.example.com/feed/item');
    const link = toDoc(out).querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://blog.example.com/posts/next');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
    expect(link?.getAttribute('rel')).toContain('noreferrer');
  });

  it('adds loading=lazy and resolves relative image sources', () => {
    const out = sanitizeHtml('<img src="img/hero.jpg" width="800" height="400">', 'https://blog.example.com/posts/a');
    const img = toDoc(out).querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://blog.example.com/posts/img/hero.jpg');
    expect(img?.getAttribute('loading')).toBe('lazy');
    expect(img?.getAttribute('decoding')).toBe('async');
    expect(img?.hasAttribute('width')).toBe(false);
    expect(img?.getAttribute('alt')).toBe('');
  });

  it('drops oversized data: images but keeps small ones', () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(51_000);
    const small = 'data:image/png;base64,iVBORw0KGgo=';
    const out = sanitizeHtml(`<img src="${big}"><img src="${small}">`);
    const imgs = toDoc(out).querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toBe(small);
  });

  it('removes style attributes and unknown containers like forms', () => {
    const out = sanitizeHtml('<p style="color:red">styled</p><form action="/x"><input name="a"></form>');
    expect(out).not.toMatch(/style=/i);
    expect(out).not.toMatch(/<form|<input/i);
    expect(out).toContain('styled');
  });
});
