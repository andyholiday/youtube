// UI-Tests (Playwright + Chromium). Start: node tests/museum/ui/run.js [Teilname]
// Lädt ui.js und die echte index.html in tests/museum/ui/harness.html, ohne 3D.
const L = require('../lib');
const S = require('./setup');

const results = [];
const ctx = { browser: null, server: null };
const filter = process.argv[2];

async function test(name, fn) {
  if (filter && !name.includes(filter)) return;
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`  FAIL ${name}\n       ${String(err.message).split('\n').join('\n       ')}`);
  }
}

/** Die Suiten liefern ihre Tests; sie laufen nacheinander in einem Browser. */
async function run() {
  ctx.server = await S.startUiServer();
  ctx.browser = await L.launch();
  for (const suite of ['./tests-basis', './tests-lightbox', './tests-plaque', './shots']) {
    const { ctx: sc, tests } = require(suite);
    Object.assign(sc, ctx);
    for (const [name, fn] of tests) await test(name, fn);
  }
}

run().catch((err) => { console.error(err); process.exitCode = 1; }).finally(async () => {
  if (ctx.browser) await ctx.browser.close();
  if (ctx.server) await ctx.server.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} von ${results.length} Tests grün`);
  if (results.length === 0) { console.log('0 Tests gelaufen = rot'); process.exitCode = 1; }
  if (failed) process.exitCode = 1;
});
