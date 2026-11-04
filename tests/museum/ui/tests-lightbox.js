// Beschriftungszeile, Großansicht (Blättern, Layout), Entdeckt-Zähler und Abschlusskarte.
const assert = require('assert');
const S = require('./setup');

const focus = (page, i) => page.evaluate((n) => window.ui.focusChanged(n), i);
const openLb = (page, i) => page.evaluate((n) => window.ui.openLightbox(n), i);
const counter = (page) => S.text(page, '#lb-zaehler');

const ctx = {};
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('Beschriftungszeile: Titel · Datum, ohne Titel nur Datum, ohne Datum nur Titel, null blendet aus', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'desktop', { enter: true });
  await focus(page, 0);
  assert.strictEqual(await S.text(page, '#beschriftung'), 'Erster Ausflug · 1. Mai 2021 – antippen zum Vergrößern');
  await focus(page, 2);
  assert.strictEqual(await S.text(page, '#beschriftung'), '12. Juni 2023 – antippen zum Vergrößern');
  await focus(page, 5);
  assert.strictEqual(await S.text(page, '#beschriftung'), 'Zufallsfoto – antippen zum Vergrößern');
  await focus(page, null);
  assert.ok(!(await page.isVisible('#beschriftung')));
  await focus(page, 99);
  assert.ok(!(await page.isVisible('#beschriftung')), 'ungültiger Index blendet aus');
});

for (const device of ['iphone', 'iphone-quer']) {
  test(`Beschriftungszeile überlagert den Joystick-Bereich nicht (${device})`, async () => {
    const page = await S.openHarness(ctx.browser, ctx.server, device, { enter: true });
    await page.evaluate(() => document.getElementById('joystick').classList.add('aktiv'));
    await focus(page, 3); // langer Titel: die breiteste Zeile
    const vp = page.viewportSize();
    const cap = await S.box(page, '#beschriftung');
    const joy = await S.box(page, '#joystick .basis');
    assert.ok(!S.overlap(cap, joy), `Zeile ${JSON.stringify(cap)} liegt auf dem Joystick ${JSON.stringify(joy)}`);
    assert.ok(cap.x >= 0 && cap.x + cap.width <= vp.width && cap.y + cap.height <= vp.height, 'Zeile liegt im Bild');
    assert.ok(cap.height >= 44, 'Mindesthöhe 44 px');
    assert.ok(joy.width >= 120, 'Joystick groß genug');
  });
}

test('Joystick: nur mit Touch und Klasse "aktiv" sichtbar, per Inline-Style positionierbar', async () => {
  const d = await S.openHarness(ctx.browser, ctx.server, 'desktop', { enter: true });
  await d.evaluate(() => document.getElementById('joystick').classList.add('aktiv'));
  assert.ok(!(await d.isVisible('#joystick')), 'Desktop: unsichtbar');
  const m = await S.openHarness(ctx.browser, ctx.server, 'iphone', { enter: true });
  assert.ok(!(await m.isVisible('#joystick')), 'ohne Klasse aktiv: unsichtbar');
  await m.evaluate(() => {
    const j = document.getElementById('joystick');
    j.classList.add('aktiv'); j.style.left = '120px'; j.style.top = '600px';
  });
  const b = await S.box(m, '#joystick .basis');
  assert.ok(Math.abs(b.x + b.width / 2 - 120) < 2 && Math.abs(b.y + b.height / 2 - 600) < 2, 'Mittelpunkt = left/top');
  const fill = await m.$eval('.basis', (e) => getComputedStyle(e).backgroundColor);
  assert.ok(/0\.6\)/.test(fill), `etwa 60 % Füllung: ${fill}`);
});

test('Großansicht: Inhalt, Zähler "3 / 7", ohne Titel steht das Datum an dessen Stelle', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'desktop', { enter: true });
  await openLb(page, 2);
  assert.ok(await page.isVisible('#lightbox'));
  assert.strictEqual(await counter(page), '3 / 7');
  assert.strictEqual(await S.text(page, '#lb-titel'), '12. Juni 2023');
  assert.ok(!(await page.isVisible('#lb-datum')), 'Datum nicht doppelt');
  assert.ok((await S.text(page, '#lb-text')).startsWith('Italien'));
  await openLb(page, 0);
  assert.strictEqual(await S.text(page, '#lb-titel'), 'Erster Ausflug');
  assert.strictEqual(await S.text(page, '#lb-datum'), '1. Mai 2021');
  assert.strictEqual(await page.$eval('#lb-img', (i) => i.getAttribute('alt')), 'Erster Ausflug');
  await openLb(page, 5);
  assert.ok(!(await page.isVisible('#lb-datum')) && !(await page.isVisible('#lb-text')), 'ohne Datum/Text keine leeren Zeilen');
  await openLb(page, -1); await openLb(page, 7); await openLb(page, null); await openLb(page, 'x');
  assert.strictEqual(await counter(page), '6 / 7', 'ungültige Indizes ändern nichts');
  assert.deepStrictEqual(await S.events(page), ['enter', 'lb:open'], 'onLightbox(true) nur einmal');
});

test('Blättern per Pfeil-Knopf, mit Umbruch an den Enden, Schließen meldet onLightbox(false)', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'desktop', { enter: true });
  await openLb(page, 0);
  await page.click('#lb-prev');
  assert.strictEqual(await counter(page), '7 / 7', 'zurück vom ersten zum letzten');
  await page.click('#lb-next');
  assert.strictEqual(await counter(page), '1 / 7');
  await page.click('#lb-next');
  assert.strictEqual(await S.text(page, '#lb-titel'), 'Valentinstag');
  await page.click('#lb-close');
  assert.ok(!(await page.isVisible('#lightbox')));
  assert.deepStrictEqual(await S.events(page), ['enter', 'lb:open', 'lb:close']);
});

test('Blättern per Tastatur (Pfeile) und Escape', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'desktop', { enter: true });
  await openLb(page, 2);
  await page.keyboard.press('ArrowRight');
  assert.strictEqual(await counter(page), '4 / 7');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  assert.strictEqual(await counter(page), '2 / 7');
  await page.keyboard.press('Escape');
  assert.ok(!(await page.isVisible('#lightbox')));
  await page.keyboard.press('ArrowRight');
  assert.ok(!(await page.isVisible('#lightbox')), 'geschlossen: Pfeile tun nichts');
});

test('Blättern per Wischen (links = weiter, rechts = zurück; senkrecht und kurz nicht)', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'iphone', { enter: true });
  await openLb(page, 2);
  await S.swipe(page, [300, 300], [100, 310]);
  assert.strictEqual(await counter(page), '4 / 7', 'nach links gewischt: nächstes');
  await S.swipe(page, [100, 300], [300, 295]);
  await S.swipe(page, [100, 300], [300, 295]);
  assert.strictEqual(await counter(page), '2 / 7', 'zweimal nach rechts: zwei zurück');
  await S.swipe(page, [200, 200], [210, 220]);
  await S.swipe(page, [200, 500], [180, 200]);
  assert.strictEqual(await counter(page), '2 / 7', 'kurz oder überwiegend senkrecht blättert nicht');
  assert.deepStrictEqual(page.errors, []);
});

test('Bild lädt nicht: kurzer Hinweis statt leerem Rahmen, Blättern danach geht weiter', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'iphone', { enter: true });
  await openLb(page, 6);
  await page.waitForSelector('#lb-fehler', { state: 'visible' });
  assert.ok((await S.text(page, '#lb-fehler')).includes('nicht geladen'));
  assert.ok(!(await page.isVisible('#lb-img')));
  assert.strictEqual(await S.text(page, '#lb-titel'), 'Kaputtes Bild', 'Titel steht trotzdem da');
  await page.click('#lb-next');
  await page.waitForFunction(() => document.getElementById('lb-img').complete && document.getElementById('lb-img').naturalWidth > 0);
  assert.ok(!(await page.isVisible('#lb-fehler')));
  assert.ok(await page.isVisible('#lb-img'));
});

test('Tippen auf die Beschriftungszeile öffnet die Großansicht des fokussierten Bildes', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'iphone', { enter: true });
  await focus(page, 4);
  await page.tap('#beschriftung');
  assert.ok(await page.isVisible('#lightbox'));
  assert.strictEqual(await counter(page), '5 / 7');
  assert.deepStrictEqual(await S.events(page), ['enter', 'lb:open']);
});

for (const device of ['iphone', 'iphone-quer', 'desktop']) {
  test(`Großansicht-Layout: nichts abgeschnitten, Knöpfe ≥ 44 px (${device})`, async () => {
    const page = await S.openHarness(ctx.browser, ctx.server, device, { enter: true });
    for (const i of [0, 3]) { // Querformat-Foto mit kurzem Text, Hochformat mit sehr langem Titel/Text
      await openLb(page, i);
      await page.waitForFunction(() => document.getElementById('lb-img').naturalWidth > 0);
      const vp = page.viewportSize();
      const karte = await S.box(page, '.lb-karte');
      const img = await S.box(page, '#lb-img');
      const info = await S.box(page, '.lb-info');
      const close = await S.box(page, '#lb-close');
      assert.ok(karte.x >= 0 && karte.y >= 0 && karte.x + karte.width <= vp.width + 0.5 && karte.y + karte.height <= vp.height + 0.5,
        `Karte im Bild: ${JSON.stringify(karte)} in ${vp.width}x${vp.height}`);
      assert.ok(!S.overlap(close, karte), 'Schließen-Knopf liegt nicht auf der Karte');
      assert.ok(close.width >= 44 && close.height >= 44 && close.x + close.width <= vp.width && close.y >= 12 - 0.5);
      for (const sel of ['#lb-prev', '#lb-next']) {
        const b = await S.box(page, sel);
        assert.ok(b.width >= 44 && b.height >= 44 && b.x >= karte.x && b.x + b.width <= karte.x + karte.width);
      }
      const sideBySide = device === 'iphone-quer';
      if (sideBySide) {
        assert.ok(info.x >= img.x + img.width - 1, `Bild links, Text rechts: img ${img.x + img.width}, info ${info.x}`);
        assert.ok(img.height <= vp.height * 0.9 + 1 && img.height >= vp.height * 0.6, `Bild bis ~90dvh, ist ${img.height}`);
        assert.ok(info.width >= 200);
      } else {
        assert.ok(info.y >= img.y + img.height - 1, 'Bild oben, Text darunter');
      }
      assert.ok(await page.$eval('html', (h) => h.scrollWidth <= innerWidth), 'kein seitliches Scrollen');
    }
    // Der lange Text scrollt in der Infospalte, statt die Karte zu sprengen.
    const scroll = await page.$eval('.lb-info', (e) => ({ sh: e.scrollHeight, ch: e.clientHeight }));
    assert.ok(scroll.sh >= scroll.ch);
    assert.deepStrictEqual(page.errors, []);
  });
}

test('Entdeckt-Zähler: zählt fokussierte und geöffnete Bilder einmalig; Abschlusskarte erst bei allen', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'desktop', { enter: true });
  await page.evaluate(() => window.ui.setWidmung(window.__widmung));
  assert.strictEqual(await S.text(page, '#entdeckt'), '0 von 7 entdeckt');
  await focus(page, 0); await focus(page, 0); await focus(page, 1);
  assert.strictEqual(await S.text(page, '#entdeckt'), '2 von 7 entdeckt');
  await openLb(page, 3);
  await page.click('#lb-next');
  assert.strictEqual(await S.text(page, '#entdeckt'), '4 von 7 entdeckt', 'Blättern zählt mit');
  await page.keyboard.press('Escape');
  for (const i of [2, 5]) await focus(page, i);
  assert.strictEqual(await S.text(page, '#entdeckt'), '6 von 7 entdeckt');
  await page.waitForTimeout(3000);
  assert.ok(!(await page.isVisible('#finale')), 'noch nicht alles entdeckt');
  await focus(page, 6);
  assert.strictEqual(await S.text(page, '#entdeckt'), '7 von 7 entdeckt');
  await page.waitForSelector('#finale', { state: 'visible', timeout: 5000 });
  assert.ok((await S.text(page, '#fin-titel')).includes('alle Erinnerungen entdeckt'));
  assert.ok((await S.text(page, '#fin-text')).includes('Jede dieser Erinnerungen gehört uns.'), 'zeigt widmung.text');
  assert.strictEqual(await S.text(page, '#fin-btn'), 'Weiter umsehen');
  await page.click('#fin-btn');
  assert.ok(!(await page.isVisible('#finale')));
  assert.deepStrictEqual(await S.events(page), ['enter', 'lb:open', 'lb:close', 'lb:open', 'lb:close']);
  await focus(page, 1); await openLb(page, 1); await page.keyboard.press('Escape');
  await page.waitForTimeout(3000);
  assert.ok(!(await page.isVisible('#finale')), 'Abschlusskarte nur einmal');
});

test('Abschlusskarte ohne Widmung: kein Text; während der Großansicht erst nach dem Schließen', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'iphone', { enter: true });
  for (const i of [0, 1, 2, 3, 4, 5]) await focus(page, i);
  await openLb(page, 6);
  await page.waitForTimeout(3200);
  assert.ok(!(await page.isVisible('#finale')), 'während die Großansicht offen ist, wartet die Karte');
  await page.click('#lb-close');
  await page.waitForSelector('#finale', { state: 'visible', timeout: 3000 });
  assert.ok(!(await page.isVisible('#fin-text')), 'ohne Widmung kein Textblock');
  assert.ok((await S.box(page, '#fin-btn')).height >= 44);
});

test('Ein einziges Bild: kein Zähler, keine Pfeile, keine Abschlusskarte', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'desktop', { enter: true, items: false });
  await page.evaluate(() => window.ui.setItems(window.__items.slice(0, 1)));
  await focus(page, 0);
  await openLb(page, 0);
  assert.ok(!(await page.isVisible('#lb-prev')) && !(await page.isVisible('#lb-next')) && !(await page.isVisible('#lb-zaehler')));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(3000);
  assert.ok(!(await page.isVisible('#finale')));
});

test('Barrierearm: Namen für Knöpfe/Dialoge, Kontrast ≥ 4,5:1 für wichtige Texte', async () => {
  const page = await S.openHarness(ctx.browser, ctx.server, 'desktop', { enter: true });
  await focus(page, 0);
  await openLb(page, 0);
  const names = await page.evaluate(() => ['lb-close', 'lb-prev', 'lb-next', 'beschriftung', 'start-btn', 'fin-btn']
    .map((id) => [id, (document.getElementById(id).getAttribute('aria-label') || document.getElementById(id).textContent).trim()]));
  for (const [id, n] of names) assert.ok(n.length > 1, `${id} braucht einen Namen`);
  assert.strictEqual(await page.getAttribute('#lightbox', 'role'), 'dialog');
  assert.strictEqual(await page.getAttribute('#lightbox', 'aria-modal'), 'true');
  const pairs = await page.evaluate(() => {
    const rgb = (s) => s.match(/[\d.]+/g).map(Number);
    const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
      .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    // Halbtransparenten Hintergrund auf das ungünstigste Weiß legen (Kulisse unbekannt).
    const over = ([r, g, b, a = 1], base) => [r, g, b].map((v, i) => v * a + base[i] * (1 - a));
    const ratio = (fg, bg) => { const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x); return (a + 0.05) / (b + 0.05); };
    const pick = (sel, bgSel) => {
      const el = document.querySelector(sel);
      const bg = rgb(getComputedStyle(document.querySelector(bgSel)).backgroundColor);
      const base = bg.length > 3 && bg[3] < 1 ? over(bg, [255, 255, 255]) : bg.slice(0, 3);
      return [sel, ratio(rgb(getComputedStyle(el).color).slice(0, 3), base)];
    };
    return [
      pick('#lb-titel', '.lb-karte'), pick('#lb-datum', '.lb-karte'), pick('#lb-text', '.lb-karte'), pick('#lb-zaehler', '.lb-karte'),
      pick('#bes-name', '#beschriftung'), pick('#bes-hint', '#beschriftung'), pick('#entdeckt', '#entdeckt'),
      pick('#start-btn', '#start-btn'), pick('#fin-btn', '#fin-btn'), pick('#raumtitel', '#raumtitel'),
    ];
  });
  for (const [sel, r] of pairs) assert.ok(r >= 4.5, `Kontrast ${sel}: ${r.toFixed(2)}`);
});

module.exports = { ctx, tests };
