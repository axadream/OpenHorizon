import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchWithProxy } = vi.hoisted(() => ({ fetchWithProxy: vi.fn() }));
vi.mock('@/lib/proxy/fetchWithProxy', () => ({ fetchWithProxy }));

import { ReadabilityError, extractArticle, fetchReadable } from './readability';

const LONG_PARAGRAPH =
  'The river had risen overnight, and by morning the lower streets were under a brown sheet of water. ' +
  'Residents carried sandbags from the depot, while volunteers knocked on doors to check on elderly neighbours. ' +
  'Officials said the defences had held better than expected, though they warned that more rain was forecast.';

const ARTICLE_PAGE = `<!doctype html>
<html lang="en"><head>
  <title>Flood defences hold as river peaks</title>
  <meta name="author" content="Jane Doe">
  <meta property="og:image" content="/static/cover.jpg">
  <script>window.tracking = function () { return 'SCRIPT_MARKER'; };</script>
  <style>.x { color: red; } /* STYLE_MARKER */</style>
</head><body>
  <nav><a href="/">Home</a> <a href="/news">News</a> <a href="/sport">Sport</a></nav>
  <article>
    <h1>Flood defences hold as river peaks</h1>
    <p>${LONG_PARAGRAPH}</p>
    <p><img src="images/flood.jpg" alt="Flooded street"> ${LONG_PARAGRAPH}</p>
    <p>${LONG_PARAGRAPH} <a href="/about">Read more about the defences</a>.</p>
    <p>${LONG_PARAGRAPH}</p>
  </article>
  <aside class="sidebar"><p>Subscribe to our newsletter for daily updates and offers.</p></aside>
  <footer><p>Copyright example news. All rights reserved.</p></footer>
</body></html>`;

const BOILERPLATE_PAGE = `<!doctype html><html><head><title>Home</title></head><body>
  <header><nav><a href="/a">A</a><a href="/b">B</a></nav></header>
  <div class="cookie-banner">We use cookies. Accept all.</div>
  <p>Short.</p>
  <footer>Footer links only.</footer>
</body></html>`;

const NEWS_URL = 'https://example.com/news/post.html';

describe('extractArticle', () => {
  it('extracts title, byline, text and excerpt from an article page', async () => {
    const out = await extractArticle(ARTICLE_PAGE, NEWS_URL);
    expect(out.title).toBe('Flood defences hold as river peaks');
    expect(out.byline).toBe('Jane Doe');
    expect(out.textContent).toContain('brown sheet of water');
    expect(out.textContent.length).toBeGreaterThanOrEqual(200);
    expect(out.contentHtml).toContain('brown sheet of water');
    expect(out.lang).toBe('en');
  });

  it('drops scripts, styles and navigation or footer boilerplate', async () => {
    const out = await extractArticle(ARTICLE_PAGE, NEWS_URL);
    expect(out.contentHtml).not.toContain('SCRIPT_MARKER');
    expect(out.contentHtml).not.toContain('STYLE_MARKER');
    expect(out.contentHtml).not.toContain('<script');
    expect(out.textContent).not.toContain('Copyright example news');
    expect(out.textContent).not.toContain('Subscribe to our newsletter');
  });

  it('resolves relative image and link addresses against the page URL', async () => {
    const out = await extractArticle(ARTICLE_PAGE, NEWS_URL);
    expect(out.contentHtml).toContain('src="https://example.com/news/images/flood.jpg"');
    expect(out.contentHtml).toContain('href="https://example.com/about"');
  });

  it('prefers the declared og:image as the lead image, made absolute', async () => {
    const out = await extractArticle(ARTICLE_PAGE, NEWS_URL);
    expect(out.leadImage).toBe('https://example.com/static/cover.jpg');
  });

  it('falls back to the first image in the article when no share image is declared', async () => {
    const withoutOg = ARTICLE_PAGE.replace('<meta property="og:image" content="/static/cover.jpg">', '');
    const out = await extractArticle(withoutOg, NEWS_URL);
    expect(out.leadImage).toBe('https://example.com/news/images/flood.jpg');
  });

  it('throws ReadabilityError("no-content") for boilerplate with little text', async () => {
    const err = await extractArticle(BOILERPLATE_PAGE, 'https://example.com/').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ReadabilityError);
    expect((err as ReadabilityError).reason).toBe('no-content');
  });

  it('throws for empty input', async () => {
    await expect(extractArticle('', NEWS_URL)).rejects.toMatchObject({ reason: 'no-content' });
  });
});

describe('fetchReadable', () => {
  beforeEach(() => {
    fetchWithProxy.mockReset();
  });

  it('fetches the page as HTML and returns the article with the final url', async () => {
    fetchWithProxy.mockResolvedValue({ status: 200, text: ARTICLE_PAGE, finalUrl: NEWS_URL, via: 'direct' });
    const controller = new AbortController();
    const out = await fetchReadable('https://example.com/short', controller.signal);
    expect(fetchWithProxy).toHaveBeenCalledWith('https://example.com/short', expect.objectContaining({ expectHtml: true, signal: controller.signal }));
    expect(out.finalUrl).toBe(NEWS_URL);
    expect(out.title).toBe('Flood defences hold as river peaks');
  });

  it('propagates fetch failures unchanged', async () => {
    const failure = new Error('timed out after 15000 ms');
    fetchWithProxy.mockRejectedValue(failure);
    await expect(fetchReadable('https://example.com/x')).rejects.toBe(failure);
  });
});
