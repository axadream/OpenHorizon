// Cloudflare Pages Function: served at /api/proxy on the same origin.
import { handleProxy } from '../../server/proxyHandler.mjs';

export const onRequest = ({ request }) => handleProxy(request);
