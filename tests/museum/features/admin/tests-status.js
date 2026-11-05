// Statusabfrage nach dem Speichern (gefälschte Uhr): Abstand ≥ 15 s, höchstens 5 Minuten.
const assert = require('assert');
const H = require('./helpers');

const tests = [];
const add = (name, fn) => tests.push([name, fn]);
const RUN_URL = 'https://github.com/andyholiday/youtube/actions/runs/42';
const run = (sha, status, conclusion) => ({ workflow_runs: [{ head_sha: 'anderer', status: 'completed', conclusion: 'success', html_url: 'x' }, { head_sha: sha, status, conclusion, html_url: RUN_URL }] });
const pill = (page) => page.locator('.adm-status').innerText();
const settle = (page) => page.waitForTimeout(150); // echte Zeit für Antwort + neuen Timer

/** Modus an, ein Bild löschen (kürzeste Aktion), Uhr anhalten. Gibt zurück, sobald der Statusbalken steht. */
async function commitWithClock(env, runs) {
  const { page, repo } = await H.activate(env, { clock: true, close: true });
  repo.runs = runs;
  await H.openLightbox(page, 4);
  await H.btn(page, 'Löschen').click();
  await H.btn(page, 'Ja, löschen').click();
  await page.waitForSelector('.adm-status');
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  return { page, repo };
}

add('Status: erste Abfrage nach 15 s, Abstand ≥ 15 s, am Ende „Jetzt live – Seite neu laden“', async (env) => {
  const { page, repo } = await commitWithClock(env, (sha, n) => (n === 1 ? { workflow_runs: [] } : n === 2 ? run(sha, 'in_progress', null) : run(sha, 'completed', 'success')));
  assert.ok((await pill(page)).includes('Wird veröffentlicht'));
  await page.clock.runFor(13000);
  await settle(page);
  assert.strictEqual(repo.runCalls.length, 0, 'vor 15 s keine Abfrage');
  await page.clock.runFor(3000);
  await H.until(() => repo.runCalls.length === 1, 'erste Abfrage');
  await settle(page);
  await page.clock.runFor(14000);
  await settle(page);
  assert.strictEqual(repo.runCalls.length, 1, 'zweite Abfrage frühestens 15 s später');
  await page.clock.runFor(2000);
  await H.until(() => repo.runCalls.length === 2, 'zweite Abfrage');
  await settle(page);
  assert.ok((await pill(page)).includes('Wird veröffentlicht'), 'Lauf läuft noch');
  await page.clock.runFor(15500);
  await H.until(() => repo.runCalls.length === 3, 'dritte Abfrage');
  await page.waitForFunction(() => document.querySelector('.adm-status')?.innerText.includes('Jetzt live – Seite neu laden'));
  assert.strictEqual(await page.locator('.adm-status button:text("Neu laden")').count(), 1);
  const times = await page.evaluate(() => window.__fetchTimes);
  assert.strictEqual(times.length, 3);
  times.slice(1).forEach((t, i) => assert.ok(t - times[i] >= 15000, `Abstand ${t - times[i]} ms`));
  assert.ok(repo.runCalls.every((c) => c.sha === repo.head), 'Abfrage zum Commit-SHA');
  await page.clock.runFor(120000);
  await settle(page);
  assert.strictEqual(repo.runCalls.length, 3, 'nach Abschluss keine Abfragen mehr');
});

add('Status: Fehlschlag -> verständliche Meldung mit Link zum Lauf', async (env) => {
  const { page, repo } = await commitWithClock(env, (sha) => run(sha, 'completed', 'failure'));
  await page.clock.runFor(15500);
  await H.until(() => repo.runCalls.length === 1, 'Abfrage');
  await page.waitForFunction(() => document.querySelector('.adm-status')?.innerText.includes('nicht geklappt'));
  assert.strictEqual(await page.locator('.adm-status a').getAttribute('href'), RUN_URL);
  assert.strictEqual(await page.locator('.adm-status a').getAttribute('rel'), 'noopener');
});

add('Status: nach 5 Minuten ohne Ergebnis Schluss (höchstens 20 Abfragen)', async (env) => {
  const { page, repo } = await commitWithClock(env, (sha) => run(sha, 'in_progress', null));
  for (let i = 0; i < 24; i++) { await page.clock.runFor(15100); await settle(page); }
  assert.ok(repo.runCalls.length >= 18 && repo.runCalls.length <= 20, `Abfragen: ${repo.runCalls.length}`);
  assert.ok((await pill(page)).includes('Noch nicht bestätigt'));
  const n = repo.runCalls.length;
  await page.clock.runFor(60000);
  await settle(page);
  assert.strictEqual(repo.runCalls.length, n);
  const times = await page.evaluate(() => window.__fetchTimes);
  assert.strictEqual(times.length, n);
  times.slice(1).forEach((t, i) => assert.ok(t - times[i] >= 15000, `Abstand ${t - times[i]} ms`));
  assert.ok(times[times.length - 1] - times[0] <= 300000);
});

add('Status: Token ohne „Actions: Read“ -> Hinweis statt Fehler, keine weiteren Abfragen', async (env) => {
  const { page, repo } = await commitWithClock(env, () => ({}));
  repo.fail['GET /actions/runs'] = { status: 403 };
  await page.clock.runFor(15500);
  await page.waitForFunction(() => document.querySelector('.adm-status')?.innerText.includes('Actions: Read'));
  await page.clock.runFor(60000);
  await settle(page);
  assert.strictEqual(repo.runCalls.length, 0);
  assert.strictEqual(repo.log.filter((r) => r.path === '/actions/runs').length, 1);
});

add('Status: „Verwaltung beenden“ stoppt Balken und Abfragen', async (env) => {
  const { page, repo } = await commitWithClock(env, (sha) => run(sha, 'in_progress', null));
  await H.closeLightbox(page);
  await H.clickHud(page);
  await H.btn(page, 'Verwaltung beenden').click();
  assert.strictEqual(await page.locator('.adm-status, .adm-hud, .adm-lbbar').count(), 0);
  await page.clock.runFor(60000);
  await settle(page);
  assert.strictEqual(repo.runCalls.length, 0);
});

module.exports = { tests };
