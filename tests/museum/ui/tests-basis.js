// Start, Laden, Widmung, Hinweise, Raumtitel, Fehler und die touch-Klasse.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const S = require('./setup');

const API = ['setLoading', 'setReady', 'setItems', 'setWidmung', 'showEmptyHint', 'showFatal',
  'showControlsHint', 'markInteracted', 'roomEntered', 'focusChanged', 'openLightbox'];

const ctx = {};
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('Schnittstelle: alle Methoden aus SPEC-UI vorhanden', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'desktop');
  const have = await page.evaluate((names) => names.filter((n) => typeof window.ui[n] === 'function'), API);
  assert.deepStrictEqual(have, API);
  assert.deepStrictEqual(page.errors, []);
});

test('body.touch steht sofort (Handy) und fehlt am Desktop; ohne main.js/ui.js', async () => {
  for (const [device, expected] of [['iphone', true], ['desktop', false]]) {
    const page = await S.newPage(ctx.browser, device);
    // Module blockieren: nur die Inline-Skripte dürfen die Klasse gesetzt haben.
    await page.route('**/js/**', (route) => route.abort());
    await page.goto(ctx.server.url + 'index.html', { waitUntil: 'domcontentloaded' });
    const r = await page.evaluate(() => ({
      body: document.body.classList.contains('touch'),
      html: document.documentElement.classList.contains('touch'),
      desktopHint: getComputedStyle(document.querySelector('.nur-desktop')).display,
      touchHint: getComputedStyle(document.querySelector('.nur-touch')).display,
    }));
    assert.strictEqual(r.body, expected, `${device}: body.touch`);
    assert.strictEqual(r.html, expected, `${device}: html.touch`);
    assert.strictEqual(r.desktopHint === 'none', expected, `${device}: Desktop-Hinweise versteckt`);
    assert.strictEqual(r.touchHint === 'none', !expected, `${device}: Touch-Hinweise versteckt`);
  }
});

test('index.html: noindex, lokale Importmap, 12-s-Voreinstellung, Safe-Area-CSS', async () => {
  const root = path.resolve(__dirname, '..', '..', '..', 'site');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.ok(html.includes('<meta name="robots" content="noindex">'));
  assert.ok(html.includes('"three": "./vendor/three.module.min.js"'));
  assert.ok(!/cdn\.jsdelivr|unpkg/.test(html), 'kein CDN');
  assert.ok(/: 12000;/.test(html), 'Voreinstellung 12 s');
  const css = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8') + fs.readFileSync(path.join(root, 'css', 'lightbox.css'), 'utf8');
  assert.ok(css.includes('max(12px, env(safe-area-inset-top))'));
  assert.ok(css.includes('(orientation: landscape) and (max-height: 500px)'));
});

test('Laden: setLoading zeigt Text, setReady aktiviert den Knopf, Klick tritt ein', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'iphone', { items: false });
  assert.strictEqual(await page.isDisabled('#start-btn'), true);
  await page.evaluate(() => window.ui.setLoading('Bilder werden aufgehängt …'));
  assert.strictEqual(await S.text(page, '#lade'), 'Bilder werden aufgehängt …');
  assert.ok(await page.isVisible('#lade'));
  await page.evaluate(() => window.ui.setReady());
  assert.strictEqual(await page.isDisabled('#start-btn'), false);
  assert.strictEqual(await S.text(page, '#start-btn'), 'Eintreten');
  assert.ok(!(await page.isVisible('#lade')));
  await page.click('#start-btn');
  assert.ok(!(await page.isVisible('#start')));
  assert.deepStrictEqual(await S.events(page), ['enter']);
  assert.deepStrictEqual(page.errors, []);
});

test('Fehler-Fallback: nach Wartezeit ohne setReady erscheint der Hinweis; mit setReady nicht', async () => {
  const stuck = await S.openHarness(ctx.browser, ctx.server, 'iphone', { query: '?fallback=700', items: false });
  assert.ok(!(await stuck.isVisible('#lade-fehler')));
  await stuck.waitForSelector('#lade-fehler', { state: 'visible', timeout: 3000 });
  assert.ok((await S.text(stuck, '#lade-fehler')).startsWith('Das Museum lädt nicht – bitte Safari/Chrome aktualisieren'));
  const ok = await S.openHarness(ctx.browser, ctx.server, 'iphone', { query: '?fallback=700', items: false });
  await ok.evaluate(() => window.ui.setReady());
  await ok.waitForTimeout(1200);
  assert.ok(!(await ok.isVisible('#lade-fehler')));
  // Kommt der Knopf doch noch, verschwindet der Hinweis wieder.
  await stuck.evaluate(() => window.ui.setReady());
  assert.ok(!(await stuck.isVisible('#lade-fehler')));
});

test('12 s: ohne gefälschte Parameter greift die Frist erst nach 12 s (Uhr vorgespult)', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'desktop', { clock: true, items: false });
  await page.clock.runFor(11000);
  assert.ok(!(await page.isVisible('#lade-fehler')), 'vor 12 s noch nichts');
  await page.clock.runFor(1500);
  assert.ok(await page.isVisible('#lade-fehler'), 'nach 12 s sichtbar');
});

test('Widmung: ersetzt "Für dich"; ohne Widmung bleibt alles; setWidmung(null) bleibt', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'desktop');
  assert.strictEqual(await S.text(page, 'h1'), 'Für dich');
  await page.evaluate(() => window.ui.setWidmung(null));
  assert.strictEqual(await S.text(page, 'h1'), 'Für dich');
  await page.evaluate(() => window.ui.setWidmung({ titel: '', text: 'x' }));
  assert.strictEqual(await S.text(page, 'h1'), 'Für dich');
  await page.evaluate(() => window.ui.setWidmung(window.__widmung));
  assert.strictEqual(await S.text(page, 'h1'), 'Für meine Liebste');
  assert.ok(await page.isVisible('h1 .herz'));
});

test('Leeres Museum und Fehlertext (Standard und eigener)', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'desktop');
  await page.evaluate(() => window.ui.showEmptyHint());
  assert.ok(await page.isVisible('#leer-hinweis'));
  await page.evaluate(() => window.ui.showFatal());
  assert.ok((await S.text(page, '#fehler')).includes('3D-Museum'));
  await page.evaluate(() => window.ui.showFatal('Etwas ist schiefgegangen.'));
  assert.strictEqual(await S.text(page, '#fehler'), 'Etwas ist schiefgegangen.');
  assert.ok(await page.isVisible('#fehler'));
});

test('Steuerungshinweis: bleibt bei nur "move", geht bei move+look, spätestens nach 15 s', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'iphone', { enter: true, clock: true });
  await page.evaluate(() => window.ui.showControlsHint('Joystick: laufen\nWischen: umschauen'));
  assert.ok(await page.isVisible('#hinweis'));
  await page.evaluate(() => { window.ui.markInteracted('move'); window.ui.markInteracted('move'); });
  await page.clock.runFor(3000);
  assert.ok(await page.isVisible('#hinweis'), 'nur Gehen reicht nicht');
  await page.evaluate(() => window.ui.markInteracted('look'));
  await page.clock.runFor(1200);
  assert.ok(!(await page.isVisible('#hinweis')), 'weg nach move+look');
  await page.evaluate(() => window.ui.showControlsHint('Noch einmal'));
  await page.clock.runFor(14000);
  assert.ok(await page.isVisible('#hinweis'), 'nach 14 s noch da');
  await page.clock.runFor(2500);
  assert.ok(!(await page.isVisible('#hinweis')), 'spätestens nach 15 s weg');
});

test('Raumtitel: Namen nach Thema, 2-3 s sichtbar, nicht doppelt, erst nach dem Eintreten', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'desktop', { clock: true });
  await page.evaluate(() => window.ui.roomEntered({ id: 0, theme: 'garten' }));
  assert.ok(!(await page.isVisible('#raumtitel')), 'vor dem Eintreten nichts');
  await page.evaluate(() => window.ui.setReady());
  await page.click('#start-btn');
  assert.strictEqual(await S.text(page, '#raumtitel'), 'Der Wintergarten', 'wartender Raum erscheint beim Eintreten');
  await page.clock.runFor(2400);
  assert.ok(await page.isVisible('#raumtitel'), 'nach 2,4 s noch sichtbar');
  await page.clock.runFor(1800);
  assert.ok(!(await page.isVisible('#raumtitel')), 'nach gut 4 s weg');
  const names = { modern: 'Die weiße Galerie', klassisch: 'Der Festsaal', futuristisch: 'Der Lichtraum', garten: 'Der Wintergarten' };
  let id = 10;
  for (const [theme, name] of Object.entries(names)) {
    await page.evaluate(([i, t]) => window.ui.roomEntered({ id: i, theme: t }), [id++, theme]);
    assert.strictEqual(await S.text(page, '#raumtitel'), name);
    await page.clock.runFor(4000);
  }
  await page.evaluate(() => window.ui.roomEntered({ id: 13, theme: 'garten' }));
  await page.clock.runFor(4000);
  await page.evaluate(() => window.ui.roomEntered({ id: 13, theme: 'garten' }));
  assert.ok(!(await page.isVisible('#raumtitel')), 'derselbe Raum zeigt den Titel nicht noch einmal');
  await page.evaluate(() => window.ui.roomEntered({ id: 14, theme: 'unbekannt' }));
  assert.ok(!(await page.isVisible('#raumtitel')), 'unbekanntes Thema: kein Titel');
  assert.deepStrictEqual(page.errors, []);
});

module.exports = { ctx, tests };
