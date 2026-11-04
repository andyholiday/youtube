// Erzeugt die Screenshots (Handy hochkant, Desktop) in screenshots/. Aufruf: node tests/museum/shots.js
const path = require('path');
const L = require('./lib');
const OUT = path.join(__dirname, 'screenshots');

async function shot(page, name) {
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, name) });
  console.log('Screenshot:', name);
}

async function szene(browser, data, mobile, prefix) {
  const srv = await L.startServer(data);
  const page = await L.newPage(browser, { mobile });
  await L.openMuseum(page, srv.url);
  if (data === 'data-7.json') await shot(page, `${prefix}-start.png`);
  await L.enter(page);
  const m = await page.evaluate(() => window.__museum.length);
  const poses = data === 'data-7.json'
    ? [['halle', { x: 0, z: m / 2 - 1.8, yaw: 0 }], ['bild', { x: 1.2, z: m / 2 - 5.9, yaw: 0.9, pitch: 0 }],
       ['ende', { x: 0, z: -m / 2 + 6, yaw: 0 }]]
    : [['leer', { x: 0, z: m / 2 - 3, yaw: 0 }]];
  for (const [n, p] of poses) {
    await page.evaluate((q) => window.__museum.setPose(q), p);
    await page.waitForTimeout(800);
    await shot(page, `${prefix}-${n}.png`);
  }
  if (data === 'data-7.json') {
    await page.evaluate(() => window.__museum.setPose({ x: -1.5, z: window.__museum.length / 2 - 5.9, yaw: Math.PI / 2, pitch: 0 }));
    await page.waitForTimeout(800);
    await shot(page, `${prefix}-nah.png`);
    const pt = await page.evaluate(() => window.__museum.screenPositionOf(0));
    if (mobile) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
    await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
    await shot(page, `${prefix}-gross.png`);
  }
  console.log('Fehler:', page.errors);
  await page.context().close();
  await srv.close();
}

(async () => {
  const browser = await L.launch();
  await szene(browser, 'data-7.json', true, 'handy');
  await szene(browser, 'data-7.json', false, 'desktop');
  await szene(browser, 'data-0.json', true, 'handy-leer');
  await browser.close();
})();
