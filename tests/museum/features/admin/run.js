// Tests des Verwaltungsmodus (Playwright + Chromium, GitHub-API vollständig gemockt).
// Start: node tests/museum/features/admin/run.js [Teilname]
const H = require('./helpers');

const results = [];
const filter = process.argv[2];
const env = { browser: null, server: null, opened: [] };

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
    console.log(`  FAIL ${name}\n       ${String(err.message).split('\n').join('\n       ')}`);
  }
  await Promise.all(env.opened.map((c) => c.close().catch(() => {})));
}

async function run() {
  env.server = await H.startServer();
  env.browser = await H.L.launch();
  for (const suite of ['./tests-token', './tests-actions', './tests-status', './tests-safety', './shots']) {
    for (const [name, fn] of require(suite).tests) await test(name, fn);
  }
}

run().catch((err) => { console.error(err); process.exitCode = 1; }).finally(async () => {
  if (env.browser) await env.browser.close();
  if (env.server) await env.server.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} von ${results.length} Tests grün`);
  if (results.length === 0) { console.log('0 Tests gelaufen = rot'); process.exitCode = 1; }
  if (failed) process.exitCode = 1;
});
