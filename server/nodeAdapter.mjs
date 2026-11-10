import { Readable } from 'node:stream';

/**
 * Build a web Request from a Node IncomingMessage.
 * @param {import('node:http').IncomingMessage} req
 * @param {string} origin e.g. "http://localhost:5173"
 * @returns {Request}
 */
export function toWebRequest(req, origin) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || name.startsWith(':')) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(name, v);
    } else {
      headers.set(name, value);
    }
  }
  const method = req.method ?? 'GET';
  /** @type {RequestInit & { duplex?: 'half' }} */
  const init = { method, headers };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(req);
    init.duplex = 'half';
  }
  return new Request(new URL(req.url ?? '/', origin), init);
}

/**
 * Write a web Response to a Node ServerResponse, streaming the body.
 * @param {import('node:http').ServerResponse} res
 * @param {Response} response
 * @returns {Promise<void>}
 */
export async function sendWebResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  for (;;) {
    if (res.destroyed) {
      await reader.cancel();
      return;
    }
    const { done, value } = await reader.read();
    if (done) break;
    if (!res.write(value)) {
      await new Promise((resolve) => {
        res.once('drain', resolve);
        res.once('close', resolve);
      });
    }
  }
  res.end();
}
