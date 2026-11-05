// Kern-Tests Teil 1: Fehlerpfade, ui-Anbindung (Aufrufe über den Spion aus lib.js), Fokus, Einblenden, Kontextverlust.
const assert = require('assert');

const FATAL_LOAD = 'Die Erinnerungen konnten nicht geladen werden – bitte Seite neu laden.';
const WIDMUNG = { titel: 'Für dich', text: 'In Liebe, für alle Zeit.' };
const names = (calls) => calls.map((c) => c[0]);

const LOAD_FAILURES = [
  ['HTTP 500', (r) => r.fulfill({ status: 500, body: 'kaputt' })],
  ['HTTP 404', (r) => r.fulfill({ status: 404, body: 'weg' })],
  ['kein gültiges JSON', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{kaputt' })],
  ['JSON ohne Feld „erinnerungen“', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"foo":1}' })],
  ['Netzfehler', (r) => r.abort('connectionrefused')],
];

async function waitCall(page, name, pred, timeout = 8000) {
  await page.waitForFunction(([n, p]) => window.__uiCalls.some((c) => c[0] === n && new Function('c', `return ${p}`)(c)),
    [name, pred], { timeout });
}

async function errorPaths({ L, custom, browser, servers, D7 }) {
  for (const [label, handler] of LOAD_FAILURES) {
    await custom(`Ladefehler (${label}) → showFatal mit Text, nie ewig „Lädt …“`, async () => {
      const page = await L.newPage(browser);
      try {
        await page.route('**/erinnerungen.json', handler);
        await page.goto(servers[D7].url);
        await waitCall(page, 'showFatal', 'true');
        const calls = await L.uiCalls(page);
        assert.deepStrictEqual(calls.find((c) => c[0] === 'showFatal'), ['showFatal', FATAL_LOAD]);
        assert.deepStrictEqual(calls[0], ['setLoading', 'Bilder werden aufgehängt …']);
        assert.ok(!names(calls).includes('showEmptyHint') && !names(calls).includes('setReady'), `Aufrufe: ${names(calls)}`);
        assert.ok(await page.locator('#fehler').isVisible(), '#fehler nicht sichtbar');
        assert.match(await page.locator('#fehler').innerText(), /nicht geladen werden/);
      } finally {
        await page.context().close();
      }
    });
  }
}

async function uiCalls({ L, test, custom, browser, servers, D7, D40, hold, setPose }) {
  await test('ui-Aufrufe beim Laden: setLoading → setItems → setWidmung(null) → setReady, ohne CDN', D7, false, async (page) => {
    const calls = await L.uiCalls(page);
    const n = names(calls);
    assert.ok(n.indexOf('setLoading') < n.indexOf('setItems') && n.indexOf('setItems') < n.indexOf('setWidmung') && n.indexOf('setWidmung') < n.indexOf('setReady'), n.join(','));
    assert.strictEqual(calls.find((c) => c[0] === 'setItems')[1].length, 7);
    assert.strictEqual(calls.find((c) => c[0] === 'setWidmung')[1], null);
    assert.deepStrictEqual(await page.evaluate(() => window.__uiMissing), [], 'ui.js fehlen Methoden der Schnittstelle');
    assert.deepStrictEqual(page.external, [], `Anfragen an fremde Hosts: ${page.external}`);
  });
  await test('ui-Aufrufe: Widmung, roomEntered beim Start und Raumwechsel, markInteracted je einmal', D40, false, async (page) => {
    const calls = await L.uiCalls(page);
    assert.deepStrictEqual(calls.find((c) => c[0] === 'setWidmung')[1], WIDMUNG);
    assert.strictEqual(calls.find((c) => c[0] === 'setItems')[1].length, 40);
    assert.deepStrictEqual(await L.uiCalls(page, 'roomEntered'), [], 'roomEntered vor dem Eintreten');
    await L.enter(page);
    assert.deepStrictEqual(await L.uiCalls(page, 'roomEntered'), [['roomEntered', { id: 0, theme: 'modern' }]]);
    await page.keyboard.down('KeyW'); // halten, bis die Bewegung bemerkt wurde (Bildrate im Software-Renderer schwankt)
    try { await page.waitForFunction(() => window.__uiCalls.some((c) => c[0] === 'markInteracted' && c[1] === 'move'), null, { timeout: 20000 }); } finally { await page.keyboard.up('KeyW'); }
    await page.mouse.move(640, 700);
    await page.mouse.down();
    await page.mouse.move(700, 700, { steps: 4 });
    await page.mouse.up();
    assert.deepStrictEqual(await L.uiCalls(page, 'markInteracted'), [['markInteracted', 'move'], ['markInteracted', 'look']]);
    const r1 = (await page.evaluate(() => window.__museum.rooms))[1];
    await setPose(page, { x: (r1.x0 + r1.x1) / 2, z: (r1.z0 + r1.z1) / 2 });
    await waitCall(page, 'roomEntered', 'c[1].id === 1');
    assert.deepStrictEqual((await L.uiCalls(page, 'roomEntered')).map((c) => c[1].id), [0, 1]);
  });
  await test('Großansicht: openLightbox bekommt den Index des angetippten Bildes', D7, false, async (page) => {
    await L.enter(page);
    for (const i of [3, 6]) {
      await page.evaluate((n) => window.__museum.faceEntry(n), i);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
      const p = await page.evaluate((n) => window.__museum.screenPositionOf(n), i);
      await page.mouse.click(p.x, p.y);
      await waitCall(page, 'openLightbox', `c[1] === ${i}`);
      await page.keyboard.press('Escape');
      await page.waitForSelector('#lightbox', { state: 'hidden' });
    }
  });
}

async function focus({ L, test, D7 }) {
  const focusIdx = async (page) => (await L.uiCalls(page, 'focusChanged')).map((c) => c[1]);
  await test('focusChanged: Bild mittig < 6 m, nur bei Änderung; wegschauen → null', D7, false, async (page) => {
    await L.enter(page);
    await page.evaluate(() => window.__museum.faceEntry(2));
    await waitCall(page, 'focusChanged', 'c[1] === 2');
    await page.waitForTimeout(800);
    const before = await focusIdx(page);
    assert.strictEqual(before.filter((i) => i === 2).length, 1, `mehrfach gemeldet: ${before}`);
    const yaw = (await L.pos(page)).yaw;
    await page.evaluate((y) => window.__museum.setPose({ yaw: y + Math.PI }), yaw);
    await waitCall(page, 'focusChanged', 'c[1] === null');
    const all = await focusIdx(page);
    all.forEach((v, i) => assert.notStrictEqual(v, all[i - 1], `Wiederholung ${v} in ${all}`));
  });
  await test('focusChanged: zu weit weg (> 6 m) zählt nicht, gedrosselt auf ~5×/s', D7, false, async (page) => {
    await L.enter(page);
    await page.evaluate(() => window.__museum.faceEntry(2));
    await waitCall(page, 'focusChanged', 'c[1] === 2');
    const s = await page.evaluate(() => window.__museum.rooms.flatMap((r) => r.slots).find((x) => x.index === 2));
    const back = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[s.wall];
    await page.evaluate(([x, z]) => window.__museum.setPose({ x, z }), [s.x + back[0] * 5.5, s.z + back[1] * 5.5]);
    await page.waitForTimeout(600);
    const n0 = (await focusIdx(page)).length;
    // schnelles Hin- und Herdrehen: höchstens ~5 Meldungen pro Sekunde
    await page.evaluate(() => { const y = window.__museum.pos.yaw; let k = 0; window.__spin = setInterval(() => window.__museum.setPose({ yaw: y + (k++ % 2) * Math.PI }), 25); });
    await page.waitForTimeout(2000);
    await page.evaluate(() => clearInterval(window.__spin));
    const n1 = (await focusIdx(page)).length;
    assert.ok(n1 - n0 <= 11, `${n1 - n0} focusChanged in 2 s`);
  });
}

async function focusBlocked({ L, test, D7 }) {
  await test('focusChanged: Wand oder Deko vor dem Bild verdeckt es', D7, false, async (page) => {
    await L.enter(page);
    await page.evaluate(() => window.__museum.faceEntry(2));
    await waitCall(page, 'focusChanged', 'c[1] === 2');
    await page.evaluate(async () => {
      const THREE = await import('three');
      const m = window.__museum;
      const p = m.pos;
      const s = m.rooms.flatMap((r) => r.slots).find((x) => x.index === 2);
      const blocker = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      blocker.position.set((p.x + s.x) / 2, 1.65, (p.z + s.z) / 2);
      blocker.lookAt(p.x, 1.65, p.z);
      m.themeGroup(p.room).add(blocker);
      window.__blocker = blocker;
    });
    await waitCall(page, 'focusChanged', 'c[1] === null');
    await page.evaluate(() => window.__blocker.removeFromParent());
    await page.waitForFunction(() => window.__uiCalls.filter((c) => c[0] === 'focusChanged').pop()[1] === 2);
  });
}

async function fadeAndContext({ L, custom, browser, servers }) {
  await custom('Bilder blenden ein: erst unsichtbar, dann Opacity 0 → 1', async () => {
    const page = await L.newPage(browser);
    try {
      await page.route('**/erinnerungen/*.jpg', async (r) => { await new Promise((res) => setTimeout(res, 1200)); await r.continue(); });
      await page.goto(servers['data-1.json'].url);
      await page.waitForFunction(() => window.__museum && window.__museum.ready);
      const before = await page.evaluate(() => window.__museum.pictureFade(0));
      assert.deepStrictEqual([before.visible, before.loaded], [false, false], 'Platzhalter vor dem Laden sichtbar');
      await page.waitForFunction(() => !document.getElementById('start-btn').disabled, null, { timeout: 15000 });
      const samples = await page.evaluate(() => new Promise((resolve) => {
        const out = [];
        const t0 = performance.now();
        (function tick() {
          const f = window.__museum.pictureFade(0);
          out.push(f.opacity);
          if (f.opacity >= 1 || performance.now() - t0 > 10000) resolve(out); else requestAnimationFrame(tick);
        }());
      }));
      assert.ok(samples.length >= 3 && samples[0] < 0.5 && samples.at(-1) === 1, `Verlauf: ${samples.map((v) => v.toFixed(2))}`);
      assert.deepStrictEqual([...samples].sort((a, b) => a - b), samples, 'Opacity nicht aufsteigend');
      assert.deepStrictEqual(page.errors, []);
    } finally {
      await page.context().close();
    }
  });
  await custom('webglcontextlost → Seite lädt neu', async () => {
    const page = await L.newPage(browser);
    try {
      await L.openMuseum(page, servers['data-1.json'].url);
      await page.evaluate(() => { window.__marker = 1; });
      await Promise.all([page.waitForEvent('load', { timeout: 20000 }), page.evaluate(() => {
        const gl = document.getElementById('szene').getContext('webgl2') || document.getElementById('szene').getContext('webgl');
        gl.getExtension('WEBGL_lose_context').loseContext();
      })]);
      await L.openMuseum(page, servers['data-1.json'].url);
      assert.strictEqual(await page.evaluate(() => window.__marker), undefined, 'Seite wurde nicht neu geladen');
    } finally {
      await page.context().close();
    }
  });
}

module.exports = async function suiteKernUi(h) {
  console.log('Kern: Fehlerpfade & ui-Anbindung');
  await errorPaths(h);
  await uiCalls(h);
  await focus(h);
  await focusBlocked(h);
  await fadeAndContext(h);
};
