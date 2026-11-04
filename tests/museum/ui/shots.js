// Screenshots (JPEG < 1,5 MB) von Start, Beschriftungszeile, Großansicht, Raumtitel und Abschlusskarte.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const S = require('./setup');

const OUT = path.join(__dirname, 'screenshots');
const LIMIT = 1.5 * 1024 * 1024;
const BG = { desktop: 'desktop-a.jpg', iphone: 'iphone-a.jpg', 'iphone-quer': 'iphone-quer-a.jpg' };

async function shot(page, device, name) {
  const file = path.join(OUT, `${device}-${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 85 });
  assert.ok(fs.statSync(file).size < LIMIT, `${file} ist größer als 1,5 MB`);
}

const ctx = {};
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

fs.mkdirSync(OUT, { recursive: true });
for (const device of Object.keys(BG)) {
  test(`Screenshots (${device})`, async () => {
    const page = await S.openHarness(ctx.browser, ctx.server, device, { query: `?bg=${BG[device]}`, items: false });
    await page.evaluate(() => { window.ui.setWidmung(window.__widmung); window.ui.setItems(window.__items); });
    await page.evaluate(() => window.ui.setReady());
    await page.waitForTimeout(300);
    await shot(page, device, '1-start');
    await page.click('#start-btn');
    await page.evaluate(() => {
      window.ui.roomEntered({ id: 1, theme: 'klassisch' });
      window.ui.showControlsHint(document.body.classList.contains('touch')
        ? 'Daumen links unten aufsetzen und schieben zum Laufen\nRechts wischen zum Umschauen\nBild antippen' : 'W A S D oder Pfeiltasten zum Laufen · Maus ziehen zum Umschauen · Bild anklicken');
    });
    await page.waitForTimeout(1000);
    await shot(page, device, '2-raumtitel');
    await page.waitForTimeout(3500);
    await page.evaluate(() => {
      if (document.body.classList.contains('touch')) {
        const j = document.getElementById('joystick');
        j.classList.add('aktiv'); j.style.left = '90px'; j.style.top = (innerHeight - 100) + 'px';
      }
      window.ui.focusChanged(2);
    });
    await page.waitForTimeout(700);
    await shot(page, device, '3-beschriftung');
    await page.click('#beschriftung');
    await page.waitForFunction(() => document.getElementById('lb-img').naturalWidth > 0);
    await page.waitForTimeout(400);
    await shot(page, device, '4-grossansicht');
    await page.evaluate(() => window.ui.openLightbox(3));
    await page.waitForFunction(() => document.getElementById('lb-img').naturalWidth > 0);
    await page.waitForTimeout(400);
    await shot(page, device, '5-grossansicht-langer-text');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { for (let i = 0; i < 7; i++) window.ui.focusChanged(i); });
    await page.waitForSelector('#finale', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(300);
    await shot(page, device, '6-abschluss');
  });
}

module.exports = { ctx, tests };
