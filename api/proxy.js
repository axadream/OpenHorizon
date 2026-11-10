// Vercel Edge Function: served at /api/proxy on the same origin.
import { handleProxy } from '../server/proxyHandler.mjs';

export const config = { runtime: 'edge' };
export default (req) => handleProxy(req);
