// 3D-Szene: weisses Porzellan-Herz (heart_porcelain.js) mit weichem Schlagschatten.
// Einheit: Modul, orthografisch von vorn.
import * as THREE from 'three';
import { RoomEnvironment } from '/RoomEnvironment.js';
import { porcelain } from '/heart_porcelain.js';

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

function signedArea(pts) {
  return pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
}

// Polares Netz um den Schwerpunkt c; Hoehe zOf(x, y, d) aus dem Abstand d zum Rand.
function heartBody(pts, rings, zOf) {
  const n = pts.length;
  const ccw = signedArea(pts) > 0;
  const c = [0, pts.reduce((s, p) => s + p[1], 0) / n];
  const pos = [c[0], c[1], zOf(c[0], c[1], distToOutline(c[0], c[1], pts))];
  for (let k = 1; k <= rings; k++) {
    const s = 1 - Math.pow(1 - k / rings, 2.2);
    pts.forEach((p) => {
      const x = c[0] + s * (p[0] - c[0]), y = c[1] + s * (p[1] - c[1]);
      pos.push(x, y, zOf(x, y, k === rings ? 0 : distToOutline(x, y, pts)));
    });
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
  return new THREE.ShapeGeometry(new THREE.Shape(pts.map((p) => new THREE.Vector2(p[0], p[1]))));
}

// Schlagschatten: Silhouette der Szene entlang der Lichtrichtung auf den Boden (z=0) geschert.
function renderShadow(renderer, scene, cam) {
  const light = { x: 36, y: -46, z: 90 };  // Laufrichtung des Lichts (Sonne steht links oben)
  const shear = new THREE.Matrix4().set(1, 0, light.x / light.z, 0, 0, 1, light.y / light.z, 0, 0, 0, 1, 0, 0, 0, 0, 1);
  cam.updateMatrixWorld();
  const v = cam.matrixWorldInverse.clone();
  cam.projectionMatrix.multiply(v.clone().multiply(shear).multiply(v.clone().invert()));
  scene.overrideMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  renderer.render(scene, cam);
  return renderer.domElement.toDataURL('image/png');
}

function makeRenderer(w, h) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

export async function render(cfg) {
  const { view, px } = cfg;
  const renderer = makeRenderer(Math.round(view.w * px), Math.round(view.h * px));
  const scene = new THREE.Scene();
  const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.03).texture;
  const cam = new THREE.OrthographicCamera(view.left, view.left + view.w, view.top, view.top - view.h, 1, 400);
  cam.position.set(0, 0, 200);
  cam.lookAt(0, 0, 0);
  porcelain(scene, cfg, { heartBody, heartBack, distToOutline });
  scene.traverse((o) => { if (o.material) { o.material.envMap = env; o.material.needsUpdate = true; } });
  renderer.render(scene, cam);
  const beauty = renderer.domElement.toDataURL('image/png');
  const shadow = renderShadow(renderer, scene, cam);
  renderer.dispose();
  return { beauty, shadow };
}
