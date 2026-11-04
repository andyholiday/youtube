// Bausteine für tour.js: Screenshots mit Layoutprüfung, Laufen per Eingabe, Großansicht, Entdecken, Abschlusskarte.
const path = require('path');
const L = require('./lib');
const { planRoute } = require('./walk-checks');

const OUT = path.join(__dirname, 'screenshots');
const GAP = 0.3;
const ENTER = { e: [1, 0], w: [-1, 0], s: [0, 1], n: [0, -1] };
const HUD = ['#entdeckt', '#hinweis', '#raumtitel', '#beschriftung', '#joystick.aktiv', '#leer-hinweis'];
const LIGHTBOX = ['.lb-karte', '#lb-close'];
const FINALE = ['.fin-karte'];

/** Fehlermeldungen zu sichtbaren Elementen, die sich überlappen oder aus dem Bild ragen (läuft im Browser). */
function layoutProblems(page, selectors) {
  return page.evaluate((sels) => {
    const seen = sels.map((s) => [s, document.querySelector(s)]).filter(([, el]) => el && !el.hidden).map(([s, el]) => {
      const cs = getComputedStyle(el);
      return { s, r: el.getBoundingClientRect(), on: cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.3 };
    }).filter((e) => e.on && e.r.width > 0);
    const out = [];
    const W = innerWidth, H = innerHeight;
    for (const a of seen) {
      // Der Joystick darf unter dem Daumen am Rand überstehen; alles andere muss ganz im Bild liegen.
      if (a.s !== '#joystick.aktiv' && (a.r.left < -0.5 || a.r.top < -0.5 || a.r.right > W + 0.5 || a.r.bottom > H + 0.5)) out.push(`${a.s} ragt aus dem Bild`);
    }
    seen.forEach((a, i) => seen.slice(i + 1).forEach((b) => {
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 1 && h > 1) out.push(`${a.s} überlappt ${b.s} (${Math.round(w)}×${Math.round(h)} px)`);
    }));
    return out;
  }, selectors);
}

/** JPEG-Screenshot; wirft, wenn sich sichtbare Elemente (selectors) überlappen oder abgeschnitten sind. */
async function shot(page, name, selectors = HUD) {
  await page.waitForTimeout(450);
  const problems = await layoutProblems(page, selectors);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 58, scale: 'css' });
  console.log('Screenshot:', name, problems.length ? `PROBLEM ${problems.join('; ')}` : '');
  if (problems.length) throw new Error(`${name}: ${problems.join('; ')}`);
}

const setPose = (page, p) => page.evaluate((q) => window.__museum.setPose(q), p);
const yawTo = (from, to) => Math.atan2(-(to[0] - from.x), -(to[1] - from.z));
const text = (page, sel) => page.locator(sel).innerText();

/** Position des Daumens für den schwebenden Joystick: links unten, ganz in der Zone und im Bild. */
const thumb = (page) => page.evaluate(() => ({ x: 90, y: innerHeight - 80 }));

/** Hält die Vorwärts-Eingabe (Taste bzw. Joystick), bis fn() fertig ist. */
async function withForward(page, mobile, fn) {
  if (mobile) {
    const c = await thumb(page);
    await L.touch.start(page, [{ x: c.x, y: c.y, id: 1 }]);
    await L.touch.move(page, [{ x: c.x, y: c.y - 46, id: 1 }]);
  } else await page.keyboard.down('KeyW');
  try { await fn(); } finally { if (mobile) await L.touch.end(page); else await page.keyboard.up('KeyW'); }
}

/** Läuft per Eingabe zum Ziel [x, z]; die Blickrichtung zum nächsten Wegpunkt setzt der Test (Wischen wäre zu langsam). */
async function walkTo(page, mobile, target) {
  for (let leg = 0; leg < 14; leg++) {
    const route = await planRoute(page, target);
    if (!route) throw new Error(`kein Weg nach ${target}`);
    if (!route.length) return;
    const p = await L.pos(page);
    const wp = route[0];
    if (route.length === 1 && Math.hypot(wp[0] - p.x, wp[1] - p.z) < 0.4) return;
    await setPose(page, { yaw: yawTo(p, wp), pitch: 0 });
    await withForward(page, mobile, () => page.waitForFunction(
      ([x, z]) => Math.hypot(window.__museum.pos.x - x, window.__museum.pos.z - z) < 0.3, wp, { timeout: 40000, polling: 'raf' }));
  }
  throw new Error(`Ziel ${target} nach 14 Teilstrecken nicht erreicht`);
}

/** Punkt dist Meter von der Türwand entfernt (vor der Tür: dist < 0, im Nachbarraum: dist > 0). */
function besideDoor(r, d, dist) {
  const [ux, uz] = ENTER[d.wall];
  const edge = { e: r.x1, w: r.x0, s: r.z1, n: r.z0 }[d.wall];
  const off = dist > 0 ? edge + (ux + uz) * (GAP + dist) : edge + (ux + uz) * dist;
  return ux ? [off, d.center] : [d.center, off];
}

/** Wartet, bis der Raumtitel mit dem erwarteten Text sichtbar ist. */
const waitTitle = (page, name) => page.waitForFunction((n) => {
  const el = document.getElementById('raumtitel');
  return !el.hidden && !el.classList.contains('weg') && el.textContent === n;
}, name, { timeout: 8000 });

/** Stellt den Spieler vor Bild i und wartet auf die Beschriftungszeile mit dem richtigen Titel. */
async function focusPicture(page, i, expected) {
  await page.evaluate((k) => window.__museum.faceEntry(k), i);
  await page.waitForFunction((e) => {
    const b = document.getElementById('beschriftung');
    return !b.hidden && document.getElementById('bes-name').textContent === e;
  }, expected, { timeout: 8000 }).catch(async () => {
    throw new Error(`Bild ${i}: Beschriftung "${await text(page, '#bes-name').catch(() => '?')}" statt "${expected}"`);
  });
}

async function tapPicture(page, mobile, i) {
  const pt = await page.evaluate((k) => window.__museum.screenPositionOf(k), i);
  if (mobile) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
  await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
  await page.waitForFunction(() => document.getElementById('lb-img').naturalWidth > 0);
}

async function swipeLeft(page, mobile) {
  if (!mobile) { await page.keyboard.press('ArrowRight'); return; }
  const w = await page.evaluate(() => innerWidth);
  const y = await page.evaluate(() => innerHeight * 0.3);
  await L.touch.start(page, [{ x: w * 0.7, y, id: 1 }]);
  for (const f of [0.55, 0.4, 0.25]) await L.touch.move(page, [{ x: w * f, y, id: 1 }]);
  await L.touch.end(page);
}

const closeLightbox = async (page, mobile) => {
  if (mobile) await page.tap('#lb-close'); else await page.keyboard.press('Escape');
  await page.waitForSelector('#lightbox', { state: 'hidden' });
};

module.exports = { HUD, LIGHTBOX, FINALE, shot, setPose, text, thumb, withForward, walkTo, besideDoor, waitTitle,
  focusPicture, tapPicture, swipeLeft, closeLightbox, layoutProblems };
