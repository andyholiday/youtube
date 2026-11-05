// Integrationstests der Museum-v4-Module in der ECHTEN App (main.js, context.js, ui.js, input.js + Third Person, Eggs, Verwaltung).
// GitHub ist gefälscht. Start: node tests/museum/features/integration/run.js [Teilname]
const { startReal } = require('./server');
const L = require('../../lib');

const results = [];
const filter = process.argv[2];
const env = { browser: null, server: null, opened: [] };
const SUITES = ['./tests-start', './tests-viewer', './tests-input', './tests-paar', './tests-secret'];

async function test(name, fn) {
  if (filter && !name.includes(filter)) return;
  const t0 = Date.now();
  env.opened = [];
  try {
    await fn(env);
    results.push({ name, ok: true });
    console.log(`  ok   ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`  FAIL ${name}\n       ${String(err.stack || err.message).split('\n').slice(0, 8).join('\n       ')}`);
  }
  await Promise.all(env.opened.map((c) => c.close().catch(() => {})));
}

async function run() {
  env.server = await startReal();
  env.browser = await L.launch();
  for (const suite of SUITES) for (const [name, fn] of require(suite).tests) await test(name, fn);
}

run().catch((err) => { console.error(err); process.exitCode = 1; }).finally(async () => {
  if (env.browser) await env.browser.close();
  if (env.server) await env.server.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} von ${results.length} Tests grün`);
  if (results.length === 0) { console.log('0 Tests gelaufen = rot'); process.exitCode = 1; }
  if (failed) process.exitCode = 1;
});
