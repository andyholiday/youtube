// Hilfen für die UI-Tests: Server (Kopie von site/ + Harness + Bilder) und Seiten für Handy/Desktop.
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('../lib');
const { devices } = require('playwright');

const HERE = __dirname;
const FIXTURES = path.join(HERE, '..', 'fixtures', 'erinnerungen');

const DEVICES = {
  desktop: { viewport: { width: 1280, height: 800 } },
  iphone: { ...devices['iPhone 13'] },
  'iphone-quer': { ...devices['iPhone 13 landscape'] },
};

/** Temp-Verzeichnis: site/ + harness.html + items.json + Fixture-Bilder + Kulissen unter bg/. */
async function startUiServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'museum-ui-'));
  fs.cpSync(path.join(L.ROOT, 'site'), dir, { recursive: true });
  fs.copyFileSync(path.join(HERE, 'harness.html'), path.join(dir, 'harness.html'));
  fs.copyFileSync(path.join(HERE, 'items.json'), path.join(dir, 'items.json'));
  fs.cpSync(FIXTURES, path.join(dir, 'erinnerungen'), { recursive: true });
  fs.cpSync(path.join(HERE, 'bg'), path.join(dir, 'bg'), { recursive: true });
  return L.serve(dir, true);
}

/** Neue Seite im gewünschten Gerät. Sammelt Fehler (ohne das absichtlich fehlende Bild). */
async function newPage(browser, device, { clock = false } = {}) {
  const context = await browser.newContext(DEVICES[device]);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.location().url.includes('gibt-es-nicht')) page.errors.push(`console: ${m.text()}`);
  });
  page.cdp = DEVICES[device].hasTouch ? await context.newCDPSession(page) : null;
  if (clock) await page.clock.install();
  return page;
}

/** Öffnet die Harness-Seite; enter=true klickt "Eintreten", items=true ruft setItems auf. */
async function openHarness(browser, server, device, { query = '', clock = false, enter = false, items = true } = {}) {
  const page = await newPage(browser, device, { clock });
  await page.goto(`${server.url}harness.html${query}`);
  await page.waitForFunction(() => window.__ready === true);
  if (items) await page.evaluate(() => window.ui.setItems(window.__items));
  if (enter) {
    await page.evaluate(() => window.ui.setReady());
    await page.click('#start-btn');
  }
  return page;
}

const events = (page) => page.evaluate(() => window.__events.slice());
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.trim());
const box = async (page, sel) => {
  const b = await page.locator(sel).boundingBox();
  if (!b) throw new Error(`${sel} ist nicht sichtbar`);
  return b;
};
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Wischen per DevTools-Protokoll (echte Touch-Ereignisse). */
async function swipe(page, from, to) {
  const send = (type, pts) => page.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await send('touchStart', [{ x: from[0], y: from[1] }]);
  for (let i = 1; i <= 6; i++) {
    await send('touchMove', [{ x: from[0] + ((to[0] - from[0]) * i) / 6, y: from[1] + ((to[1] - from[1]) * i) / 6 }]);
  }
  await send('touchEnd', []);
}

module.exports = { startUiServer, newPage, openHarness, events, text, box, overlap, swipe, DEVICES };
