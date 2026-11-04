// Rendert die 3D-Szene (heart_scene.js) in headless Chromium zu einer PNG-Datei.
// Aufruf: node render_heart.js <config.json> <out.png> <three-cache-ordner>
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [cfgPath, outPng, cache] = process.argv.slice(2);
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const HTML = `<!doctype html><meta charset=utf-8><body style="margin:0;background:#fff">
<script type="importmap">{"imports":{"three":"/three.module.js"}}</script>
<script type="module">import { render } from '/heart_scene.js';
const r = await fetch('/cfg.json'); window.__png = await render(await r.json()); window.__done = true;</script>`;
const FILES = {
  '/heart_scene.js': path.join(__dirname, 'heart_scene.js'),
  '/heart_porcelain.js': path.join(__dirname, 'heart_porcelain.js'),
  '/three.module.js': path.join(cache, 'three.module.js'),
  '/RoomEnvironment.js': path.join(cache, 'RoomEnvironment.js'),
};

const server = http.createServer((req, res) => {
  if (req.url === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(HTML);
  if (req.url === '/cfg.json') return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(cfg));
  const f = FILES[req.url];
  if (!f) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': 'text/javascript' }).end(fs.readFileSync(f));
});

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  });
  try {
    const page = await browser.newPage();
    page.on('console', (m) => console.log('[browser]', m.text()));
    page.on('pageerror', (e) => console.error('[pageerror]', e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction('window.__done === true', null, { timeout: 280000 });
    const png = await page.evaluate('window.__png');
    const save = (file, url) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
    save(outPng, png.beauty);
    save(outPng.replace(/\.png$/, '-shadow.png'), png.shadow);
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
