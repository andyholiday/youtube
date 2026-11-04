// Schild (plaque): leerer Titel zeigt nur das Datum, größer; die Textur ist nicht leer.
const assert = require('assert');
const S = require('./setup');

/** Läuft im Browser: baut Räume mit dem echten Layout und liest die Schild-Texturen aus. */
function inspectPlaques() {
  return (async () => {
    const { buildLayout } = await import('./js/layout.js');
    const { THEMES, buildTheme } = await import('./js/themes/index.js');
    const { formatDatum } = await import('./js/format.js');
    const THREE = await import('three');
    const items = window.__items.map((e) => ({ ...e, breite: 1600, hoehe: 1200 }));
    const rooms = buildLayout(items, THEMES);
    const seen = new Set();
    const out = [];
    const ink = (group) => {
      const face = group.children[group.children.length - 1];
      const c = face.material.map.image;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const bg = [d[0], d[1], d[2]];
      const rows = new Set();
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        // Pixel weicht deutlich vom Eckpixel ab = Text (Rahmenlinien liegen am Rand, daher nur die Mitte zählen)
        const p = i / 4, x = p % c.width, y = Math.floor(p / c.width);
        if (x < c.width * 0.1 || x > c.width * 0.9 || y < c.height * 0.2 || y > c.height * 0.8) continue;
        if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 150) { n++; rows.add(y); }
      }
      return { w: c.width, h: c.height, ink: n, rows: rows.size };
    };
    for (const room of rooms) {
      if (seen.has(room.theme)) continue;
      seen.add(room.theme);
      const theme = buildTheme(room.theme, room);
      const datum = formatDatum('2023-06-12');
      out.push({
        theme: room.theme,
        leer: ink(theme.plaque('', datum)),
        voll: ink(theme.plaque('Unser erster Urlaub', datum)),
        nichts: ink(theme.plaque('', '')),
        nurTitel: ink(theme.plaque('Nur ein Titel', '')),
        size: (() => { const b = new THREE.Box3().setFromObject(theme.plaque('', datum)); return { w: b.max.x - b.min.x, h: b.max.y - b.min.y }; })(),
      });
    }
    return out;
  })();
}

const ctx = {};
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('Schild: leerer Titel = nur Datum, Textur nicht leer und größer gesetzt (alle Themen)', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'desktop', { items: false });
  const out = await page.evaluate(inspectPlaques);
  assert.ok(out.length >= 2, `mehrere Themen im Layout gefunden: ${out.map((o) => o.theme)}`);
  for (const o of out) {
    assert.ok(o.leer.ink > 800, `${o.theme}: Datum sichtbar (Tintenpixel ${o.leer.ink})`);
    assert.ok(o.nichts.ink < o.leer.ink / 10, `${o.theme}: ohne Titel und Datum bleibt die Mitte leer (${o.nichts.ink})`);
    assert.ok(o.voll.ink > 800 && o.nurTitel.ink > 800, `${o.theme}: Titel mit/ohne Datum sichtbar`);
    assert.ok(o.leer.rows >= o.voll.rows * 0.4, `${o.theme}: Datum allein ist kräftig gesetzt (${o.leer.rows} Zeilen)`);
    assert.ok(o.size.w <= 0.6 + 1e-6 && o.size.h <= 0.2 + 1e-6, `${o.theme}: Schild höchstens 0,6 x 0,2 m (${o.size.w} x ${o.size.h})`);
    assert.ok(o.leer.w >= 1024, `${o.theme}: scharfe Textur (${o.leer.w} px)`);
  }
  assert.deepStrictEqual(page.errors, []);
});

module.exports = { ctx, tests };
