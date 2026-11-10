// Captures README screenshots from the running dev server using headless Edge/Chrome + CDP.
// Usage: node scripts/screenshots.mjs [baseUrl]   (default http://localhost:5173)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://localhost:5173';
const feed = encodeURIComponent('https://feeds.bbci.co.uk/news/rss.xml');
const shots = [
  { name: 'desktop', width: 1440, height: 900, query: `seed=${feed}` },
  { name: 'reader', width: 1440, height: 900, query: `seed=${feed}&pane=reader` },
  { name: 'mobile', width: 390, height: 844, query: `seed=${feed}&pane=reader`, mobile: true },
];

const candidates = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const browser = candidates.find((p) => existsSync(p));
if (!browser) throw new Error('No Edge/Chrome found');

const port = 9333;
const profile = mkdtempSync(join(tmpdir(), 'oh-shots-'));
const proc = spawn(browser, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForDevTools() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch {}
    await sleep(200);
  }
  throw new Error('DevTools endpoint not reachable');
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && this.pending.has(msg.id)) { const { res, rej } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
      else this.events.push(msg);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
}

async function openTarget() {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
  const target = await res.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  return new Cdp(ws);
}

async function evaluate(cdp, expression) {
  const { result } = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return result.value;
}

mkdirSync('assets/screenshots', { recursive: true });
try {
  await waitForDevTools();
  for (const shot of shots) {
    const cdp = await openTarget();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: shot.width, height: shot.height, deviceScaleFactor: 1, mobile: !!shot.mobile,
    });
    if (shot.mobile) await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await cdp.send('Page.navigate', { url: `${base}/?${shot.query}` });
    let ready = false;
    for (let i = 0; i < 150; i++) {
      await sleep(200);
      try { ready = await evaluate(cdp, "document.documentElement.dataset.seeded === 'true'"); } catch {}
      if (ready) break;
    }
    if (!ready) console.warn(`${shot.name}: seed flag not seen, capturing anyway`);
    // Let live queries, images and transitions settle.
    await sleep(2500);
    await evaluate(cdp, "document.querySelectorAll('[role=\"status\"]').forEach(() => {}); 1");
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const out = join('assets/screenshots', `${shot.name}.png`);
    writeFileSync(out, Buffer.from(data, 'base64'));
    console.log(`${shot.name}: ${out}`);
    cdp.ws.close();
  }
} finally {
  proc.kill();
}
