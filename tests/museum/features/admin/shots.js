// Screenshots (JPEG, iPhone hochkant) nach screenshots/ – zur Sichtprüfung für Nicht-Entwickler.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const H = require('./helpers');

const DIR = path.join(__dirname, 'screenshots');
const tests = [];
const add = (name, fn) => tests.push([name, fn]);
const shot = async (page, name) => {
  fs.mkdirSync(DIR, { recursive: true });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(DIR, `${name}.jpg`), type: 'jpeg', quality: 80 });
};

add('Screenshots: Einrichtung, Verwaltung, Großansicht, Bearbeiten, Status, Hinzufügen', async (env) => {
  const a = await H.openPage(env);
  await H.tapHeart(a.page, 5);
  await a.page.waitForSelector('.adm-ov');
  await shot(a.page, '01-token-einrichtung');

  const { page, repo } = await H.activate(env, { close: false });
  await shot(page, '02-verwaltungsfenster');
  await H.btn(page, 'Schließen').click();
  await page.evaluate(() => window.__enter());
  await shot(page, '07-hud-schraubenschluessel');
  await H.openLightbox(page, 0);
  await shot(page, '03-grossansicht-mit-knoepfen');

  await H.btn(page, 'Titel, Text & Notiz').click();
  await page.waitForSelector('.adm-ov textarea');
  await shot(page, '04-bearbeiten');
  await page.getByLabel('Titel', { exact: true }).fill('Unser erster Ausflug');
  await H.btn(page, 'Speichern').click();
  await page.waitForSelector('.adm-status');
  await shot(page, '05-status-toast');

  await H.closeLightbox(page);
  await H.clickHud(page);
  await H.btn(page, 'Foto hinzufügen').click();
  await H.chooseFile(page, () => H.btn(page, 'Foto auswählen').click(), { name: 'IMG_1.jpg', buffer: H.withGpsExif(await H.makeJpeg(page, 900, 600)) });
  await page.waitForSelector('.adm-ov img.adm-prev');
  await page.getByLabel('Titel', { exact: true }).fill('Abend am Wasser');
  await shot(page, '06-hinzufuegen');
  assert.ok(repo.writes.length > 0);
});

module.exports = { tests };
