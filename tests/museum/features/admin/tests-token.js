// Geste, Token-Einrichtung und -Prüfung, Beenden/Entfernen.
const assert = require('assert');
const H = require('./helpers');

const tests = [];
const add = (name, fn) => tests.push([name, fn]);
const stored = (page) => page.evaluate(() => localStorage.getItem('mv4t'));

add('4× Herz: nichts passiert (kein DOM, kein CSS, keine Pause, keine Konsole)', async (env) => {
  const { page, repo } = await H.openPage(env, { token: 'good' });
  await H.tapHeart(page, 4);
  await page.waitForTimeout(300);
  assert.strictEqual(await page.locator('.adm-ov, .adm-hud, .adm-status, .adm-file').count(), 0);
  assert.strictEqual(await page.locator('#overlay-root > *').count(), 0);
  assert.deepStrictEqual(await page.evaluate(() => window.__log.styles), []);
  assert.deepStrictEqual(await page.evaluate(() => window.__log.paused), []);
  assert.deepStrictEqual(page.console, []);
  assert.strictEqual(repo.log.length, 0, 'keine Anfrage an GitHub');
});

add('5× Herz ohne Token: Einrichtung mit Anleitung, Link und Eingabefeld', async (env) => {
  const { page } = await H.openPage(env);
  await H.tapHeart(page, 5);
  await page.waitForSelector('.adm-ov');
  const text = await H.dialogText(page);
  assert.ok(text.includes('Verwaltung einrichten') && text.includes('Contents = Read and write') && text.includes('Actions = Read-only'), text);
  const href = await page.locator('.adm-ov a').getAttribute('href');
  assert.strictEqual(href, 'https://github.com/settings/personal-access-tokens/new');
  assert.strictEqual(await page.locator('.adm-ov input[type=password]').count(), 1);
  assert.deepStrictEqual(await page.evaluate(() => window.__log.styles), ['css/admin.css'], 'CSS erst jetzt geladen');
  assert.deepStrictEqual(await page.evaluate(() => window.__log.paused), [true]);
  await H.btn(page, 'Abbrechen').click();
  assert.deepStrictEqual(await page.evaluate(() => window.__log.paused), [true, false]);
});

add('Token gut: Modus aktiv, Schraubenschlüssel im HUD, Token nur in localStorage, Branch dynamisch', async (env) => {
  const { page, repo } = await H.openPage(env, { branch: 'trunk' });
  await H.tapHeart(page, 5);
  await page.fill('.adm-ov input[type=password]', '  good  ');
  await H.btn(page, 'Prüfen').click();
  await page.waitForSelector('.adm-ov h2:text("Verwaltung")');
  assert.strictEqual(await page.locator('.adm-hud').count(), 1);
  assert.strictEqual(await stored(page), 'good');
  assert.ok(repo.log.some((r) => r.method === 'GET' && r.path === ''), 'GET /repos/andyholiday/youtube');
  const text = await H.dialogText(page);
  for (const t of ['Foto hinzufügen', 'Widmung bearbeiten', 'Geheimnisse bearbeiten', 'Verwaltung beenden', 'Token entfernen']) assert.ok(text.includes(t), t);
  await H.btn(page, 'Schließen').click();
  assert.strictEqual(await page.locator('.adm-hud').count(), 1, 'HUD bleibt im aktiven Modus');
  // Der HUD-Knopf öffnet die Verwaltung wieder.
  await H.clickHud(page);
  await page.waitForSelector('.adm-ov h2:text("Verwaltung")');
});

add('Token ungültig: verständliche Meldung, Modus bleibt aus', async (env) => {
  const { page } = await H.openPage(env);
  await H.tapHeart(page, 5);
  await page.fill('.adm-ov input[type=password]', 'kaputt');
  await H.btn(page, 'Prüfen').click();
  await page.waitForSelector('.adm-err:not([hidden])');
  assert.ok((await page.locator('.adm-err').innerText()).includes('ungültig oder abgelaufen'));
  assert.strictEqual(await page.locator('.adm-hud').count(), 0);
  assert.strictEqual(await stored(page), null);
});

add('Token ohne Schreibrecht: Meldung, Modus bleibt aus', async (env) => {
  const { page } = await H.openPage(env);
  await H.tapHeart(page, 5);
  await page.fill('.adm-ov input[type=password]', 'ro');
  await H.btn(page, 'Prüfen').click();
  await page.waitForSelector('.adm-err:not([hidden])');
  assert.ok((await page.locator('.adm-err').innerText()).includes('Read and write'));
  assert.strictEqual(await page.locator('.adm-hud').count(), 0);
  assert.strictEqual(await stored(page), null);
});

add('Leeres Feld: Hinweis ohne Anfrage', async (env) => {
  const { page, repo } = await H.openPage(env);
  await H.tapHeart(page, 5);
  await H.btn(page, 'Prüfen').click();
  assert.ok((await page.locator('.adm-err').innerText()).includes('Token einfügen'));
  assert.strictEqual(repo.log.length, 0);
});

add('Gespeicherter Token: 5× Herz prüft ihn und öffnet direkt die Verwaltung', async (env) => {
  const { page } = await H.activate(env);
  assert.strictEqual(await page.locator('.adm-hud').count(), 1);
});

add('Gespeicherter Token abgelaufen: Einrichtung mit Meldung', async (env) => {
  const { page } = await H.openPage(env, { token: 'alt' });
  await H.tapHeart(page, 5);
  await page.waitForSelector('.adm-err:not([hidden])');
  assert.ok((await H.dialogText(page)).includes('Verwaltung einrichten'));
  assert.ok((await page.locator('.adm-err').innerText()).includes('ungültig oder abgelaufen'));
});

add('Verwaltung beenden: alles weg, Token bleibt, nächstes Mal direkt wieder aktiv', async (env) => {
  const { page } = await H.activate(env);
  await H.btn(page, 'Verwaltung beenden').click();
  assert.strictEqual(await page.locator('.adm-ov, .adm-hud').count(), 0);
  assert.strictEqual(await stored(page), 'good');
  assert.deepStrictEqual((await page.evaluate(() => window.__log.paused)).slice(-1), [false]);
  await H.tapHeart(page, 5);
  await page.waitForSelector('.adm-ov h2:text("Verwaltung")');
});

add('Token entfernen: Rückfrage, dann Token weg und Modus aus', async (env) => {
  const { page } = await H.activate(env);
  await H.btn(page, 'Token entfernen').click();
  await page.waitForSelector('.adm-ov h2:text("Token entfernen?")');
  await H.btn(page, 'Abbrechen').click();
  await page.waitForSelector('.adm-ov h2:text("Verwaltung")');
  await H.btn(page, 'Token entfernen').click();
  await H.btn(page, 'Ja, entfernen').click();
  assert.strictEqual(await stored(page), null);
  assert.strictEqual(await page.locator('.adm-ov, .adm-hud').count(), 0);
  await H.tapHeart(page, 5);
  await page.waitForSelector('.adm-ov h2:text("Verwaltung einrichten")');
});

add('Nach Neuladen im selben Tab bleibt der Modus aktiv (HUD ohne Fenster)', async (env) => {
  const { page } = await H.activate(env);
  await page.reload();
  await page.waitForFunction(() => window.__ready);
  await page.waitForSelector('.adm-hud', { state: 'attached' });
  assert.strictEqual(await page.locator('.adm-ov').count(), 0);
});

module.exports = { tests };
