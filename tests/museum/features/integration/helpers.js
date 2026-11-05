// Bausteine der Integrationstests: echte Seite, Wege zum geheimen Raum, Berührungen, Wartebedingungen.
const L = require('../../lib');
const T = require('../../tour-steps');
const { openApp } = require('./server');

const GITHUB = 'https://api.github.com/'; // gemockt (page.repo)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const must = (cond, msg) => { if (!cond) throw new Error(msg); };

/** Wartet auf eine Bedingung (Seitenfunktion), nicht auf feste Zeiten. */
const until = (page, fn, arg, ms = 10000) => page.waitForFunction(fn, arg, { timeout: ms, polling: 100 });

/** Wartet n gezeichnete Bilder (requestAnimationFrame). */
const frames = (page, n) => page.evaluate((k) => new Promise((done) => { let i = 0; const f = () => (++i >= k ? done() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

/** Neue echte Seite und (standardmäßig) eintreten. opts: mobile, landscape, admin, query, enter = false. */
async function openEntered(env, opts = {}) {
  const page = await openApp(env.browser, env.server, opts);
  env.opened.push(page.context());
  if (opts.enter !== false) await L.enter(page);
  return page;
}

/** Fehler und Modul-Warnungen, die die Seite gesammelt hat (leer = sauber). */
const problems = (page) => [...page.errors, ...page.warnings.map((w) => `Warnung: ${w}`), ...page.external.filter((u) => !u.startsWith(GITHUB)).map((u) => `fremde Anfrage: ${u}`)];

/** Räume der Seite (Kopien) und Daten des geheimen Raums samt Gastgeberraum und Tür. */
function secretInfo(page) {
  return page.evaluate(() => {
    const rooms = window.__museum.rooms;
    const secret = rooms.find((r) => r.secret);
    const host = rooms[secret.doors[0].to];
    return { secret: secret.id, host, door: host.doors.find((d) => d.secret) };
  });
}

/** Stellt den Spieler 3 m vor die Geheimtür (Blick auf die Tür); liefert { secret, host, door }. */
async function standBeforeSecretDoor(page) {
  const info = await secretInfo(page);
  const { host, door } = info;
  const pose = { e: { x: host.x1 - 3, z: door.center, yaw: -Math.PI / 2 }, s: { x: door.center, z: host.z1 - 3, yaw: Math.PI },
    w: { x: host.x0 + 3, z: door.center, yaw: Math.PI / 2 }, n: { x: door.center, z: host.z0 + 3, yaw: 0 } }[door.wall];
  await page.evaluate((q) => window.__museum.setPose({ ...q, pitch: 0 }), { ...pose, room: host.id });
  return info;
}

/** Läuft per Taste W, bis der Spieler im Türspalt steht (noch zwischen den Räumen). */
async function walkToDoorGap(page) {
  const { host, door } = await standBeforeSecretDoor(page);
  await page.keyboard.down('KeyW');
  try {
    await until(page, ([h, d]) => {
      const p = window.__museum.pos;
      return { e: p.x - h.x1, s: p.z - h.z1, w: h.x0 - p.x, n: h.z0 - p.z }[d.wall] > 0.08;
    }, [host, door], 30000);
  } finally { await page.keyboard.up('KeyW'); }
}

/** Läuft per Taste W weiter, bis der Spieler im geheimen Raum steht. */
async function walkOnInto(page, secret) {
  await page.keyboard.down('KeyW');
  try { await until(page, (id) => window.__museum.pos.room === id, secret, 30000); } finally { await page.keyboard.up('KeyW'); }
}

/** Stellt den Spieler vor die Geheimtür und läuft per Taste W in den geheimen Raum. */
async function walkIntoSecret(page) {
  const { secret } = await standBeforeSecretDoor(page);
  await walkOnInto(page, secret);
  return secret;
}

/** Weltpunkte der Tippflächen der geheimen Bilder (unsichtbare Ebenen bei z = 0,034 ohne Bildindex). */
function secretPicturePoints(page) {
  return page.evaluate(() => {
    const scene = window.__museum.themeGroup(0).parent;
    const out = [];
    scene.traverse((o) => {
      if (o.isMesh && o.geometry.type === 'PlaneGeometry' && o.material.colorWrite === false && o.userData.index === undefined && o.position.z === 0.034) {
        out.push(o.getWorldPosition(new o.position.constructor()).toArray());
      }
    });
    return out.sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  });
}

/** Weltpunkte der kleinen Herzen an der Wand (Kugel mit Radius 0,18 = Tippfläche des Herzregens). */
function heartPoints(page) {
  return page.evaluate(() => {
    const scene = window.__museum.themeGroup(0).parent;
    const out = [];
    scene.traverse((o) => {
      if (o.isMesh && o.geometry.type === 'SphereGeometry' && o.geometry.parameters.radius === 0.18) out.push(o.getWorldPosition(new o.position.constructor()).toArray());
    });
    return out;
  });
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
  }, [pt, dist]);
}

/** Bildschirmposition eines Weltpunkts mit der tatsächlichen Kamera (Test-Hook der Seite). */
const project = (page, p) => page.evaluate((q) => window.__museum.screenPositionAt(...q), p);

/** Stellt den Spieler vor Bild i und liefert dessen Bildschirmposition; wartet, bis die Beschriftung steht. */
async function faceAndWait(page, i) {
  await page.evaluate((k) => window.__museum.faceEntry(k), i);
  await until(page, () => !document.getElementById('beschriftung').hidden);
  return page.evaluate((k) => window.__museum.screenPositionOf(k), i);
}

/** Echtes Antippen (Touch bzw. Maus). */
async function tapAt(page, mobile, x, y) {
  if (mobile) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
}

/** Setzt Finger id auf (x, y) (zusätzlich zu den Fingern in others); liefert end() zum Loslassen nur dieses Fingers. */
async function pressTouch(page, x, y, id = 2, others = []) {
  await L.touch.start(page, [...others, { x, y, id }]);
  return () => L.touch.send(page, 'touchEnd', others);
}

const hudLayout = (page) => T.layoutProblems(page, ['#entdeckt', '#hinweis', '#raumtitel', '#beschriftung', '.tp-knopf', '.adm-hud']);

module.exports = { L, T, sleep, frames, must, until, openEntered, problems, secretInfo, standBeforeSecretDoor, walkToDoorGap, walkOnInto, walkIntoSecret, heartPoints, secretPicturePoints, standBefore, project,
  faceAndWait, tapAt, pressTouch, hudLayout };
