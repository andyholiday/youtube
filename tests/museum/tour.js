// Gesamtrundgang mit 3D und den echten Fotos aus erinnerungen/: baut die Seite wie die Action (tools/build.py), liefert sie lokal aus
// und geht auf iPhone 13 (hoch, quer) und am Desktop durch: Eintreten, Raumtitel, Beschriftung, Großansicht, alle 4 Räume,
// alle 13 Bilder entdecken, Abschlusskarte mit Widmung. Screenshots (JPEG) landen in screenshots/.
// Aufruf: node tests/museum/tour.js   (Exit-Code 1 bei Konsolenfehlern, fremden Anfragen, Überlappungen oder verfehlten Schritten)
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { pathToFileURL } = require('url');
const { execFileSync } = require('child_process');
const L = require('./lib');
const T = require('./tour-steps');

const OUT = path.join(__dirname, 'screenshots');
const ROOM_NAMES = { modern: 'Die weiße Galerie', klassisch: 'Der Festsaal', futuristisch: 'Der Lichtraum', garten: 'Der Wintergarten' };
const HINT = { touch: /Daumen links unten aufsetzen und schieben zum Laufen/, desktop: /W A S D/ };
const DEVICES = [
  { prefix: 'handy', mobile: true, landscape: false },
  { prefix: 'quer', mobile: true, landscape: true },
  { prefix: 'desktop', mobile: false, landscape: false },
];

/** Widmungstext wie tools/build.py: erste Zeile "# Titel", der Rest ist der Text. */
function readWidmung() {
  const lines = fs.readFileSync(path.join(L.ROOT, 'erinnerungen', 'widmung.txt'), 'utf8').split(/\r?\n/);
  return lines.slice(lines[0].startsWith('#') ? 1 : 0).join('\n').trim();
}

const discovered = (page, n) => page.waitForFunction(
  (k) => document.getElementById('entdeckt').textContent === `${k} von 13 entdeckt`, n, { timeout: 5000 });

/** Start → Eintreten → Raumtitel und Steuerungshinweis, beides gleichzeitig auf dem Bild. */
async function enterAndLook(page, d, rooms) {
  await T.shot(page, `${d.prefix}-start`, []);
  await L.enter(page);
  await T.waitTitle(page, ROOM_NAMES[rooms[0].theme]);
  assert.match(await T.text(page, '#hinweis'), d.mobile ? HINT.touch : HINT.desktop, 'Steuerungshinweis passt nicht zum Gerät');
  await T.shot(page, `${d.prefix}-raum1-titel`);
}

/** Bild fokussieren (Beschriftung), antippen (Großansicht), zum nächsten wischen, schließen. */
async function lightboxRound(page, d, data, idx) {
  const { items, nameOf } = data;
  await T.focusPicture(page, idx, nameOf(items[idx]));
  await discovered(page, 1);
  await T.shot(page, `${d.prefix}-beschriftung`);
  await T.tapPicture(page, d.mobile, idx);
  const title = (i) => items[i].titel || data.dateOf(items[i]);
  assert.strictEqual(await T.text(page, '#lb-titel'), title(idx));
  assert.strictEqual(await T.text(page, '#lb-zaehler'), `${idx + 1} / ${items.length}`);
  await T.shot(page, `${d.prefix}-gross`, T.LIGHTBOX);
  await T.swipeLeft(page, d.mobile);
  const next = (idx + 1) % items.length;
  await page.waitForFunction((t) => document.getElementById('lb-titel').textContent === t, title(next), { timeout: 5000 });
  assert.strictEqual(await T.text(page, '#lb-zaehler'), `${next + 1} / ${items.length}`);
  await page.waitForFunction(() => document.getElementById('lb-img').naturalWidth > 0);
  await T.shot(page, `${d.prefix}-gross-weiter`, T.LIGHTBOX);
  await T.closeLightbox(page, d.mobile);
}

/** Mit dem Daumen auf dem Joystick, während die Beschriftung steht: nichts darf sich überlappen. */
async function joystickUnderCaption(page, d) {
  const c = await T.thumb(page);
  await L.touch.start(page, [{ x: c.x, y: c.y, id: 1 }]);
  try { await T.shot(page, `${d.prefix}-joystick`); } finally { await L.touch.end(page); }
}

/** Von Raum r durch die Tür in Raum r+1; der Raumtitel erscheint beim Betreten. */
async function nextRoom(page, d, rooms, r) {
  const door = r.doors.find((q) => q.to === r.id + 1);
  const mobile = d.mobile;
  await T.walkTo(page, mobile, T.besideDoor(r, door, -4.5));
  if (r.id === 0) {
    const [tx, tz] = T.besideDoor(r, door, 2);
    const p = await L.pos(page);
    await T.setPose(page, { yaw: Math.atan2(-(tx - p.x), -(tz - p.z)), pitch: 0 });
    await T.shot(page, `${d.prefix}-tuer`);
  }
  await T.walkTo(page, mobile, T.besideDoor(r, door, -2.5));
  await T.walkTo(page, mobile, T.besideDoor(r, door, 0.8));
  const name = ROOM_NAMES[rooms[r.id + 1].theme];
  await T.waitTitle(page, name);
  await T.shot(page, `${d.prefix}-raum${r.id + 2}-titel`);
  await T.walkTo(page, mobile, T.besideDoor(r, door, 2));
  assert.strictEqual((await L.pos(page)).room, r.id + 1, 'falscher Raum nach der Tür');
}

/** Alle Bilder entdecken (per Test-Hook vor jedes Bild gestellt), dann die Abschlusskarte mit Widmung. */
async function discoverAll(page, d, data, rooms) {
  const { items, nameOf } = data;
  for (const r of rooms) {
    for (const [k, s] of r.slots.entries()) {
      await T.focusPicture(page, s.index, nameOf(items[s.index]));
      if (k === 0) await T.shot(page, `${d.prefix}-bild${r.id + 1}`);
    }
  }
  await discovered(page, items.length);
  await page.waitForSelector('#finale:not([hidden])', { timeout: 8000 });
  assert.strictEqual(await page.locator('#fin-text').textContent(), data.widmung, 'Widmungstext stimmt nicht');
  await T.shot(page, `${d.prefix}-abschluss`, T.FINALE);
  await page.click('#fin-btn');
  await page.waitForSelector('#finale', { state: 'hidden' });
  assert.ok(!(await page.evaluate(() => document.body.classList.contains('lb-offen'))), 'Oberfläche bleibt gesperrt');
  await page.waitForTimeout(500);
  await T.shot(page, `${d.prefix}-weiter-umsehen`);
}

/** Ein kompletter Rundgang auf einem Gerät; gibt die gesammelten Konsolenfehler und fremden Anfragen zurück. */
async function tour(browser, url, d, data) {
  const page = await L.newPage(browser, { mobile: d.mobile, landscape: d.landscape });
  await L.openMuseum(page, url);
  const rooms = await page.evaluate(() => window.__museum.rooms);
  assert.strictEqual(rooms.length, 4, `erwartet 4 Räume, gefunden ${rooms.length}`);
  assert.strictEqual(await page.evaluate(() => window.__museum.count), 13);
  await enterAndLook(page, d, rooms);
  await lightboxRound(page, d, data, rooms[0].slots[0].index);
  if (d.mobile) { await T.focusPicture(page, rooms[0].slots[0].index, data.nameOf(data.items[rooms[0].slots[0].index])); await joystickUnderCaption(page, d); }
  for (const r of rooms.slice(0, -1)) await nextRoom(page, d, rooms, r);
  await discoverAll(page, d, data, rooms);
  const problems = [...page.errors, ...page.external.map((u) => `fremde Anfrage: ${u}`)];
  await page.context().close();
  return problems;
}

async function loadData(siteDir) {
  const json = JSON.parse(fs.readFileSync(path.join(siteDir, 'erinnerungen.json'), 'utf8'));
  const { nameUndDatum, formatDatum } = await import(pathToFileURL(path.join(L.ROOT, 'site', 'js', 'format.js')).href);
  return { items: json.erinnerungen, nameOf: nameUndDatum, dateOf: (i) => formatDatum(i.datum), widmung: readWidmung() };
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'museum-tour-'));
  const siteDir = path.join(tmp, 'site');
  execFileSync('python3', [path.join(L.ROOT, 'tools', 'build.py'), '--out', siteDir], { stdio: 'inherit' });
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.jpg')) fs.rmSync(path.join(OUT, f));
  const srv = await L.serve(siteDir);
  const browser = await L.launch();
  const errors = [];
  try {
    const data = await loadData(siteDir);
    for (const d of DEVICES) {
      console.log(`Rundgang ${d.prefix}`);
      errors.push(...await tour(browser, srv.url, d, data));
    }
    console.log(errors.length ? `Fehler: ${errors.join(' | ')}` : 'Keine Konsolenfehler, keine fremden Anfragen, alle Schritte auf allen Geräten bestanden.');
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
