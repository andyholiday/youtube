// Museums-Tests (Playwright + Chromium/SwiftShader). Start: node tests/museum/run.js
// Fixtures liegen eingecheckt unter tests/museum/fixtures (neu erzeugen: python3 tests/museum/make_fixtures.py).
const assert = require('assert');
const path = require('path');
const L = require('./lib');

const SHOTS = path.join(__dirname, 'screenshots');
const results = [];
const servers = {};
let browser;

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

async function test(name, data, mobile, fn) {
  if (process.argv[2] && !name.includes(process.argv[2])) return; // Filter: node run.js <Teilname>
  const t0 = Date.now();
  try {
    await withPage(data, mobile, fn);
    results.push({ name, ok: true });
    console.log(`  ok   ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  FAIL ${name}\n       ${String(err.message).split('\n')[0]}`);
  }
}

const D7 = 'data-7.json';
const hold = async (page, key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
const setPose = (page, p) => page.evaluate((q) => window.__museum.setPose(q), p);
const info = (page) => page.evaluate(() => ({ length: window.__museum.length, count: window.__museum.count }));

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

async function suite() {
  console.log('Seite & Start');
  await test('Seite lädt ohne Konsolenfehler, Titel und 7 Erinnerungen', D7, false, async (page) => {
    assert.match(await page.title(), /Für dich/);
    assert.strictEqual((await info(page)).count, 7);
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

  console.log('Halle & Bilder');
  await test('Halle wächst mit der Anzahl (0 < 7), Bilder im richtigen Seitenverhältnis', D7, false, async (page) => {
    const len7 = (await info(page)).length;
    assert.ok(len7 > 14, `Länge 7 Einträge: ${len7}`);
    const exp = [[1600, 1200], [1200, 1600], [1200, 1200], [1600, 900], [900, 1600], [1500, 1000], [1000, 1500]];
    for (let i = 0; i < exp.length; i++) {
      const s = await page.evaluate((n) => window.__museum.pictureSize(n), i);
      assert.ok(Math.abs(s.w / s.h - exp[i][0] / exp[i][1]) < 1e-3, `Bild ${i}: ${s.w}x${s.h}`);
    }
  });
  await test('Leere Liste: Hinweis im leeren Saal, keine Fehler', 'data-0.json', false, async (page) => {
    await L.enter(page);
    assert.strictEqual((await info(page)).count, 0);
    assert.ok((await info(page)).length <= 14);
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
  await test('Texturen laden lazy: nahe Bilder sofort, ferne erst beim Näherkommen', D7, false, async (page) => {
    await L.enter(page);
    await page.waitForFunction(() => window.__museum.texturesLoaded() >= 1);
    await page.waitForTimeout(1500);
    const before = await page.evaluate(() => window.__museum.texturesLoaded());
    assert.ok(before < 7, `am Start schon ${before} von 7 geladen`);
    await setPose(page, { z: -(await info(page)).length / 2 + 5 });
    await page.waitForFunction(() => window.__museum.texturesLoaded() === 7, null, { timeout: 15000 });
  });

  console.log('Steuerung Desktop');
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
    await hold(page, 'ArrowLeft', 500);
    const y1 = (await L.pos(page)).yaw;
    assert.ok(y1 > y0 + 0.1, `Pfeil links: yaw ${y0} -> ${y1}`);
    await page.mouse.move(640, 700);
    await page.mouse.down();
    await page.mouse.move(740, 700, { steps: 5 });
    await page.mouse.up();
    assert.ok(Math.abs((await L.pos(page)).yaw - y1) > 0.2, 'Maus-Ziehen ändert Blickrichtung nicht');
  });
  await test('Kollision: Stirnwand, Eingangswand und beide Seitenwände halten', D7, false, async (page) => {
    await L.enter(page);
    const len = (await info(page)).length;
    await setPose(page, { x: 0, z: -len / 2 + 3, yaw: 0 });
    const zEnd = await walkUntilStuck(page, 'KeyW', 'z');
    assert.ok(zEnd >= -len / 2 + 0.5 && zEnd < -len / 2 + 2, `Stirnwand: z=${zEnd}`);
    await setPose(page, { x: 0, z: len / 2 - 3, yaw: Math.PI });
    const zIn = await walkUntilStuck(page, 'KeyW', 'z');
    assert.ok(zIn <= len / 2 && zIn > len / 2 - 2, `Eingangswand: z=${zIn}`);
    await setPose(page, { x: 0, z: 0, yaw: Math.PI / 2 });
    const xL = await walkUntilStuck(page, 'KeyW', 'x');
    assert.ok(xL >= -4 && xL < -3, `linke Wand: x=${xL}`);
    await setPose(page, { x: 0, z: 0, yaw: -Math.PI / 2 });
    const xR = await walkUntilStuck(page, 'KeyW', 'x');
    assert.ok(xR <= 4 && xR > 3, `rechte Wand: x=${xR}`);
  });

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
  await test('Handy: Laufen gegen die Stirnwand bleibt in den Grenzen', D7, true, async (page) => {
    await L.enter(page);
    const len = (await info(page)).length;
    await setPose(page, { x: 0, z: -len / 2 + 3, yaw: 0 });
    const c = await joystickCenter(page);
    await L.touch.start(page, [{ x: c.x, y: c.y, id: 1 }]);
    await L.touch.move(page, [{ x: c.x, y: c.y - 46, id: 1 }]);
    await page.waitForTimeout(5000);
    const z = (await L.pos(page)).z;
    await L.touch.end(page);
    assert.ok(z >= -len / 2 + 0.5 && z < -len / 2 + 2, `z=${z}`);
  });

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
      if (i === 0) await page.screenshot({ path: path.join(SHOTS, 'desktop-gross.png') });
      await page.keyboard.press('Escape');
      await page.waitForSelector('#lightbox', { state: 'hidden' });
    }
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
    await suite();
  } finally {
    await browser.close();
    for (const s of Object.values(servers)) await s.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length} Tests gelaufen, ${results.length - failed.length} grün, ${failed.length} rot`);
  if (results.length === 0 || failed.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
