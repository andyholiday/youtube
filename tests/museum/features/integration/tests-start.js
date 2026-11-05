// Start und Oberfläche der echten App: Module, 5× Herz, Knöpfe im HUD.
const assert = require('assert');
const H = require('./helpers');

const { L, until, openEntered, problems, hudLayout } = H;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

t('Alle drei Module laden in der echten App ohne Warnung und Fehler (Paar-Knopf im HUD, geheimer Raum zuletzt)', async (env) => {
  const page = await openEntered(env, { enter: false });
  assert.strictEqual(await page.locator('#hud .tp-knopf').count(), 1, 'Paar-Knopf fehlt');
  const rooms = await page.evaluate(() => window.__museum.rooms.map((r) => !!r.secret));
  assert.deepStrictEqual([rooms.filter(Boolean).length, rooms[rooms.length - 1]], [1, true]);
  assert.strictEqual(await page.locator('#hud .adm-hud').count(), 0, 'Verwaltungsknopf ohne aktiven Modus sichtbar');
  assert.strictEqual(await page.locator('link[href$="admin.css"]').count(), 0, 'Verwaltungs-CSS ohne aktiven Modus geladen');
  assert.deepStrictEqual(problems(page), []);
});

t('5× Herz am Start öffnet die Verwaltung, löst nie „Eintreten“ aus; der Knopf geht danach normal', async (env) => {
  const page = await openEntered(env, { enter: false });
  for (let i = 1; i <= 5; i++) {
    await page.tap('#start .herz', { force: true }); // das Herz pulsiert, Playwright würde auf Ruhe warten
    assert.ok(await page.locator('#start').isVisible(), `Start nach Tipp ${i} verschwunden`);
    assert.ok(!(await page.evaluate(() => document.body.classList.contains('im-saal'))), `Tipp ${i} trat ins Museum ein`);
    if (i < 5) assert.strictEqual(await page.locator('.adm-ov').count(), 0, `Verwaltung schon nach ${i} Tipps offen`);
  }
  await page.waitForSelector('.adm-ov h2:text("Verwaltung einrichten")');
  assert.ok(await page.locator('#start').isVisible(), 'Start nach 5× Herz verschwunden');
  await page.getByRole('button', { name: 'Schließen', exact: true }).click();
  await page.waitForSelector('.adm-ov', { state: 'detached' });
  assert.ok(await page.locator('#start-btn').isEnabled(), 'Knopf nach dem Schließen gesperrt');
  await L.enter(page);
  assert.ok(await page.evaluate(() => document.body.classList.contains('im-saal')), 'Eintreten klappt nach der Verwaltung nicht');
  assert.deepStrictEqual(problems(page), []);
});

t('Herz am Start: einzelne Tipps (auch Maus am Desktop) zählen nicht zusammen mit alten, Eintreten bleibt möglich', async (env) => {
  const page = await openEntered(env, { enter: false, mobile: false });
  for (let i = 0; i < 4; i++) await page.click('#start .herz', { force: true });
  assert.strictEqual(await page.locator('.adm-ov').count(), 0, 'Verwaltung nach 4 Tipps');
  assert.ok(await page.locator('#start').isVisible());
  await L.enter(page);
  assert.deepStrictEqual(problems(page), []);
});

/** HUD-Knöpfe: ≥ 44 px, innerhalb der Safe-Area-Ränder, unter dem Zähler, nichts überlappt (Hinweis und Raumtitel stehen gleichzeitig). */
async function checkHud(page, label) {
  const info = await page.evaluate(() => {
    const cs = getComputedStyle(document.getElementById('hud'));
    const edge = { right: parseFloat(cs.right), top: parseFloat(cs.top) };
    const buttons = [...document.querySelectorAll('#hud > *')].map((b) => { const r = b.getBoundingClientRect(); return { c: b.className, w: r.width, h: r.height, right: r.right, top: r.top, bottom: r.bottom }; });
    const counter = document.getElementById('entdeckt').getBoundingClientRect();
    return { edge, buttons, counterBottom: counter.bottom, W: innerWidth };
  });
  assert.strictEqual(info.buttons.length, 2, `${label}: HUD-Knöpfe ${JSON.stringify(info.buttons)}`);
  for (const b of info.buttons) {
    assert.ok(b.w >= 44 && b.h >= 44, `${label}: ${b.c} nur ${b.w}×${b.h}`);
    assert.ok(b.right <= info.W - info.edge.right + 0.5, `${label}: ${b.c} ragt in den Safe-Area-Rand`);
    assert.ok(b.top >= info.counterBottom, `${label}: ${b.c} überlappt den Zähler`);
  }
  assert.ok(info.buttons[1].top >= info.buttons[0].bottom, `${label}: Knöpfe überlappen einander`);
  assert.deepStrictEqual(await hudLayout(page), [], `${label}: Überlappung im HUD`);
}

for (const dev of [{ name: 'iPhone hoch', mobile: true }, { name: 'iPhone quer', mobile: true, landscape: true }, { name: 'Desktop', mobile: false }]) {
  t(`HUD (${dev.name}): Paar-Knopf und Schraubenschlüssel ≥ 44 px, neben dem Zähler, Hinweis und Raumtitel überlappen nicht`, async (env) => {
    const page = await openEntered(env, { ...dev, admin: true });
    await page.waitForSelector('#hud .adm-hud');
    await until(page, () => !document.getElementById('raumtitel').hidden && !document.getElementById('hinweis').hidden);
    await checkHud(page, dev.name);
    // Notch/Safe-Area simuliert: größere Ränder müssen ins Layout wandern.
    const inset = dev.landscape ? ['--s-l', '--s-r'] : ['--s-o'];
    await page.evaluate((keys) => { for (const k of keys) document.documentElement.style.setProperty(k, '47px'); }, inset);
    await checkHud(page, `${dev.name} mit Notch`);
    assert.deepStrictEqual(problems(page), []);
  });
}

module.exports = { tests };
