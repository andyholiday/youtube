// Tests der Raumthemen (Playwright + Chromium/SwiftShader). Start: node tests/museum/themes/run.js
// Prüft pro Thema Struktur, Performance-Grenzen, Türöffnungen, Freiflächen, frame/plaque und erzeugt Screenshots.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SHOTS = path.join(__dirname, 'screenshots');
const THEMES = ['modern', 'klassisch', 'futuristisch', 'garten'];
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

const VIEWS = {
  desktop: [
    { name: 'a', q: 'room=a', w: 1100, h: 620 },
    { name: 'b', q: 'room=a&cam=12.5,1.65,1.5&look=2,3.5,9', w: 1100, h: 620 },
  ],
  handy: [
    { name: 'a', q: 'room=a&cam=7,1.65,10.8&look=7,3.4,1', w: 390, h: 844, dpr: 1.5 },
    { name: 'b', q: 'room=b&cam=0,1.65,9.6&look=-1.5,3.2,4', w: 390, h: 844, dpr: 1.5 },
  ],
};

const results = [];
let browser, server, base;

async function startServer() {
  server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}

async function newPage(viewport, dpr = 1) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: dpr });
  await context.route('https://cdn.jsdelivr.net/**', (route) => route.abort()); // Three.js liegt lokal in site/vendor/
  const page = await context.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => page.errors.push(`requestfailed: ${r.url()}`));
  return page;
}

async function open(page, query) {
  await page.goto(`${base}/tests/museum/themes/preview.html?${query}`);
  await page.waitForFunction('window.__ready === true', null, { timeout: 120000 });
}

function record(name, t0, err) {
  results.push({ name, ok: !err });
  console.log(err ? `  FAIL ${name}\n       ${String(err.message).split('\n').join('\n       ')}` : `  ok   ${name} (${Date.now() - t0} ms)`);
}

async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); record(name, t0); } catch (err) { record(name, t0, err); }
}

function assertNoErrors(page, label) {
  if (page.errors.length) throw new Error(`${label}: Konsolen-/Netzwerkfehler: ${page.errors.join(' | ')}`);
}

/** Zufallsräume mit 8-20 m Kantenlänge und 0-3 Türen auf beliebigen Wänden (im Seitenkontext erzeugt). */
function randomRooms(page, count) {
  return page.evaluate((n) => {
    const { makeSlots } = window.__api;
    let a = 12345;
    const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const rooms = [];
    for (let i = 0; i < n; i++) {
      const w = 8 + rnd() * 12, d = 8 + rnd() * 12;
      const x0 = Math.round((rnd() * 40 - 20) * 10) / 10, z0 = Math.round((rnd() * 40 - 20) * 10) / 10;
      const room = { id: i, x0, z0, x1: x0 + w, z1: z0 + d, height: 7 + rnd() * 3, doors: [] };
      const count = Math.floor(rnd() * 4);
      for (let k = 0; k < count; k++) {
        const wall = 'nswe'[Math.floor(rnd() * 4)];
        const len = wall === 'n' || wall === 's' ? w : d;
        const width = 1.8 + rnd() * 1.0, height = 3.4 + rnd() * 1.2;
        const lo = (wall === 'n' || wall === 's' ? x0 : z0) + 1.6 + width / 2, hi = (wall === 'n' || wall === 's' ? x0 : z0) + len - 1.6 - width / 2;
        const center = lo + rnd() * (hi - lo);
        if (room.doors.some((o) => o.wall === wall && Math.abs(o.center - center) < 4)) continue;
        room.doors.push({ wall, center, width, height });
      }
      room.slots = makeSlots(room);
      rooms.push(room);
    }
    return rooms;
  }, count);
}

async function structureTests() {
  const page = await newPage({ width: 400, height: 300 });
  await open(page, 'theme=none');
  const known = await page.evaluate('window.__api.THEMES');
  await test('THEMES enthält die vier Themen', async () => {
    if (JSON.stringify(known) !== JSON.stringify(THEMES)) throw new Error(`THEMES = ${JSON.stringify(known)}`);
  });
  const rooms = await randomRooms(page, 10);
  for (const theme of THEMES) {
    for (const key of ['a', 'b', 'c', 'd']) {
      await test(`${theme}: Beispielraum ${key}`, async () => {
        const r = await page.evaluate(([t, k]) => window.__api.runChecks(t, k), [theme, key]);
        if (r.errors.length) throw new Error(r.errors.join('\n'));
        console.log(`       Meshes ${r.stats.meshes}, Lichter ${r.stats.lights}, Hindernisse ${r.stats.obstacles}, Dreiecke ${r.stats.triangles}, ${r.stats.buildMs} ms`);
      });
    }
    await test(`${theme}: 10 Zufallsräume (8-20 m, 0-3 Türen)`, async () => {
      const out = [];
      for (const room of rooms) {
        const r = await page.evaluate(([t, ro]) => window.__api.runChecks(t, null, ro), [theme, room]);
        if (r.errors.length) out.push(`Raum ${room.id} (${(room.x1 - room.x0).toFixed(1)}x${(room.z1 - room.z0).toFixed(1)}, Türen ${room.doors.map((d) => d.wall).join('')}): ${r.errors.join('; ')}`);
      }
      if (out.length) throw new Error(out.join('\n'));
    });
  }
  await test('Unbekanntes Thema wirft', async () => {
    const msg = await page.evaluate(() => { try { window.__api.buildTheme('xyz', window.__api.fullRoom('a')); return ''; } catch (e) { return e.message; } });
    if (!msg) throw new Error('kein Fehler');
  });
  await test('Seite ohne Konsolenfehler', async () => assertNoErrors(page, 'Struktur'));
  await page.context().close();
}

async function screenshotTests() {
  fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  let total = 0;
  for (const theme of THEMES) {
    for (const [device, views] of Object.entries(VIEWS)) {
      for (const v of views) {
        await test(`Screenshot ${theme} ${device}-${v.name}`, async () => {
          const page = await newPage({ width: v.w, height: v.h }, v.dpr || 1);
          try {
            await open(page, `theme=${theme}&${v.q}&dpr=${v.dpr || 1}`);
            const file = path.join(SHOTS, `${theme}-${device}-${v.name}.jpg`);
            await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
            total += fs.statSync(file).size;
            assertNoErrors(page, `${theme} ${device}-${v.name}`);
          } finally { await page.context().close(); }
        });
      }
    }
  }
  await test(`Screenshots zusammen unter 3 MB`, async () => {
    console.log(`       ${(total / 1024).toFixed(0)} KB`);
    if (total > MAX_TOTAL_BYTES || total === 0) throw new Error(`${total} Byte`);
  });
}

(async () => {
  await startServer();
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    if (!process.argv[2] || process.argv[2] === 'struktur') await structureTests();
    if (!process.argv[2] || process.argv[2] === 'shots') await screenshotTests();
  } finally {
    await browser.close();
    server.close();
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length} Tests, ${results.length - failed} ok, ${failed} fehlgeschlagen`);
  if (results.length === 0 || failed) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
