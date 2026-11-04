// Kern-Tests Teil 2: Speicher (dispose), Start-Blick, schwebender Joystick, Blickgrenze, Pixelrate/FOV, Bild- und Türgrößen.
const assert = require('assert');

const PITCH_MAX = (35 * Math.PI) / 180;
const ASPECTS = [[1600, 1200], [1200, 1600], [1200, 1200], [1600, 900], [900, 1600], [1500, 1000], [1000, 1500]];

async function memory({ L, test, D40, setPose }) {
  await test('Speicher: weit entfernte Räume geben Texturen frei und werden ausgeblendet (40 Bilder, < 30 Texturen)', D40, false, async (page) => {
    await L.enter(page);
    const rooms = await page.evaluate(() => window.__museum.rooms);
    assert.strictEqual(rooms.length, 10);
    let peak = 0;
    for (const r of rooms) {
      await setPose(page, { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
      const want = rooms.filter((o) => Math.abs(o.id - r.id) <= 1).reduce((s, o) => s + o.slots.length, 0);
      await page.waitForFunction(([id, n]) => {
        const m = window.__museum;
        return [id - 1, id, id + 1].reduce((s, k) => s + (k >= 0 && k < m.rooms.length ? m.loadedIn(k) : 0), 0) >= n;
      }, [r.id, want], { timeout: 30000 });
      peak = Math.max(peak, await page.evaluate(() => window.__museum.texturesLoaded()));
    }
    assert.ok(peak < 30, `bis zu ${peak} Bildtexturen gleichzeitig geladen`);
    const last = rooms.length - 1;
    await page.waitForFunction((l) => window.__museum.rooms.every((r) => Math.abs(r.id - l) <= 2 || (window.__museum.loadedIn(r.id) === 0 && !window.__museum.roomVisible(r.id))),
      last, { timeout: 15000 }).catch(() => {}); // Rest prüft die Schleife unten mit Meldung
    for (const r of rooms) {
      const far = Math.abs(r.id - last) > 2;
      const [loaded, visible] = await page.evaluate((id) => [window.__museum.loadedIn(id), window.__museum.roomVisible(id)], r.id);
      if (far) assert.deepStrictEqual([loaded, visible], [0, false], `Raum ${r.id} (fern): ${loaded} Texturen, sichtbar ${visible}`);
      else assert.strictEqual(visible, true, `Raum ${r.id} (nah) unsichtbar`);
    }
    assert.ok(await page.evaluate(() => window.__museum.texturesLoaded()) < 30);
    console.log(`       Spitze ${peak} Bildtexturen, GPU-Texturen gesamt: ${await page.evaluate(() => window.__museum.gpuTextures())}`);
    await setPose(page, { x: (rooms[0].x0 + rooms[0].x1) / 2, z: (rooms[0].z0 + rooms[0].z1) / 2 });
    await page.waitForFunction((n) => window.__museum.loadedIn(0) === n, rooms[0].slots.length, { timeout: 30000 });
    assert.ok(await page.evaluate(() => window.__museum.roomVisible(0)), 'Raum 0 nach der Rückkehr unsichtbar');
  });
}

// Blickfeld-Prüfung im Seitenkontext: Tür zum nächsten Raum und mindestens ein Bild liegen im echten Frustum.
function frustumReport(args) {
  return import('three').then(async (THREE) => {
    const [{ buildLayout, startPose }, { createWalkable, EYE }, { THEMES, buildTheme }] = await Promise.all([
      import('./js/layout.js'), import('./js/player.js'), import('./js/themes/index.js')]);
    const inView = (pose, rooms, aspect, fov) => {
      const cam = new THREE.PerspectiveCamera(fov, aspect, 0.1, 160);
      cam.rotation.order = 'YXZ';
      cam.position.set(pose.x, EYE, pose.z);
      cam.rotation.set(pose.pitch, pose.yaw, 0);
      cam.updateMatrixWorld();
      const f = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      const d = rooms[0].doors.find((q) => q.to === 1);
      const dp = d && { e: [rooms[0].x1, d.center], w: [rooms[0].x0, d.center], s: [d.center, rooms[0].z1], n: [d.center, rooms[0].z0] }[d.wall];
      const door = !d || f.containsPoint(new THREE.Vector3(dp[0], d.height / 2, dp[1]));
      const pics = rooms[0].slots.filter((s) => f.containsPoint(new THREE.Vector3(s.x, s.y, s.z))).length;
      return { door, pics, hasDoor: Boolean(d) };
    };
    if (args.live) {
      const m = window.__museum;
      return [{ n: 'live', ...inView(m.pos, m.rooms, innerWidth / innerHeight, m.fov()) }];
    }
    const out = [];
    for (const n of args.counts) {
      const items = Array.from({ length: n }, (_, i) => ({ breite: args.asp[i % args.asp.length][0], hoehe: args.asp[i % args.asp.length][1] }));
      const rooms = buildLayout(items, THEMES);
      const walk = createWalkable(rooms, rooms.map((r, i) => (i === 0 ? buildTheme(r.theme, r).obstacles : [])));
      const pose = startPose(rooms[0], walk.canStand, EYE);
      for (const [aspect, fov] of args.cams) out.push({ n, aspect, ...inView(pose, rooms, aspect, fov), stands: walk.canStand(pose.x, pose.z) });
    }
    return out;
  });
}

async function startView({ L, test, plain, D7, D40, browser, servers }) {
  await test('Start-Blick: Tür zum nächsten Raum und ein Bild im Frustum (Handy-Hochformat, Tablet, Desktop; 1–40 Bilder)', D7, false, async (page) => {
    const counts = Array.from({ length: 40 }, (_, i) => i + 1);
    const cams = [[0.43, 80], [0.46, 80], [0.5625, 80], [0.75, 80], [1.6, 62], [1.78, 62]];
    const rep = await page.evaluate(frustumReport, { counts, asp: ASPECTS, cams });
    const bad = rep.filter((r) => !r.door || r.pics < 1 || !r.stands);
    assert.deepStrictEqual(bad, [], `Start-Blick unvollständig bei: ${bad.map((b) => `n=${b.n}/${b.aspect}`).join(' ')}`);
    assert.ok(rep.some((r) => r.hasDoor) && rep.some((r) => !r.hasDoor), 'Test deckt Räume mit und ohne Tür ab');
  });
  for (const [data, mobile] of [[D7, false], [D7, true], [D40, true]]) {
    await test(`Start-Blick live (${data}, ${mobile ? 'Handy' : 'Desktop'}): Tür und Bild im Frustum der echten Kamera`, data, mobile, async (page) => {
      await L.enter(page);
      const [r] = await page.evaluate(frustumReport, { live: true });
      assert.ok(r.door && r.hasDoor && r.pics >= 1, JSON.stringify(r));
      assert.ok(Math.abs((await L.pos(page)).pitch) < 0.1);
    });
  }
}

const frac = (page, fx, fy) => page.evaluate(([a, b]) => ({ x: Math.round(innerWidth * a), y: Math.round(innerHeight * b) }), [fx, fy]);
const joyState = (page) => page.evaluate(() => {
  const el = document.getElementById('joystick');
  return { aktiv: el.classList.contains('aktiv'), left: parseFloat(el.style.left), top: parseFloat(el.style.top) };
});

async function joystick({ L, test }) {
  const D7 = 'data-7.json';
  await test('Schwebender Joystick: erscheint unter dem Daumen, nur in der Zone unten links (45 % × 40 %)', D7, true, async (page) => {
    await L.enter(page);
    const cases = [[0.3, 0.8, true], [0.44, 0.62, true], [0.02, 0.98, true], [0.5, 0.8, false], [0.3, 0.55, false], [0.8, 0.5, false]];
    for (const [fx, fy, expected] of cases) {
      const p = await frac(page, fx, fy);
      await L.touch.start(page, [{ x: p.x, y: p.y, id: 1 }]);
      const s = await joyState(page);
      await L.touch.end(page);
      assert.strictEqual(s.aktiv, expected, `Touch bei (${fx}, ${fy}): aktiv=${s.aktiv}`);
      if (expected) assert.ok(Math.abs(s.left - p.x) < 1 && Math.abs(s.top - p.y) < 1, `Joystick bei ${s.left},${s.top} statt ${p.x},${p.y}`);
      assert.strictEqual((await joyState(page)).aktiv, false, 'Joystick nach dem Loslassen noch aktiv');
    }
  });
  await test('Schwebender Joystick: Touch bei (30 %, 80 %) bewegt, Touch bei (80 %, 50 %) dreht', D7, true, async (page) => {
    await L.enter(page);
    const a = await L.pos(page);
    const g = await frac(page, 0.3, 0.8);
    await L.touch.start(page, [{ x: g.x, y: g.y, id: 1 }]);
    await L.touch.move(page, [{ x: g.x, y: g.y - 40, id: 1 }]);
    await page.waitForTimeout(900);
    const b = await L.pos(page);
    await L.touch.end(page);
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 0.1, 'Daumen in der Zone bewegt nicht');
    assert.ok(Math.abs(b.yaw - a.yaw) < 1e-6, 'Joystick drehte mit');
    const s = await frac(page, 0.8, 0.5);
    const c = await L.pos(page);
    await L.touch.start(page, [{ x: s.x, y: s.y, id: 3 }]);
    for (let i = 1; i <= 6; i++) await L.touch.move(page, [{ x: s.x - i * 15, y: s.y, id: 3 }]);
    assert.ok(!(await joyState(page)).aktiv, 'Wischen außerhalb der Zone aktivierte den Joystick');
    await L.touch.end(page);
    const d = await L.pos(page);
    assert.ok(Math.abs(d.yaw - c.yaw) > 0.2, 'Wischen außerhalb der Zone dreht nicht');
    assert.ok(Math.hypot(d.x - c.x, d.z - c.z) < 0.05, 'Wischen außerhalb der Zone bewegt');
  });
}

async function joystickMulti({ L, test }) {
  const D7 = 'data-7.json';
  await test('Schwebender Joystick: zwei Finger – Zone läuft, Rest schaut um', D7, true, async (page) => {
    await L.enter(page);
    const a = await L.pos(page);
    const g = await frac(page, 0.25, 0.8);
    const s = await frac(page, 0.75, 0.4);
    await L.touch.start(page, [{ x: g.x, y: g.y, id: 1 }]);
    await L.touch.move(page, [{ x: g.x, y: g.y - 40, id: 1 }]);
    await L.touch.start(page, [{ x: g.x, y: g.y - 40, id: 1 }, { x: s.x, y: s.y, id: 2 }]);
    for (let i = 1; i <= 6; i++) await L.touch.move(page, [{ x: g.x, y: g.y - 40, id: 1 }, { x: s.x - i * 15, y: s.y, id: 2 }]);
    await page.waitForTimeout(500);
    const b = await L.pos(page);
    await L.touch.end(page);
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) > 0.1 && Math.abs(b.yaw - a.yaw) > 0.2, 'Laufen und Umschauen nicht gleichzeitig');
  });
}

async function look({ L, test, D7 }) {
  /** Wisch mit einem Finger (Pitch vorher auf 0), in Schritten von from nach to. */
  const swipe = async (page, from, to, id = 5, steps = 12) => {
    await page.evaluate(() => window.__museum.setPose({ pitch: 0 }));
    await L.touch.start(page, [{ x: from.x, y: from.y, id }]);
    for (let i = 1; i <= steps; i++) await L.touch.move(page, [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps, id }]);
    await L.touch.end(page);
  };
  await test('Blick: Pitch-Wischen halb so empfindlich wie Yaw-Wischen', D7, true, async (page) => {
    await L.enter(page);
    await page.evaluate(() => window.__museum.setPose({ pitch: 0 }));
    const a = await L.pos(page);
    await swipe(page, { x: 250, y: 250 }, { x: 310, y: 310 });
    const b = await L.pos(page);
    const dyaw = Math.abs(b.yaw - a.yaw);
    const dpitch = Math.abs(b.pitch - a.pitch);
    assert.ok(dyaw > 0.25 && Math.abs(dpitch / dyaw - 0.5) < 0.1, `yaw ${dyaw.toFixed(3)}, pitch ${dpitch.toFixed(3)}`);
  });
  await test('Blick: Pitch bleibt auf ±35° begrenzt (Touch und Maus)', D7, true, async (page) => {
    await L.enter(page);
    await swipe(page, { x: 250, y: 100 }, { x: 250, y: 640 }, 5, 20);
    const up = (await L.pos(page)).pitch;
    await swipe(page, { x: 250, y: 640 }, { x: 250, y: 60 }, 6, 20);
    const down = (await L.pos(page)).pitch;
    assert.ok(Math.abs(up - PITCH_MAX) < 0.01 && Math.abs(down + PITCH_MAX) < 0.01, `pitch ${up} / ${down}`);
    await page.mouse.move(200, 100);
    await page.mouse.down();
    await page.mouse.move(200, 2000, { steps: 5 });
    await page.mouse.up();
    assert.ok(Math.abs((await L.pos(page)).pitch) <= PITCH_MAX + 1e-6);
  });
  await test('Blick: Pitch federt langsam zur Mitte zurück, solange nicht gewischt wird', D7, true, async (page) => {
    await L.enter(page);
    await swipe(page, { x: 250, y: 100 }, { x: 250, y: 600 }, 5, 20);
    const start = (await L.pos(page)).pitch;
    assert.ok(start > 0.5);
    const g = await frac(page, 0.8, 0.5);
    await L.touch.start(page, [{ x: g.x, y: g.y, id: 9 }]); // Finger bleibt liegen: kein Zurückfedern
    await page.waitForTimeout(2500);
    assert.ok(Math.abs((await L.pos(page)).pitch - start) < 0.01, 'federte trotz aufliegendem Finger zurück');
    await L.touch.end(page);
    await page.waitForFunction((s) => window.__museum.pos.pitch < s * 0.5, start, { timeout: 60000, polling: 250 });
    const back = (await L.pos(page)).pitch;
    assert.ok(back < start * 0.5 && back >= 0, `pitch ${back}`);
  });
}

async function display({ L, custom, test, browser, servers, D7 }) {
  const open = async (opts, concurrency) => {
    const page = await L.newPage(browser, opts);
    if (concurrency) await page.addInitScript((n) => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => n }), concurrency);
    await L.openMuseum(page, servers[D7].url);
    return page;
  };
  for (const [cores, max] of [[4, 1.5], [2, 1.5], [8, 2]]) {
    await custom(`Pixelrate: iPhone (DPR 3) mit ${cores} Kernen → ${max}`, async () => {
      const page = await open({ mobile: true }, cores);
      try { assert.strictEqual(await page.evaluate(() => window.__museum.pixelRatio()), max); } finally { await page.context().close(); }
    });
  }
  await custom('Pixelrate Desktop (DPR 1) bleibt 1; FOV Hochformat ≤ 80°, Querformat 62°', async () => {
    const desk = await open({ mobile: false });
    const phone = await open({ mobile: true });
    try {
      assert.strictEqual(await desk.evaluate(() => window.__museum.pixelRatio()), 1);
      assert.strictEqual(await desk.evaluate(() => window.__museum.fov()), 62);
      assert.ok(await phone.evaluate(() => window.__museum.fov()) <= 80);
      await phone.setViewportSize({ width: 300, height: 900 });
      await phone.waitForTimeout(300);
      assert.ok(await phone.evaluate(() => window.__museum.fov()) <= 80, 'FOV im schmalen Hochformat über 80°');
    } finally {
      await desk.context().close();
      await phone.context().close();
    }
  });
  await test('Türen 3,2 m breit, Bilder ~30 % größer (Blickfang ≥ 3,5 m, kleinste ≤ 1,6 m)', D7, false, async (page) => {
    const rooms = await page.evaluate(() => window.__museum.rooms);
    for (const r of rooms) for (const d of r.doors) assert.strictEqual(d.width, 3.2);
    const edges = rooms.flatMap((r) => r.slots.map((s) => Math.max(s.w, s.h)));
    assert.ok(Math.max(...edges) >= 3.5 && Math.min(...edges) <= 1.6, edges.join(','));
  });
}

module.exports = async function suiteKernCore(h) {
  console.log('Kern: Speicher, Start-Blick, Joystick, Blick');
  await memory(h);
  await startView(h);
  await joystick(h);
  await joystickMulti(h);
  await look(h);
  await display(h);
};
