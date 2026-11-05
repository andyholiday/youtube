// Paar-Ansicht (Third Person) in der echten App: Fokus, Antippen, Beschriftung, Kamera am geheimen Durchgang.
const assert = require('assert');
const H = require('./helpers');

const { until, openEntered, problems, faceAndWait, pressTouch, walkIntoSecret } = H;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

/** Schaltet auf Paar-Ansicht (Knopf antippen) und wartet, bis die Kamera hinter den Figuren steht. */
async function paarAn(page, mobile) {
  if (mobile) await page.tap('.tp-knopf'); else await page.click('.tp-knopf');
  await until(page, () => { const m = window.__museum; const c = m.cameraPosition(); return Math.hypot(c[0] - m.pos.x, c[2] - m.pos.z) > 2.5; });
}

t('Paar-Ansicht: Beschriftungszeile nennt das Bild im Blick, Antippen der Zeile öffnet die Großansicht', async (env) => {
  const page = await openEntered(env);
  await paarAn(page, true);
  await faceAndWait(page, 1);
  assert.strictEqual(await page.locator('#bes-name').innerText(), 'Valentinstag · 14. Februar 2022');
  await page.tap('#beschriftung');
  await page.waitForSelector('#lightbox:not([hidden])');
  assert.strictEqual(await page.locator('#lb-titel').innerText(), 'Valentinstag');
  assert.deepStrictEqual(problems(page), []);
});

t('Paar-Ansicht: Antippen und langes Drücken treffen das Bild, nie die Figuren (Figuren stehen auf der Sichtlinie)', async (env) => {
  const page = await openEntered(env);
  await paarAn(page, true);
  const p = await faceAndWait(page, 1);
  // Stellen auf dem Bildschirm, an denen eine Figur liegt UND das Bild dahinter hängt: Antippen öffnet trotzdem die Großansicht.
  const spots = await page.evaluate(() => {
    const r = window.__museum.figureRect();
    const out = [];
    for (let y = r.y0; y < r.y0 + 30; y += 6) for (let x = r.x0 + 20; x < r.x1 - 20; x += 6) out.push([x, y]); // Kopfhöhe
    return out;
  });
  assert.ok(spots.length > 5, 'Figuren nicht im Bild');
  let opened = false;
  for (const [x, y] of spots) {
    await page.touchscreen.tap(x, y);
    opened = await page.locator('#lightbox').isVisible();
    if (opened) break;
  }
  assert.ok(opened, 'Antippen auf eine Figur vor dem Bild öffnete nichts');
  assert.strictEqual(await page.locator('#lb-titel').innerText(), 'Valentinstag');
  await page.tap('#lb-close');
  await page.waitForSelector('#lightbox', { state: 'hidden' });
  const end = await pressTouch(page, p.x, p.y, 1);
  await page.waitForSelector('.eggs-notiz', { timeout: 4000 });
  await end();
  assert.ok(await page.locator('#lightbox').isHidden());
  assert.deepStrictEqual(problems(page), []);
});

t('Paar-Ansicht: Antippen der Figuren vor kahler Wand öffnet nichts (Figuren sind keine Ziele)', async (env) => {
  const page = await openEntered(env);
  await paarAn(page, true);
  await page.evaluate(() => window.__museum.setPose({ yaw: Math.PI, pitch: 0 })); // Blick zur Wand ohne Bild
  await H.frames(page, 10);
  const r = await page.evaluate(() => window.__museum.figureRect());
  await page.touchscreen.tap((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
  await H.frames(page, 20);
  assert.ok(await page.locator('#lightbox').isHidden());
  assert.strictEqual(await page.locator('.eggs-notiz').count(), 0);
  assert.deepStrictEqual(problems(page), []);
});

/** Läuft im Browser: Alle Punkte der Strecke Spieler → Kamera liegen in einem Raum oder in einem Türspalt. */
const SAMPLER = async () => {
  const { GAP } = await import('./js/layout.js');
  const rooms = window.__museum.rooms;
  const inside = (x, z) => rooms.some((r) => (x >= r.x0 - 0.02 && x <= r.x1 + 0.02 && z >= r.z0 - 0.02 && z <= r.z1 + 0.02)
    || r.doors.some((d) => {
      const lo = d.center - d.width / 2;
      const hi = d.center + d.width / 2;
      const b = { e: [r.x1, r.x1 + GAP, lo, hi], w: [r.x0 - GAP, r.x0, lo, hi], s: [lo, hi, r.z1, r.z1 + GAP], n: [lo, hi, r.z0 - GAP, r.z0] }[d.wall];
      return x >= b[0] - 0.02 && x <= b[1] + 0.02 && z >= b[2] - 0.02 && z <= b[3] + 0.02;
    }));
  const out = { frames: 0, bad: [], maxDist: 0 };
  window.__camSamples = out;
  const tick = () => {
    const m = window.__museum;
    const c = m.cameraPosition();
    const p = m.pos;
    out.frames++;
    out.maxDist = Math.max(out.maxDist, Math.hypot(c[0] - p.x, c[2] - p.z));
    for (let k = 0; k <= 10; k++) {
      const x = p.x + (c[0] - p.x) * (k / 10);
      const z = p.z + (c[2] - p.z) * (k / 10);
      if (!inside(x, z)) { out.bad.push([+x.toFixed(2), +z.toFixed(2), p.room]); break; }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

t('Paar-Ansicht am geheimen Durchgang: Kamera bleibt auf dem Weg hinein und zurück in begehbaren Räumen, nie hinter oder in einer Wand', async (env) => {
  const page = await openEntered(env, { mobile: false });
  await paarAn(page, false);
  await page.evaluate(SAMPLER);
  const secret = await walkIntoSecret(page);
  await H.frames(page, 40);
  await page.keyboard.down('KeyS'); // rückwärts wieder hinaus
  await until(page, (id) => window.__museum.pos.room !== id, secret, 15000);
  await page.keyboard.up('KeyS');
  await H.frames(page, 40);
  const s = await page.evaluate(() => window.__camSamples);
  assert.ok(s.frames > 100, `zu wenige Bilder: ${s.frames}`);
  assert.deepStrictEqual(s.bad, [], `Kamera/Sichtlinie außerhalb der Räume: ${JSON.stringify(s.bad.slice(0, 5))}`);
  assert.ok(s.maxDist > 2.5, 'Kamera stand nie hinter den Figuren');
  assert.deepStrictEqual(problems(page), []);
});

module.exports = { tests };
