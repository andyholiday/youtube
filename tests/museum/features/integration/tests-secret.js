// Geheimer Durchgang in der echten App: das Wandband (Sockel, Handlauf) schließt die Wand und verschwindet mit dem Paneel.
const assert = require('assert');
const H = require('./helpers');

const { until, openEntered, problems, walkIntoSecret, frames } = H;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

/** Sichtbare und unsichtbare Bandstücke vor dem Paneel samt Paneel (Deckkraft). */
const state = (page) => page.evaluate(() => {
  const scene = window.__museum.themeGroup(0).parent;
  const fillers = [];
  let panel = null;
  scene.traverse((o) => {
    if (o.userData && o.userData.secretFiller) fillers.push(o);
    if (o.userData && o.userData.secretPanel) panel = o;
  });
  return { n: fillers.length, shown: fillers.filter((f) => f.visible && f.layers.mask === 1).length, panel: panel && panel.material.opacity };
});

t('Geheimtür: geschlossen hängt das Wandband vor dem Paneel, im Durchgang ist es weg (kein Sockel quer durch die Öffnung)', async (env) => {
  const page = await openEntered(env, { mobile: false });
  const closed = await state(page);
  assert.ok(closed.n >= 1, 'kein Wandband an der Geheimtür (es würde durch die Öffnung laufen)');
  assert.deepStrictEqual([closed.shown, closed.panel], [closed.n, 1], 'geschlossene Wand nicht ganz: Band fehlt oder Paneel durchsichtig');
  await walkIntoSecret(page);
  await frames(page, 30);
  await until(page, () => { let ok = true; window.__museum.themeGroup(0).parent.traverse((o) => { if (o.userData && o.userData.secretFiller && o.visible) ok = false; }); return ok; });
  const open = await state(page);
  assert.deepStrictEqual([open.shown, open.panel], [0, 0], 'Band oder Paneel steht noch im geöffneten Durchgang');
  assert.deepStrictEqual(problems(page), []);
});

module.exports = { tests };
