// Weisses Porzellan-Herz: weich gewoelbtes Kissen mit sanft eingelassenem, ebenem Plateau fuer den QR.
// Das Plateau ist exakt frontal (Normale +z): ein Licht, keine Glanzlichter, kein Schattenwurf darauf.
// Einheit: Modul, orthografisch von vorn. Wird von heart_scene.js (Variante "intarsie") aufgerufen.
import * as THREE from 'three';

const BEAD = 12;       // Breite der abgerundeten Randwulst
const BEAD_H = 11;     // Hoehe der Randwulst
const DOME = 5;        // zusaetzliche Woelbung der beiden Lappen
const DOME_R = 30;     // ueber so viele Module steigt die Woelbung an
const SHOULDER = 10;   // Breite der weichen Schulter zwischen Kissen und Plateau
const PLATE_R = 6;     // Eckenradius des Plateaus
const LIFT = 2.5;      // Herz schwebt knapp ueber dem Untergrund
const RINGS = 260;     // feines Netz, damit die Schulter glatt bleibt

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => t * t * (3 - 2 * t);

function domeZ(d) {
  const t = clamp01(d / BEAD);
  return BEAD_H * Math.sqrt(1 - (1 - t) * (1 - t)) + DOME * smooth(clamp01((d - BEAD) / DOME_R));
}

// Vorzeichenbehaftete Entfernung zum abgerundeten Quadrat des Plateaus (innen negativ).
function plateDist(x, y, cfg) {
  const h = cfg.side / 2 + cfg.frame - PLATE_R;
  const qx = Math.abs(x - cfg.cx) - h, qy = Math.abs(y - cfg.cy) - h;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - PLATE_R;
}

// Randabstand als Raster, entlang der Mittelachse geglaettet: rundet den Grat an der Herzspitze ab.
function smoothDistance(outline, dist, res = 3, sigma = 5) {
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const x0 = Math.min(...xs) - 1, y1 = Math.max(...ys) + 1;
  const W = Math.ceil((Math.max(...xs) + 1 - x0) * res), H = Math.ceil((y1 - Math.min(...ys) + 1) * res);
  const inside = (x, y) => outline.reduce((c, a, i) => {
    const b = outline[(i + 1) % outline.length];
    return c ^ ((a[1] > y) !== (b[1] > y) && x < a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }, false);
  const D = new Float32Array(W * H), M = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (i + 0.5) / res, y = y1 - (j + 0.5) / res;
    if (inside(x, y)) { M[j * W + i] = 1; D[j * W + i] = dist(x, y, outline); }
  }
  const sd = sigma * res, r = Math.ceil(sd * 3);
  const k = Array.from({ length: 2 * r + 1 }, (_, t) => Math.exp(-((t - r) ** 2) / (2 * sd * sd)));
  const blur = (src) => [[1, 0], [0, 1]].reduce((a, [dx, dy]) => {
    const out = new Float32Array(W * H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      let acc = 0;
      for (let t = -r; t <= r; t++) {
        const ii = i + t * dx, jj = j + t * dy;
        if (ii >= 0 && ii < W && jj >= 0 && jj < H) acc += k[t + r] * a[jj * W + ii];
      }
      out[j * W + i] = acc;
    }
    return out;
  }, src);
  const bd = blur(D.map((v, n) => v * M[n])), bm = blur(M);
  const at = (g, i, j) => g[Math.min(H - 1, Math.max(0, j)) * W + Math.min(W - 1, Math.max(0, i))];
  const bil = (g, x, y) => {
    const fx = (x - x0) * res - 0.5, fy = (y1 - y) * res - 0.5, i = Math.floor(fx), j = Math.floor(fy);
    const u = fx - i, v = fy - j;
    return (at(g, i, j) * (1 - u) + at(g, i + 1, j) * u) * (1 - v) + (at(g, i, j + 1) * (1 - u) + at(g, i + 1, j + 1) * u) * v;
  };
  const smin = (a, b, w = 4) => { const h = Math.max(w - Math.abs(a - b), 0) / w; return Math.min(a, b) - h * h * w / 4; };
  return (x, y, d) => smin(d, bil(bd, x, y) / Math.max(bil(bm, x, y), 1e-6));
}

// Hoehe des Plateaus: die niedrigste Kissenhoehe darunter, damit es nirgends ueber das Kissen ragt.
function plateLevel(cfg, outline, dist, smoothD) {
  let low = Infinity;
  const half = cfg.side / 2 + cfg.frame;
  for (let x = -half; x <= half; x += 1.5) {
    for (let y = -half; y <= half; y += 1.5) {
      const px = cfg.cx + x, py = cfg.cy + y;
      if (plateDist(px, py, cfg) <= 0) { const d = dist(px, py, outline); low = Math.min(low, domeZ(smoothD(px, py, d))); }
    }
  }
  return low;
}

function surface(cfg, outline, dist) {
  const smoothD = smoothDistance(outline, dist);
  const floor = plateLevel(cfg, outline, dist, smoothD);
  const softPos = (v) => 0.5 * (v + Math.sqrt(v * v + 1));
  return (x, y, d) => {
    const z = domeZ(smoothD(x, y, d));
    const w = smooth(clamp01(plateDist(x, y, cfg) / SHOULDER));
    return z - softPos(z - floor) * (1 - w);
  };
}

function lights(scene) {
  const sun = new THREE.DirectionalLight(0xfff8f0, 1.25);
  sun.position.set(-75, 85, 70);
  sun.target.position.set(0, -45, 0);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xeef2ff, 0x7c7c80, 0.62));
}

function material() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xf6f6f4, roughness: 0.42, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.14,
    envMapIntensity: 0.5 });
}

export function porcelain(scene, cfg, helpers) {
  const { heartBody, heartBack, distToOutline } = helpers;
  const root = new THREE.Group();
  root.position.z = LIFT;
  const mat = material();
  const zOf = surface(cfg.card, cfg.outline, distToOutline);
  root.add(new THREE.Mesh(heartBody(cfg.outline, RINGS, zOf, 0.01), mat), new THREE.Mesh(heartBack(cfg.outline), mat));
  scene.add(root);
  lights(scene);
}
