// Integrationstest der Easter Eggs in der ECHTEN Seite (main.js, context.js, input.js, ui.js), nicht im Harness:
// Eingaben kommen als echte Mausereignisse, das Laden der Module läuft über context.loadFeatures().
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('../../lib');

const FIX = path.join(L.ROOT, 'tests', 'museum', 'fixtures');
const NOTE = 'Das hier sieht nur, wer genau hinschaut.';

/** Kopie von site/ mit Fixture-Fotos und einer erinnerungen.json samt geheim-Block und einer Notiz. */
async function startRealServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eggs-real-'));
  fs.cpSync(path.join(L.ROOT, 'site'), dir, { recursive: true });
  fs.cpSync(path.join(FIX, 'erinnerungen'), path.join(dir, 'erinnerungen'), { recursive: true });
  const data = JSON.parse(fs.readFileSync(path.join(FIX, 'data-7.json'), 'utf8'));
  data.erinnerungen[1].notiz = NOTE;
  const pic = (i, titel, notiz) => ({ ...data.erinnerungen[i], titel, notiz });
  data.geheim = {
    herzregen: 'Ich liebe dich.', raumtext: 'Schön, dass du ihn gefunden hast.',
    tage: [{ tag: '02-14', jahr: null, text: 'Alles Liebe zum Valentinstag!' }],
    raum: [pic(0, 'Nur für uns', 'Geheime Notiz im geheimen Raum.'), pic(2, 'Unser Platz', null)],
  };
  fs.writeFileSync(path.join(dir, 'erinnerungen.json'), JSON.stringify(data));
  return L.serve(dir, true);
}

async function openReal(browser, url, query = '') {
  const page = await L.newPage(browser, { mobile: false });
  page.eggLog = [];
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) page.eggLog.push(`${m.type()}: ${m.text()}`); });
  await L.openMuseum(page, `${url}${query}`);
  return page;
}

/** Bildschirmposition (Pixel) eines Punktes der Szene mit der echten Kamera-Pose und -FOV. */
function project(page, point) {
  return page.evaluate(async (p) => {
    const THREE = await import('three');
    const m = window.__museum;
    const cam = new THREE.PerspectiveCamera(m.fov(), innerWidth / innerHeight, 0.1, 160);
    cam.rotation.order = 'YXZ';
    cam.position.set(m.pos.x, 1.65, m.pos.z);
    cam.rotation.set(m.pos.pitch, m.pos.yaw, 0);
    cam.updateMatrixWorld();
    const v = new THREE.Vector3(...p).project(cam);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, visible: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 };
  }, point);
}

/** Weltpositionen der Tippflächen: kind = 'heart' (Herz) oder 'secretpics' (Bilder im geheimen Raum). Szene = Elternknoten einer Themengruppe. */
function findInScene(page, kind) {
  return page.evaluate((k) => {
    const scene = window.__museum.themeGroup(0).parent;
    const out = [];
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const t = o.geometry.type, p = o.geometry.parameters || {};
      const heart = k === 'heart' && t === 'SphereGeometry' && p.radius === 0.18;
      // Tippfläche eines geheimen Bildes: unsichtbare Ebene (colorWrite aus) ohne Bildindex bei z = 0,034
      const secretPic = k === 'secretpics' && t === 'PlaneGeometry' && o.material.colorWrite === false && o.userData.index === undefined && o.position.z === 0.034;
      if (heart || secretPic) out.push(o.getWorldPosition(new o.position.constructor()).toArray());
    });
    return out;
  }, kind);
}

/** Stellt den Spieler dist Meter vor einen Wandpunkt, Blick darauf. */
function standBefore(page, pt, dist) {
  return page.evaluate(([p, d]) => {
    const m = window.__museum;
    const r = m.rooms.find((q) => p[0] >= q.x0 - 0.2 && p[0] <= q.x1 + 0.2 && p[2] >= q.z0 - 0.2 && p[2] <= q.z1 + 0.2);
    const dists = { n: p[2] - r.z0, s: r.z1 - p[2], w: p[0] - r.x0, e: r.x1 - p[0] };
    const wall = Object.keys(dists).sort((a, b) => dists[a] - dists[b])[0];
    const n = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[wall];
    const yaw = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }[wall];
    m.setPose({ x: p[0] + n[0] * d, z: p[2] + n[1] * d, yaw, pitch: Math.atan2(p[1] - 1.65, d), room: r.id });
    return r.id;
  }, [pt, dist]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function check(name, results, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true }); console.log(`  ok   ${name} (${Date.now() - t0} ms)`); } catch (err) {
    results.push({ name, ok: false });
    console.log(`  FAIL ${name}\n       ${String(err.message).split('\n').join('\n       ')}`);
  }
}

const must = (cond, msg) => { if (!cond) throw new Error(msg); };

async function heartAndDay(page, results) {
  await check('Echte Seite: Module geladen ohne Warnung, geheimer Raum zuletzt', results, async () => {
    const rooms = await page.evaluate(() => window.__museum.rooms.map((r) => [r.id, !!r.secret]));
    must(rooms[rooms.length - 1][1] === true && rooms.filter((r) => r[1]).length === 1, `Räume ${JSON.stringify(rooms)}`);
    must(page.eggLog.length === 0, `Konsole: ${page.eggLog.join(' | ')}`);
  });
  await check('Echte Seite: Begrüßungskarte (?heute=02-14) erst nach dem Eintreten, Weiter startet Herzregen', results, async () => {
    must((await page.locator('.eggs-karte').count()) === 0, 'Karte vor dem Eintreten');
    await L.enter(page);
    await page.waitForSelector('.eggs-karte', { timeout: 8000 });
    must((await page.textContent('.eggs-karte-text')) === 'Alles Liebe zum Valentinstag!', 'Kartentext');
    await page.click('.eggs-knopf');
    await page.waitForSelector('.eggs-regen', { timeout: 3000 });
    await page.waitForSelector('.eggs-regen', { state: 'detached', timeout: 12000 });
  });
  await check('Echte Seite: Herz antippen (echter Mausklick) zeigt Herzregen mit Text', results, async () => {
    const [pos] = await findInScene(page, 'heart');
    must(pos, 'Herz nicht in der Szene');
    await standBefore(page, pos, 1.5);
    await sleep(500);
    const p = await project(page, pos);
    must(p.visible, 'Herz nicht im Bild');
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('.eggs-regen-text', { timeout: 5000 });
    must((await page.textContent('.eggs-regen-text')) === 'Ich liebe dich.', 'Text des Herzregens');
    await page.waitForSelector('.eggs-regen', { state: 'detached', timeout: 12000 });
  });
}

async function noteAndSecret(page, results) {
  await check('Echte Seite: Lang drücken (echte Maus, ≥ 550 ms) auf Bild mit Notiz zeigt die Notizkarte', results, async () => {
    await page.evaluate(() => window.__museum.faceEntry(1));
    await sleep(600);
    const p = await page.evaluate(() => window.__museum.screenPositionOf(1));
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await sleep(900);
    await page.mouse.up();
    await page.waitForSelector('.eggs-notiz', { timeout: 4000 });
    must((await page.textContent('.eggs-notiz-text')) === NOTE, 'Notiztext');
    must(await page.locator('#lightbox').isHidden(), 'Großansicht öffnete sich trotz Lang-Drücken');
    await sleep(500);
    await page.mouse.click(60, 60);
    await page.waitForSelector('.eggs-notiz-wrap', { state: 'detached' });
  });
  await check('Echte Seite: durch die Geheimwand laufen, Toast, Bild antippen öffnet Großansicht', results, async () => {
    const info = await page.evaluate(() => {
      const s = window.__museum.rooms.find((r) => r.secret);
      const host = window.__museum.rooms[s.doors[0].to];
      return { d: host.doors.find((q) => q.secret), host, secret: s.id };
    });
    const { d, host } = info;
    const pose = { e: { x: host.x1 - 3, z: d.center, yaw: -Math.PI / 2 }, s: { x: d.center, z: host.z1 - 3, yaw: Math.PI } }[d.wall];
    await page.evaluate((q) => window.__museum.setPose({ ...q, pitch: 0, room: window.__museum.pos.room }), { ...pose, room: host.id });
    await page.keyboard.down('KeyW');
    await page.waitForFunction((id) => window.__museum.pos.room === id, info.secret, { timeout: 25000 });
    await page.keyboard.up('KeyW');
    await page.waitForSelector('.x-toast', { timeout: 4000 });
    must((await page.textContent('.x-toast')).includes('gefunden'), 'Toast-Text');
    const pics = await findInScene(page, 'secretpics');
    must(pics.length === 2, `geheime Bilder in der Szene: ${pics.length}`);
    await standBefore(page, pics[1], 2.4);
    await sleep(700);
    const p = await project(page, pics[1]);
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('.eggs-viewer', { timeout: 4000 });
    must((await page.textContent('.eggs-viewer h2')) === 'Unser Platz', 'Titel in der Großansicht');
    await page.click('.eggs-schliessen');
    await page.waitForSelector('.eggs-viewer', { state: 'detached' });
  });
  await check('Echte Seite: keine Konsolenfehler/Warnungen während des ganzen Ablaufs', results, async () => {
    must(page.eggLog.length === 0, page.eggLog.join(' | '));
    must(page.errors.length === 0, page.errors.join(' | '));
  });
}

/** Aufruf aus run.js: results ist die gemeinsame Ergebnisliste. */
async function suiteRealApp(browser, results, only) {
  if (only && !'Echte Seite'.includes(only)) return;
  const server = await startRealServer();
  const page = await openReal(browser, server.url, '?heute=02-14');
  try {
    await heartAndDay(page, results);
    await noteAndSecret(page, results);
  } finally {
    await page.context().close();
    await server.close();
  }
}

module.exports = { suiteRealApp };
