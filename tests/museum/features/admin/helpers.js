// Gemeinsame Helfer der Admin-Tests: Server, Seite mit gefälschter GitHub-API, Testbilder mit GPS-EXIF.
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('../../lib');
const { FakeRepo } = require('./github-mock');

const HERE = __dirname;
const FX = path.join(HERE, '..', '..', 'fixtures', 'erinnerungen');
const TXT = (titel, text, notiz) => `# ${titel}\n${text ? `\n${text}\n` : ''}${notiz ? `\n## Notiz\n${notiz}\n` : ''}`;

// Erinnerungen der Testseite: 0 normal, 1 anderer Endung + name.ext.txt, 2 ohne quelle (Fallback), 3 geheim, 4 ohne txt.
const ITEMS = [
  { bild: 'erinnerungen/2021-05-01_erster-ausflug.jpg?v=a1', quelle: 'erinnerungen/2021-05-01_erster-ausflug.jpg', titel: 'Erster Ausflug', datum: '2021-05-01', text: 'Ein sonniger Tag am See.', notiz: 'Hier gab es Eis.' },
  { bild: 'erinnerungen/2022-02-14_valentinstag.jpg?v=b2', quelle: 'erinnerungen/2022-02-14_valentinstag.HEIC', titel: 'Valentinstag', datum: '2022-02-14', text: 'Wir haben zusammen gekocht.', notiz: null },
  { bild: 'erinnerungen/2023-06-12_unser_erster_urlaub.jpg?v=c3', quelle: 'erinnerungen/2023-06-12_unser erster urlaub.PNG', titel: 'Unser erster Urlaub', datum: '2023-06-12', text: null, notiz: null },
  { bild: 'erinnerungen/geheim/2024-01-01_ueberraschung.jpg?v=d4', quelle: 'erinnerungen/geheim/2024-01-01_ueberraschung.jpg', titel: '<b>fett</b> & "Anführung"', datum: '2024-01-01', text: 'Nur für uns.', notiz: null },
  { bild: 'erinnerungen/2022-08-20_quadrat.jpg?v=e5', quelle: 'erinnerungen/2022-08-20_quadrat.jpg', titel: 'Sommerabend auf dem Balkon', datum: '2022-08-20', text: null, notiz: null },
].map((i) => ({ breite: 1600, hoehe: 1200, ...i }));

const IMG = Buffer.from('JPEGDATA');
const REPO_FILES = {
  'README.md': 'Readme', 'site/index.html': '<html>', '.github/workflows/pages.yml': 'name: x',
  'erinnerungen/2021-05-01_erster-ausflug.jpg': IMG,
  'erinnerungen/2021-05-01_erster-ausflug.txt': TXT('Erster Ausflug', 'Ein sonniger Tag am See (Stand im Repo).', 'Hier gab es Eis.'),
  'erinnerungen/2022-02-14_valentinstag.HEIC': IMG,
  'erinnerungen/2022-02-14_valentinstag.HEIC.txt': TXT('Valentinstag', 'Wir haben zusammen gekocht.', ''),
  'erinnerungen/2023-06-12_unser erster urlaub.PNG': IMG,
  'erinnerungen/geheim/2024-01-01_ueberraschung.jpg': IMG,
  'erinnerungen/2022-08-20_quadrat.jpg': IMG,
  'erinnerungen/widmung.txt': '# Für dich\nDeine Botschaft im Repo.\n',
};

/** Server: site/ + Harness + items.json + Fixture-Bilder unter den Namen der ITEMS. */
async function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-'));
  fs.cpSync(path.join(L.ROOT, 'site'), dir, { recursive: true });
  fs.copyFileSync(path.join(HERE, 'harness.html'), path.join(dir, 'harness.html'));
  fs.writeFileSync(path.join(dir, 'items.json'), JSON.stringify(ITEMS));
  const pics = fs.readdirSync(FX).filter((f) => f.endsWith('.jpg'));
  fs.mkdirSync(path.join(dir, 'erinnerungen/geheim'), { recursive: true });
  ITEMS.forEach((it, i) => fs.copyFileSync(path.join(FX, pics[i % pics.length]), path.join(dir, it.bild.split('?')[0])));
  return L.serve(dir, true);
}

/** Neue Handy-Seite mit gefälschter API. opts: token (in localStorage), branch, noquelle, clock, files. */
async function openPage(env, opts = {}) {
  const repo = new FakeRepo({ files: opts.files || REPO_FILES, branch: opts.branch || 'main', ...(opts.tokens ? { tokens: opts.tokens } : {}) });
  const page = await L.newPage(env.browser, { mobile: true, spy: false });
  if (env.opened) env.opened.push(page.context());
  page.console = [];
  page.on('console', (m) => page.console.push(`${m.type()}: ${m.text()}`));
  await repo.attach(page.context());
  repo.page = page;
  if (opts.token) await page.addInitScript((t) => { try { localStorage.setItem('mv4t', t); } catch { /* egal */ } }, opts.token);
  if (opts.active) await page.addInitScript(() => { try { sessionStorage.setItem('mv4a', '1'); } catch { /* egal */ } });
  if (opts.clock) await page.clock.install({ time: new Date('2026-11-05T10:00:00Z') });
  await page.goto(`${env.server.url}harness.html${opts.noquelle ? '?noquelle=1' : ''}`);
  await page.waitForFunction(() => window.__ready);
  return { page, repo };
}

async function tapHeart(page, n) {
  for (let i = 0; i < n; i++) {
    if (await page.locator('.adm-ov').count()) return; // Fenster ist schon offen (frühere Taps zählen mit)
    await page.tap('#start .herz');
  }
}

/** Schaltet den Modus über die Geste ein (5× Herz, Token einfügen, Prüfen). */
async function activate(env, opts = {}) {
  const t = await openPage(env, { token: 'good', ...opts });
  await tapHeart(t.page, 5);
  await t.page.waitForSelector('.adm-ov h2:text("Verwaltung")');
  if (opts.close) await t.page.getByRole('button', { name: 'Schließen', exact: true }).click();
  return t;
}

/** Großansicht von Bild i öffnen (wie die echte Seite) und auf die Verwaltungsknöpfe warten. */
async function openLightbox(page, i) {
  await page.evaluate((n) => window.__openLightbox(n), i);
  await page.waitForSelector('.adm-lbbar');
}

/** Wie ein Besucher im Saal: Startbildschirm weg, dann den Schraubenschlüssel im HUD antippen. */
async function clickHud(page) {
  await page.evaluate(() => window.__enter());
  await page.click('.adm-hud');
}

/** Großansicht schließen (der HUD-Knopf ist nur ohne Großansicht sichtbar). */
async function closeLightbox(page) {
  await page.click('#lb-close');
}

/** Letzter Commit des gefälschten Repos: geänderte Dateien (Pfad -> Buffer | null bei Löschen) und Nachricht. */
function lastCommit(repo, before) {
  const files = repo.files;
  const changed = {};
  for (const [p, b] of files) if (!before.has(p) || !before.get(p).equals(b)) changed[p] = b;
  for (const p of before.keys()) if (!files.has(p)) changed[p] = null;
  const c = repo.log.filter((r) => r.method === 'POST' && r.path === '/git/commits').pop();
  return { changed, message: c && c.body.message };
}

/** JPEG (Handy-Hochformat-Farbverlauf) aus dem Browser; w×h. */
async function makeJpeg(page, w, h) {
  const b64 = await page.evaluate(([w, h]) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#d6a58f'); grad.addColorStop(1, '#5c7a9e');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.font = `${h / 6}px serif`; g.fillText('Foto', w / 8, h / 2);
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  }, [w, h]);
  return Buffer.from(b64, 'base64');
}

/** Fügt einen EXIF-Block (Aufnahmedatum 2019-07-06 + GPS-Breite) direkt hinter FFD8 ein. */
function withGpsExif(jpeg) {
  const t = Buffer.alloc(130);
  t.write('MM', 0); t.writeUInt16BE(42, 2); t.writeUInt32BE(8, 4);
  t.writeUInt16BE(2, 8); // IFD0 @8
  [[0x8769, 38], [0x8825, 76]].forEach(([tag, off], i) => { const e = 10 + i * 12; t.writeUInt16BE(tag, e); t.writeUInt16BE(4, e + 2); t.writeUInt32BE(1, e + 4); t.writeUInt32BE(off, e + 8); });
  t.writeUInt16BE(1, 38); // Exif-IFD @38: DateTimeOriginal -> @56
  t.writeUInt16BE(0x9003, 40); t.writeUInt16BE(2, 42); t.writeUInt32BE(20, 44); t.writeUInt32BE(56, 48);
  t.write('2019:07:06 18:30:00\0', 56, 'latin1');
  t.writeUInt16BE(2, 76); // GPS-IFD @76: Ref + Breite -> @106
  t.writeUInt16BE(1, 78); t.writeUInt16BE(2, 80); t.writeUInt32BE(2, 82); t.write('N\0', 86, 'latin1');
  t.writeUInt16BE(2, 90); t.writeUInt16BE(5, 92); t.writeUInt32BE(3, 94); t.writeUInt32BE(106, 98);
  [[52, 1], [31, 1], [0, 1]].forEach(([n, d], i) => { t.writeUInt32BE(n, 106 + i * 8); t.writeUInt32BE(d, 110 + i * 8); });
  const head = Buffer.alloc(10);
  head.writeUInt16BE(0xffe1, 0); head.writeUInt16BE(2 + 6 + t.length, 2); head.write('Exif\0\0', 4, 'latin1');
  return Buffer.concat([jpeg.subarray(0, 2), head, t, jpeg.subarray(2)]);
}

/** true, wenn irgendein EXIF/APP1-Segment oder Rest davon im JPEG steckt. */
function hasMetadata(jpeg) {
  if (jpeg.includes('Exif\0\0', 0, 'latin1') || jpeg.includes('2019:07:06', 0, 'latin1')) return true;
  let p = 2;
  while (p + 4 < jpeg.length && jpeg[p] === 0xff) {
    const marker = jpeg[p + 1];
    if (marker === 0xe1 || marker === 0xed) return true;
    if (marker === 0xda) break;
    p += 2 + jpeg.readUInt16BE(p + 2);
  }
  return false;
}

/** Breite/Höhe eines JPEG aus dem SOF-Segment. */
function jpegSize(jpeg) {
  let p = 2;
  while (p + 9 < jpeg.length) {
    const marker = jpeg[p + 1];
    if (marker >= 0xc0 && marker <= 0xc3) return { h: jpeg.readUInt16BE(p + 5), w: jpeg.readUInt16BE(p + 7) };
    p += 2 + jpeg.readUInt16BE(p + 2);
  }
  return null;
}

/** Wählt per echtem Dateidialog eine Datei, nachdem `click` ihn ausgelöst hat. */
async function chooseFile(page, click, file) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), click()]);
  await chooser.setFiles({ name: file.name, mimeType: file.mime || 'image/jpeg', buffer: file.buffer });
}

/** Wartet (echte Zeit), bis fn() wahr ist. */
async function until(fn, what = 'Bedingung', ms = 6000) {
  const t0 = Date.now();
  while (!(await fn())) {
    if (Date.now() - t0 > ms) throw new Error(`Zeitüberschreitung: ${what}`);
    await new Promise((r) => setTimeout(r, 40));
  }
}

const btn = (page, name) => page.getByRole('button', { name, exact: true });
const dialogText = (page) => page.locator('.adm-ov').last().innerText();

module.exports = { L, ITEMS, REPO_FILES, TXT, startServer, openPage, tapHeart, activate, openLightbox, closeLightbox, clickHud, lastCommit, makeJpeg, withGpsExif, hasMetadata, jpegSize, chooseFile, until, btn, dialogText };
