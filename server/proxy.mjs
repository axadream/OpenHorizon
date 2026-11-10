// Standalone feed proxy: `npm run proxy` -> http://localhost:8787/api/proxy?url=...
import { createServer } from 'node:http';
import { handleProxy } from './proxyHandler.mjs';
import { sendWebResponse, toWebRequest } from './nodeAdapter.mjs';

const PORT = Number(process.env.PORT) || 8787;

const server = createServer(async (req, res) => {
  const origin = `http://${req.headers.host ?? 'localhost'}`;
  let pathname = '';
  try {
    pathname = new URL(req.url ?? '/', origin).pathname;
  } catch {
    pathname = '';
  }

  if (pathname !== '/api/proxy') {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  try {
    await sendWebResponse(res, await handleProxy(toWebRequest(req, origin)));
  } catch (err) {
    console.error('proxy error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'internal proxy error' }));
    } else {
      res.end();
    }
  }
});

server.listen(PORT, () => {
  console.log(`OpenHorizon proxy listening on http://localhost:${PORT}/api/proxy?url={url}`);
});
