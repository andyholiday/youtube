// 3D-Szene: bordeauxrotes Emaille-Herz (Cabochon) in gebuerstetem Messing-Fasenrand, die QR-Karte
// eingelassen in einen Messingrahmen, weicher Schlagschatten. Einheit: Modul, orthografisch von vorn.
import * as THREE from 'three';
import { RoomEnvironment } from '/RoomEnvironment.js';

const RIM = 11;       // Breite der abgerundeten Wulst am Herzrand
const RIM_H = 7;      // Hoehe der Wulst
const DOME = 8;       // zusaetzliche Woelbung zur Herzmitte
const LIFT = 2.5;     // Herz schwebt knapp ueber dem Untergrund
const BEZEL_TOP = 5.4;  // Oberkante des Fasenrands
const BEZEL_BEVEL = 0.62;

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
  const q = clamp01((d - RIM) / 30);
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
    const d = k === rings ? xy.map(() => 0) : smoothRing(xy.map(([x, y]) => distToOutline(x, y, pts)), 6 + 22 * s);
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
    bevelSegments: 2, curveSegments: 24,
  });
  const frame = new THREE.Mesh(geo, gold);
  const card = new THREE.Mesh(
    new THREE.ShapeGeometry(roundedRect(cfg.side + 1.6, 2.6, cfg.cx, cfg.cy, new THREE.Shape()), 24),
    new THREE.MeshStandardMaterial({ color: 0xf8f4ec, roughness: 1, metalness: 0, envMapIntensity: 0 }));
  card.position.z = zTop - 1.1;
  return [frame, card];
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
  const sun = new THREE.DirectionalLight(0xfff3e4, 3.4);
  sun.position.set(-55, 70, 90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 400 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  sun.target.position.set(0, -45, 0);
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xffffff, 0x6a5a56, 0.9));
}

// Gebuerstetes Metall: waagerechte Schleifspuren als Rauheitstextur.
function brushedMap() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 256; y++) {
    const v = 205 + Math.floor(rnd() * 50);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(0, y, 256, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / 16, 1 / 16);
  return tex;
}

function materials() {
  const brass = new THREE.MeshPhysicalMaterial({
    color: 0xae8f58, metalness: 1, roughness: 0.4, roughnessMap: brushedMap(), clearcoat: 0.15,
    clearcoatRoughness: 0.3, envMapIntensity: 1.7 });
  const enamel = new THREE.MeshPhysicalMaterial({
    color: 0x520a1c, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03,
    specularIntensity: 0.6, envMapIntensity: 0.75 });
  return { brass, enamel };
}

// Fasenrand: Messingband entlang des Herzumrisses mit klaren 45-Grad-Fasen.
function bezel(cfg, mat) {
  const v2 = (pts) => pts.map((p) => new THREE.Vector2(p[0], p[1]));
  const outer = new THREE.Shape(v2(cfg.outline));
  outer.holes.push(new THREE.Path(v2(cfg.inner)));
  const geo = new THREE.ExtrudeGeometry(outer, {
    depth: BEZEL_TOP - BEZEL_BEVEL, bevelEnabled: true, bevelThickness: BEZEL_BEVEL, bevelSize: BEZEL_BEVEL,
    bevelOffset: -BEZEL_BEVEL, bevelSegments: 1, curveSegments: 1,
  });
  return new THREE.Mesh(geo, mat);
}

// Grosses Herz mit Fasenrand und Rahmen fuer die QR-Karte.
function addHeart(scene, cfg, mats) {
  const root = new THREE.Group();
  root.position.z = LIFT;
  scene.add(root);
  root.add(new THREE.Mesh(heartBody(cfg.outline), mats.enamel), new THREE.Mesh(heartBack(cfg.outline), mats.enamel));
  root.add(bezel(cfg, mats.brass));
  const [frame, card] = plaque(cfg.card, RIM_H + DOME + 0.8, mats.brass);
  root.add(frame, card);
  root.children.forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
  card.receiveShadow = false;  // Karte bleibt gleichmaessig hell; Innenschatten kommt flach aus Python
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
  // Umgebungslicht je Material (envMapIntensity) statt global: Karte bleibt matt.
  scene.traverse((o) => { if (o.material) { o.material.envMap = env; o.material.needsUpdate = true; } });
  renderer.render(scene, cam);
  const beauty = renderer.domElement.toDataURL('image/png');
  const shadow = renderShadow(renderer, scene, cam);
  renderer.dispose();
  return { beauty, shadow };
}
