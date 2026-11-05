// Tests der Paar-Ansicht (Playwright + Chromium/SwiftShader). Start: node tests/museum/features/thirdperson/run.js
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SHOTS = path.join(__dirname, 'screenshots');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const VIEWPORTS = { handy: { width: 390, height: 844, dpr: 2, touch: true }, desktop: { width: 1280, height: 720, dpr: 1, touch: false } };
const results = [];
let browser, server, base;

async function startServer() {
  server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}

async function open(kind, { stored } = {}) {
  const vp = VIEWPORTS[kind];
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.dpr, hasTouch: vp.touch, isMobile: vp.touch });
  if (stored) await context.addInitScript((v) => { try { localStorage.setItem('museum-ansicht', v); } catch (e) { /* egal */ } }, stored);
  const page = await context.newPage();
  page.errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') page.errors.push(`console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => page.errors.push(`requestfailed: ${r.url()}`));
  await page.goto(`${base}/tests/museum/features/thirdperson/harness.html`);
  await page.waitForFunction('window.__h && window.__h.ready === true', null, { timeout: 300000 });
  page.context_ = context;
  return page;
}

const state = (page) => page.evaluate('window.__h.state()');
const advance = (page, sec, move, turn, render = true) => page.evaluate(([s, m, t, r]) => window.__h.advance(s, m, t, r), [sec, move, turn, render]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const approx = (v, w, eps, msg) => { if (Math.abs(v - w) > eps) throw new Error(`${msg}: ${v} statt ${w} (±${eps})`); };
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true }); console.log(`  ok   ${name} (${Date.now() - t0} ms)`); } catch (err) {
    results.push({ name, ok: false });
    console.log(`  FAIL ${name}\n       ${String(err.message).split('\n').join('\n       ')}`);
  }
}

async function shot(page, kind, name) {
  await advance(page, 0); // aktuellen Stand rendern (advance mit render=false lässt die Leinwand veraltet)
  await page.screenshot({ path: path.join(SHOTS, `${kind}-${name}.jpg`), type: 'jpeg', quality: 86 });
}

async function bad(page) {
  const log = await page.evaluate('window.__h.log()');
  return log.bad;
}

/** Spielerpose direkt an der Wand, Blick von der Wand weg (die Kamera würde hinter die Wand fallen). */
function wallPose(room, wall) {
  const cx = (room.x0 + room.x1) / 2;
  const cz = (room.z0 + room.z1) / 2;
  const r = 0.46;
  return {
    n: { x: cx, z: room.z0 + r, yaw: Math.PI }, s: { x: cx, z: room.z1 - r, yaw: 0 },
    w: { x: room.x0 + r, z: cz, yaw: -Math.PI / 2 }, e: { x: room.x1 - r, z: cz - 3.5, yaw: Math.PI / 2 },
  }[wall];
}

async function testStart(page, kind) {
  await test(`${kind}: Ich-Ansicht ist Start, Knopf >= 44 px mit aria-label, Figuren unsichtbar`, async () => {
    const btn = await page.locator('#hud .tp-knopf');
    assert((await btn.count()) === 1, 'genau ein Knopf im HUD');
    const box = await btn.boundingBox();
    assert(box.width >= 44 && box.height >= 44, `Knopf ${box.width}x${box.height}`);
    assert((await btn.getAttribute('aria-label')).length > 2, 'aria-label fehlt');
    assert((await btn.getAttribute('aria-pressed')) === 'false', 'aria-pressed sollte false sein');
    assert((await page.evaluate('window.__h.styles')).includes('css/thirdperson.css'), 'addStyle nicht aufgerufen');
    await advance(page, 0.5);
    const s = await state(page);
    assert(!s.figuresVisible, 'Figuren in Ich-Ansicht sichtbar');
    approx(s.cam[0], s.player[0], 1e-6, 'Kamera x = Spieler');
    approx(s.cam[1], 1.65, 1e-6, 'Kamera y = Augenhöhe');
    await shot(page, kind, '0-ich');
  });
}

async function testToggle(page, kind) {
  await test(`${kind}: Knopf schaltet um, Übergang weich in ~0,5 s, Kamera hinter den Figuren`, async () => {
    const r0 = (await page.evaluate('window.__h.rooms'))[0];
    await page.evaluate((p) => window.__h.setPose(p), { x: (r0.x0 + r0.x1) / 2, z: (r0.z0 + r0.z1) / 2 + 1, yaw: 0.3 });
    await advance(page, 0.2);
    await page.evaluate('window.__h.resetLog()');
    await page.locator('#hud .tp-knopf').click();
    assert((await page.locator('#hud .tp-knopf').getAttribute('aria-pressed')) === 'true', 'aria-pressed nach Klick');
    const s0 = await state(page);
    await advance(page, 0.25);
    const mid = await state(page);
    await advance(page, 0.5);
    const end = await state(page);
    const log = await page.evaluate('window.__h.log()');
    const steps = log.cam.slice(1).map((p, i) => dist(p, log.cam[i]));
    const lead = dist(mid.cam, s0.cam);
    const total = dist(end.cam, s0.cam);
    assert(lead > 0.25 * total && lead < 0.8 * total, `Mitte des Übergangs: ${lead.toFixed(2)} von ${total.toFixed(2)} m`);
    assert(Math.max(...steps) < 0.2, `Sprung im Übergang: ${Math.max(...steps).toFixed(3)} m/Frame`);
    assert(steps.slice(40).every((d) => d < 0.03), 'Kamera nach 0,5 s noch in Bewegung');
    const [px, pz, yaw] = end.player;
    const back = (end.cam[0] - px) * Math.sin(yaw) + (end.cam[2] - pz) * Math.cos(yaw);
    assert(end.figuresVisible && end.opacity > 0.99, `Figuren nicht voll sichtbar (${end.opacity})`);
    approx(Math.hypot(end.cam[0] - px, end.cam[2] - pz), 3.2, 0.25, 'Abstand hinter den Figuren');
    assert(back > 3.0, `Kamera nicht hinter den Figuren (${back.toFixed(2)})`);
    approx(end.cam[1], 1.9, 0.12, 'Kamerahöhe');
    assert(Math.abs(end.ndc[0]) < 0.12 && end.ndc[1] > -0.9 && end.ndc[1] < 0.25, `Figuren nicht im Bild: ndc ${end.ndc}`);
    const stored = await page.evaluate("localStorage.getItem('museum-ansicht')");
    assert(stored === 'paar', `localStorage: ${stored}`);
    await shot(page, kind, '1-paar-stand');
  });
}

async function testKeyboard(page, kind) {
  await test(`${kind}: Taste V schaltet zurück, Figuren wieder unsichtbar`, async () => {
    await page.evaluate("document.body.insertAdjacentHTML('beforeend','<input id=\"tipp\" style=\"position:fixed;left:0;top:0\">')");
    await page.focus('#tipp');
    await page.keyboard.press('v');
    assert((await state(page)).view === 'paar', 'V im Textfeld darf nicht umschalten');
    await page.evaluate("document.getElementById('tipp').blur()");
    await page.keyboard.press('v');
    await advance(page, 0.7);
    const s = await state(page);
    assert(s.view === 'ich' && !s.figuresVisible, 'Ich-Ansicht nach V');
    approx(s.cam[1], 1.65, 1e-6, 'Kamera zurück auf Augenhöhe');
    assert((await page.evaluate("localStorage.getItem('museum-ansicht')")) === 'ich', 'localStorage ich');
    await page.keyboard.press('V');
    await advance(page, 0.7);
    assert((await state(page)).figuresVisible, 'Umschalten per Großbuchstabe V');
  });
}

async function suiteBasics(kind) {
  const page = await open(kind);
  await testStart(page, kind);
  await testToggle(page, kind);
  await testKeyboard(page, kind);
  return page;
}

async function suiteWalk(kind) {
  const page = await open(kind, { stored: 'paar' });
  await test(`${kind}: gemerkte Wahl wird beim Laden übernommen (Paar-Ansicht)`, async () => {
    await advance(page, 0.1);
    const s = await state(page);
    assert(s.view === 'paar' && s.figuresVisible, 'Start in Paar-Ansicht');
    assert((await page.locator('#hud .tp-knopf').getAttribute('aria-pressed')) === 'true', 'aria-pressed beim Start');
    assert(s.triangles < 3000, `Dreiecke: ${s.triangles}`);
  });
  await test(`${kind}: Gehanimation ändert die Pose nur in Bewegung`, async () => {
    await advance(page, 1.5);
    let still = [];
    for (let i = 0; i < 20; i++) { await advance(page, 0.05, undefined, undefined, false); still.push((await state(page)).pose); }
    assert(still.every((p) => Math.abs(p.legA) < 0.02 && Math.abs(p.legB) < 0.02), 'Beine bewegen sich im Stand');
    const hand0 = still[0].hand;
    assert(still.every((p) => dist(p.hand, hand0) < 0.03), 'Hände wandern im Stand');
    const walking = [];
    await shot(page, kind, '2-vor-gehen');
    for (let i = 0; i < 30; i++) { await advance(page, 0.05, { x: 0, y: 1 }, 0, false); walking.push((await state(page)).pose); }
    const legs = walking.map((p) => p.legA);
    assert(Math.max(...legs) > 0.3 && Math.min(...legs) < -0.3, `Beinschwung zu klein: ${Math.min(...legs).toFixed(2)}..${Math.max(...legs).toFixed(2)}`);
    assert(walking[29].amp > 0.9, `Amplitude ${walking[29].amp}`);
    await shot(page, kind, '3-paar-gehen');
    await advance(page, 0.8);
    const after = (await state(page)).pose;
    assert(Math.abs(after.legA) < 0.03 && after.amp < 0.03, `Pose nach dem Anhalten: ${after.legA}`);
  });
  await test(`${kind}: Figuren drehen weich in Laufrichtung`, async () => {
    const h0 = await page.evaluate('window.__h.tp.figures.group.rotation.y');
    const yaw = (await state(page)).player[2];
    await advance(page, 0.5, { x: 1, y: 0 }); // seitlich laufen → Figuren drehen in Laufrichtung
    const h1 = await page.evaluate('window.__h.tp.figures.group.rotation.y');
    const delta = Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0));
    assert(Math.abs(delta) > 0.5 && Math.abs(delta) < 1.7, `Kurs änderte sich um ${delta.toFixed(2)} rad (yaw ${yaw.toFixed(2)})`);
  });
  return page;
}

async function testWallsFour(page, kind, rooms) {
  await test(`${kind}: Kamera dringt an keiner Wand von Raum 1 durch (alle vier Wände)`, async () => {
    for (const wall of ['n', 's', 'w', 'e']) {
      await page.evaluate((p) => { window.__h.setPose(p); window.__h.resetLog(); }, wallPose(rooms[0], wall));
      await advance(page, 0.6);
      await advance(page, 0.8, { x: 0, y: -0.6 }); // rückwärts gegen die Wand drängen
      const b = await bad(page);
      assert(b.length === 0, `Wand ${wall}: ${JSON.stringify(b[0])}`);
      const s = await state(page);
      const d = Math.hypot(s.cam[0] - s.player[0], s.cam[2] - s.player[1]);
      assert(d < 1.2, `Wand ${wall}: Kamera zu weit weg (${d.toFixed(2)} m), wurde nicht herangerückt`);
      assert(s.opacity < 0.9, `Wand ${wall}: Figuren nicht transparent (${s.opacity})`);
    }
  });
}

async function testWallsFade(page, kind, rooms) {
  await test(`${kind}: 1,6 m vor der Wand rückt die Kamera heran, Figuren werden halbtransparent`, async () => {
    await page.evaluate((p) => window.__h.setPose(p), { x: (rooms[0].x0 + rooms[0].x1) / 2 - 2, z: rooms[0].z1 - 1.6, yaw: 0.25 });
    await advance(page, 1.5);
    const s = await state(page);
    const d = Math.hypot(s.cam[0] - s.player[0], s.cam[2] - s.player[1]);
    assert(d < 1.4 && d > 0.5, `Kameraabstand ${d.toFixed(2)} m`);
    assert(s.opacity > 0.05 && s.opacity < 0.95, `Deckkraft ${s.opacity}`);
    await shot(page, kind, '4-nah-an-wand');
  });
}

async function testDoors(page, kind, rooms) {
  await test(`${kind}: Kamera bleibt an Türen und Ecken vor der Wand (Türdurchgang, alle Blickrichtungen)`, async () => {
    const door = rooms[0].doors.find((d) => d.wall === 'e');
    const spots = [[rooms[0].x1 - 0.8, door.center], [rooms[0].x1 + 0.15, door.center], [rooms[0].x1 + 0.3, door.center + 1.0], [rooms[0].x1 - 0.5, rooms[0].z0 + 0.5]];
    for (const [x, z] of spots) {
      for (let k = 0; k < 8; k++) {
        await page.evaluate((p) => { window.__h.setPose(p); window.__h.resetLog(); }, { x, z, yaw: (k * Math.PI) / 4 });
        await advance(page, 0.8);
        const b = await bad(page);
        assert(b.length === 0, `Tür/Ecke (${x.toFixed(1)}, ${z.toFixed(1)}) Blick ${k * 45}°: ${JSON.stringify(b[0])}`);
      }
    }
  });
}

async function testWalkThrough(page, kind, rooms) {
  await test(`${kind}: Durch die Tür laufen und im Raum drehen – Kamera nie hinter einer Wand`, async () => {
    const door = rooms[0].doors.find((d) => d.wall === 'e');
    await page.evaluate((p) => { window.__h.setPose(p); window.__h.resetLog(); }, { x: rooms[0].x1 - 4, z: door.center, yaw: -Math.PI / 2 });
    await advance(page, 0.5);
    await advance(page, 3.5, { x: 0, y: 1 });
    await advance(page, 2.5, { x: 0, y: 1 }, 1);
    await advance(page, 1.5, { x: 0, y: -1 }, -1);
    await advance(page, 1.5, { x: 0.7, y: 0.7 });
    const b = await bad(page);
    assert(b.length === 0, JSON.stringify(b[0]));
    const s = await state(page);
    assert(s.player[0] > rooms[0].x1, 'Test kam nicht durch die Tür');
  });
}

async function testNearWall(page, kind, rooms) {
  await test(`${kind}: nah an der Wand ist die Ansicht sichtbar (Screenshot)`, async () => {
    await page.evaluate((p) => window.__h.setPose(p), { x: rooms[0].x0 + 1.4, z: rooms[0].z1 - 1.2, yaw: 0.6 });
    await advance(page, 1.2, { x: 0, y: 0.4 });
    await shot(page, kind, '5-nah-wand');
  });
}

async function suiteWalls(kind) {
  const page = await open(kind, { stored: 'paar' });
  const rooms = await page.evaluate('window.__h.rooms');
  for (const t of [testWallsFour, testWallsFade, testDoors, testWalkThrough, testNearWall]) await t(page, kind, rooms);
  return page;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await startServer();
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const errors = [];
  try {
    for (const kind of ['handy', 'desktop']) {
      console.log(`\n== ${kind} ==`);
      for (const suite of [suiteBasics, suiteWalk, suiteWalls]) {
        const page = await suite(kind);
        errors.push(...page.errors);
        await page.context_.close(); // GPU-Speicher freigeben, bevor die nächste Seite lädt
      }
    }
    await test('keine Konsolenfehler (alle Seiten)', async () => {
      assert(errors.length === 0, errors.join(' | '));
    });
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} Tests grün${failed ? `, ${failed} rot` : ''}`);
  if (results.length === 0) { console.log('0 Tests = rot'); process.exit(1); }
  process.exit(failed ? 1 : 0);
})().catch(async (err) => { console.error(err); try { await browser.close(); } catch (e) { /* egal */ } process.exit(1); });
