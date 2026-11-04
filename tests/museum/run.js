// Museums-Tests (Playwright + Chromium/SwiftShader). Start: node tests/museum/run.js [Teilname]
// Fixtures liegen eingecheckt unter tests/museum/fixtures (neu erzeugen: python3 tests/museum/make_fixtures.py).
const assert = require('assert');
const path = require('path');
const L = require('./lib');
const C = require('./layout-checks');
const { clearApproach, reachAllRooms } = require('./walk-checks');

const SHOTS = path.join(__dirname, 'screenshots');
const results = [];
const servers = {};
let browser;
let layouts = {}; // n -> Räume, einmal im Browser mit layout.js erzeugt

async function withPage(data, mobile, fn) {
  const page = await L.newPage(browser, { mobile });
  try {
    await L.openMuseum(page, servers[data].url);
    await fn(page);
    assert.deepStrictEqual(page.errors, [], `Konsolen-/Netzwerkfehler: ${page.errors.join(' | ')}`);
  } finally {
    await page.context().close();
  }
}

function record(name, t0, err) {
  results.push({ name, ok: !err, err });
  console.log(err ? `  FAIL ${name}\n       ${String(err.message).split('\n')[0]}` : `  ok   ${name} (${Date.now() - t0} ms)`);
}

async function test(name, data, mobile, fn) {
  if (process.argv[2] && !name.includes(process.argv[2])) return; // Filter: node run.js <Teilname>
  const t0 = Date.now();
  try { await withPage(data, mobile, fn); record(name, t0); } catch (err) { record(name, t0, err); }
}

/** Test ohne Browser-Seite (reine Layout-Daten). */
async function plain(name, fn) {
  if (process.argv[2] && !name.includes(process.argv[2])) return;
  const t0 = Date.now();
  try { await fn(); record(name, t0); } catch (err) { record(name, t0, err); }
}

const D7 = 'data-7.json';
const hold = async (page, key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
/** Taste halten, bis cond(window.__museum.pos) wahr ist (Bildrate im Software-Renderer schwankt). */
async function holdUntil(page, key, cond, arg, timeout = 20000) {
  await page.keyboard.down(key);
  try { await page.waitForFunction(([c, a]) => new Function('pos', 'a', `return ${c}`)(window.__museum.pos, a), [cond, arg], { timeout }); } finally { await page.keyboard.up(key); }
}
const setPose = (page, p) => page.evaluate((q) => window.__museum.setPose(q), p);
const getRooms = (page) => page.evaluate(() => window.__museum.rooms);
const YAW = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }; // Blickrichtung zur Wand
const PLANE = (r, wall) => ({ n: r.z0, s: r.z1, w: r.x0, e: r.x1 })[wall];
const FIELD = (wall) => (wall === 'n' || wall === 's' ? 'z' : 'x');

async function joystickCenter(page) {
  const b = await page.locator('#joystick .basis').boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Läuft in Richtung key, bis sich die Position nicht mehr ändert (Wand) oder timeout. */
async function walkUntilStuck(page, key, field) {
  await page.keyboard.down(key);
  let prev = (await L.pos(page))[field];
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(400);
    const cur = (await L.pos(page))[field];
    if (Math.abs(cur - prev) < 1e-6) break;
    prev = cur;
  }
  await page.keyboard.up(key);
  return prev;
}

/** Pose 2 m vor der Tür d des Raums r, Blick durch die Tür. */
function beforeDoor(r, d) {
  const along = { x: d.wall === 'n' || d.wall === 's' ? d.center : null, z: d.wall === 'e' || d.wall === 'w' ? d.center : null };
  const x = along.x ?? { w: r.x0 + 2, e: r.x1 - 2 }[d.wall];
  const z = along.z ?? { n: r.z0 + 2, s: r.z1 - 2 }[d.wall];
  return { x, z, yaw: YAW[d.wall], pitch: 0 };
}

async function loadLayouts() {
  const page = await L.newPage(browser, { mobile: false });
  await L.openMuseum(page, servers[D7].url);
  const asp = [[1600, 1200], [1200, 1600], [1200, 1200], [1600, 900], [900, 1600], [1500, 1000], [1000, 1500], [2400, 1000], [1000, 2400]];
  layouts = await page.evaluate(async (a) => {
    const { buildLayout } = await import('./js/layout.js');
    const out = {};
    for (let n = 0; n <= 40; n++) {
      const items = Array.from({ length: n }, (_, i) => ({ breite: a[i % a.length][0], hoehe: a[i % a.length][1] }));
      out[n] = buildLayout(items, ['modern', 'klassisch', 'futuristisch', 'garten']);
    }
    return out;
  }, asp);
  await page.context().close();
}

async function suiteStart() {
  console.log('Seite & Start');
  await test('Seite lädt ohne Konsolenfehler, Titel und 7 Erinnerungen', D7, false, async (page) => {
    assert.match(await page.title(), /Für dich/);
    assert.strictEqual(await page.evaluate(() => window.__museum.count), 7);
    assert.ok(await page.locator('#szene').isVisible());
  });
  await test('Overlay „Für dich“ → Eintreten blendet Overlay aus', D7, false, async (page) => {
    assert.match(await page.locator('#start h1').innerText(), /Für dich/);
    assert.strictEqual((await page.locator('#start-btn').innerText()).trim(), 'Eintreten');
    await L.enter(page);
    assert.ok(await page.locator('#start').isHidden());
  });
  await test('Datum wird deutsch formatiert', D7, false, async (page) => {
    const r = await page.evaluate(async () => {
      const { formatDatum } = await import('./js/format.js');
      return [formatDatum('2023-06-12'), formatDatum('2021-05-01'), formatDatum('2022-12-24'), formatDatum(null), formatDatum('kaputt')];
    });
    assert.deepStrictEqual(r, ['12. Juni 2023', '1. Mai 2021', '24. Dezember 2022', '', '']);
  });
}

async function suiteLayout() {
  console.log('Layout (Räume, Türen, Bilder)');
  await plain('Räume überlappen nicht (0–40 Bilder, mind. 0,3 m Spalt)', async () => {
    for (const [n, rooms] of Object.entries(layouts)) assert.deepStrictEqual(C.noOverlap(rooms), [], `n=${n}`);
  });
  await plain('Jede Tür hat ein Gegenstück im Nachbarraum (gleiche Stelle)', async () => {
    for (const [n, rooms] of Object.entries(layouts)) assert.deepStrictEqual(C.doorsMatch(rooms), [], `n=${n}`);
  });
  await plain('Alle Räume sind vom Start über Türen erreichbar', async () => {
    for (const [n, rooms] of Object.entries(layouts)) assert.deepStrictEqual(C.reachable(rooms), [], `n=${n}`);
    assert.strictEqual(layouts[13].length, 4, '13 Bilder -> 4 Räume');
    assert.ok(layouts[7].length >= 3, '7 Bilder -> mind. 3 Räume');
  });
  await plain('Rundgang hat Ecken (Richtungswechsel), Türen auf wechselnden Wänden', async () => {
    for (const n of [7, 13, 25]) assert.deepStrictEqual(C.hasCorner(layouts[n]), [], `n=${n}`);
  });
  await plain('Slots liegen auf den Wänden, überlappen weder einander noch Türen noch Ecken', async () => {
    for (const [n, rooms] of Object.entries(layouts)) assert.deepStrictEqual(C.slotsOk(rooms), [], `n=${n}`);
    for (const [n, rooms] of Object.entries(layouts)) assert.deepStrictEqual(C.indices(rooms, Number(n)), [], `n=${n}`);
  });
  await plain('Räume 10–18 m groß, Decke 7–10 m', async () => {
    for (const [n, rooms] of Object.entries(layouts)) assert.deepStrictEqual(C.perRoom(rooms), [], `n=${n}`);
  });
  await plain('Bildgrößen: mindestens drei Stufen bei 7 Bildern, Blickfang groß, kleine klein', async () => {
    const sizes = layouts[7].flatMap((r) => r.slots.map((s) => C.longEdge(s)));
    assert.ok(C.distinctSizes(layouts[7]) >= 3, `nur ${C.distinctSizes(layouts[7])} Größen`);
    assert.ok(Math.max(...sizes) >= 2.5 && Math.min(...sizes) <= 1.3, sizes.join(','));
    for (const r of layouts[7]) assert.ok(r.slots.some((s) => C.longEdge(s) >= 2.5), `Raum ${r.id} ohne Blickfang`);
  });
  await plain('Leere Liste: ein Raum, keine Tür, kein Bild', async () => {
    assert.strictEqual(layouts[0].length, 1);
    assert.deepStrictEqual([layouts[0][0].doors.length, layouts[0][0].slots.length], [0, 0]);
  });
  await test('App nutzt das Layout: 3 Räume, Themen der Reihe nach, Decke gebaut ≥ 7 m', D7, false, async (page) => {
    const rooms = await getRooms(page);
    assert.strictEqual(rooms.length, 3);
    assert.deepStrictEqual(rooms.map((r) => r.theme), ['modern', 'klassisch', 'futuristisch']);
    assert.deepStrictEqual(C.checkAll(rooms, 7), []);
    for (const r of rooms) assert.ok(await page.evaluate((i) => window.__museum.ceilingY(i), r.id) >= 7, `Raum ${r.id} Decke zu niedrig`);
  });
}

async function suiteWorld() {
  console.log('Bilder & Texturen');
  await test('Bilder im richtigen Seitenverhältnis und an ihren Slots', D7, false, async (page) => {
    const exp = [[1600, 1200], [1200, 1600], [1200, 1200], [1600, 900], [900, 1600], [1500, 1000], [1000, 1500]];
    const rooms = await getRooms(page);
    const slots = rooms.flatMap((r) => r.slots);
    for (let i = 0; i < exp.length; i++) {
      const s = await page.evaluate((n) => window.__museum.pictureSize(n), i);
      assert.ok(Math.abs(s.w / s.h / (exp[i][0] / exp[i][1]) - 1) < 0.02, `Bild ${i}: ${s.w}x${s.h}`); // Slots sind auf cm gerundet
      assert.ok(Math.abs(s.w - slots[i].w) < 1e-6 && Math.abs(s.h - slots[i].h) < 1e-6, `Bild ${i} passt nicht zum Slot`);
    }
  });
  await test('Leere Liste: Hinweis im leeren Saal, keine Fehler', 'data-0.json', false, async (page) => {
    await L.enter(page);
    assert.strictEqual((await getRooms(page)).length, 1);
    const hint = page.locator('#leer-hinweis');
    await hint.waitFor({ state: 'visible' });
    assert.match(await hint.innerText(), /Noch hängt hier nichts/);
  });
  await test('Ein Eintrag: Bild wird geladen und lässt sich öffnen', 'data-1.json', false, async (page) => {
    await L.enter(page);
    await page.waitForFunction(() => window.__museum.texturesLoaded() === 1);
    await page.evaluate(() => window.__museum.faceEntry(0));
    await page.waitForTimeout(300);
    const p = await page.evaluate(() => window.__museum.screenPositionOf(0));
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
    assert.strictEqual(await page.locator('#lb-titel').innerText(), 'Erster Ausflug');
  });
  await test('Texturen laden lazy: Nachbarräume sofort, fernere erst beim Näherkommen', D7, false, async (page) => {
    await L.enter(page);
    const rooms = await getRooms(page);
    const near = rooms[0].slots.length + rooms[1].slots.length;
    await page.waitForFunction((n) => window.__museum.texturesLoaded() >= n, near, { timeout: 15000 });
    await page.waitForTimeout(1200);
    assert.strictEqual(await page.evaluate(() => window.__museum.texturesLoaded()), near, 'ferner Raum schon geladen');
    const r2 = rooms[2];
    await setPose(page, { x: (r2.x0 + r2.x1) / 2, z: (r2.z0 + r2.z1) / 2 });
    await page.waitForFunction(() => window.__museum.texturesLoaded() === 7, null, { timeout: 15000 });
  });
}

async function suiteDesktop() {
  console.log('Steuerung & Kollision Desktop');
  await test('Desktop: W/S und A/D ändern die Kameraposition', D7, false, async (page) => {
    await L.enter(page);
    const a = await L.pos(page);
    await hold(page, 'KeyW', 700);
    const b = await L.pos(page);
    assert.ok(b.z < a.z - 0.1, `z ${a.z} -> ${b.z}`);
    await hold(page, 'KeyD', 700);
    const c = await L.pos(page);
    assert.ok(c.x > b.x + 0.1, `x ${b.x} -> ${c.x}`);
    await hold(page, 'KeyS', 700);
    assert.ok((await L.pos(page)).z > b.z + 0.05);
  });
  await test('Desktop: Pfeiltasten laufen/drehen, Maus-Ziehen schaut um', D7, false, async (page) => {
    await L.enter(page);
    const a = await L.pos(page);
    await hold(page, 'ArrowUp', 600);
    assert.ok((await L.pos(page)).z < a.z - 0.1);
    const y0 = (await L.pos(page)).yaw;
    await holdUntil(page, 'ArrowLeft', 'pos.yaw > a + 0.3', y0);
    const y1 = (await L.pos(page)).yaw;
    assert.ok(y1 > y0 + 0.3, `Pfeil links: yaw ${y0} -> ${y1}`);
    await page.mouse.move(640, 700);
    await page.mouse.down();
    await page.mouse.move(740, 700, { steps: 5 });
    await page.mouse.up();
    assert.ok(Math.abs((await L.pos(page)).yaw - y1) > 0.2, 'Maus-Ziehen ändert Blickrichtung nicht');
  });
  await test('Kollision: alle vier Wände von Raum 0 und 1 halten (Abstand 0,3–0,7 m)', D7, false, async (page) => {
    await L.enter(page);
    const rooms = await getRooms(page);
    for (const r of rooms.slice(0, 2)) {
      for (const wall of ['n', 's', 'w', 'e']) {
        await setPose(page, await clearApproach(page, r, wall));
        const stop = await walkUntilStuck(page, 'KeyW', FIELD(wall));
        const dist = Math.abs(stop - PLANE(r, wall));
        assert.ok(dist > 0.3 && dist < 0.7, `Raum ${r.id} Wand ${wall}: Abstand ${dist.toFixed(2)}`);
      }
    }
  });
  await test('Kollision: neben der Tür und an der Laibung hält die Wand (kein Durchlaufen im Spalt)', D7, false, async (page) => {
    await L.enter(page);
    const r = (await getRooms(page))[0];
    const d = r.doors[0];
    for (const off of [d.width / 2 + 0.5, -(d.width / 2 + 0.5), d.width / 2 - 0.2, -(d.width / 2 - 0.2)]) {
      const p = beforeDoor(r, d);
      await setPose(page, { ...p, z: d.center + off });
      const x = await walkUntilStuck(page, 'KeyW', 'x');
      assert.ok(x < r.x1 - 0.3, `Versatz ${off}: durch die Wand/Laibung gelaufen, x=${x}`);
    }
  });
  await test('Kollision: Per Tastatur durch die Tür in den nächsten Raum (und wieder zurück)', D7, false, async (page) => {
    await L.enter(page);
    const rooms = await getRooms(page);
    const d = rooms[0].doors[0];
    await setPose(page, beforeDoor(rooms[0], d));
    await holdUntil(page, 'KeyW', `pos.room === 1 && pos.x > ${rooms[1].x0 + 1.5}`);
    const p = await L.pos(page);
    assert.strictEqual(await page.evaluate(([x, z]) => window.__museum.roomAt(x, z), [p.x, p.z]), 1, `nicht in Raum 1: ${JSON.stringify(p)}`);
    await holdUntil(page, 'KeyS', `pos.room === 0 && pos.x < ${rooms[0].x1 - 1.5}`);
    assert.strictEqual((await L.pos(page)).room, 0, 'zurück in Raum 0');
  });
  await test('Alle Räume per simulierter Eingabe zu Fuß erreichbar (echte Kollision, 13 Bilder)', D7, false, async (page) => {
    const reached = await reachAllRooms(page, 13);
    assert.deepStrictEqual(reached, [1, 2, 3]);
  });
}

async function suiteMobile() {
  console.log('Steuerung Handy (iPhone 13, Touch)');
  await test('Handy: Joystick-Touch bewegt die Kamera, Loslassen stoppt', D7, true, async (page) => {
    assert.ok(await page.locator('#joystick').isHidden(), 'Joystick vor dem Eintreten sichtbar');
    await L.enter(page);
    assert.ok(await page.locator('#joystick').isVisible(), 'Joystick nach dem Eintreten nicht sichtbar');
    const c = await joystickCenter(page);
    const a = await L.pos(page);
    await L.touch.start(page, [{ x: c.x, y: c.y, id: 1 }]);
    await L.touch.move(page, [{ x: c.x, y: c.y - 40, id: 1 }]);
    await page.waitForTimeout(900);
    const b = await L.pos(page);
    assert.ok(b.z < a.z - 0.1, `Joystick vor: z ${a.z} -> ${b.z}`);
    await L.touch.end(page);
    await page.waitForTimeout(200);
    const s1 = await L.pos(page);
    await page.waitForTimeout(500);
    assert.ok(Math.abs((await L.pos(page)).z - s1.z) < 1e-6, 'bewegt sich nach Loslassen weiter');
    await L.touch.start(page, [{ x: c.x, y: c.y, id: 1 }]);
    await L.touch.move(page, [{ x: c.x + 40, y: c.y, id: 1 }]);
    await page.waitForTimeout(700);
    await L.touch.end(page);
    assert.ok((await L.pos(page)).x > s1.x + 0.1, 'Joystick rechts ändert x nicht');
  });
  await test('Handy: Wischen schaut um; Joystick + Wischen gleichzeitig (Multi-Touch)', D7, true, async (page) => {
    await L.enter(page);
    const c = await joystickCenter(page);
    const y0 = (await L.pos(page)).yaw;
    await L.touch.start(page, [{ x: 250, y: 300, id: 7 }]);
    for (let i = 1; i <= 6; i++) await L.touch.move(page, [{ x: 250 + i * 15, y: 300, id: 7 }]);
    await L.touch.end(page);
    assert.ok(Math.abs((await L.pos(page)).yaw - y0) > 0.2, 'Wischen ändert yaw nicht');
    const a = await L.pos(page);
    await L.touch.start(page, [{ x: c.x, y: c.y, id: 1 }]);
    await L.touch.move(page, [{ x: c.x, y: c.y - 40, id: 1 }]);
    await L.touch.start(page, [{ x: c.x, y: c.y - 40, id: 1 }, { x: 250, y: 300, id: 2 }]);
    for (let i = 1; i <= 6; i++) await L.touch.move(page, [{ x: c.x, y: c.y - 40, id: 1 }, { x: 250 - i * 15, y: 300, id: 2 }]);
    await page.waitForTimeout(500);
    const b = await L.pos(page);
    await L.touch.end(page);
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 0.1, 'Joystick bewegt nicht neben dem Wischen');
    assert.ok(Math.abs(b.yaw - a.yaw) > 0.2, 'Wischen neben dem Joystick ändert yaw nicht');
  });
  await test('Handy: Laufen gegen die Nordwand von Raum 0 bleibt in den Grenzen', D7, true, async (page) => {
    await L.enter(page);
    const r = (await getRooms(page))[0];
    await setPose(page, await clearApproach(page, r, 'n'));
    const c = await joystickCenter(page);
    await L.touch.start(page, [{ x: c.x, y: c.y, id: 1 }]);
    await L.touch.move(page, [{ x: c.x, y: c.y - 46, id: 1 }]);
    await page.waitForTimeout(5000);
    const z = (await L.pos(page)).z;
    await L.touch.end(page);
    assert.ok(z > r.z0 + 0.3 && z < r.z0 + 0.7, `z=${z}, Wand bei ${r.z0}`);
  });
  await test('Handy: Mit dem Joystick durch die Tür in den nächsten Raum', D7, true, async (page) => {
    await L.enter(page);
    const rooms = await getRooms(page);
    await setPose(page, beforeDoor(rooms[0], rooms[0].doors[0]));
    const c = await joystickCenter(page);
    await L.touch.start(page, [{ x: c.x, y: c.y, id: 1 }]);
    await L.touch.move(page, [{ x: c.x, y: c.y - 46, id: 1 }]);
    await page.waitForFunction((x) => window.__museum.pos.room === 1 && window.__museum.pos.x > x, rooms[1].x0 + 1.5, { timeout: 20000 });
    await L.touch.end(page);
    assert.strictEqual((await L.pos(page)).room, 1);
  });
}

async function suiteLightbox() {
  console.log('Großansicht');
  await test('Desktop: Klick auf Bild öffnet Großansicht (Titel, Datum, Text, Bild)', D7, false, async (page) => {
    await L.enter(page);
    const cases = [[0, 'Erster Ausflug', '1. Mai 2021', 'Ein sonniger Tag am See.'],
      [3, 'Unser erster Urlaub mit einem sehr langen Titel, der nicht aufs Schild passt', '12. Juni 2023', 'Italien, Pizza, Meer.'],
      [2, 'Sommerabend auf dem Balkon', '20. August 2022', ''],
      [6, 'Zufallsfoto', '', 'Ohne Datum, aber nicht ohne Herz.']];
    for (const [i, titel, datum, text] of cases) {
      await page.evaluate((n) => window.__museum.faceEntry(n), i);
      await page.waitForTimeout(500);
      const p = await page.evaluate((n) => window.__museum.screenPositionOf(n), i);
      assert.ok(p.visible, `Bild ${i} nicht sichtbar`);
      await page.mouse.click(p.x, p.y);
      await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
      assert.strictEqual(await page.locator('#lb-titel').innerText(), titel);
      assert.strictEqual(await page.locator('#lb-datum').innerText(), datum);
      assert.strictEqual(await page.locator('#lb-text').innerText(), text);
      await page.waitForFunction(() => document.getElementById('lb-img').naturalWidth > 0);
      if (i === 0) await page.screenshot({ path: path.join(SHOTS, 'desktop-gross.jpg'), type: 'jpeg', quality: 70 });
      await page.keyboard.press('Escape');
      await page.waitForSelector('#lightbox', { state: 'hidden' });
    }
  });
  await test('Wand verdeckt: Tippen auf ein Bild im Nachbarraum hinter der Wand öffnet nichts', D7, false, async (page) => {
    await L.enter(page);
    const [r0, r1] = await getRooms(page);
    const door = r0.doors[0];
    const from = { x: r0.x1 - 1.5, z: (await clearApproach(page, r0, 'e')).z };
    const crossZ = (s) => from.z + ((r0.x1 + 0.075 - from.x) / (s.x - from.x)) * (s.z - from.z);
    const slot = r1.slots.find((s) => s.x > r0.x1 && Math.abs(crossZ(s) - door.center) > door.width / 2 + 0.3);
    assert.ok(slot, 'kein Bild hinter der Wand gefunden');
    const dx = slot.x - from.x;
    const dz = slot.z - from.z;
    await setPose(page, { ...from, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(slot.y - 1.65, Math.hypot(dx, dz)) });
    await page.waitForTimeout(500);
    const p = await page.evaluate((i) => window.__museum.screenPositionOf(i), slot.index);
    assert.ok(p.visible, 'Bild liegt nicht im Bildausschnitt (Testaufbau)');
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(500);
    assert.ok(await page.locator('#lightbox').isHidden(), 'Großansicht trotz Wand');
    await page.evaluate((i) => window.__museum.faceEntry(i), slot.index); // Kontrolle: frei davor öffnet es
    await page.waitForTimeout(500);
    const q = await page.evaluate((i) => window.__museum.screenPositionOf(i), slot.index);
    await page.mouse.click(q.x, q.y);
    await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
  });
  await test('Handy: Tippen öffnet Großansicht, Schließen per Knopf und Tippen daneben', D7, true, async (page) => {
    await L.enter(page);
    await page.evaluate(() => window.__museum.faceEntry(1));
    await page.waitForTimeout(500);
    const p = await page.evaluate(() => window.__museum.screenPositionOf(1));
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
    assert.strictEqual(await page.locator('#lb-titel').innerText(), 'Valentinstag');
    assert.strictEqual(await page.locator('#lb-datum').innerText(), '14. Februar 2022');
    await page.waitForTimeout(400);
    await page.touchscreen.tap(195, 8);
    await page.waitForSelector('#lightbox', { state: 'hidden' });
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForSelector('#lightbox:not([hidden])');
    await page.locator('#lb-close').tap();
    await page.waitForSelector('#lightbox', { state: 'hidden' });
  });
  await test('Handy: Wischen über ein Bild öffnet nichts (Bewegungsschwelle)', D7, true, async (page) => {
    await L.enter(page);
    await page.evaluate(() => window.__museum.faceEntry(0));
    await page.waitForTimeout(500);
    const p = await page.evaluate(() => window.__museum.screenPositionOf(0));
    const y0 = (await L.pos(page)).yaw;
    await L.touch.start(page, [{ x: p.x, y: p.y, id: 3 }]);
    for (let i = 1; i <= 5; i++) await L.touch.move(page, [{ x: p.x + i * 12, y: p.y, id: 3 }]);
    await L.touch.end(page);
    await page.waitForTimeout(300);
    assert.ok(await page.locator('#lightbox').isHidden(), 'Wischen öffnete die Großansicht');
    assert.ok(Math.abs((await L.pos(page)).yaw - y0) > 0.1);
  });
  await test('Während der Großansicht läuft die Kamera nicht weiter', D7, false, async (page) => {
    await L.enter(page);
    await page.evaluate(() => window.__museum.faceEntry(0));
    await page.waitForTimeout(400);
    const p = await page.evaluate(() => window.__museum.screenPositionOf(0));
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('#lightbox:not([hidden])');
    const a = await L.pos(page);
    await hold(page, 'KeyW', 500);
    const b = await L.pos(page);
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) < 1e-6);
  });
}

(async () => {
  browser = await L.launch();
  for (const d of ['data-0.json', 'data-1.json', D7]) servers[d] = await L.startServer(d);
  try {
    await loadLayouts();
    await suiteStart();
    await suiteLayout();
    await suiteWorld();
    await suiteDesktop();
    await suiteMobile();
    await suiteLightbox();
  } finally {
    await browser.close();
    for (const s of Object.values(servers)) await s.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length} Tests gelaufen, ${results.length - failed.length} grün, ${failed.length} rot`);
  if (results.length === 0 || failed.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
