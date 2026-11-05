// Rundgang Museum v4 für tour.js: Paar-Ansicht, Herzregen, Notiz, geheimer Raum, besonderer Tag, Verwaltungsmodus (GitHub gemockt).
const assert = require('assert');
const H = require('./features/integration/helpers');
const { openApp } = require('./features/integration/server');

const { L, T, until, frames } = H;

/** Antippen mit Finger bzw. Maus. */
const tap = (page, d, x, y) => H.tapAt(page, d.mobile, x, y);
const shot = (page, d, name, sel) => T.shot(page, `${d.prefix}-${name}`, sel);

/** Paar-Ansicht per Knopf im HUD ein- oder ausschalten und warten, bis die Kamera hinter bzw. in den Figuren steht. */
async function paar(page, d, on) {
  if (d.mobile) await page.tap('.tp-knopf'); else await page.click('.tp-knopf');
  assert.strictEqual(await page.getAttribute('.tp-knopf', 'aria-pressed'), String(on), 'Paar-Knopf zeigt den falschen Zustand');
  await page.waitForFunction((want) => {
    const m = window.__museum;
    const c = m.cameraPosition();
    const dist = Math.hypot(c[0] - m.pos.x, c[2] - m.pos.z);
    return want ? dist > 2.5 : dist < 0.1;
  }, on, { timeout: 10000 });
}

/** Herz an der Wand antippen: Herzregen mit Text (Screenshot mitten im Regen). */
async function heartRain(page, d, data) {
  const [pos] = await H.heartPoints(page);
  assert.ok(pos, 'kleines Herz nicht in der Szene');
  await H.standBefore(page, pos, 1.6);
  await frames(page, 4);
  const p = await H.project(page, pos);
  assert.ok(p.visible, 'Herz nicht im Bild');
  await tap(page, d, p.x, p.y);
  await page.waitForSelector('.eggs-regen-text', { timeout: 5000 });
  assert.strictEqual(await page.textContent('.eggs-regen-text'), data.geheim.herzregen, 'Herzregen-Text');
  await shot(page, d, 'herzregen', ['.eggs-regen-text']);
  await page.waitForSelector('.eggs-regen', { state: 'detached', timeout: 12000 });
}

/** Lang drücken auf ein Bild mit Notiz: Notizkarte, keine Großansicht. */
async function noteLong(page, d, data) {
  const i = data.items.findIndex((e) => e.notiz);
  assert.ok(i >= 0, 'keine Erinnerung mit Notiz in den echten Daten');
  const p = await H.faceAndWait(page, i);
  if (d.mobile) await H.pressTouch(page, p.x, p.y, 1);
  else { await page.mouse.move(p.x, p.y); await page.mouse.down(); }
  await page.waitForSelector('.eggs-notiz', { timeout: 5000 });
  if (d.mobile) await L.touch.end(page); else await page.mouse.up();
  assert.ok(await page.locator('#lightbox').isHidden(), 'Großansicht trotz langem Drücken');
  assert.strictEqual(await page.textContent('.eggs-notiz-text'), data.items[i].notiz, 'Notiztext');
  await shot(page, d, 'notiz', ['.eggs-notiz']);
  await H.frames(page, 20); // die Karte nimmt Antippen erst nach kurzer Zeit an
  await tap(page, d, 24, 24);
  await page.waitForSelector('.eggs-notiz-wrap', { state: 'detached' });
}

/** Geheimer Raum: Paar-Ansicht im Durchgang, Toast, Bild öffnen (ohne Verwaltung keine Knöpfe). */
async function secretRoom(page, d, data) {
  await paar(page, d, true);
  await H.walkToDoorGap(page);
  await shot(page, d, 'paar-durchgang');
  const { secret } = await H.secretInfo(page);
  await H.walkOnInto(page, secret);
  await page.waitForSelector('.x-toast', { timeout: 4000 });
  assert.strictEqual(await page.textContent('.x-toast'), data.geheim.raumtext);
  await shot(page, d, 'geheim-toast', [...T.HUD, '.x-toast']);
  await paar(page, d, false);
  await openSecretPicture(page, d, 0);
  assert.strictEqual(await page.locator('.eggs-viewer .lb-aktionen > *').count(), 0, 'Knöpfe in der Geheimraum-Großansicht ohne Verwaltung');
  await page.waitForFunction(() => { const i = document.querySelector('.eggs-viewer-bild'); return i && i.naturalWidth > 0; });
  await shot(page, d, 'geheim-gross', ['.eggs-viewer-karte', '.eggs-schliessen']);
  await page.click('.eggs-schliessen');
  await page.waitForSelector('.eggs-viewer', { state: 'detached' });
}

/** Vor Geheimraum-Bild k treten und es antippen (Großansicht des geheimen Raums). */
async function openSecretPicture(page, d, k) {
  const pics = await H.secretPicturePoints(page);
  assert.ok(pics[k], `Geheimraum-Bild ${k} fehlt`);
  await H.standBefore(page, pics[k], 2.4);
  await frames(page, 4);
  const p = await H.project(page, pics[k]);
  await tap(page, d, p.x, p.y);
  await page.waitForSelector('.eggs-viewer', { timeout: 5000 });
}

/** Mit dem Herzen auf dem Start 5× tippen: Verwaltung einrichten (Token gefälscht), schließen, eintreten. */
async function openAdminFromStart(page, d) {
  for (let i = 0; i < 5; i++) await (d.mobile ? page.tap('#start .herz', { force: true }) : page.click('#start .herz', { force: true }));
  await page.waitForSelector('.adm-ov h2:text("Verwaltung einrichten")');
  assert.ok(await page.locator('#start').isVisible(), '5× Herz trat ins Museum ein');
  await shot(page, d, 'admin-einrichten', ['.adm-card']);
  await page.fill('.adm-ov input[type=password]', 'good');
  await page.getByRole('button', { name: 'Prüfen', exact: true }).click();
  await page.waitForSelector('.adm-ov h2:text-is("Verwaltung")');
  await shot(page, d, 'admin-menue', ['.adm-card']);
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.waitForSelector('.adm-ov', { state: 'detached' });
  await L.enter(page);
  await page.waitForSelector('#hud .adm-hud');
}

/** Normale Großansicht mit Verwaltungsknöpfen und der Bearbeiten-Dialog; Geheimraum-Bild mit denselben Knöpfen. */
async function adminButtons(page, d, data) {
  const p = await H.faceAndWait(page, 0);
  await tap(page, d, p.x, p.y);
  await page.waitForSelector('#lightbox .adm-lbbar');
  assert.deepStrictEqual(await page.locator('#lightbox .adm-lbbar button').allInnerTexts(), ['Foto ersetzen', 'Titel, Text & Notiz', 'Löschen']);
  await page.waitForFunction(() => document.getElementById('lb-img').naturalWidth > 0);
  await shot(page, d, 'admin-gross', T.LIGHTBOX);
  await page.getByRole('button', { name: 'Titel, Text & Notiz', exact: true }).click();
  await page.waitForSelector('.adm-ov textarea');
  await shot(page, d, 'admin-bearbeiten', ['.adm-card']);
  await page.getByRole('button', { name: 'Abbrechen', exact: true }).click();
  await T.closeLightbox(page, d.mobile);
  await H.walkIntoSecret(page);
  await openSecretPicture(page, d, 0);
  await page.waitForSelector('.eggs-viewer .adm-lbbar');
  await page.waitForFunction(() => { const i = document.querySelector('.eggs-viewer-bild'); return i && i.naturalWidth > 0; });
  await shot(page, d, 'admin-geheim', ['.eggs-viewer-karte', '.eggs-schliessen']);
}

/** Verwaltungsmodus auf eigener Seite; GitHub nur gemockt. Liefert Probleme (leer = sauber). */
async function adminRound(browser, srv, d) {
  const page = await openApp(browser, srv, { mobile: d.mobile });
  await openAdminFromStart(page, d);
  await H.until(page, () => !document.getElementById('raumtitel').hidden);
  await shot(page, d, 'admin-hud');
  await adminButtons(page, d, srv.data);
  assert.ok(page.repo.log.length > 0, 'Verwaltung hat die gefälschte GitHub-API nie gefragt');
  assert.deepStrictEqual(page.repo.unhandled, [], 'Anfragen an GitHub außerhalb des Repos');
  assert.strictEqual(page.repo.writes.length, 0, 'es wurde nichts geschrieben');
  const out = H.problems(page);
  await page.context().close();
  return out;
}

/** Besonderer Tag (?heute=02-14): Karte erscheint nach dem Eintreten, Weiter startet den Herzregen. */
async function dayRound(browser, srv, d) {
  const page = await openApp(browser, srv, { mobile: d.mobile, query: '?heute=02-14' });
  assert.strictEqual(await page.locator('.eggs-karte').count(), 0, 'Karte schon vor dem Eintreten');
  await L.enter(page);
  await page.waitForSelector('.eggs-karte', { timeout: 8000 });
  const day = srv.data.geheim.tage.find((t) => t.tag === '02-14');
  assert.strictEqual(await page.textContent('.eggs-karte-text'), day.text);
  await shot(page, d, 'tag', ['.eggs-karte']);
  if (d.mobile) await page.tap('.eggs-knopf'); else await page.click('.eggs-knopf');
  await page.waitForSelector('.eggs-regen', { timeout: 3000 });
  const out = H.problems(page);
  await page.context().close();
  return out;
}

module.exports = { paar, heartRain, noteLong, secretRoom, adminRound, dayRound };
