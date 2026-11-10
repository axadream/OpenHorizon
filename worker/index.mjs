// Standalone Cloudflare Worker exposing the OpenHorizon feed proxy.
// Deploy with `npm run worker:deploy` (requires `npx wrangler login` once), then set
// VITE_CORS_PROXY=https://<name>.<account>.workers.dev/api/proxy?url={url}
// as a GitHub Actions repository variable so the Pages build uses it.
import { handleProxy } from '../server/proxyHandler.mjs';

export default {
  /** @param {Request} request */
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/proxy' || pathname === '/') return handleProxy(request);
    return new Response('Not found', { status: 404 });
  },
};
