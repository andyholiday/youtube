// Weisses Porzellan-Herz: flaches, weich gerolltes Kissen mit einer sanften, sehr flachen Senke fuer den QR.
// Die Senke ist exakt frontal (Normale +z): ein Licht, keine Glanzlichter, kein Schattenwurf darauf.
// Einheit: Modul, orthografisch von vorn. Wird von heart_scene.js aufgerufen.
import * as THREE from 'three';

const BEAD = 9;        // Breite der gerundeten Randwulst
const BEAD_H = 9;      // Hoehe der Randwulst
const DOME = 3.5;      // zusaetzliche Woelbung zur Herzmitte
const DOME_R = 34;     // ueber so viele Module steigt die Woelbung an
const DEPTH = 2;       // zusaetzliche Tiefe der Senke unter dem niedrigsten Kissenpunkt
const SHOULDER = 14;   // Breite des weichen Uebergangs zwischen Kissen und Senke
const PLATE_R = 11;    // Eckenradius der Senke (rund-ovales Quadrat)
const BLUR = 4;        // Glaettung der Hoehe (rundet Grat an Spitze und Kerbe)
const RES = 3;         // Rasterzellen pro Modul
const LIFT = 2.5;      // Herz schwebt knapp ueber dem Untergrund
const RINGS = 260;     // feines Netz, damit die Flaeche glatt bleibt

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (t) => t * t * (3 - 2 * t);
const smin = (a, b, w = 3) => { const h = Math.max(w - Math.abs(a - b), 0) / w; return Math.min(a, b) - h * h * w / 4; };

function domeZ(d) {
  const t = clamp01(d / BEAD);
  return BEAD_H * Math.sqrt(1 - (1 - t) * (1 - t)) + DOME * smooth(clamp01((d - BEAD) / DOME_R));
}

// Vorzeichenbehaftete Entfernung zum abgerundeten Quadrat der Senke (innen negativ).
function plateDist(x, y, cfg) {
  const h = cfg.side / 2 + cfg.pad - PLATE_R;
  const qx = Math.abs(x - cfg.cx) - h, qy = Math.abs(y - cfg.cy) - h;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - PLATE_R;
}

function inside(outline, x, y) {
  return outline.reduce((c, a, i) => {
    const b = outline[(i + 1) % outline.length];
    return c ^ ((a[1] > y) !== (b[1] > y) && x < a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
  }, false);
}

// Separable Gauss-Glaettung eines Rasters (Rand: Werte ausserhalb zaehlen nicht, normiert).
function blur(src, mask, W, H, sigma) {
  const sd = sigma * RES, r = Math.ceil(sd * 3);
  const k = Array.from({ length: 2 * r + 1 }, (_, t) => Math.exp(-((t - r) ** 2) / (2 * sd * sd)));
  const pass = (a, dx, dy) => {
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
  };
  const both = (a) => pass(pass(a, 1, 0), 0, 1);
  const num = both(src.map((v, n) => v * mask[n])), den = both(mask);
  return num.map((v, n) => v / Math.max(den[n], 1e-6));
}

// Kissenhoehe mit Senke an Stelle (x, y) bei Randabstand d; floor = Boden der Senke.
const pillow = (x, y, d, cfg, floor) => {
  const z = domeZ(d);
  return z - smooth(1 - clamp01(plateDist(x, y, cfg) / SHOULDER)) * Math.max(z - floor, 0);
};

// Hoehenfunktion: Kissen mit Senke, als Raster geglaettet; unten gilt immer die Randwulst (z=0 am Rand).
function surface(cfg, outline, dist) {
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const x0 = Math.min(...xs) - 1, y1 = Math.max(...ys) + 1;
  const W = Math.ceil((Math.max(...xs) + 1 - x0) * RES), H = Math.ceil((y1 - Math.min(...ys) + 1) * RES);
  const at = (i, j) => [x0 + (i + 0.5) / RES, y1 - (j + 0.5) / RES];
  const D = new Float32Array(W * H), M = new Float32Array(W * H);
  let floor = Infinity;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const [x, y] = at(i, j);
    if (!inside(outline, x, y)) continue;
    M[j * W + i] = 1;
    D[j * W + i] = dist(x, y, outline);
    if (plateDist(x, y, cfg) <= 0) floor = Math.min(floor, domeZ(D[j * W + i]) - DEPTH);
  }
  const Z = D.map((d, n) => (M[n] ? pillow(...at(n % W, Math.floor(n / W)), d, cfg, floor) : 0));
  const S = blur(Z, M, W, H, BLUR);
  const bil = (g, x, y) => {
    const fx = (x - x0) * RES - 0.5, fy = (y1 - y) * RES - 0.5, i = Math.floor(fx), j = Math.floor(fy);
    const u = fx - i, v = fy - j, c = (a, b) => g[Math.min(H - 1, Math.max(0, b)) * W + Math.min(W - 1, Math.max(0, a))];
    return (c(i, j) * (1 - u) + c(i + 1, j) * u) * (1 - v) + (c(i, j + 1) * (1 - u) + c(i + 1, j + 1) * u) * v;
  };
  return (x, y, d) => Math.max(0, smin(pillow(x, y, d, cfg, floor), bil(S, x, y)));
}

function lights(scene) {
  const sun = new THREE.DirectionalLight(0xfff8f0, 1.45);
  sun.position.set(-75, 85, 70);
  sun.target.position.set(0, -45, 0);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xeef2ff, 0x8a8a8e, 0.6));
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
  root.add(new THREE.Mesh(heartBody(cfg.outline, RINGS, zOf), mat), new THREE.Mesh(heartBack(cfg.outline), mat));
  scene.add(root);
  lights(scene);
}
