// Unsichtbarkeit, Token-Schutz, Eingaben nur als Text, Pfade.
const assert = require('assert');
const H = require('./helpers');

const tests = [];
const add = (name, fn) => tests.push([name, fn]);

add('Ohne aktiven Modus: kein DOM, kein CSS, keine Anfrage, keine Konsolenausgabe (auch mit gespeichertem Token)', async (env) => {
  const { page, repo } = await H.openPage(env, { token: 'good' }); // Token da, aber Modus nicht aktiv
  await page.evaluate(() => window.__openLightbox(0));
  await page.waitForTimeout(300);
  assert.strictEqual(await page.locator('#lb-actions').evaluate((n) => n.childElementCount), 0);
  assert.strictEqual(await page.locator('#overlay-root').evaluate((n) => n.childElementCount), 0);
  assert.strictEqual(await page.locator('#hud').evaluate((n) => n.childElementCount), 0);
  assert.strictEqual(await page.locator('[class*="adm-"], link[href*="admin"]').count(), 0);
  assert.deepStrictEqual(await page.evaluate(() => window.__log), { styles: [], paused: [], toasts: [] });
  assert.strictEqual(repo.log.length, 0);
  assert.deepStrictEqual(page.console, []);
  assert.deepStrictEqual(page.errors, []);
});

add('Nach „Verwaltung beenden“ erscheinen in der Großansicht keine Knöpfe mehr', async (env) => {
  const { page } = await H.activate(env, { close: true });
  await H.clickHud(page);
  await H.btn(page, 'Verwaltung beenden').click();
  await page.evaluate(() => window.__openLightbox(0));
  assert.strictEqual(await page.locator('[class*="adm-"]').count(), 0);
});

add('Token taucht nie in einer URL, einem Commit, im Repo, in der Konsole oder im DOM auf', async (env) => {
  const TOKEN = 'github_pat_GEHEIM_0123456789';
  const { page, repo } = await H.openPage(env, { tokens: { [TOKEN]: 'rw' } });
  await H.tapHeart(page, 5);
  await page.fill('.adm-ov input[type=password]', TOKEN);
  await H.btn(page, 'Prüfen').click();
  await page.waitForSelector('.adm-ov h2:text("Verwaltung")');
  await H.btn(page, 'Schließen').click();
  await H.openLightbox(page, 0);
  await H.btn(page, 'Titel, Text & Notiz').click();
  await page.waitForSelector('.adm-ov textarea');
  await H.btn(page, 'Speichern').click();
  await page.waitForSelector('.adm-status');
  assert.ok(repo.log.length >= 6);
  for (const r of repo.log) {
    assert.ok(!r.url.includes(TOKEN) && !r.url.includes('github_pat'), `URL: ${r.url}`);
    assert.ok(!JSON.stringify(r.body || {}).includes(TOKEN), 'Token im Body');
    assert.strictEqual(r.auth, `Bearer ${TOKEN}`, 'nur im Authorization-Header');
  }
  for (const text of repo.files.values()) assert.ok(!text.includes(TOKEN));
  assert.ok(!page.url().includes(TOKEN));
  assert.ok(!(await page.evaluate(() => document.documentElement.outerHTML)).includes(TOKEN), 'nicht im DOM-Text');
  assert.ok(!page.console.join('\n').includes(TOKEN));
  assert.deepStrictEqual(page.console, [], 'keine Konsolenausgabe im aktiven Modus');
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('mv4t')), TOKEN, 'nur im localStorage dieses Geräts');
});

add('Alle Anfragen gehen nur an die gefälschte GitHub-API (nichts Echtes)', async (env) => {
  const { page, repo } = await H.activate(env, { close: true });
  await H.openLightbox(page, 4);
  await H.btn(page, 'Löschen').click();
  await H.btn(page, 'Ja, löschen').click();
  await page.waitForSelector('.adm-status');
  const outside = page.external.filter((u) => !u.startsWith('blob:') && !u.startsWith('data:'));
  assert.ok(outside.length > 0 && outside.every((u) => u.startsWith('https://api.github.com/repos/andyholiday/youtube')), outside.join('\n'));
  assert.deepStrictEqual(repo.unhandled, []);
});

add('Eingaben landen nur als Text im DOM (kein HTML aus Titel/Text)', async (env) => {
  const { page, repo } = await H.activate(env, { close: true });
  await H.openLightbox(page, 3); // Titel '<b>fett</b> & "Anführung"'
  await H.btn(page, 'Löschen').click();
  assert.ok((await H.dialogText(page)).includes('„<b>fett</b> & "Anführung"“'));
  assert.strictEqual(await page.locator('.adm-ov b').count(), 0);
  await H.btn(page, 'Abbrechen').click();
  await H.btn(page, 'Titel, Text & Notiz').click();
  await page.waitForSelector('.adm-ov textarea');
  const evil = '<img src=x onerror="window.__xss=1">';
  await page.getByLabel('Titel', { exact: true }).fill(evil);
  await page.getByLabel('Text', { exact: true }).fill(`${evil}\n## Notiz`);
  await H.btn(page, 'Speichern').click();
  await page.waitForSelector('.adm-status');
  await H.openLightbox(page, 3);
  await H.btn(page, 'Titel, Text & Notiz').click();
  await page.waitForSelector('.adm-ov textarea');
  assert.strictEqual(await page.getByLabel('Titel', { exact: true }).inputValue(), evil, 'Wert kommt unverändert zurück');
  assert.strictEqual(await page.locator('.adm-ov img, .adm-status img').count(), 0);
  assert.strictEqual(await page.evaluate(() => window.__xss), undefined);
  const txt = repo.text('erinnerungen/geheim/2024-01-01_ueberraschung.txt');
  assert.ok(!/^## Notiz$/m.test(txt), `Eine „## Notiz“-Zeile im Text darf die Notiz nicht abtrennen:\n${txt}`);
});

add('Slug, Pfade und .txt-Format (Einheiten im Browser)', async (env) => {
  const { page } = await H.openPage(env);
  const r = await page.evaluate(async () => {
    const t = await import('./js/features/admin/text.js');
    const p = await import('./js/features/admin/plan.js');
    const snap = { files: new Map([['erinnerungen/2020-01-01_a.jpg', 'x']]) };
    return {
      slugs: ['Größe Überraschung / ../ Ärger?!', '../../etc/passwd', '', 'Café Crème', 'a'.repeat(100), '日本語', 'ß', 'Ä Ö Ü'].map((s) => t.slugify(s)),
      safe: ['erinnerungen/a.jpg', 'erinnerungen/geheim/a.jpg', 'erinnerungen/../x', 'erinnerungen/a/../b', 'x/y', 'erinnerungen//a', '/erinnerungen/a', 'erinnerungen/a\\b'].map(t.isSafePath),
      dates: ['2024-02-29', '2023-02-29', '2024-13-01', 'heute', ''].map(t.isIsoDate),
      round: t.parseTxt(t.buildTxt({ titel: 'Ti # tel', text: 'a\n## Notiz\nb', notiz: 'n1\nn2' })),
      empty: t.buildTxt({ titel: '', text: '', notiz: '' }),
      dup: p.planAdd(snap, { datum: '2020-01-01', titel: 'A', text: '', notiz: '' }, new Uint8Array(1)).changes.map((c) => c.path),
      evil: p.planAdd(snap, { datum: '2020-01-01', titel: '../../.github/workflows/pages', text: '', notiz: '' }, new Uint8Array(1)).changes.map((c) => c.path),
    };
  });
  assert.deepStrictEqual(r.slugs, ['groesse-ueberraschung-aerger', 'etc-passwd', 'foto', 'cafe-creme', 'a'.repeat(48), 'foto', 'ss', 'ae-oe-ue']);
  assert.deepStrictEqual(r.safe, [true, true, false, false, false, false, false, false]);
  assert.deepStrictEqual(r.dates, [true, false, false, false, false]);
  assert.deepStrictEqual(r.round, { titel: 'Ti # tel', text: 'a\nNotiz\nb', notiz: 'n1\nn2' });
  assert.strictEqual(r.empty, '# \n');
  assert.deepStrictEqual(r.dup, ['erinnerungen/2020-01-01_a-2.jpg', 'erinnerungen/2020-01-01_a-2.txt']);
  assert.deepStrictEqual(r.evil, ['erinnerungen/2020-01-01_github-workflows-pages.jpg', 'erinnerungen/2020-01-01_github-workflows-pages.txt']);
});

module.exports = { tests };
