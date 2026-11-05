// Aktionen: ersetzen, bearbeiten, löschen, hinzufügen, Widmung, Geheimnisse, Fehlerfälle.
const assert = require('assert');
const H = require('./helpers');

const tests = [];
const add = (name, fn) => tests.push([name, fn]);
const saved = (page) => page.waitForSelector('.adm-status');
const lab = (page, name) => page.getByLabel(name, { exact: true });
const PATHS = (repo) => repo.writes.map((r) => `${r.method} ${r.path}`);

async function replaceVia(page, file) {
  await H.chooseFile(page, () => H.btn(page, 'Foto ersetzen').click(), file);
  await page.waitForSelector('.adm-ov img.adm-prev');
  await H.btn(page, 'Jetzt ersetzen').click();
}

add('Ersetzen: ein Commit (Blob, Tree mit base_tree, Commit, Ref), JPEG ≤ 2000 px ohne EXIF/GPS', async (env) => {
  const { page, repo } = await H.activate(env, { branch: 'trunk', close: true });
  const before = repo.files;
  const base = repo.commits.get(repo.head).tree;
  const head = repo.head;
  await H.openLightbox(page, 0);
  const input = H.withGpsExif(await H.makeJpeg(page, 3200, 2400));
  assert.ok(H.hasMetadata(input), 'Testbild trägt GPS/EXIF');
  await replaceVia(page, { name: 'IMG_0001.jpg', buffer: input });
  await saved(page);
  assert.deepStrictEqual(PATHS(repo), ['POST /git/blobs', 'POST /git/trees', 'POST /git/commits', 'PATCH /git/refs/heads/trunk']);
  const [, tree, commit, ref] = repo.writes;
  assert.strictEqual(tree.body.base_tree, base);
  assert.deepStrictEqual(tree.body.tree.map((e) => e.path), ['erinnerungen/2021-05-01_erster-ausflug.jpg']);
  assert.deepStrictEqual(commit.body.parents, [head]);
  assert.strictEqual(commit.body.message, 'Erinnerung ersetzt: Erster Ausflug');
  assert.strictEqual(ref.body.force, false);
  const { changed } = H.lastCommit(repo, before);
  assert.deepStrictEqual(Object.keys(changed), ['erinnerungen/2021-05-01_erster-ausflug.jpg']);
  const out = changed['erinnerungen/2021-05-01_erster-ausflug.jpg'];
  assert.strictEqual(out[0], 0xff);
  assert.ok(!H.hasMetadata(out), 'kein EXIF/GPS im hochgeladenen JPEG');
  assert.deepStrictEqual(H.jpegSize(out), { w: 2000, h: 1500 });
  assert.deepStrictEqual(await page.evaluate(() => window.__log.toasts), ['Gespeichert – in ca. 2 Minuten live']);
  assert.strictEqual(await page.locator('.adm-ov').count(), 0, 'Dialog geschlossen');
});

add('Ersetzen mit anderer Endung: alte Quelle wird gelöscht, Text bleibt', async (env) => {
  const { page, repo } = await H.activate(env, { close: true });
  const before = repo.files;
  await H.openLightbox(page, 1);
  await replaceVia(page, { name: 'neu.jpg', buffer: await H.makeJpeg(page, 600, 800) });
  await saved(page);
  const { changed, message } = H.lastCommit(repo, before);
  assert.deepStrictEqual(Object.keys(changed).sort(), ['erinnerungen/2022-02-14_valentinstag.HEIC', 'erinnerungen/2022-02-14_valentinstag.jpg']);
  assert.strictEqual(changed['erinnerungen/2022-02-14_valentinstag.HEIC'], null);
  assert.strictEqual(message, 'Erinnerung ersetzt: Valentinstag');
  assert.ok(repo.files.has('erinnerungen/2022-02-14_valentinstag.HEIC.txt'));
});

add('Ersetzen ohne „quelle“ (Fallback aus „bild“): findet Datei mit Leerzeichen und .PNG', async (env) => {
  const { page, repo } = await H.activate(env, { noquelle: true, close: true });
  const before = repo.files;
  await H.openLightbox(page, 2);
  await replaceVia(page, { name: 'x.jpg', buffer: await H.makeJpeg(page, 400, 300) });
  await saved(page);
  const { changed } = H.lastCommit(repo, before);
  assert.deepStrictEqual(Object.keys(changed).sort(), ['erinnerungen/2023-06-12_unser erster urlaub.PNG', 'erinnerungen/2023-06-12_unser erster urlaub.jpg']);
});

add('Ersetzen: Foto, das der Browser nicht lesen kann, gibt verständliche Meldung', async (env) => {
  const { page, repo } = await H.activate(env, { close: true });
  await H.openLightbox(page, 0);
  await H.chooseFile(page, () => H.btn(page, 'Foto ersetzen').click(), { name: 'kaputt.jpg', buffer: Buffer.from('kein bild') });
  await page.waitForSelector('.adm-err:not([hidden])');
  assert.ok((await page.locator('.adm-err').innerText()).includes('kann der Browser nicht lesen'));
  assert.strictEqual(repo.writes.length, 0);
});

const EDIT_TXT = '# Ausflug zum See\n\nZeile eins\nÄ ö ü ß\n\n## Notiz\nGeheim\n';

async function editVia(page, titel, text, notiz) {
  await H.btn(page, 'Titel, Text & Notiz').click();
  await page.waitForSelector('.adm-ov textarea');
  const [t, x, n] = [lab(page, 'Titel'), lab(page, 'Text'), lab(page, 'Notiz (versteckt)')];
  return { t, x, n, fill: async () => { await t.fill(titel); await x.fill(text); await n.fill(notiz); await H.btn(page, 'Speichern').click(); } };
}

add('Bearbeiten: lädt den Stand aus dem Repo, schreibt „# Titel / Text / ## Notiz“', async (env) => {
  const { page, repo } = await H.activate(env, { close: true });
  const before = repo.files;
  await H.openLightbox(page, 0);
  const e = await editVia(page, 'Ausflug zum See', 'Zeile eins\nÄ ö ü ß', 'Geheim');
  assert.ok((await e.x.inputValue()).includes('Stand im Repo'), 'Text kommt aus der .txt im Repo');
  assert.strictEqual(await e.n.inputValue(), 'Hier gab es Eis.');
  await e.fill();
  await saved(page);
  const { changed, message } = H.lastCommit(repo, before);
  assert.deepStrictEqual(Object.keys(changed), ['erinnerungen/2021-05-01_erster-ausflug.txt']);
  assert.strictEqual(changed['erinnerungen/2021-05-01_erster-ausflug.txt'].toString('utf8'), EDIT_TXT);
  assert.strictEqual(message, 'Erinnerung bearbeitet: Ausflug zum See');
  assert.deepStrictEqual(PATHS(repo), ['POST /git/blobs', 'POST /git/trees', 'POST /git/commits', 'PATCH /git/refs/heads/main']);
});

add('Bearbeiten: vorhandene „bild.ext.txt“ wird weiterbenutzt; ohne txt entsteht „<stamm>.txt“; nur Titel -> „# Titel“', async (env) => {
  const { page, repo } = await H.activate(env, { close: true });
  let before = repo.files;
  await H.openLightbox(page, 1);
  await (await editVia(page, 'Valentin', 'Text', '')).fill();
  await saved(page);
  assert.deepStrictEqual(Object.keys(H.lastCommit(repo, before).changed), ['erinnerungen/2022-02-14_valentinstag.HEIC.txt']);
  assert.strictEqual(repo.text('erinnerungen/2022-02-14_valentinstag.HEIC.txt'), '# Valentin\n\nText\n');
  before = repo.files;
  await H.openLightbox(page, 4);
  await (await editVia(page, 'Nur Titel', '', '')).fill();
  await page.waitForFunction(() => document.querySelectorAll('.adm-ov').length === 0);
  const { changed } = H.lastCommit(repo, before);
  assert.deepStrictEqual(Object.keys(changed), ['erinnerungen/2022-08-20_quadrat.txt']);
  assert.strictEqual(changed['erinnerungen/2022-08-20_quadrat.txt'].toString('utf8'), '# Nur Titel\n');
});

add('Löschen: erst Rückfrage (Abbrechen = kein Commit), dann Bild und .txt in einem Commit', async (env) => {
  const { page, repo } = await H.activate(env, { close: true });
  const before = repo.files;
  await H.openLightbox(page, 1);
  await H.btn(page, 'Löschen').click();
  await page.waitForSelector('.adm-ov h2:text("Wirklich löschen?")');
  assert.ok((await H.dialogText(page)).includes('„Valentinstag“'));
  await H.btn(page, 'Abbrechen').click();
  assert.strictEqual(repo.writes.length, 0, 'Abbrechen schreibt nichts');
  await H.btn(page, 'Löschen').click();
  await H.btn(page, 'Ja, löschen').click();
  await saved(page);
  const { changed, message } = H.lastCommit(repo, before);
  assert.deepStrictEqual(changed, { 'erinnerungen/2022-02-14_valentinstag.HEIC': null, 'erinnerungen/2022-02-14_valentinstag.HEIC.txt': null });
  assert.strictEqual(message, 'Erinnerung gelöscht: Valentinstag');
  assert.deepStrictEqual(repo.writes.filter((r) => r.path === '/git/commits').length, 1);
});

async function addVia(page, { file, titel, text = '', notiz = '', geheim = false, datum }) {
  await H.clickHud(page);
  await H.btn(page, 'Foto hinzufügen').click();
  await H.chooseFile(page, () => H.btn(page, 'Foto auswählen').click(), file);
  await page.waitForSelector('.adm-ov img.adm-prev');
  if (datum) await lab(page, 'Datum').fill(datum);
  await lab(page, 'Titel').fill(titel);
  await lab(page, 'Text').fill(text);
  await lab(page, 'Notiz (versteckt)').fill(notiz);
  if (geheim) await lab(page, 'In den geheimen Raum').check();
  await H.btn(page, 'Hinzufügen').click();
}

add('Hinzufügen: Datum aus EXIF, Slug (Umlaute/Sonderzeichen), geheim/, txt-Format, kein EXIF im Bild', async (env) => {
  const { page, repo } = await H.activate(env, { close: true });
  const before = repo.files;
  const file = { name: 'IMG_9.jpg', buffer: H.withGpsExif(await H.makeJpeg(page, 800, 600)) };
  const titel = 'Größe Überraschung / ../ Ärger?!';
  await H.clickHud(page);
  await H.btn(page, 'Foto hinzufügen').click();
  await H.chooseFile(page, () => H.btn(page, 'Foto auswählen').click(), file);
  await page.waitForSelector('.adm-ov img.adm-prev');
  assert.strictEqual(await lab(page, 'Datum').inputValue(), '2019-07-06', 'Datum aus dem Foto-EXIF');
  await lab(page, 'Titel').fill(titel);
  await lab(page, 'Text').fill('Hallo');
  await lab(page, 'Notiz (versteckt)').fill('Psst');
  await lab(page, 'In den geheimen Raum').check();
  await H.btn(page, 'Hinzufügen').click();
  await saved(page);
  const { changed, message } = H.lastCommit(repo, before);
  const base = 'erinnerungen/geheim/2019-07-06_groesse-ueberraschung-aerger';
  assert.deepStrictEqual(Object.keys(changed).sort(), [`${base}.jpg`, `${base}.txt`]);
  assert.ok(Object.keys(changed).every((p) => /^erinnerungen\/geheim\/[a-z0-9_-]+\.(jpg|txt)$/.test(p)));
  assert.strictEqual(changed[`${base}.txt`].toString('utf8'), `# ${titel}\n\nHallo\n\n## Notiz\nPsst\n`);
  assert.strictEqual(message, `Erinnerung hinzugefügt (geheimer Raum): ${titel}`);
  assert.ok(!H.hasMetadata(changed[`${base}.jpg`]));
});

add('Hinzufügen: ohne EXIF = heute; gleicher Name wird nummeriert; ohne Foto kein Commit', async (env) => {
  const { page, repo } = await H.activate(env, { close: true });
  const file = { name: 'a.jpg', buffer: await H.makeJpeg(page, 640, 480) };
  await H.clickHud(page);
  await H.btn(page, 'Foto hinzufügen').click();
  await H.btn(page, 'Hinzufügen').click();
  assert.ok((await page.locator('.adm-err').innerText()).includes('zuerst ein Foto'));
  assert.strictEqual(repo.writes.length, 0);
  await H.btn(page, 'Abbrechen').click();
  await page.waitForSelector('.adm-ov h2:text("Verwaltung")'); // zurück zur Verwaltung
  await H.btn(page, 'Schließen').click();
  const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await addVia(page, { file, titel: 'Kaffee' });
  await saved(page);
  assert.ok(repo.files.has(`erinnerungen/${today}_kaffee.jpg`) && repo.files.has(`erinnerungen/${today}_kaffee.txt`));
  await addVia(page, { file, titel: 'Kaffee' });
  await H.until(() => repo.files.has(`erinnerungen/${today}_kaffee-2.jpg`), 'zweites Foto nummeriert');
});

add('Widmung: lädt die Datei aus dem Repo, speichert mit Zeilenende \\n', async (env) => {
  const { page, repo } = await H.activate(env);
  await H.btn(page, 'Widmung bearbeiten').click();
  const area = lab(page, 'Text');
  await page.waitForFunction(() => document.querySelector('.adm-ov textarea')?.value.includes('Botschaft im Repo'));
  await area.fill('# Neu für dich\r\nMit Liebe\r\nÜberarbeitet');
  await H.btn(page, 'Speichern').click();
  await saved(page);
  assert.strictEqual(repo.text('erinnerungen/widmung.txt'), '# Neu für dich\nMit Liebe\nÜberarbeitet\n');
  assert.strictEqual(repo.writes.find((r) => r.path === '/git/commits').body.message, 'Widmung geändert');
});

add('Geheimnisse: fehlende Datei = Vorlage, Speichern legt erinnerungen/geheimnisse.txt an', async (env) => {
  const { page, repo } = await H.activate(env);
  await H.btn(page, 'Geheimnisse bearbeiten').click();
  await page.waitForSelector('.adm-ov textarea');
  assert.strictEqual(await lab(page, 'Text').inputValue(), '# Herzregen\n\n# Geheimer Raum\n\n# Besondere Tage\n');
  assert.ok((await H.dialogText(page)).includes('{jahre}'), 'Formathilfe');
  await lab(page, 'Text').fill('# Herzregen\nIch liebe dich.\n# Besondere Tage\n14.02. Alles Liebe!');
  await H.btn(page, 'Speichern').click();
  await saved(page);
  assert.strictEqual(repo.text('erinnerungen/geheimnisse.txt'), '# Herzregen\nIch liebe dich.\n# Besondere Tage\n14.02. Alles Liebe!\n');
});

async function failDelete(env, setup, expected) {
  const { page, repo } = await H.activate(env, { close: true });
  setup(repo);
  await H.openLightbox(page, 4);
  await H.btn(page, 'Löschen').click();
  await H.btn(page, 'Ja, löschen').click();
  await page.waitForSelector('.adm-err:not([hidden])');
  assert.ok((await page.locator('.adm-err').innerText()).includes(expected), await page.locator('.adm-err').innerText());
  assert.strictEqual(await page.locator('.adm-status').count(), 0, 'kein Statusbalken ohne Commit');
  assert.ok(await page.locator('.adm-ov').count(), 'Dialog bleibt für einen neuen Versuch offen');
  assert.strictEqual(await page.locator('.adm-card.adm-busy').count(), 0, 'nicht mehr gesperrt');
  return repo;
}

add('Konflikt 422 beim Ref-Update: „neueren Stand“, nichts geht verloren', async (env) => {
  const repo = await failDelete(env, (r) => { r.fail['PATCH /git/refs'] = { status: 422, message: 'Update is not a fast forward' }; }, 'neueren Stand');
  assert.ok(repo.files.has('erinnerungen/2022-08-20_quadrat.jpg'), 'Repo unverändert');
});
add('Konflikt 409: „neueren Stand“', async (env) => { await failDelete(env, (r) => { r.fail['POST /git/commits'] = { status: 409 }; }, 'neueren Stand'); });
add('Echter Wettlauf: Kopf wandert zwischen Lesen und Schreiben (422 vom Ref-Update)', async (env) => {
  await failDelete(env, (r) => {
    const orig = r.route.bind(r);
    r.route = async (route, method, path, ...rest) => {
      if (method === 'POST' && path === '/git/commits') r.head = r.makeCommit(r.trees.get(r.commits.get(r.head).tree), r.head); // fremder Commit
      return orig(route, method, path, ...rest);
    };
  }, 'neueren Stand');
});
add('Offline: „Keine Verbindung“', async (env) => { await failDelete(env, (r) => { r.offline = true; }, 'Keine Verbindung'); });
add('Token mitten drin abgelaufen (401): Meldung', async (env) => { await failDelete(env, (r) => { r.tokens = {}; }, 'ungültig oder abgelaufen'); });
add('Schreibrecht fehlt (403 beim Speichern): Meldung zu den Rechten', async (env) => { await failDelete(env, (r) => { r.fail['POST /git/blobs'] = { status: 403 }; r.fail['POST /git/trees'] = { status: 403 }; }, 'fehlen die Rechte'); });

module.exports = { tests };
