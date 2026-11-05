// Hooks, die auf Eingaben und Frames reagieren: onFrame, Tippen, langes Drücken, Objekte, Herz, Raum, Großansicht, Pause.
const assert = require('assert');
const L = require('../lib');
const { withPage, rec, frames, facePicture, lightboxOpen, tapHeart } = require('./helpers');

const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const hold = async (page, ms) => { await page.waitForTimeout(ms); };

t('ctx: Felder, Funktionen und Live-Sicht auf den Spieler', async () => {
  await withPage({}, async (page) => {
    const info = await page.evaluate(() => {
      const c = window.__ctx;
      const fns = ['collide', 'wallDistance', 'onFrame', 'onPictureTap', 'onPictureLongPress', 'onObjectTap', 'onStartHeartTap',
        'onRoomEnter', 'onLightboxOpen', 'setInputPaused'];
      return {
        three: typeof c.THREE.Vector3, scene: c.scene.isScene, cam: c.camera.isPerspectiveCamera, ren: typeof c.renderer.render,
        n: c.data.erinnerungen.length, hasWidmung: 'widmung' in c.data || c.data.widmung === undefined, items: c.items.length,
        rooms: c.rooms === window.__museum.rooms, fns: fns.filter((f) => typeof c[f] !== 'function'),
        ui: ['addStyle', 'toast'].filter((f) => typeof c.ui[f] !== 'function'), overlay: c.ui.overlayRoot.id, hud: c.ui.hud.id,
        player: Object.keys(c.player).sort().join(','),
      };
    });
    assert.deepStrictEqual(info, { three: 'function', scene: true, cam: true, ren: 'function', n: 7, hasWidmung: true, items: 7, rooms: true,
      fns: [], ui: [], overlay: 'overlay-root', hud: 'hud', player: 'pitch,room,x,yaw,z' });
    const start = await L.pos(page);
    await page.keyboard.down('KeyS');
    await page.waitForFunction(([x, z]) => Math.hypot(window.__ctx.player.x - x, window.__ctx.player.z - z) > 0.2, [start.x, start.z], { timeout: 15000 });
    await page.keyboard.up('KeyS');
    const same = await page.evaluate(() => { const p = window.__museum.pos; const v = window.__ctx.player; return p.x === v.x && p.z === v.z && p.yaw === v.yaw && p.room === v.room; });
    assert.ok(same, 'ctx.player weicht von der echten Pose ab');
  });
});

t('onFrame: dt in 0..0.05, nach dem Kamera-Update (Ich-Pose) und unmittelbar vor jedem Render', async () => {
  await withPage({}, async (page) => {
    await page.evaluate(() => {
      const r = window.__ctx.renderer;
      const orig = r.render.bind(r);
      window.__renderAt = [];
      r.render = (...a) => { window.__renderAt.push(window.__rec.frames); return orig(...a); };
    });
    await frames(page, 8);
    const out = await page.evaluate(() => ({ dts: window.__rec.dts, camOff: window.__rec.camOff, at: window.__renderAt }));
    assert.ok(out.dts.length >= 8);
    assert.ok(out.dts.every((d) => d >= 0 && d <= 0.0501), `dt: ${out.dts.slice(0, 5)}`);
    assert.strictEqual(out.camOff, 0, 'Kamera wich beim onFrame von der Spielerpose ab');
    const diffs = out.at.slice(1, 8).map((v, i) => v - out.at[i]);
    assert.ok(diffs.every((d) => d === 1), `onFrame läuft nicht genau einmal vor jedem Render: ${diffs}`);
  });
});

t('Tippen auf ein Bild: onPictureTap(index) läuft vor der Großansicht, die dann aufgeht', async () => {
  await withPage({}, async (page) => {
    const p = await facePicture(page, 0);
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
    const r = await rec(page);
    assert.deepStrictEqual(r.picTap, [0]);
    assert.deepStrictEqual(r.picLong, []);
  });
});

t('onPictureTap gibt true zurück → keine Großansicht; danach false → Großansicht', async () => {
  await withPage({}, async (page) => {
    const p = await facePicture(page, 0);
    await page.evaluate(() => { window.__swallow = true; });
    await page.mouse.click(p.x, p.y);
    await page.waitForFunction(() => window.__rec.picTap.length === 1);
    await page.waitForTimeout(500);
    assert.strictEqual(await lightboxOpen(page), false, 'Großansicht trotz true');
    await page.evaluate(() => { window.__swallow = false; });
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
    assert.deepStrictEqual((await rec(page)).picTap, [0, 0]);
  });
});

t('Langes Drücken (Maus ≥ 550 ms, still): onPictureLongPress, kein Tap, keine Großansicht', async () => {
  await withPage({}, async (page) => {
    const p = await facePicture(page, 0);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await hold(page, 800);
    await page.mouse.up();
    await page.waitForTimeout(500);
    const r = await rec(page);
    assert.deepStrictEqual(r.picLong, [0]);
    assert.deepStrictEqual(r.picTap, [], 'nach dem langen Drücken wurde ein Tap ausgelöst');
    assert.strictEqual(await lightboxOpen(page), false);
  });
});

t('Wischen (≥ 10 px) während des Drückens: weder langes Drücken noch Tap', async () => {
  await withPage({}, async (page) => {
    const q = await facePicture(page, 0);
    await page.mouse.move(q.x, q.y);
    await page.mouse.down();
    await page.mouse.move(q.x + 30, q.y, { steps: 4 });
    await hold(page, 800);
    await page.mouse.up();
    await page.waitForTimeout(400);
    const r = await rec(page);
    assert.deepStrictEqual([r.picTap, r.picLong], [[], []], 'Wischen darf weder tippen noch lang drücken');
    assert.strictEqual(await lightboxOpen(page), false);
  });
});

t('Touch: langes Drücken auf ein Bild ruft onPictureLongPress, danach kein Tap; kurzes Tippen öffnet', async () => {
  await withPage({ mobile: true }, async (page) => {
    const p = await facePicture(page, 0);
    await L.touch.start(page, [{ x: p.x, y: p.y, id: 1 }]);
    await hold(page, 800);
    await L.touch.end(page);
    await page.waitForTimeout(500);
    let r = await rec(page);
    assert.deepStrictEqual([r.picLong, r.picTap], [[0], []]);
    assert.strictEqual(await lightboxOpen(page), false);
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
    r = await rec(page);
    assert.deepStrictEqual([r.picLong, r.picTap], [[0], [0]]);
  });
});

t('onObjectTap: registriertes Objekt antippen ruft fn(obj); unsichtbar = nicht antippbar', async () => {
  await withPage({}, async (page) => {
    await page.evaluate(() => {
      const c = window.__ctx;
      const T = c.THREE;
      const m = new T.Mesh(new T.BoxGeometry(0.8, 0.8, 0.8), new T.MeshBasicMaterial({ color: 'red' }));
      const p = c.player;
      m.position.set(p.x - Math.sin(p.yaw) * 1.5, 1.65, p.z - Math.cos(p.yaw) * 1.5);
      c.scene.add(m);
      window.__obj = m;
      window.__objHits = [];
      c.onObjectTap(m, (o) => { window.__objHits.push(o === m); });
    });
    await frames(page, 3);
    const mid = await page.evaluate(() => ({ x: innerWidth / 2, y: innerHeight / 2 }));
    await page.mouse.click(mid.x, mid.y);
    await page.waitForFunction(() => window.__objHits.length === 1);
    assert.deepStrictEqual(await page.evaluate(() => window.__objHits), [true]);
    assert.strictEqual(await lightboxOpen(page), false);
    await page.evaluate(() => { window.__obj.visible = false; });
    await page.mouse.click(mid.x, mid.y);
    await page.waitForTimeout(500);
    assert.strictEqual(await page.evaluate(() => window.__objHits.length), 1, 'unsichtbares Objekt wurde angetippt');
  });
});

t('onStartHeartTap: zählt Tipper der letzten 3 s, löst das Eintreten nicht aus', async () => {
  await withPage({ enter: false }, async (page) => {
    for (let i = 0; i < 3; i++) await tapHeart(page);
    assert.deepStrictEqual((await rec(page)).heart, [1, 2, 3]);
    assert.strictEqual(await page.evaluate(() => !document.getElementById('start').hidden && !document.body.classList.contains('im-saal')), true, 'Herz-Tipp hat das Eintreten ausgelöst');
    await page.waitForTimeout(3300);
    await tapHeart(page);
    assert.deepStrictEqual((await rec(page)).heart, [1, 2, 3, 1]);
    const box = await page.locator('#start h1 .herz').boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `Tippfläche ${box.width}×${box.height}`);
  });
});

t('onStartHeartTap per Touch (Handy): Tippfläche ≥ 44 px, Zählung stimmt', async () => {
  await withPage({ mobile: true, enter: false }, async (page) => {
    for (let i = 0; i < 2; i++) await tapHeart(page, true);
    assert.deepStrictEqual((await rec(page)).heart, [1, 2]);
    const box = await page.locator('#start h1 .herz').boundingBox();
    assert.ok(box.width >= 44 && box.height >= 44, `Tippfläche ${box.width}×${box.height}`);
    assert.strictEqual(await page.evaluate(() => document.body.classList.contains('im-saal')), false);
  });
});

t('onRoomEnter: beim Eintreten Raum 0, beim Betreten von Raum 1 genau einmal', async () => {
  await withPage({}, async (page) => {
    assert.deepStrictEqual((await rec(page)).rooms, [{ id: 0, theme: 'modern' }]);
    await page.evaluate(() => {
      const r = window.__museum.rooms[1];
      window.__museum.setPose({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
    });
    await frames(page, 4);
    const rooms = (await rec(page)).rooms;
    assert.deepStrictEqual(rooms.map((r) => r.id), [0, 1]);
    assert.ok(typeof rooms[1].theme === 'string');
  });
});

t('onLightboxOpen: actionsEl bekommt Knöpfe, wird beim Blättern/Öffnen geleert, leer unsichtbar', async () => {
  await withPage({}, async (page) => {
    const p = await facePicture(page, 0);
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
    const texts = () => page.locator('.lb-aktionen .t-btn').allInnerTexts();
    assert.deepStrictEqual(await texts(), ['A0']);
    const below = await page.evaluate(() => document.querySelector('.lb-aktionen').getBoundingClientRect().top >= document.getElementById('lb-text').getBoundingClientRect().bottom - 1);
    assert.ok(below, 'actionsEl liegt nicht unter dem Text');
    await page.click('#lb-next');
    assert.deepStrictEqual(await texts(), ['A1']);
    await page.evaluate(() => { window.__noActions = true; });
    await page.click('#lb-next');
    assert.deepStrictEqual(await texts(), []);
    assert.strictEqual(await page.locator('.lb-aktionen').isVisible(), false, 'leerer Container sichtbar');
    const r = await rec(page);
    assert.deepStrictEqual(r.lb.map((e) => [e.i, e.empty]), [[0, true], [1, true], [2, true]]);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { window.__noActions = false; });
    const q = await facePicture(page, 0);
    await page.mouse.click(q.x, q.y);
    await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
    assert.deepStrictEqual(await texts(), ['A0'], 'Container wurde beim erneuten Öffnen nicht geleert');
  });
});

t('setInputPaused: Laufen, Tippen und Tasten ruhen (Tippen im Eingabefeld geht); danach wieder normal', async () => {
  await withPage({}, async (page) => {
    await page.evaluate(() => window.__ctx.setInputPaused(true));
    const p = await facePicture(page, 0);
    const before = await L.pos(page);
    await page.keyboard.down('KeyW');
    await hold(page, 700);
    await page.keyboard.up('KeyW');
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(400);
    const after = await L.pos(page);
    assert.deepStrictEqual([after.x, after.z], [before.x, before.z], 'Spieler lief trotz Pause');
    assert.deepStrictEqual((await rec(page)).picTap, [], 'Tap trotz Pause');
    await page.evaluate(() => { const i = document.createElement('input'); i.id = 'tf'; document.body.append(i); i.focus(); });
    await page.keyboard.type('wasd');
    assert.strictEqual(await page.inputValue('#tf'), 'wasd', 'Tasten wurden in der Pause abgefangen');
    await page.evaluate(() => { document.getElementById('tf').blur(); window.__ctx.setInputPaused(false); });
    await page.keyboard.down('KeyW');
    await page.waitForFunction(([x, z]) => Math.hypot(window.__museum.pos.x - x, window.__museum.pos.z - z) > 0.2, [after.x, after.z], { timeout: 15000 });
    await page.keyboard.up('KeyW');
    await page.mouse.click(p.x, p.y);
    await page.waitForFunction(() => window.__rec.picTap.length === 1, null, { timeout: 5000 });
  });
});

module.exports = { tests };
