// 3D-Szene: aufgeblasenes, glaenzendes Herz mit Perlenkranz, Goldrahmen fuer die QR-Karte,
// schwebenden Herzchen und weichem Schlagschatten. Einheit: Modul, orthografisch von vorn.
import * as THREE from 'three';
import { RoomEnvironment } from '/RoomEnvironment.js';

const RIM = 9.5;      // Breite der abgerundeten Wulst am Herzrand
const RIM_H = 6.5;    // Hoehe der Wulst
const DOME = 3.0;     // zusaetzliche Woelbung zur Herzmitte
const LIFT = 2.5;     // Herz schwebt knapp ueber dem Untergrund

const clamp01 = (v) => Math.min(1, Math.max(0, v));

function distToOutline(x, y, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const t = clamp01(((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1));
    const dx = x - (a[0] + t * ex), dy = y - (a[1] + t * ey);
    best = Math.min(best, dx * dx + dy * dy);
  }
  return Math.sqrt(best);
}

function surfaceZ(d) {
  const t = clamp01(d / RIM);
  const q = clamp01((d - RIM) / 16);
  return RIM_H * Math.sqrt(1 - (1 - t) * (1 - t)) + DOME * q * q * (3 - 2 * q);
}

function signedArea(pts) {
  return pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
}

// Glaettet den Randabstand entlang des Umfangs, damit an Kerbe und Spitze keine Kante entsteht.
function smoothRing(d, sigma = 14) {
  const n = d.length, r = Math.ceil(sigma * 3), w = [];
  for (let j = -r; j <= r; j++) w.push(Math.exp(-(j * j) / (2 * sigma * sigma)));
  const sum = w.reduce((a, b) => a + b, 0);
  return d.map((_, i) => w.reduce((a, wj, j) => a + wj * d[(i + j - r + n * 4) % n], 0) / sum);
}

// Polares Netz um den Schwerpunkt c; Hoehe aus dem (geglaetteten) Abstand zum Rand.
function heartBody(pts, rings = 110) {
  const n = pts.length;
  const ccw = signedArea(pts) > 0;
  const c = [0, pts.reduce((s, p) => s + p[1], 0) / n];
  const pos = [c[0], c[1], surfaceZ(distToOutline(c[0], c[1], pts))];
  for (let k = 1; k <= rings; k++) {
    const s = 1 - Math.pow(1 - k / rings, 2.2);
    const xy = pts.map((p) => [c[0] + s * (p[0] - c[0]), c[1] + s * (p[1] - c[1])]);
    const d = k === rings ? xy.map(() => 0) : smoothRing(xy.map(([x, y]) => distToOutline(x, y, pts)), 6 + 10 * s);
    xy.forEach(([x, y], i) => pos.push(x, y, surfaceZ(d[i])));
  }
  const idx = [];
  const tri = (a, b, c2) => (ccw ? idx.push(a, b, c2) : idx.push(a, c2, b));
  for (let i = 0; i < n; i++) tri(0, 1 + i, 1 + (i + 1) % n);
  for (let k = 0; k < rings - 1; k++) {
    for (let i = 0; i < n; i++) {
      const a = 1 + k * n + i, b = 1 + k * n + (i + 1) % n, a2 = a + n, b2 = b + n;
      tri(a, a2, b); tri(b, a2, b2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Rueckseite: flache Kappe, damit der Schatten geschlossen ist.
function heartBack(pts) {
  const sh = new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1])));
  return new THREE.ShapeGeometry(sh);
}

function roundedRect(w, r, x = 0, y = 0, path = new THREE.Path()) {
  const x0 = x - w / 2, y0 = y - w / 2, x1 = x + w / 2, y1 = y + w / 2;
  path.moveTo(x0 + r, y0);
  path.lineTo(x1 - r, y0); path.quadraticCurveTo(x1, y0, x1, y0 + r);
  path.lineTo(x1, y1 - r); path.quadraticCurveTo(x1, y1, x1 - r, y1);
  path.lineTo(x0 + r, y1); path.quadraticCurveTo(x0, y1, x0, y1 - r);
  path.lineTo(x0, y0 + r); path.quadraticCurveTo(x0, y0, x0 + r, y0);
  return path;
}

function plaque(cfg, zTop, gold) {
  const outer = roundedRect(cfg.side + 2 * cfg.frame, 3.6, cfg.cx, cfg.cy, new THREE.Shape());
  outer.holes.push(roundedRect(cfg.side, 2.4, cfg.cx, cfg.cy));
  const geo = new THREE.ExtrudeGeometry(outer, {
    depth: zTop, bevelEnabled: true, bevelThickness: 0.55, bevelSize: 0.55, bevelOffset: -0.55,
    bevelSegments: 8, curveSegments: 24,
  });
  const frame = new THREE.Mesh(geo, gold);
  const card = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedRect(cfg.side + 1.6, 2.6, cfg.cx, cfg.cy, new THREE.Shape()), 24),
    new THREE.MeshStandardMaterial({ color: 0xfffaf6, roughness: 1, metalness: 0, envMapIntensity: 0 }));
  card.position.z = zTop - 1.1;
  return [frame, card];
}

function pearls(pts, mat, radius, inset, zAt, skip) {
  const out = [];
  // Orientierung des Umrisses: +1 gegen den Uhrzeigersinn (Innen liegt links der Laufrichtung)
  const orient = signedArea(pts) > 0 ? 1 : -1;
  const geo = new THREE.SphereGeometry(radius, 48, 32);
  let acc = 0;
  const placed = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    acc += len;
    if (acc < radius * 2.15) continue;
    acc = 0;
    const px = a[0] - orient * (b[1] - a[1]) / len * inset;
    const py = a[1] + orient * (b[0] - a[0]) / len * inset;
    if (placed.some((q) => Math.hypot(q[0] - px, q[1] - py) < radius * 2.05)) continue;
    if (skip(px, py)) continue;
    placed.push([px, py]);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, zAt(px, py) + radius * 0.35);
    out.push(m);
  }
  return out;
}

function floaterGeometry(unit, size) {
  const sh = new THREE.Shape(unit.map((p) => new THREE.Vector2(p[0] * size, p[1] * size)));
  const g = new THREE.ExtrudeGeometry(sh, {
    depth: size * 0.16, bevelEnabled: true, bevelThickness: size * 0.2, bevelSize: size * 0.14,
    bevelOffset: -size * 0.1, bevelSegments: 12, curveSegments: 1,
  });
  g.translate(0, 0, -size * 0.2);
  g.computeVertexNormals();
  return g;
}

function glossy(color, extra = {}) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06,
    sheen: 0.6, sheenColor: new THREE.Color(0xff8fb0), sheenRoughness: 0.4, envMapIntensity: 1.15, ...extra,
  });
}

// Schlagschatten: Silhouette der Szene entlang der Lichtrichtung auf den Boden (z=0) geschert.
function renderShadow(renderer, scene, cam) {
  const light = { x: 36, y: -46, z: 90 };  // Laufrichtung des Lichts (Sonne steht links oben)
  const shear = new THREE.Matrix4().set(1, 0, light.x / light.z, 0, 0, 1, light.y / light.z, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  cam.updateMatrixWorld();
  const v = cam.matrixWorldInverse.clone();
  cam.projectionMatrix.multiply(v.clone().multiply(shear).multiply(v.clone().invert()));
  scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  renderer.shadowMap.enabled = false;
  renderer.render(scene, cam);
  return renderer.domElement.toDataURL('image/png');
}

function makeRenderer(w, h) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

function addLights(scene) {
  const sun = new THREE.DirectionalLight(0xfffaf6, 3.4);
  sun.position.set(-55, 70, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  sun.target.position.set(0, -45, 0);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xffffff, 0xffeef0, 1.05));
}

function materials() {
  const pearl = new THREE.MeshPhysicalMaterial({
    color: 0xfff3ee, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
    iridescence: 0.35, iridescenceIOR: 1.4, sheen: 0.5, sheenColor: new THREE.Color(0xffc9d8), envMapIntensity: 1.2 });
  const gold = new THREE.MeshPhysicalMaterial({
    color: 0xf5cf72, metalness: 1, roughness: 0.18, clearcoat: 0.6, clearcoatRoughness: 0.1, envMapIntensity: 2.0 });
  return { pearl, gold, ruby: glossy(0xb30c36, { sheen: 0.25 }), rose: glossy(0xf48fab),
    blush: glossy(0xffc2d0, { sheen: 0.3 }) };
}

// Grosses Herz mit Perlenkranz und Goldrahmen; liefert die Gruppe und die Karte.
function addHeart(scene, cfg, mats) {
  const root = new THREE.Group();
  root.position.z = LIFT;
  scene.add(root);
  root.add(new THREE.Mesh(heartBody(cfg.outline), mats.ruby), new THREE.Mesh(heartBack(cfg.outline), mats.ruby));
  const [frame, card] = plaque(cfg.card, RIM_H + DOME + 1.8, mats.gold);
  root.add(frame, card);
  const c = cfg.card;
  const nearCard = (x, y) => Math.max(Math.abs(x - c.cx), Math.abs(y - c.cy)) < c.side / 2 + c.frame + 0.9;
  root.add(...pearls(cfg.outline, mats.pearl, 1.25, 2.1, (x, y) => surfaceZ(distToOutline(x, y, cfg.outline)), nearCard));
  root.children.forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
  card.receiveShadow = false;  // Karte bleibt gleichmaessig hell; Innenschatten kommt flach aus Python
}

// Schwebende Herzchen und verstreute Gold-/Perlkugeln.
function addFloaters(scene, cfg, mats) {
  const rad = Math.PI / 180;
  for (const f of cfg.floaters) {
    const m = new THREE.Mesh(floaterGeometry(cfg.unit, f.size), mats[f.mat]);
    m.position.set(f.x, f.y, f.z);
    m.rotation.set(f.rx * rad, f.ry * rad, f.rz * rad);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  for (const s of cfg.beads) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(s.r, 32, 24), mats[s.mat]);
    m.position.set(s.x, s.y, s.z);
    m.castShadow = true;
    scene.add(m);
  }
}

export async function render(cfg) {
  const { view, px } = cfg;
  const renderer = makeRenderer(Math.round(view.w * px), Math.round(view.h * px));
  const scene = new THREE.Scene();
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.03).texture;
  const cam = new THREE.OrthographicCamera(view.left, view.left + view.w, view.top, view.top - view.h, 1, 400);
  cam.position.set(0, 0, 200);
  cam.lookAt(0, 0, 0);
  const mats = materials();
  addLights(scene);
  addHeart(scene, cfg, mats);
  addFloaters(scene, cfg, mats);
  // Umgebungslicht je Material (envMapIntensity) statt global: Karte bleibt matt.
  scene.traverse((o) => { if (o.material) { o.material.envMap = env; o.material.needsUpdate = true; } });
  renderer.render(scene, cam);
  const beauty = renderer.domElement.toDataURL('image/png');
  const shadow = renderShadow(renderer, scene, cam);
  renderer.dispose();
  return { beauty, shadow };
}
