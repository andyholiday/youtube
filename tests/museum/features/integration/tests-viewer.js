// Großansicht in der echten App: Datum formatiert, Verwaltungsknöpfe nur bei aktivem Modus, Geheimraum-Bilder korrekt verwaltet.
const assert = require('assert');
const H = require('./helpers');

const { L, until, openEntered, problems, faceAndWait, tapAt, walkIntoSecret, secretPicturePoints, standBefore, project, frames, sleep } = H;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const saved = (page) => page.waitForSelector('.adm-status');
const btn = (page, name) => page.getByRole('button', { name, exact: true });
const GEHEIM_DIR = 'erinnerungen/geheim/';

/** Öffnet die normale Großansicht von Bild i (Tippen auf das Bild). */
async function openNormal(page, mobile, i) {
  const p = await faceAndWait(page, i);
  await tapAt(page, mobile, p.x, p.y);
  await page.waitForSelector('#lightbox:not([hidden])');
}

/** Läuft in den geheimen Raum und öffnet das Bild k (nach x sortiert) in der Geheimraum-Großansicht. */
async function openSecret(page, k) {
  await walkIntoSecret(page);
  const pics = await secretPicturePoints(page);
  await standBefore(page, pics[k], 2.4);
  await frames(page, 3); // Kamera folgt der neuen Pose
  const p = await project(page, pics[k]);
  await page.mouse.click(p.x, p.y);
  await page.waitForSelector('.eggs-viewer');
}

/** Wartet (Node-Seite) auf eine Bedingung, ohne feste Zeit. */
async function waitNode(fn, what, ms = 10000) {
  for (const t0 = Date.now(); !fn(); await sleep(50)) if (Date.now() - t0 > ms) throw new Error(`Zeitüberschreitung: ${what}`);
}

const changedPaths = (repo, before) => {
  const { changed } = require('../admin/helpers').lastCommit(repo, before);
  return changed;
};

t('Großansicht: Datum formatiert („1. Mai 2021“), ohne Verwaltung keine Knöpfe und kein leerer Platz', async (env) => {
  const page = await openEntered(env, { mobile: false });
  await openNormal(page, false, 0);
  assert.strictEqual(await page.locator('#lb-datum').innerText(), '1. Mai 2021');
  assert.strictEqual(await page.locator('#lb-titel').innerText(), 'Erster Ausflug');
  assert.strictEqual(await page.locator('.lb-aktionen').isVisible(), false, 'Aktionsfläche ohne Modus sichtbar');
  assert.strictEqual(await page.locator('.lb-aktionen > *').count(), 0);
  assert.deepStrictEqual(problems(page), []);
});

t('Großansicht mit aktivem Modus: Knöpfe „Foto ersetzen“, „Titel, Text & Notiz“, „Löschen“ (≥ 44 px), Datum formatiert', async (env) => {
  const page = await openEntered(env, { admin: true });
  await page.waitForSelector('#hud .adm-hud');
  await openNormal(page, true, 0);
  await page.waitForSelector('#lightbox .adm-lbbar');
  assert.strictEqual(await page.locator('#lb-datum').innerText(), '1. Mai 2021');
  const boxes = await page.locator('#lightbox .adm-lbbar button').evaluateAll((bs) => bs.map((b) => [b.textContent, b.getBoundingClientRect().height, b.getBoundingClientRect().bottom <= innerHeight]));
  assert.deepStrictEqual(boxes.map((b) => b[0]), ['Foto ersetzen', 'Titel, Text & Notiz', 'Löschen']);
  assert.ok(boxes.every((b) => b[1] >= 44), `Knöpfe zu klein: ${JSON.stringify(boxes)}`);
  assert.deepStrictEqual(await H.T.layoutProblems(page, H.T.LIGHTBOX), []);
  // Blättern: Knöpfe bleiben genau einmal da und gehören zum neuen Bild.
  await page.keyboard.press('ArrowRight');
  await until(page, () => document.getElementById('lb-titel').textContent === 'Valentinstag');
  assert.strictEqual(await page.locator('#lightbox .adm-lbbar').count(), 1);
  assert.deepStrictEqual(problems(page), []);
});

t('Normale Erinnerung bearbeiten/löschen in der echten App: nur ihre eigenen Dateien ändern sich, nie die im geheimen Raum', async (env) => {
  const page = await openEntered(env, { admin: true, mobile: false });
  await page.waitForSelector('#hud .adm-hud');
  const before = page.repo.files;
  await openNormal(page, false, 0);
  await page.waitForSelector('#lightbox .adm-lbbar');
  await btn(page, 'Titel, Text & Notiz').click();
  await page.waitForSelector('.adm-ov textarea');
  await page.getByLabel('Titel', { exact: true }).fill('Ausflug zum See');
  await btn(page, 'Speichern').click();
  await saved(page);
  assert.deepStrictEqual(Object.keys(changedPaths(page.repo, before)), ['erinnerungen/2021-05-01_erster-ausflug.txt']);
  const after = page.repo.files;
  const head = page.repo.head;
  await btn(page, 'Löschen').click();
  await btn(page, 'Ja, löschen').click();
  await waitNode(() => page.repo.head !== head, 'Commit des Löschens');
  const gone = Object.keys(changedPaths(page.repo, after)).sort();
  assert.deepStrictEqual(gone, ['erinnerungen/2021-05-01_erster-ausflug.jpg', 'erinnerungen/2021-05-01_erster-ausflug.txt']);
  assert.ok([...page.repo.files.keys()].filter((p) => p.startsWith(GEHEIM_DIR)).length === 4, 'Geheimraum-Dateien wurden angefasst');
  assert.deepStrictEqual(problems(page), []);
});

t('Geheimraum-Bild: eigene Großansicht ohne Modus ohne Knöpfe, Datum formatiert', async (env) => {
  const page = await openEntered(env, { mobile: false });
  await openSecret(page, 1);
  assert.strictEqual(await page.locator('.eggs-viewer h2').innerText(), 'Unser Platz');
  assert.strictEqual(await page.locator('.eggs-datum').innerText(), '2. Februar 2024');
  assert.strictEqual(await page.locator('.eggs-viewer .lb-aktionen').isVisible(), false);
  assert.strictEqual(await page.locator('.eggs-viewer .adm-lbbar').count(), 0);
  assert.deepStrictEqual(problems(page), []);
});

t('Geheimraum-Bild mit Verwaltung: Knöpfe in der Großansicht, Steuerung bleibt dahinter pausiert', async (env) => {
  const page = await openEntered(env, { admin: true, mobile: false });
  await page.waitForSelector('#hud .adm-hud');
  await openSecret(page, 1);
  await page.waitForSelector('.eggs-viewer .adm-lbbar');
  assert.deepStrictEqual(await page.locator('.eggs-viewer .adm-lbbar button').allInnerTexts(), ['Foto ersetzen', 'Titel, Text & Notiz', 'Löschen']);
  // Dialog auf, Dialog zu: die Großansicht ist noch offen, also darf die Steuerung nicht wieder laufen.
  await btn(page, 'Titel, Text & Notiz').click();
  await page.waitForSelector('.adm-ov textarea');
  await btn(page, 'Abbrechen').click();
  await page.waitForSelector('.adm-ov', { state: 'detached' });
  assert.ok(await page.locator('.eggs-viewer').isVisible());
  const a = await L.pos(page);
  await page.keyboard.down('KeyW');
  await frames(page, 30);
  await page.keyboard.up('KeyW');
  const b = await L.pos(page);
  assert.deepStrictEqual([b.x, b.z], [a.x, a.z], 'Spieler lief hinter der offenen Geheimraum-Großansicht weiter');
  await page.click('.eggs-schliessen');
  await page.waitForSelector('.eggs-viewer', { state: 'detached' });
  await page.keyboard.down('KeyW');
  await until(page, (p) => Math.hypot(window.__museum.pos.x - p.x, window.__museum.pos.z - p.z) > 0.2, a);
  await page.keyboard.up('KeyW');
  assert.deepStrictEqual(problems(page), []);
});

t('Geheimraum-Bild bearbeiten: schreibt nur erinnerungen/geheim/…txt, lädt den Stand aus dem Repo, Notiz bleibt getrennt', async (env) => {
  const page = await openEntered(env, { admin: true, mobile: false });
  await page.waitForSelector('#hud .adm-hud');
  await openSecret(page, 0);
  const title = await page.locator('.eggs-viewer h2').innerText();
  assert.strictEqual(title, 'Nur für uns');
  const before = page.repo.files;
  await btn(page, 'Titel, Text & Notiz').click();
  await page.waitForSelector('.adm-ov textarea');
  assert.strictEqual(await page.getByLabel('Notiz (versteckt)', { exact: true }).inputValue(), 'Geheime Notiz im geheimen Raum.');
  await page.getByLabel('Titel', { exact: true }).fill('Nur für uns zwei');
  await btn(page, 'Speichern').click();
  await saved(page);
  const changed = changedPaths(page.repo, before);
  assert.deepStrictEqual(Object.keys(changed), [`${GEHEIM_DIR}2024-01-01_ueberraschung.txt`]);
  assert.ok(changed[`${GEHEIM_DIR}2024-01-01_ueberraschung.txt`].toString().startsWith('# Nur für uns zwei'));
  assert.ok(changed[`${GEHEIM_DIR}2024-01-01_ueberraschung.txt`].toString().includes('## Notiz\nGeheime Notiz im geheimen Raum.'));
  assert.deepStrictEqual(problems(page), []);
});

t('Geheimraum-Bild ersetzen: neue JPEG unter erinnerungen/geheim/, kein normales Foto betroffen', async (env) => {
  const page = await openEntered(env, { admin: true, mobile: false });
  await page.waitForSelector('#hud .adm-hud');
  await openSecret(page, 1);
  const H2 = require('../admin/helpers');
  const before = page.repo.files;
  await H2.chooseFile(page, () => btn(page, 'Foto ersetzen').click(), { name: 'neu.jpg', buffer: await H2.makeJpeg(page, 800, 600) });
  await page.waitForSelector('.adm-ov img.adm-prev');
  await btn(page, 'Jetzt ersetzen').click();
  await saved(page);
  const changed = changedPaths(page.repo, before);
  assert.deepStrictEqual(Object.keys(changed), [`${GEHEIM_DIR}2024-02-02_unser-platz.jpg`]);
  assert.ok(page.repo.log.some((r) => r.body && r.body.message === 'Erinnerung ersetzt: Unser Platz'));
  assert.deepStrictEqual(problems(page), []);
});

t('Geheimraum-Bild löschen: Bild und Text aus erinnerungen/geheim/ weg, normale Erinnerungen bleiben', async (env) => {
  const page = await openEntered(env, { admin: true, mobile: false });
  await page.waitForSelector('#hud .adm-hud');
  await openSecret(page, 0);
  const before = page.repo.files;
  await btn(page, 'Löschen').click();
  await btn(page, 'Ja, löschen').click();
  await saved(page);
  const changed = changedPaths(page.repo, before);
  assert.deepStrictEqual(Object.keys(changed).sort(), [`${GEHEIM_DIR}2024-01-01_ueberraschung.jpg`, `${GEHEIM_DIR}2024-01-01_ueberraschung.txt`]);
  assert.ok(Object.values(changed).every((c) => c === null));
  assert.strictEqual([...page.repo.files.keys()].filter((p) => p.startsWith('erinnerungen/2')).length, 12, 'normale Erinnerungen wurden gelöscht');
  assert.deepStrictEqual(problems(page), []);
});

module.exports = { tests };
