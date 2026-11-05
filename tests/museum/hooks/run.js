// Hook-Tests (Playwright + Chromium/SwiftShader). Start: node tests/museum/hooks/run.js [Teilname]
// Prüft die ctx-Schnittstelle (.planning/SPEC-FEATURES.md) mit Test-Modulen, die per Route unter features/ eingeschleust werden.
const L = require('../lib');
const { S } = require('./helpers');

const results = [];
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
    console.log(`  FAIL ${name}\n       ${String(err.stack || err.message).split('\n').slice(0, 6).join('\n       ')}`);
  }
}

async function run() {
  S.server = await L.startServer('data-7.json');
  S.browser = await L.launch();
  for (const suite of ['./tests-input', './tests-api', './tests-sprite', './tests-robust']) {
    for (const [name, fn] of require(suite).tests) await test(name, fn);
  }
}

run().catch((err) => { console.error(err); process.exitCode = 1; }).finally(async () => {
  if (S.browser) await S.browser.close();
  if (S.server) await S.server.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} von ${results.length} Tests grün`);
  if (results.length === 0) { console.log('0 Tests gelaufen = rot'); process.exitCode = 1; }
  if (failed) process.exitCode = 1;
});
