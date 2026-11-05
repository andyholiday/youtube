// Tests der Easter Eggs (Playwright + Chromium/SwiftShader). Start: node tests/museum/features/eggs/run.js [Teilname]
// Das Harness (harness.html) baut Layout, Themen und Kollision echt auf und stellt ein Mini-ctx nach SPEC-FEATURES bereit.
const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { suiteRealApp } = require('./real-app');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SHOTS = path.join(__dirname, 'screenshots');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const results = [];
const only = process.argv[2];
let browser, server, base;

async function startServer() {
  server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}

/** Handy hochkant (iPhone-Größe, dpr 2). context: bestehender Kontext (gleiches localStorage) oder neu. */
async function open(query = '', context = null) {
  const ctx = context || await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.warnings = [];
  page.on('console', (m) => {
    if (m.type() === 'error') page.errors.push(`console.error: ${m.text()}`);
    if (m.type() === 'warning') page.warnings.push(m.text());
  });
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => page.errors.push(`requestfailed: ${r.url()}`));
  await page.goto(`${base}/tests/museum/features/eggs/harness.html${query}`);
  await page.waitForFunction('window.__h && window.__h.ready === true', null, { timeout: 120000 });
  page.ctx_ = ctx;
  return page;
}

const h = (page, expr) => page.evaluate(`window.__h.${expr}`);
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} statt ${JSON.stringify(b)}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => {
  await page.evaluate('window.__h.render()');
  await page.screenshot({ path: path.join(SHOTS, `${name}.jpg`), type: 'jpeg', quality: 86 });
};

async function test(name, fn) {
  if (only && !name.includes(only)) return;
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true }); console.log(`  ok   ${name} (${Date.now() - t0} ms)`); } catch (err) {
    results.push({ name, ok: false });
    console.log(`  FAIL ${name}\n       ${String(err.message).split('\n').join('\n       ')}`);
  }
}

/** Seite nach den Prüfungen: keine Konsolenfehler und keine Warnungen der Eggs. */
function clean(page, label) {
  assert(page.errors.length === 0, `${label}: Konsolenfehler: ${page.errors.join(' | ')}`);
  assert(page.warnings.length === 0, `${label}: Warnungen: ${page.warnings.join(' | ')}`);
}

const reg = (page) => h(page, 'registered()');
const heartIndex = async (page) => (await reg(page)).findIndex((o) => o.geo === 'SphereGeometry');
const picIndexes = async (page) => (await reg(page)).map((o, i) => (o.geo === 'PlaneGeometry' ? i : -1)).filter((i) => i >= 0);

async function tapRegistered(page, k, dist = 1.4) {
  const p = await page.evaluate(([i, d]) => window.__h.pointAtRegistered(i, d), [k, dist]);
  assert(p.visible, 'Objekt nicht im Blickfeld');
  return page.evaluate(([x, y]) => window.__h.tapAt(x, y), [p.x, p.y]);
}

// ---------------------------------------------------------------- Herz und Herzregen
async function suiteHeart() {
  const page = await open('');
  await test('Herz: kleines leuchtendes Porzellanherz (~12 cm) in einem mittleren Raum', async () => {
    const k = await heartIndex(page);
    assert(k >= 0, 'kein Herz registriert');
    const box = await h(page, 'heartBox()');
    const wide = Math.max(box.size[0], box.size[2]); // je nach Wand liegt die Breite auf x oder z
    assert(wide > 0.1 && wide < 0.15 && box.size[1] > 0.09 && box.size[1] < 0.15, `Größe ${box.size.map((v) => v.toFixed(3))}`);
    assert(box.glow > 0.1, `kein Leuchten (${box.glow})`);
    const pos = (await reg(page))[k].pos;
    const room = await page.evaluate(([x, z]) => window.__h.rooms.find((r) => x >= r.x0 - 0.2 && x <= r.x1 + 0.2 && z >= r.z0 - 0.2 && z <= r.z1 + 0.2).id, [pos[0], pos[2]]);
    eq(room, 1, 'Raum des Herzens (9 Erinnerungen = 3 Räume, Mitte)');
    assert(pos[1] > 1.2 && pos[1] < 1.6, `Höhe ${pos[1]}`);
  });
  await test('Herzregen: Antippen zeigt geheim.herzregen, Herzen fallen, ~5 s, wiederholbar', async () => {
    const k = await heartIndex(page);
    await page.evaluate(() => window.__h.enter());
    const tapped = Date.now();
    const res = await tapRegistered(page, k);
    eq(res.kind, 'object', 'Treffer');
    await page.waitForSelector('.eggs-regen-text');
    eq(await page.textContent('.eggs-regen-text'), 'Ich liebe dich.', 'Text');
    await sleep(2200);
    const px = await page.evaluate('window.__h.alphaPixels()');
    assert(px > 2000, `zu wenige Herz-Pixel im Canvas (${px})`);
    await shot(page, '01-herzregen');
    await page.waitForSelector('.eggs-regen', { state: 'detached', timeout: 12000 });
    const dur = (Date.now() - tapped) / 1000;
    assert(dur > 5 && dur < 8.5, `Regen dauerte ${dur.toFixed(1)} s`);
    const again = await tapRegistered(page, k);
    eq(again.kind, 'object', 'zweiter Treffer');
    await page.waitForSelector('.eggs-regen-text');
    await page.evaluate(() => window.__h.advance(0.1));
  });
  await heartAfter(page);
  await page.ctx_.close();
}

async function heartAfter(page) {
  await test('Herz: Tipp durch die Wand (anderer Raum) löst nichts aus', async () => {
    await page.waitForSelector('.eggs-regen', { state: 'detached', timeout: 12000 });
    const res = await page.evaluate(() => {
      const hh = window.__h;
      const r0 = hh.rooms[0];
      hh.setPose({ x: (r0.x0 + r0.x1) / 2, z: (r0.z0 + r0.z1) / 2, yaw: -Math.PI / 2, pitch: 0, room: 0 });
      return hh.tapAt(innerWidth / 2, innerHeight / 2).kind;
    });
    assert(res !== 'object', `Treffer ${res}`);
    eq(await page.locator('.eggs-regen').count(), 0, 'Overlay');
  });
  await test('Herz: Nahaufnahme an der Wand (Screenshot)', async () => {
    const k = await heartIndex(page);
    await page.evaluate((i) => window.__h.pointAtRegistered(i, 1.9), k);
    await shot(page, '02-herz-wand');
  });
  await test('Herz: keine Konsolenfehler/Warnungen', async () => clean(page, 'Herz'));
}

// ---------------------------------------------------------------- Geheimer Raum
async function checkWallRays(page, info) {
  return page.evaluate((inf) => {
    const hh = window.__h;
    const secret = hh.rooms.find((r) => r.secret);
    const host = hh.rooms[inf.host];
    const d = inf.door;
    const n = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[d.wall];
    const along = { n: [1, 0], s: [-1, 0], w: [0, -1], e: [0, 1] }[d.wall];
    const wallAt = { n: [d.center, host.z0], s: [d.center, host.z1], w: [host.x0, d.center], e: [host.x1, d.center] }[d.wall];
    const bad = [];
    let panelHits = 0;
    for (let t = -d.width / 2 + 0.1; t <= d.width / 2 - 0.1; t += 0.4) {
      for (const y of [0.3, 1.0, 1.7, 2.4, 3.2]) {
        const px = wallAt[0] + along[0] * t, pz = wallAt[1] + along[1] * t;
        const hit = hh.hitFirst([px + n[0] * 3, y, pz + n[1] * 3], [px - n[0] * 4, y, pz - n[1] * 4]);
        if (!hit || hit.distance < 2.9 || hit.distance > 3.2) bad.push([t, y, hit && hit.distance]);
        else if (hit.panel) panelHits++;
      }
    }
    return { bad, panelHits, secretRoom: secret.id };
  }, info);
}

async function suiteSecret() {
  const page = await open('');
  const info = await page.evaluate('window.__h.viewHostDoor()');
  await test('Geheimer Raum: liegt am letzten Raum, 6×6 m, Thema geheim, ohne Slots, nicht in den Erinnerungen', async () => {
    const rooms = await page.evaluate('window.__h.rooms');
    const secret = rooms.filter((r) => r.secret);
    eq(secret.length, 1, 'Anzahl geheimer Räume');
    const s = secret[0];
    eq([s.x1 - s.x0, s.z1 - s.z0, s.theme, s.slots.length], [6, 6, 'geheim', 0], 'Maße/Thema/Slots');
    eq(s.id, rooms.length - 1, 'letzter Raum');
    const normal = rooms.filter((r) => !r.secret);
    eq(normal.flatMap((r) => r.slots.map((q) => q.index)), [0, 1, 2, 3, 4, 5, 6, 7, 8], 'Bildindizes nur der Erinnerungen');
    eq(await h(page, 'items.length'), 9, 'ctx.items ohne geheime Bilder');
    const host = rooms[s.doors[0].to];
    assert(host.doors.some((d) => d.secret && d.to === s.id) && !s.doors[0].secret, 'Tür: im Gastgeber secret, innen offen');
    eq(host.id, normal.length - 1, 'Gastgeberraum = letzter normaler Raum');
  });
  await test('Geheimer Raum: Wand sieht geschlossen aus (Strahlen treffen die Wand), Eingang nicht im Rundgang-Weg', async () => {
    const r = await checkWallRays(page, info);
    eq(r.bad, [], 'Strahlen, die die Wand nicht treffen');
    assert(r.panelHits > 10, `Wandpaneel nicht getroffen (${r.panelHits})`);
    const pan = await h(page, 'panel()');
    eq([pan.opacity, pan.visible, pan.layer0], [1, true, true], 'Paneel geschlossen');
  });
  await test('Geheimer Raum: Kollision lässt den Durchgang frei, daneben bleibt die Wand fest', async () => {
    const r = await page.evaluate((inf) => {
      const hh = window.__h;
      const host = hh.rooms[inf.host];
      const d = inf.door;
      const pt = (t, s) => ({ n: [t, host.z0 - s], s: [t, host.z1 + s], w: [host.x0 - s, t], e: [host.x1 + s, t] }[d.wall]);
      const blockedAlong = [];
      for (let s = -2.5; s <= 3; s += 0.1) { const [x, z] = pt(d.center, s); if (hh.collide(x, z, 0.3)) blockedAlong.push(+s.toFixed(1)); }
      const [wx, wz] = pt(d.center + d.width / 2 + 0.7, 0.15);
      return { blockedAlong, besideWall: hh.collide(wx, wz, 0.3) };
    }, info);
    eq(r.blockedAlong, [], 'blockierte Punkte entlang des Durchgangs');
    assert(r.besideWall, 'neben der Tür müsste die Wand blockieren');
  });
  await secretWalk(page, info);
  await secretPics(page);
  await test('Geheimer Raum: keine Konsolenfehler/Warnungen', async () => clean(page, 'Geheimer Raum'));
  await page.ctx_.close();
}

async function secretWalk(page, info) {
  await test('Geheimer Raum: begehbar, Paneel löst sich auf, Toast genau einmal, Paneel schließt wieder', async () => {
    await page.evaluate(() => window.__h.enter());
    await page.evaluate(() => window.__h.viewHostDoor(0, 3.2));
    eq(await h(page, 'toasts.length'), 0, 'Toast vor dem Betreten');
    await page.evaluate(() => window.__h.advance(3.5, { x: 0, y: 1 }, 0, false));
    const st = await page.evaluate(() => ({ pos: window.__h.pos(), panel: window.__h.panel(), toasts: window.__h.toasts, secret: window.__h.rooms.find((r) => r.secret).id }));
    eq(st.pos.room, st.secret, 'Spieler im geheimen Raum');
    eq(st.panel.opacity, 0, 'Paneel aufgelöst');
    eq(st.toasts, ['Schön, dass du ihn gefunden hast.'], 'Toast');
    await page.evaluate(() => window.__h.viewHostDoor(0, 3.2));
    await page.evaluate(() => window.__h.advance(1.5, undefined, 0, false));
    assert((await h(page, 'panel()')).opacity > 0.99, 'Paneel schließt sich wieder');
    await page.evaluate(() => window.__h.advance(3.5, { x: 0, y: 1 }, 0, false));
    eq(await h(page, 'toasts.length'), 1, 'Toast beim zweiten Betreten');
  });
  await test('Geheimer Raum: Hinweis am Eingang (Fuge, Efeu) und Screenshots außen/innen', async () => {
    await page.evaluate(() => { document.querySelectorAll('.x-toast').forEach((e) => e.remove()); window.__h.viewHostDoor(-0.75, 3.3, 0.1); window.__h.advance(2, undefined, 0, false); });
    eq((await h(page, 'panel()')).opacity, 1, 'Paneel zu');
    await shot(page, '03-eingang-aussen');
    await page.evaluate(() => { window.__h.viewHostDoor(0, 0.9); window.__h.advance(0.1, undefined, 0, false); });
    const mid = (await h(page, 'panel()')).opacity;
    assert(mid > 0.2 && mid < 0.8, `Paneel löst sich auf (Deckkraft ${mid})`);
    await shot(page, '04-eingang-loest-sich');
    await page.evaluate(() => { window.__h.viewSecretDoor(4.6); window.__h.advance(1.2, undefined, 0, false); });
    await shot(page, '05-eingang-innen');
  });
}

async function secretPics(page) {
  await test('Geheimer Raum: Bilder aus geheim.raum, Antippen öffnet die Großansicht', async () => {
    const pics = await picIndexes(page);
    eq(pics.length, 3, 'registrierte Bilder im geheimen Raum');
    await page.evaluate(() => window.__h.enter());
    await sleep(800);
    const res = await tapRegistered(page, pics[0], 2.2);
    eq(res.kind, 'object', 'Treffer');
    await page.waitForSelector('.eggs-viewer');
    eq(await page.textContent('.eggs-viewer h2'), 'Zu zweit auf dem Wasser', 'Titel');
    eq(await page.textContent('.eggs-datum'), '14. August 2021', 'Datum');
    assert((await page.textContent('.eggs-viewer-text')).includes('Boot'), 'Text');
    eq(await h(page, 'paused'), true, 'Steuerung pausiert');
    await sleep(700);
    await shot(page, '06-geheim-grossansicht');
    await page.click('.eggs-schliessen');
    await page.waitForSelector('.eggs-viewer', { state: 'detached' });
    eq(await h(page, 'paused'), false, 'Steuerung wieder frei');
  });
  await test('Geheimer Raum: Screenshots Raum (Bilder, Ecke mit Kerzen)', async () => {
    await page.evaluate(() => { window.__h.viewSecretFar(); window.__h.advance(1, undefined, 0, false); });
    await shot(page, '07-geheimer-raum');
    await page.evaluate(() => { window.__h.viewSecretCorner(); window.__h.advance(0.1, undefined, 0, false); });
    await shot(page, '08-geheimer-raum-ecke');
  });
}

async function suiteBoard() {
  const page = await open('?raum=0');
  await test('Geheimer Raum ohne Bilder: Tafel mit geheim.raumtext, keine antippbaren Bilder', async () => {
    eq((await picIndexes(page)).length, 0, 'registrierte Bilder');
    const scene = await h(page, 'scene()');
    assert(scene.some((m) => m.geo === 'PlaneGeometry' && m.params && m.params.width === 1.9 && m.params.height === 0.95), 'Tafel fehlt');
    await page.evaluate(() => { window.__h.viewSecretFar(); window.__h.advance(1, undefined, 0, false); });
    await shot(page, '09-geheimer-raum-tafel');
    clean(page, 'Tafel');
  });
  await page.ctx_.close();
  const bare = await open('?geheim=none');
  await test('Ohne geheim-Block: dezente Standardtexte (Herzregen, Toast), nichts bricht', async () => {
    const k = await heartIndex(bare);
    assert(k >= 0, 'Herz fehlt');
    await bare.evaluate(() => window.__h.enter());
    await tapRegistered(bare, k);
    await bare.waitForSelector('.eggs-regen-text');
    eq(await bare.textContent('.eggs-regen-text'), 'Von Herzen.', 'Standardtext Herzregen');
    await bare.evaluate(() => { window.__h.viewHostDoor(0, 3.2); window.__h.advance(3.5, { x: 0, y: 1 }, 0, false); });
    eq(await h(bare, 'toasts'), ['Schön, dass du ihn gefunden hast.'], 'Standard-Toast');
    clean(bare, 'ohne geheim');
  });
  await bare.ctx_.close();
}

// ---------------------------------------------------------------- Besondere Tage
async function suiteDays() {
  const year = new Date().getFullYear();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  let page = await open('?heute=07-06', ctx);
  await test('Besondere Tage: ?heute=07-06 zeigt Karte mit {jahre}, Weiter startet Herzregen und Festdeko', async () => {
    await page.evaluate(() => window.__h.enter());
    await page.waitForSelector('.eggs-karte', { timeout: 6000 });
    eq(await page.textContent('.eggs-karte-text'), `Heute vor ${year - 2019} Jahren saßen wir zum ersten Mal am Wasser.`, 'Text');
    eq(await h(page, 'paused'), true, 'Steuerung pausiert');
    assert(await page.locator('.eggs-karte .eggs-knopf').innerText() === 'Weiter', 'Knopf');
    await sleep(900);
    await page.evaluate(() => window.__h.advance(0.1));
    await shot(page, '10-begruessung');
    const before = (await h(page, 'scene()')).filter((m) => m.geo === 'ExtrudeGeometry').length;
    await page.click('.eggs-karte .eggs-knopf');
    await page.waitForSelector('.eggs-karte-wrap', { state: 'detached', timeout: 3000 });
    eq(await h(page, 'paused'), false, 'Steuerung frei');
    await page.waitForSelector('.eggs-regen');
    const after = (await h(page, 'scene()')).filter((m) => m.geo === 'ExtrudeGeometry').length;
    eq(after - before, 8, 'Zahl der schwebenden Porzellanherzen');
    await page.evaluate(() => window.__h.advance(2.2));
    await sleep(1800);
    await shot(page, '11-festtag-herzregen');
    clean(page, 'Tage');
  });
  await page.close();
  await test('Besondere Tage: einmal pro Tag und Gerät (zweiter Besuch am selben Tag ohne Karte)', async () => {
    page = await open('?heute=07-06', ctx);
    await page.evaluate(() => window.__h.enter());
    await sleep(2500);
    eq(await page.locator('.eggs-karte').count(), 0, 'Karte beim zweiten Besuch');
    await page.close();
  });
  await daysMore(ctx);
}

async function daysMore(ctx) {
  let page;
  await test('Besondere Tage: anderer Tag zeigt seine Karte, Tag ohne Eintrag keine, &neu=1 wiederholt', async () => {
    page = await open('?heute=02-14', ctx);
    await page.evaluate(() => window.__h.enter());
    await page.waitForSelector('.eggs-karte', { timeout: 6000 });
    eq(await page.textContent('.eggs-karte-text'), 'Alles Liebe zum Valentinstag!', 'Text ohne Jahr');
    await page.close();
    page = await open('?heute=03-03', ctx);
    await page.evaluate(() => window.__h.enter());
    await sleep(2500);
    eq(await page.locator('.eggs-karte').count(), 0, 'Karte an einem Tag ohne Eintrag');
    await page.close();
    page = await open('?heute=07-06&neu=1', ctx);
    await page.evaluate(() => window.__h.enter());
    await page.waitForSelector('.eggs-karte', { timeout: 6000 });
    await page.close();
  });
  await test('Besondere Tage: Karte erscheint erst nach dem Eintreten', async () => {
    const fresh = await open('?heute=02-14');
    await sleep(2500);
    eq(await fresh.locator('.eggs-karte').count(), 0, 'Karte vor dem Eintreten');
    await fresh.evaluate(() => window.__h.enter());
    await fresh.waitForSelector('.eggs-karte', { timeout: 6000 });
    await fresh.ctx_.close();
  });
  await daysLogic();
  await ctx.close();
}

async function daysLogic() {
  await test('Besondere Tage: Logik (Tagesvergleich, {jahre}, ?heute)', async () => {
    const page2 = await open('?heute=03-03');
    const out = await page2.evaluate(async () => {
      const days = await import('/site/js/features/eggs-days.js');
      return {
        heute: days.today('?heute=2-4', new Date(2026, 5, 1)),
        ohne: days.today('', new Date(2026, 10, 5)).tag,
        jahre: days.entryFor([{ tag: '07-06', jahr: 2019, text: 'Vor {jahre} Jahren' }], { tag: '07-06', jahr: 2026 }),
        keinJahr: days.entryFor([{ tag: '07-06', jahr: null, text: 'Hallo {jahre}' }], { tag: '07-06', jahr: 2026 }),
        nullen: days.entryFor([{ tag: '7-6', jahr: null, text: 'x' }], { tag: '07-06', jahr: 2026 }),
        anderer: days.entryFor([{ tag: '07-07', text: 'x' }], { tag: '07-06', jahr: 2026 }),
      };
    });
    eq(out.heute, { tag: '02-04', jahr: 2026, test: true }, '?heute normalisiert');
    eq(out.ohne, '11-05', 'ohne Parameter: heute');
    eq(out.jahre, { text: 'Vor 7 Jahren' }, '{jahre}');
    eq(out.keinJahr, { text: 'Hallo' }, 'ohne Jahr entfällt {jahre}');
    eq(out.nullen, { text: 'x' }, 'Tag ohne Nullen');
    eq(out.anderer, null, 'anderer Tag');
    await page2.ctx_.close();
  });
}

// ---------------------------------------------------------------- Notizen
async function suiteNotes() {
  const page = await open('');
  await test('Notizen: lang drücken auf Bild mit Notiz zeigt Karte, Tippen schließt; ohne Notiz passiert nichts', async () => {
    await page.evaluate(() => window.__h.enter());
    await page.evaluate(() => window.__h.facePicture(1, 2.6));
    await page.evaluate(() => window.__h.longPress(0));
    await sleep(500);
    eq(await page.locator('.eggs-notiz').count(), 0, 'Karte bei Bild ohne Notiz');
    eq(await h(page, 'paused'), false, 'Steuerung unberührt');
    await page.evaluate(() => window.__h.longPress(1));
    await page.waitForSelector('.eggs-notiz');
    eq(await page.textContent('.eggs-notiz-text'), 'Ich wusste schon beim ersten Blick,\ndass du die Richtige bist.', 'Notiztext');
    const rot = await page.evaluate(() => getComputedStyle(document.querySelector('.eggs-notiz')).transform);
    assert(rot && rot !== 'none', 'Karte ist nicht schräg');
    eq(await h(page, 'paused'), true, 'Steuerung pausiert');
    await sleep(900);
    await shot(page, '12-notiz');
    await page.mouse.click(195, 700);
    await page.waitForSelector('.eggs-notiz-wrap', { state: 'detached' });
    eq(await h(page, 'paused'), false, 'Steuerung wieder frei');
  });
  await test('Notizen: kleine Büroklammer an jedem Bild mit Notiz (Screenshot)', async () => {
    const scene = await h(page, 'scene()');
    const clips = scene.filter((m) => m.geo === 'PlaneGeometry' && m.params && m.params.width === 0.08 && m.params.height === 0.2);
    eq(clips.length, 4, 'Büroklammern (Notizen an Bild 1, 4, 7 und am geheimen Bild 0)');
    const slot = await page.evaluate(() => window.__h.rooms.flatMap((r) => r.slots).find((s) => s.index === 1));
    assert(clips.some((c) => Math.hypot(c.pos[0] - slot.x, c.pos[2] - slot.z) < slot.w), 'keine Klammer in Bildnähe');
    await page.evaluate(() => window.__h.facePicture(1, 4.4));
    await shot(page, '13-bueroklammer');
  });
  await notesSecret(page);
  await test('Notizen: keine Konsolenfehler/Warnungen', async () => clean(page, 'Notizen'));
  await page.ctx_.close();
}

async function notesSecret(page) {
  await test('Notizen: geheimes Bild per echtem Lang-Drücken (Maus ≥ 550 ms), kurzes Drücken nichts', async () => {
    const pics = await picIndexes(page);
    const p = await page.evaluate((k) => window.__h.pointAtRegistered(k, 2.4), pics[0]);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await sleep(150);
    await page.mouse.up();
    await sleep(700);
    eq(await page.locator('.eggs-notiz').count(), 0, 'Karte nach kurzem Drücken');
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await sleep(800);
    await page.mouse.up();
    await page.waitForSelector('.eggs-notiz', { timeout: 3000 });
    eq(await page.textContent('.eggs-notiz-text'), 'Du hast gelacht, obwohl wir fast nass geworden sind.', 'Notiz des geheimen Bildes');
    await sleep(500);
    await page.mouse.click(195, 700);
    await page.waitForSelector('.eggs-notiz-wrap', { state: 'detached' });
    const p2 = await page.evaluate((k) => window.__h.pointAtRegistered(k, 2.4), pics[1]);
    await page.mouse.move(p2.x, p2.y);
    await page.mouse.down();
    await sleep(800);
    await page.mouse.up();
    await sleep(300);
    eq(await page.locator('.eggs-notiz').count(), 0, 'Karte bei geheimem Bild ohne Notiz');
  });
}

// ---------------------------------------------------------------- Layout mit 13 Erinnerungen (Garten als Gastgeber)
async function suiteGarden() {
  const page = await open('?n=13');
  await test('Gastgeber Garten (13 Erinnerungen): Wand geschlossen, begehbar, Hinweis (Screenshot)', async () => {
    const info = await page.evaluate('window.__h.viewHostDoor(-0.75, 3.3, 0.1)');
    eq(await page.evaluate(`window.__h.rooms[${info.host}].theme`), 'garten', 'Gastgeberthema');
    const r = await checkWallRays(page, info);
    eq(r.bad, [], 'Strahlen, die die Wand nicht treffen');
    await page.evaluate(() => window.__h.advance(0.1));
    await shot(page, '14-eingang-aussen-garten');
    await page.evaluate(() => { window.__h.viewHostDoor(0, 3.2); window.__h.advance(3.5, { x: 0, y: 1 }, 0, false); });
    eq((await h(page, 'pos()')).room, info.secret, 'im geheimen Raum');
    clean(page, 'Garten');
  });
  await page.ctx_.close();
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await startServer();
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    for (const suite of [suiteHeart, suiteSecret, suiteBoard, suiteDays, suiteNotes, suiteGarden]) await suite();
    await suiteRealApp(browser, results, only);
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} Tests grün`);
  if (results.length === 0) { console.log('FEHLER: 0 Tests gelaufen (0 Tests = rot)'); process.exit(1); }
  process.exit(failed.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
