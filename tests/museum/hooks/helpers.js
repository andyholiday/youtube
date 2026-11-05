// Hilfen für die Hook-Tests: Server/Browser, Seiten mit eingeschleusten Feature-Modulen, Aufnahme-Modul.
const assert = require('assert');
const L = require('../lib');

const S = { browser: null, server: null };

// Test-Feature, das jeden Hook aufzeichnet (liegt unter features/thirdperson.js). Schalter: window.__swallow, window.__noActions.
const RECORDER = `
export function install(ctx) {
  const rec = window.__rec = { frames: 0, dts: [], camOff: 0, picTap: [], picLong: [], heart: [], rooms: [], lb: [],
    beforeReady: document.getElementById('start-btn').disabled };
  window.__ctx = ctx;
  (window.__order = window.__order || []).push('thirdperson');
  ctx.onFrame((dt) => {
    rec.frames++;
    if (rec.dts.length < 300) rec.dts.push(dt);
    const c = ctx.camera, p = ctx.player;
    if (Math.abs(c.position.x - p.x) > 1e-6 || Math.abs(c.position.z - p.z) > 1e-6 || Math.abs(c.rotation.y - p.yaw) > 1e-6) rec.camOff++;
  });
  ctx.onPictureTap((i) => { rec.picTap.push(i); return window.__swallow === true; });
  ctx.onPictureLongPress((i) => { rec.picLong.push(i); });
  ctx.onStartHeartTap((n) => { rec.heart.push(n); });
  ctx.onRoomEnter((r) => { rec.rooms.push({ id: r.id, theme: r.theme }); });
  ctx.onLightboxOpen((i, el) => {
    rec.lb.push({ i, empty: el.childElementCount === 0 });
    if (window.__noActions) return;
    const b = document.createElement('button');
    b.className = 't-btn';
    b.textContent = 'A' + i;
    el.append(b);
  });
}`;

const marker = (name) => `export function install() { (window.__order = window.__order || []).push('${name}'); }`;

const MISSING = Symbol('fehlt'); // Modul liefert 404
const ROUTES = { thirdperson: '**/js/features/thirdperson.js', eggs: '**/js/features/eggs.js', admin: '**/js/features/admin/index.js' };

/**
 * Öffnet das Museum (Daten: 7 Bilder) mit Test-Modulen. Ein Modul = MISSING liefert 404, null lässt die echte Datei (falls vorhanden) laden.
 * Gibt die Seite zurück; page.warns sammelt console.warn.
 */
async function open({ mobile = false, enter = true, thirdperson = RECORDER, eggs = marker('eggs'), admin = marker('admin') } = {}) {
  const page = await L.newPage(S.browser, { mobile, spy: false });
  page.warns = [];
  page.on('console', (m) => { if (m.type() === 'warning') page.warns.push(m.text()); });
  const bodies = { thirdperson, eggs, admin };
  for (const [name, body] of Object.entries(bodies)) {
    if (body === MISSING) await page.route(ROUTES[name], (r) => r.fulfill({ status: 404, body: 'nicht gefunden' }));
    else if (body !== null) await page.route(ROUTES[name], (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body }));
  }
  await L.openMuseum(page, S.server.url);
  if (enter) await L.enter(page);
  return page;
}

/** Test mit Seite: danach dürfen keine Konsolen-/Seitenfehler vorliegen (allow: Muster erlaubter Fehler). */
async function withPage(opts, fn, allow = null) {
  const page = await open(opts);
  try {
    await fn(page);
    const bad = page.errors.filter((e) => !(allow && allow.test(e)));
    assert.deepStrictEqual(bad, [], `Konsolen-/Netzwerkfehler: ${bad.join(' | ')}`);
  } finally {
    await page.context().close();
  }
}

const rec = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__rec)));

/** Wartet auf n weitere gerenderte Frames (Software-Renderer ist langsam). */
async function frames(page, n = 3) {
  const start = await page.evaluate(() => window.__rec.frames);
  await page.waitForFunction(([s, k]) => window.__rec.frames >= s + k, [start, n], { timeout: 20000 });
}

/** Stellt den Spieler vor Bild i und liefert dessen Bildschirmposition. */
async function facePicture(page, i = 0) {
  await page.evaluate((n) => window.__museum.faceEntry(n), i);
  await frames(page, 3);
  return page.evaluate((n) => window.__museum.screenPositionOf(n), i);
}

const lightboxOpen = (page) => page.evaluate(() => !document.getElementById('lightbox').hidden);

/** Tippt aufs Herz im Startbildschirm (das Herz pulsiert, daher kein Playwright-click mit Stabilitätsprüfung). */
async function tapHeart(page, touch = false) {
  const b = await page.locator('#start h1 .herz').boundingBox();
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
}

module.exports = { S, MISSING, tapHeart, open, withPage, rec, frames, facePicture, lightboxOpen, RECORDER, marker };
