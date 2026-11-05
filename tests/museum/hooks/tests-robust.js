// Robustheit: werfende Module, fehlende Module, Ladereihenfolge.
const assert = require('assert');
const { open, withPage, rec, MISSING, tapHeart } = require('./helpers');

const tests = [];
const t = (name, fn) => tests.push([name, fn]);

const THROWING = `
export function install(ctx) {
  window.__eggs = true;
  const boom = (n) => () => { window['__thrown_' + n] = (window['__thrown_' + n] || 0) + 1; throw new Error(n); };
  ctx.onFrame(boom('frame'));
  ctx.onPictureTap(boom('tap'));
  ctx.onPictureLongPress(boom('long'));
  ctx.onRoomEnter(boom('room'));
  ctx.onLightboxOpen(boom('lb'));
  ctx.onStartHeartTap(boom('heart'));
  ctx.onObjectTap(new ctx.THREE.Object3D(), boom('obj'));
}`;

t('Werfende Module: install wirft, Handler werfen → Museum läuft weiter, nur Warnungen', async () => {
  const thrower = 'export function install() { throw new Error("boom"); }';
  const page = await open({ thirdperson: thrower, eggs: THROWING, admin: 'export function install() { window.__admin = true; }', enter: false });
  try {
    assert.strictEqual(await page.evaluate(() => [window.__eggs, window.__admin]).then((a) => a.join()), 'true,true', 'spätere Module wurden nicht geladen');
    assert.ok(page.warns.some((w) => w.includes('thirdperson.js nicht geladen')), `Warnungen: ${page.warns}`);
    await tapHeart(page);
    assert.strictEqual(await page.evaluate(() => window.__thrown_heart), 1);
    assert.strictEqual(await page.evaluate(() => document.body.classList.contains('im-saal')), false);
    await page.click('#start-btn');
    await page.waitForSelector('#start', { state: 'hidden' });
    await page.waitForTimeout(1500);
    assert.strictEqual(await page.evaluate(() => window.__thrown_frame), 1, 'werfender onFrame-Handler wurde nicht abgeschaltet');
    assert.ok(page.warns.filter((w) => w.includes('onFrame fehlgeschlagen')).length === 1);
    // Weiter laufen, tippen, Raum wechseln: nichts davon darf am werfenden Modul scheitern.
    await page.keyboard.down('KeyW');
    const s = await page.evaluate(() => window.__museum.pos);
    await page.waitForFunction(([x, z]) => Math.hypot(window.__museum.pos.x - x, window.__museum.pos.z - z) > 0.2, [s.x, s.z], { timeout: 15000 });
    await page.keyboard.up('KeyW');
    const p = await facePicture0(page);
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
    assert.strictEqual(await page.evaluate(() => window.__thrown_tap), 1);
    assert.strictEqual(await page.evaluate(() => window.__thrown_lb), 1);
    assert.deepStrictEqual(page.errors, []);
  } finally {
    await page.context().close();
  }
});

async function facePicture0(page) {
  await page.evaluate(() => window.__museum.faceEntry(0));
  await page.waitForTimeout(500);
  return page.evaluate(() => window.__museum.screenPositionOf(0));
}

t('Fehlende Module: nur console.warn, Museum startet, läuft und lässt sich bedienen', async () => {
  const page = await open({ thirdperson: MISSING, eggs: MISSING, admin: MISSING });
  try {
    const nf = page.warns.filter((w) => w.includes('nicht geladen'));
    assert.strictEqual(nf.length, 3, `Warnungen: ${page.warns}`);
    assert.ok(nf[0].includes('thirdperson') && nf[1].includes('eggs') && nf[2].includes('admin'), nf.join(' | '));
    const bad = page.errors.filter((e) => !/404|\/js\/features\//.test(e)); // lib.js ist streng; hier fehlen die Module absichtlich
    assert.deepStrictEqual(bad, [], 'außer den 404 der fehlenden Module darf nichts fehlschlagen');
    await page.keyboard.down('KeyW');
    const s = await page.evaluate(() => window.__museum.pos);
    await page.waitForFunction(([x, z]) => Math.hypot(window.__museum.pos.x - x, window.__museum.pos.z - z) > 0.2, [s.x, s.z], { timeout: 15000 });
    await page.keyboard.up('KeyW');
    const p = await facePicture0(page);
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
  } finally {
    await page.context().close();
  }
});

t('Ladereihenfolge: thirdperson → eggs → admin/index, alle vor setReady (Knopf noch gesperrt)', async () => {
  await withPage({ enter: false }, async (page) => {
    assert.deepStrictEqual(await page.evaluate(() => window.__order), ['thirdperson', 'eggs', 'admin']);
    assert.strictEqual((await rec(page)).beforeReady, true);
    assert.strictEqual(await page.evaluate(() => document.getElementById('start-btn').disabled), false);
  });
});

const TWO = (name) => `export function install(ctx) { window.__order = (window.__order || []).concat('${name}'); window.__ctx_${name} = ctx; }`;

t('Pause je Modul: ein Modul hebt die Pause eines anderen nicht auf; erst wenn alle losgelassen haben, läuft es wieder', async () => {
  const page = await open({ thirdperson: TWO('a'), eggs: TWO('b') });
  try {
    // Wartet auf Bewegung (bis timeout ms); false, wenn der Spieler stehen bleibt.
    const walks = async (timeout) => {
      const s = await page.evaluate(() => window.__museum.pos);
      await page.keyboard.down('KeyW');
      const moved = await page.waitForFunction(([x, z]) => Math.hypot(window.__museum.pos.x - x, window.__museum.pos.z - z) > 0.2, [s.x, s.z], { timeout }).then(() => true, () => false);
      await page.keyboard.up('KeyW');
      return moved;
    };
    await page.evaluate(() => { window.__ctx_a.setInputPaused(true); window.__ctx_b.setInputPaused(true); window.__ctx_b.setInputPaused(false); });
    assert.strictEqual(await walks(800), false, 'Modul b hob die Pause von Modul a auf');
    await page.evaluate(() => window.__ctx_a.setInputPaused(false));
    assert.strictEqual(await walks(15000), true, 'Steuerung läuft nach dem Loslassen nicht wieder');
    assert.deepStrictEqual(page.errors, []);
  } finally {
    await page.context().close();
  }
});

t('onViewerOpen/viewerOpened: Handler bekommen Eintrag und Aktionsfläche, ein werfender Handler stört nicht', async () => {
  const mod = `export function install(ctx) {
    window.__got = [];
    window.__vctx = ctx;
    ctx.onViewerOpen(() => { throw new Error('boom'); });
    ctx.onViewerOpen((item, el) => { window.__got.push([item.titel, el.tagName]); });
  }`;
  const page = await open({ thirdperson: mod });
  try {
    await page.evaluate(() => window.__vctx.viewerOpened({ titel: 'Geheim' }, document.createElement('div')));
    assert.deepStrictEqual(await page.evaluate(() => window.__got), [['Geheim', 'DIV']]);
    assert.ok(page.warns.some((w) => w.includes('onViewerOpen fehlgeschlagen')), `Warnungen: ${page.warns}`);
    assert.deepStrictEqual(page.errors, []);
  } finally {
    await page.context().close();
  }
});

module.exports = { tests };
