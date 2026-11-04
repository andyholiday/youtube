// Integrations-Rundgang mit den echten Fotos aus erinnerungen/: baut die Seite wie die Action (tools/build.py),
// läuft per Tastatur (Desktop) bzw. Joystick (iPhone 13) durch alle Räume und schreibt JPEG-Screenshots nach screenshots/.
// Aufruf: node tests/museum/tour.js   (Exit-Code 1 bei Konsolenfehlern oder nicht erreichten Räumen)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const L = require('./lib');
const { planRoute } = require('./walk-checks');

const OUT = path.join(__dirname, 'screenshots');
const GAP = 0.3;
const ENTER = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] };

async function shot(page, name) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 58, scale: 'css' });
  console.log('Screenshot:', name);
}

const setPose = (page, p) => page.evaluate((q) => window.__museum.setPose(q), p);
const yawTo = (from, to) => Math.atan2(-(to[0] - from.x), -(to[1] - from.z));

/** Halt die Vorwärts-Eingabe (Taste bzw. Joystick), bis fn() fertig ist. */
async function withForward(page, mobile, fn) {
  let center = null;
  if (mobile) {
    const b = await page.locator('#joystick .basis').boundingBox();
    center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await L.touch.start(page, [{ x: center.x, y: center.y, id: 1 }]);
    await L.touch.move(page, [{ x: center.x, y: center.y - 46, id: 1 }]);
  } else await page.keyboard.down('KeyW');
  try { await fn(); } finally { if (mobile) await L.touch.end(page); else await page.keyboard.up('KeyW'); }
}

/** Läuft per Eingabe zum Ziel [x, z]; Blickrichtung zum nächsten Wegpunkt setzt der Test (Wischen wäre zu langsam). */
async function walkTo(page, mobile, target) {
  for (let leg = 0; leg < 14; leg++) {
    const route = await planRoute(page, target);
    if (!route) throw new Error(`kein Weg nach ${target}`);
    if (!route.length) return;
    const p = await L.pos(page);
    const wp = route[0];
    if (route.length === 1 && Math.hypot(wp[0] - p.x, wp[1] - p.z) < 0.4) return;
    await setPose(page, { yaw: yawTo(p, wp), pitch: 0 });
    await withForward(page, mobile, () => page.waitForFunction(
      ([x, z]) => Math.hypot(window.__museum.pos.x - x, window.__museum.pos.z - z) < 0.3, wp, { timeout: 40000, polling: 'raf' }));
  }
  throw new Error(`Ziel ${target} nach 14 Teilstrecken nicht erreicht`);
}

/** Punkt in Raum r, dist Meter von der Türwand entfernt (vor der Tür: dist < 0, hinter der Tür im Nachbarraum: dist > 0). */
function besideDoor(r, d, dist) {
  const [ux, uz] = ENTER[d.wall];
  const edge = { e: r.x1, w: r.x0, s: r.z1, n: r.z0 }[d.wall];
  const off = dist > 0 ? edge + (ux + uz) * (GAP + dist) : edge + (ux + uz) * dist;
  return ux ? [off, d.center] : [d.center, off];
}

async function loaded(page, room, count) {
  await page.waitForFunction(([r, n]) => window.__museum.loadedIn(r) >= n, [room, count], { timeout: 20000 });
}

async function lightbox(page, mobile, name) {
  await page.evaluate(() => window.__museum.faceEntry(0));
  await page.waitForTimeout(400);
  const pt = await page.evaluate(() => window.__museum.screenPositionOf(0));
  if (mobile) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
  await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
  await page.waitForFunction(() => document.getElementById('lb-img').naturalWidth > 0);
  await shot(page, name);
  if (mobile) await page.touchscreen.tap(5, 5); else await page.keyboard.press('Escape');
  await page.waitForSelector('#lightbox', { state: 'hidden' });
}

/** Ein Rundgang: alle Räume nacheinander, je Raum Übersicht und Nahaufnahme, in Raum 0 Türblick und Großansicht. */
async function tour(browser, url, mobile, prefix) {
  const page = await L.newPage(browser, { mobile });
  await L.openMuseum(page, url);
  const rooms = await page.evaluate(() => window.__museum.rooms);
  const count = await page.evaluate(() => window.__museum.count);
  if (rooms.length !== 4 || count !== 13) throw new Error(`erwartet 4 Räume und 13 Fotos, gefunden ${rooms.length} und ${count}`);
  await shot(page, `${prefix}-start`);
  await L.enter(page);
  const visited = [];
  for (const r of rooms) {
    const p = await L.pos(page);
    const centre = [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
    await setPose(page, { yaw: yawTo(p, centre), pitch: -0.04 });
    await loaded(page, r.id, r.slots.length);
    await shot(page, `${prefix}-raum${r.id + 1}`);
    visited.push((await L.pos(page)).room);
    await page.evaluate((i) => window.__museum.faceEntry(i), r.slots[0].index);
    await shot(page, `${prefix}-bild${r.id + 1}`);
    if (r.id === 0) await lightbox(page, mobile, `${prefix}-gross`);
    const next = r.doors.find((d) => d.to === r.id + 1);
    if (!next) continue;
    if (r.id === 0) {
      await walkTo(page, mobile, besideDoor(r, next, -4.5));
      await setPose(page, { yaw: yawTo(await L.pos(page), besideDoor(r, next, 2)), pitch: 0 });
      await shot(page, `${prefix}-tuer`);
    }
    await walkTo(page, mobile, besideDoor(r, next, -2.5));
    await walkTo(page, mobile, besideDoor(r, next, 2));
  }
  if (JSON.stringify(visited) !== '[0,1,2,3]') throw new Error(`Räume nicht in Reihenfolge betreten: ${visited}`);
  const errors = page.errors;
  await page.context().close();
  return errors;
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'museum-tour-'));
  execFileSync('python3', [path.join(L.ROOT, 'tools', 'build.py'), '--out', path.join(tmp, 'site')], { stdio: 'inherit' });
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.jpg')) fs.rmSync(path.join(OUT, f));
  const srv = await L.serve(path.join(tmp, 'site'));
  const browser = await L.launch();
  let errors = [];
  try {
    errors = [...await tour(browser, srv.url, true, 'handy'), ...await tour(browser, srv.url, false, 'desktop')];
    console.log(errors.length ? `Fehler: ${errors.join(' | ')}` : 'Keine Konsolenfehler, alle 4 Räume in Reihenfolge betreten.');
  } catch (err) {
    errors.push(String(err.stack || err));
    console.error(err);
  } finally {
    await browser.close();
    await srv.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  process.exit(errors.length ? 1 : 0);
})();
