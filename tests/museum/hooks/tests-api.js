// Geometrie und Oberfläche der ctx-Schnittstelle: collide, wallDistance, hud, overlayRoot, addStyle, toast.
const assert = require('assert');
const { withPage, facePicture, open } = require('./helpers');

const tests = [];
const t = (name, fn) => tests.push([name, fn]);

t('collide: Wand und frei, Türlaibung, Spalt neben der Tür', async () => {
  await withPage({}, async (page) => {
    const out = await page.evaluate(() => {
      const c = window.__ctx;
      const r = c.rooms[0];
      const d = r.doors[0]; // Raum 0 hat nur die Tür nach Osten
      const gap = 0.3;
      const start = window.__museum.pos;
      return {
        free: c.collide(start.x, start.z, 0.45),
        westWall: c.collide(r.x0 + 0.2, (r.z0 + r.z1) / 2, 0.3),
        westTouch: c.collide(r.x0 + 0.3, r.z0 + 1.2, 0.3),
        outside: c.collide(r.x0 - 5, r.z0 - 5, 0.1),
        doorWall: d.wall,
        doorOpen: c.collide(r.x1 + gap / 2, d.center, 0.2),
        besideDoor: c.collide(r.x1 + gap / 2, d.center + d.width / 2 + 0.1, 0.2),
        jamb: c.collide(r.x1 + gap / 2, d.center + d.width / 2 - 0.1, 0.3),
        jambFree: c.collide(r.x1 + gap / 2, d.center + d.width / 2 - 0.3, 0.3),
      };
    });
    assert.deepStrictEqual(out, { free: false, westWall: true, westTouch: false, outside: true, doorWall: 'e',
      doorOpen: false, besideDoor: true, jamb: true, jambFree: false });
  });
});

t('collide(x, z, 0.45) stimmt auf einem Raster in Raum 0–2 mit der Spielerkollision überein; Hindernisse zählen', async () => {
  await withPage({}, async (page) => {
    const out = await page.evaluate(() => {
      const c = window.__ctx;
      const walk = window.__museum.walk;
      let n = 0;
      let obstacle = 0;
      const bad = [];
      for (const r of c.rooms.slice(0, 3)) {
        for (let x = r.x0 - 1.1; x < r.x1 + 1.1; x += 0.37) {
          for (let z = r.z0 - 1.1; z < r.z1 + 1.1; z += 0.37) {
            n++;
            const hit = c.collide(x, z, 0.45);
            if (hit === walk.canStand(x, z)) bad.push([x, z]);
            const inner = x > r.x0 + 0.5 && x < r.x1 - 0.5 && z > r.z0 + 0.5 && z < r.z1 - 0.5;
            if (inner && hit) obstacle++;
          }
        }
      }
      return { n, bad: bad.slice(0, 5), obstacle };
    });
    assert.ok(out.n > 500, `nur ${out.n} Punkte`);
    assert.deepStrictEqual(out.bad, [], 'collide weicht von createWalkable ab');
    assert.ok(out.obstacle > 0, 'kein Hindernis im Raster gefunden');
  });
});

t('wallDistance: Wand, frei, durch die Tür frei, über der Tür (Wand) blockiert, Länge 0', async () => {
  await withPage({}, async (page) => {
    const out = await page.evaluate(() => {
      const c = window.__ctx;
      const V = (x, y, z) => new c.THREE.Vector3(x, y, z);
      const r = c.rooms[0];
      const d = r.doors[0];
      const s = window.__museum.pos;
      const cz = d.center;
      return {
        up: c.wallDistance(V(s.x, 1.65, s.z), V(s.x, 2.65, s.z)),
        north: c.wallDistance(V(s.x, 1.65, r.z0 + 1), V(s.x, 1.65, r.z0 - 3)),
        throughDoor: c.wallDistance(V(r.x1 - 2, 1.65, cz), V(r.x1 + 2.3, 1.65, cz)),
        aboveDoor: c.wallDistance(V(r.x1 - 2, 5, cz), V(r.x1 + 2.3, 5, cz)),
        zero: c.wallDistance(V(s.x, 1.65, s.z), V(s.x, 1.65, s.z)),
        plain: c.wallDistance({ x: s.x, y: 1.65, z: r.z0 + 1 }, { x: s.x, y: 1.65, z: r.z0 - 3 }),
      };
    });
    assert.strictEqual(out.up, null);
    assert.ok(out.north !== null && out.north > 0.05 && out.north <= 1.05, `Nordwand: ${out.north}`);
    assert.strictEqual(out.throughDoor, null, 'Tür ist frei');
    assert.ok(out.aboveDoor !== null && Math.abs(out.aboveDoor - 2) < 0.2, `über der Tür: ${out.aboveDoor}`);
    assert.strictEqual(out.zero, null);
    assert.strictEqual(out.plain, out.north, 'einfache {x,y,z}-Objekte werden wie Vector3 behandelt');
  });
});

t('ui.hud: oben rechts, unter dem Zähler, ≥ 44 px, erst nach Eintreten, klickbar ohne Laufen/Tippen (Desktop)', async () => {
  await hudTest(false);
});
t('ui.hud: Handy (Hochformat, Safe-Area, Tippen auf den Knopf)', async () => {
  await hudTest(true);
});

async function hudTest(mobile) {
  await withPage({ mobile, enter: false }, async (page) => {
    const add = () => page.evaluate(() => {
      const b = document.createElement('button');
      b.id = 'hb';
      b.textContent = 'T';
      b.style.cssText = 'width:44px;height:44px';
      b.addEventListener('click', () => { window.__hb = (window.__hb || 0) + 1; });
      window.__ctx.ui.hud.append(b);
    });
    await add();
    assert.strictEqual(await page.locator('#hb').isVisible(), false, 'HUD vor dem Eintreten sichtbar');
    await page.click('#start-btn');
    await page.waitForSelector('#start', { state: 'hidden' });
    await page.waitForSelector('#entdeckt:not([hidden])');
    assert.strictEqual(await page.locator('#hb').isVisible(), true);
    const g = await page.evaluate(() => {
      const b = document.getElementById('hb').getBoundingClientRect();
      const z = document.getElementById('entdeckt').getBoundingClientRect();
      return { b: { top: b.top, right: b.right, w: b.width, h: b.height, left: b.left, bottom: b.bottom }, zBottom: z.bottom, zRight: z.right, w: innerWidth };
    });
    assert.ok(g.b.w >= 44 && g.b.h >= 44);
    assert.ok(g.b.right <= g.w - 12 + 0.5 && g.b.right > g.w - 40, `rechter Rand ${g.b.right} von ${g.w}`);
    assert.ok(g.b.top >= g.zBottom, `HUD (${g.b.top}) überlappt den Zähler (unten ${g.zBottom})`);
    const before = await page.evaluate(() => window.__museum.pos);
    if (mobile) await page.tap('#hb'); else await page.click('#hb');
    await page.waitForTimeout(300);
    assert.strictEqual(await page.evaluate(() => window.__hb), 1);
    assert.deepStrictEqual(await page.evaluate(() => { const p = window.__museum.pos; return [p.x, p.z, p.yaw]; }), [before.x, before.z, before.yaw]);
    assert.strictEqual(await page.evaluate(() => !document.getElementById('lightbox').hidden), false);
    const q = await facePicture(page, 0);
    if (mobile) await page.touchscreen.tap(q.x, q.y); else await page.mouse.click(q.x, q.y);
    await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
    assert.strictEqual(await page.locator('#hb').isVisible(), false, 'HUD liegt über der Großansicht');
  });
}

t('ui.overlayRoot: liegt über der Großansicht, eigene Kinder sind antippbar', async () => {
  await withPage({}, async (page) => {
    const p = await facePicture(page, 0);
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
    const out = await page.evaluate(() => {
      const root = window.__ctx.ui.overlayRoot;
      const d = document.createElement('div');
      d.id = 'ov';
      d.style.cssText = 'position:absolute;left:40px;top:40px;width:80px;height:80px;pointer-events:auto;background:#f00';
      d.addEventListener('click', () => { window.__ov = true; });
      root.append(d);
      const z = (el) => Number(getComputedStyle(el).zIndex);
      return { rootZ: z(root), lbZ: z(document.getElementById('lightbox')), top: document.elementFromPoint(60, 60) === d, rootEvents: getComputedStyle(root).pointerEvents };
    });
    assert.ok(out.rootZ > out.lbZ, `z-index ${out.rootZ} <= ${out.lbZ}`);
    assert.strictEqual(out.top, true);
    assert.strictEqual(out.rootEvents, 'none', 'overlayRoot fängt Eingaben ab');
    await page.mouse.click(60, 60);
    assert.strictEqual(await page.evaluate(() => window.__ov), true);
  });
});

t('ui.addStyle: lädt ein Stylesheet einmal; fehlendes Stylesheet löst mit false auf', async () => {
  const page = await open({});
  try {
    await page.route('**/css/hooks-test.css', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: 'body { --hooks-test: 42; }' }));
    const out = await page.evaluate(async () => {
      const a = window.__ctx.ui.addStyle('css/hooks-test.css');
      const b = window.__ctx.ui.addStyle('css/hooks-test.css');
      const [ra, rb] = await Promise.all([a, b]);
      return { ra, rb, links: document.querySelectorAll('link[href="css/hooks-test.css"]').length,
        value: getComputedStyle(document.body).getPropertyValue('--hooks-test').trim() };
    });
    assert.deepStrictEqual(out, { ra: true, rb: true, links: 1, value: '42' });
    const missing = await page.evaluate(() => window.__ctx.ui.addStyle('css/gibt-es-nicht.css'));
    assert.strictEqual(missing, false);
    assert.ok(page.warns.some((w) => w.includes('gibt-es-nicht')), 'keine Warnung für fehlendes Stylesheet');
    const bad = page.errors.filter((e) => !/404|gibt-es-nicht/.test(e));
    assert.deepStrictEqual(bad, []);
  } finally {
    await page.context().close();
  }
});

t('ui.toast: zeigt Text für ms, blendet dann aus; neuer Toast ersetzt den alten', async () => {
  await withPage({}, async (page) => {
    await page.evaluate(() => window.__ctx.ui.toast('Hallo Herz', 500));
    const toast = page.locator('.x-toast');
    assert.strictEqual(await toast.isVisible(), true);
    assert.strictEqual(await toast.innerText(), 'Hallo Herz');
    await page.evaluate(() => window.__ctx.ui.toast('Zweiter', 3000));
    assert.strictEqual(await toast.innerText(), 'Zweiter');
    assert.strictEqual(await page.locator('.x-toast').count(), 1);
    await page.waitForTimeout(600);
    assert.strictEqual(await toast.isVisible(), true, 'alter Timer blendet den neuen Toast aus');
    await page.evaluate(() => window.__ctx.ui.toast('Kurz', 300));
    await toast.waitFor({ state: 'hidden', timeout: 5000 });
  });
});

module.exports = { tests };
