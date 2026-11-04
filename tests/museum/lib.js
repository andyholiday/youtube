// Hilfsfunktionen: lokaler Server mit Kopie von site/ + Fixtures, Browser-Start, Touch per CDP.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };

// Spion auf dem ui-Objekt (läuft im Seitenkontext, vor main.js): zeichnet alle Aufrufe der Schnittstelle
// aus .planning/SPEC-UI.md auf. Methoden, die ui.js noch nicht hat, werden durch Aufzeichner ersetzt.
function uiSpyScript() {
  const NAMES = ['setLoading', 'setReady', 'setItems', 'setWidmung', 'showEmptyHint', 'showFatal', 'showControlsHint',
    'markInteracted', 'roomEntered', 'focusChanged', 'openLightbox'];
  const calls = [];
  const missing = [];
  window.__uiCalls = calls;
  window.__uiMissing = missing;
  const plain = (a) => (a && typeof a === 'object' && 'theme' in a && 'id' in a ? { id: a.id, theme: a.theme } : a);
  window.__museumUiHook = (ui) => new Proxy(ui, {
    get(target, name) {
      const real = target[name];
      if (typeof name !== 'string' || (typeof real !== 'function' && !NAMES.includes(name))) return real;
      if (typeof real !== 'function' && !missing.includes(name)) missing.push(name);
      return (...args) => {
        calls.push([name, ...args.map(plain)]);
        return typeof real === 'function' ? real.apply(target, args) : undefined;
      };
    },
  });
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

/** Kopiert site/ + Fixtures in ein Temp-Verzeichnis und serviert es. dataFile: data-0|1|7|40.json */
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

/** Neue Seite; mobile=true -> iPhone 13 (Hochformat, Touch), landscape=true -> Querformat. Sammelt Konsolenfehler in page.errors. */
async function newPage(browser, { mobile = false, landscape = false, spy = true } = {}) {
  const opts = mobile ? { ...devices[landscape ? 'iPhone 13 landscape' : 'iPhone 13'] } : { viewport: { width: 1280, height: 800 } };
  const context = await browser.newContext(opts);
  // Three.js liegt lokal in site/vendor/: jeder CDN-Zugriff wäre ein Fehler (und scheitert hier absichtlich).
  await context.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
  const page = await context.newPage();
  page.errors = [];
  page.external = [];
  page.on('request', (r) => { if (!r.url().startsWith('http://127.0.0.1') && !r.url().startsWith('data:')) page.external.push(r.url()); });
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => page.errors.push(`requestfailed: ${r.url()}`));
  if (spy) await page.addInitScript(uiSpyScript);
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

/** Aufgezeichnete ui-Aufrufe als [[Name, ...Argumente], ...]; filter: nur diesen Methodennamen. */
const uiCalls = async (page, name) => {
  const calls = await page.evaluate(() => window.__uiCalls);
  return name ? calls.filter((c) => c[0] === name) : calls;
};

const pos = (page) => page.evaluate(() => window.__museum.pos);

// Touch-Ereignisse über das DevTools-Protokoll (echte Multi-Touch-Sequenzen). points = alle aktuellen Finger.
const touch = {
  send: (page, type, points) => page.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points }),
  start: (page, points) => touch.send(page, 'touchStart', points),
  move: (page, points) => touch.send(page, 'touchMove', points),
  end: (page) => touch.send(page, 'touchEnd', []),
};

module.exports = { ROOT, serve, startServer, launch, newPage, openMuseum, enter, pos, touch, uiCalls };
