// Sprites in den Themengruppen: jeder Raycaster (Tippen, Fokus, wallDistance) braucht raycaster.camera,
// sonst wirft Sprite.raycast ("Cannot read properties of null (reading 'matrixWorld')").
const assert = require('assert');
const { withPage, frames, facePicture, lightboxOpen } = require('./helpers');

const tests = [];

tests.push(['Raum mit Sprite: wallDistance, Tippen (Bild öffnet) und Blick-Fokus (Beschriftung) werfen nicht', async () => {
  await withPage({}, async (page) => {
    const p = await facePicture(page, 0);
    // Sprite 1 m hinter dem Spieler in der Gruppe von Raum 0, wie die Glow-Sprites der Themen.
    await page.evaluate(() => {
      const c = window.__ctx;
      const T = c.THREE;
      const sp = new T.Sprite(new T.SpriteMaterial({ color: 'white' }));
      const q = c.player;
      sp.position.set(q.x + Math.sin(q.yaw) * 1.0, 1.65, q.z + Math.cos(q.yaw) * 1.0);
      window.__museum.themeGroup(0).add(sp);
      window.__sprite = sp;
    });
    await frames(page, 6); // Fokus-Raycast läuft in der Schleife
    const d = await page.evaluate(() => {
      const c = window.__ctx;
      const q = c.player;
      const a = new c.THREE.Vector3(q.x, 1.65, q.z);
      const b = new c.THREE.Vector3(q.x + Math.sin(q.yaw) * 1.5, 1.65, q.z + Math.cos(q.yaw) * 1.5);
      return c.wallDistance(a, b);
    });
    assert.ok(d !== null && Math.abs(d - 1.0) < 0.2, `wallDistance trifft das Sprite nicht: ${d}`);
    await page.waitForSelector('#beschriftung:not([hidden])', { timeout: 5000 });
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('#lightbox:not([hidden])', { timeout: 5000 });
    assert.strictEqual(await lightboxOpen(page), true);
  });
}]);

module.exports = { tests };
