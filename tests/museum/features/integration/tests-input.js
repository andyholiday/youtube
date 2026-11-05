// Langes Drücken (Notiz), Tippen, Joystick und Wischen in der echten App stören sich nicht (echte Mehr-Finger-Berührungen per CDP).
const assert = require('assert');
const H = require('./helpers');

const { L, sleep, until, openEntered, problems, faceAndWait, tapAt, pressTouch } = H;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const NOTE_PIC = 1; // Erinnerung mit Notiz
const THUMB = (page) => page.evaluate(() => ({ x: 90, y: innerHeight - 80 }));
const lightboxHidden = (page) => page.locator('#lightbox').isHidden();
const noteShown = (page) => page.locator('.eggs-notiz').count();
const moved = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

t('Tippen auf ein Bild mit Notiz öffnet die Großansicht, keine Notiz', async (env) => {
  const page = await openEntered(env);
  const p = await faceAndWait(page, NOTE_PIC);
  await tapAt(page, true, p.x, p.y);
  await page.waitForSelector('#lightbox:not([hidden])');
  assert.strictEqual(await noteShown(page), 0);
  assert.deepStrictEqual(problems(page), []);
});

t('Langes Drücken (Finger) zeigt die Notiz, keine Großansicht; danach Tippen und Laufen wieder normal', async (env) => {
  const page = await openEntered(env);
  const p = await faceAndWait(page, NOTE_PIC);
  const end = await pressTouch(page, p.x, p.y, 1);
  await page.waitForSelector('.eggs-notiz', { timeout: 4000 });
  await end();
  assert.ok(await lightboxHidden(page), 'Großansicht öffnete sich trotz langem Drücken');
  await page.mouse.click(30, 30); // Notiz schließen (Tippen auf den Hintergrund)
  await page.waitForSelector('.eggs-notiz-wrap', { state: 'detached' });
  const thumb = await THUMB(page);
  const a = await L.pos(page);
  await L.touch.start(page, [{ ...thumb, id: 1 }]);
  await L.touch.move(page, [{ x: thumb.x, y: thumb.y - 46, id: 1 }]);
  await until(page, (s) => Math.hypot(window.__museum.pos.x - s.x, window.__museum.pos.z - s.z) > 0.3, a);
  await L.touch.end(page);
  assert.deepStrictEqual(problems(page), []);
});

t('Joystick-Finger läuft, während ein zweiter Finger lang auf ein Bild drückt: Notiz erscheint, Joystick geht nicht verloren', async (env) => {
  const page = await openEntered(env);
  const p = await faceAndWait(page, NOTE_PIC);
  const thumb = await THUMB(page);
  const a = await L.pos(page);
  await L.touch.start(page, [{ ...thumb, id: 1 }]);
  const joy = { x: thumb.x, y: thumb.y - 14, id: 1 }; // sanft vorwärts
  await L.touch.move(page, [joy]);
  await until(page, (s) => Math.hypot(window.__museum.pos.x - s.x, window.__museum.pos.z - s.z) > 0.1, a);
  const end2 = await pressTouch(page, p.x, p.y, 2, [joy]);
  await page.waitForSelector('.eggs-notiz', { timeout: 4000 });
  await end2();
  await L.touch.end(page);
  assert.ok(await lightboxHidden(page));
  assert.strictEqual(await noteShown(page), 1);
  assert.deepStrictEqual(problems(page), []);
});

t('Wischen über ein Bild (auch nach kurzem Verweilen) dreht nur den Blick: keine Notiz, keine Großansicht', async (env) => {
  const page = await openEntered(env);
  const p = await faceAndWait(page, NOTE_PIC);
  const yaw0 = (await L.pos(page)).yaw;
  await L.touch.start(page, [{ x: p.x, y: p.y, id: 1 }]);
  await sleep(300); // kürzer als das lange Drücken
  for (const dx of [20, 45, 70]) await L.touch.move(page, [{ x: p.x + dx, y: p.y, id: 1 }]);
  await sleep(700); // länger als das lange Drücken, aber der Finger hat sich bewegt
  await L.touch.end(page);
  assert.ok(Math.abs((await L.pos(page)).yaw - yaw0) > 0.1, 'Blick drehte sich nicht');
  assert.strictEqual(await noteShown(page), 0, 'Notiz trotz Wischen');
  assert.ok(await lightboxHidden(page), 'Großansicht trotz Wischen');
  assert.deepStrictEqual(problems(page), []);
});

t('Joystick-Finger lange auf dem Boden gehalten löst keine Notiz und keine Großansicht aus, Laufen geht danach', async (env) => {
  const page = await openEntered(env);
  const thumb = await THUMB(page);
  await L.touch.start(page, [{ ...thumb, id: 1 }]);
  await sleep(800);
  assert.strictEqual(await noteShown(page), 0);
  const a = await L.pos(page);
  await L.touch.move(page, [{ x: thumb.x, y: thumb.y - 46, id: 1 }]);
  await until(page, (s) => Math.hypot(window.__museum.pos.x - s.x, window.__museum.pos.z - s.z) > 0.3, a);
  await L.touch.end(page);
  assert.ok(await lightboxHidden(page));
  assert.deepStrictEqual(problems(page), []);
});

module.exports = { tests };
