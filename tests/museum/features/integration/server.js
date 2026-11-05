// Echte Seite (main.js, context.js, alle drei Feature-Module) mit Fixture-Fotos, geheimem Raum und gefälschter GitHub-API.
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('../../lib');
const { FakeRepo } = require('../admin/github-mock');

const FX = path.join(L.ROOT, 'tests', 'museum', 'fixtures');
const NOTE = 'Das hier sieht nur, wer genau hinschaut.';
const JPEG = fs.readFileSync(path.join(FX, 'erinnerungen', '2021-05-01_erster-ausflug.jpg'));

/** Fügt quelle/notiz hinzu (wie tools/build.py) und legt den geheimen Raum mit zwei Bildern an. */
function buildData() {
  const data = JSON.parse(fs.readFileSync(path.join(FX, 'data-7.json'), 'utf8'));
  data.erinnerungen.forEach((e, i) => {
    e.quelle = e.bild;
    e.notiz = i === 1 ? NOTE : null;
  });
  const secret = (stem, titel, datum, text, notiz) => ({
    bild: `erinnerungen/geheim/${stem}.jpg`, quelle: `erinnerungen/geheim/${stem}.jpg`, titel, datum, text, notiz, breite: 1600, hoehe: 1200,
  });
  data.widmung = { titel: 'Für dich', text: 'Danke für alles.' };
  data.geheim = {
    herzregen: 'Ich liebe dich.', raumtext: 'Schön, dass du ihn gefunden hast.',
    tage: [{ tag: '02-14', jahr: null, text: 'Alles Liebe zum Valentinstag!' }],
    raum: [secret('2024-01-01_ueberraschung', 'Nur für uns', '2024-01-01', 'Ein Foto, das sonst keiner kennt.', 'Geheime Notiz im geheimen Raum.'),
      secret('2024-02-02_unser-platz', 'Unser Platz', '2024-02-02', null, null)],
  };
  return data;
}

/** Repo-Stand passend zu den Daten: Originalfoto und .txt je Erinnerung (Pfad -> Inhalt). */
function repoFiles(data) {
  const files = { 'README.md': 'Readme', 'erinnerungen/widmung.txt': '# Für dich\nDanke für alles.\n' };
  for (const it of [...data.erinnerungen, ...data.geheim.raum]) {
    files[it.quelle] = JPEG;
    files[it.quelle.replace(/\.jpg$/, '.txt')] = `# ${it.titel}\n${it.text ? `\n${it.text}\n` : ''}${it.notiz ? `\n## Notiz\n${it.notiz}\n` : ''}`;
  }
  return files;
}

/** Server mit Kopie von site/ und den Fixtures; Rückgabe: Server plus data. */
async function startReal() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'integration-'));
  fs.cpSync(path.join(L.ROOT, 'site'), dir, { recursive: true });
  fs.cpSync(path.join(FX, 'erinnerungen'), path.join(dir, 'erinnerungen'), { recursive: true });
  const data = buildData();
  fs.mkdirSync(path.join(dir, 'erinnerungen', 'geheim'), { recursive: true });
  for (const it of data.geheim.raum) fs.writeFileSync(path.join(dir, it.bild), JPEG);
  fs.writeFileSync(path.join(dir, 'erinnerungen.json'), JSON.stringify(data));
  const srv = await L.serve(dir, true);
  return Object.assign(srv, { data });
}

/**
 * Handy- oder Desktopseite der echten App. opts: mobile, landscape, query, admin (Token + Modus an).
 * Die GitHub-API ist gefälscht (page.repo); jeder andere fremde Host landet in page.external.
 */
async function openApp(browser, srv, opts = {}) {
  const page = await L.newPage(browser, { mobile: opts.mobile !== false, landscape: !!opts.landscape, spy: false });
  page.repo = new FakeRepo({ files: repoFiles(srv.data) });
  await page.repo.attach(page.context());
  page.repo.page = page;
  if (opts.admin) {
    await page.addInitScript(() => { try { localStorage.setItem('mv4t', 'good'); sessionStorage.setItem('mv4a', '1'); } catch (e) { /* egal */ } });
  }
  await L.openMuseum(page, `${srv.url}${opts.query || ''}`);
  return page;
}

module.exports = { startReal, openApp, repoFiles, NOTE };
