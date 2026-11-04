// Hilfsfunktionen: lokaler Server mit Kopie von site/ + Fixtures, Browser-Start, Touch per CDP.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';
const THREE_CACHE = path.join(__dirname, '.cache', 'three.module.js');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };

function ensureThree() {
  if (fs.existsSync(THREE_CACHE) && fs.statSync(THREE_CACHE).size > 100000) return;
  fs.mkdirSync(path.dirname(THREE_CACHE), { recursive: true });
  execFileSync('curl', ['-sSfL', '--max-time', '60', '-o', THREE_CACHE, THREE_URL]);
}

/** Serviert ein Verzeichnis auf einem freien Port. */
async function serve(dir, cleanup = false) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html');
    const file = path.join(dir, rel);
    if (!file.startsWith(dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end('nicht gefunden'); return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  return { url, dir, close: () => new Promise((r) => server.close(() => { if (cleanup) fs.rmSync(dir, { recursive: true, force: true }); r(); })) };
}

/** Kopiert site/ + Fixtures in ein Temp-Verzeichnis und serviert es. dataFile: data-0|1|7.json */
async function startServer(dataFile) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'museum-'));
  fs.cpSync(path.join(ROOT, 'site'), dir, { recursive: true });
  const fx = path.join(__dirname, 'fixtures');
  fs.cpSync(path.join(fx, 'erinnerungen'), path.join(dir, 'erinnerungen'), { recursive: true });
  fs.copyFileSync(path.join(fx, dataFile), path.join(dir, 'erinnerungen.json'));
  return serve(dir, true);
}

function launch() {
  return chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}

/** Neue Seite; mobile=true -> iPhone 13 (Hochformat, Touch). Sammelt Konsolenfehler in page.errors. */
async function newPage(browser, { mobile = false } = {}) {
  ensureThree();
  const opts = mobile ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 800 } };
  const context = await browser.newContext(opts);
  await context.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript', body: fs.readFileSync(THREE_CACHE) }));
  const page = await context.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => page.errors.push(`requestfailed: ${r.url()}`));
  page.cdp = mobile ? await context.newCDPSession(page) : null;
  return page;
}

async function openMuseum(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.__museum && window.__museum.ready, null, { timeout: 30000 });
  await page.waitForFunction(() => !document.getElementById('start-btn').disabled);
}

async function enter(page) {
  await page.click('#start-btn');
  await page.waitForSelector('#start', { state: 'hidden' });
}

const pos = (page) => page.evaluate(() => window.__museum.pos);

// Touch-Ereignisse über das DevTools-Protokoll (echte Multi-Touch-Sequenzen). points = alle aktuellen Finger.
const touch = {
  send: (page, type, points) => page.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points }),
  start: (page, points) => touch.send(page, 'touchStart', points),
  move: (page, points) => touch.send(page, 'touchMove', points),
  end: (page) => touch.send(page, 'touchEnd', []),
};

module.exports = { ROOT, serve, startServer, launch, newPage, openMuseum, enter, pos, touch };
