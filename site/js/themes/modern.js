// Thema "modern": heller White-Cube, sehr hohe Decke mit Oberlicht-Streifen, Terrazzo-Boden.
import * as THREE from 'three';
import { Batch } from './geo.js';
import {
  shell, bandAround, doorLining, Placer, addLight, longAxis, plaqueObject,
} from './common.js';
import { cached, canvas, rng, speckle, toTexture, fitText, softStripTexture, SANS } from '../textures.js';

const BLACK = '#1d1d20';
const OAK = '#c79f6b';

function wallTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#f7f5f0'; g.fillRect(0, 0, 256, 256);
  const rnd = rng(5);
  speckle(g, 256, 256, rnd, 1400, ['#e6e1d6', '#ffffff'], 1, 3, 0.35);
  return toTexture(c, 2);
}

/** Terrazzo: helle Platten (1,5 m) mit bunten Splittern und feinen Fugen; Kachel = 3 m. */
function floorTexture() {
  const S = 1024;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#d3cfc6'; g.fillRect(0, 0, S, S);
  const rnd = rng(21);
  speckle(g, S, S, rnd, 1500, ['#bdb8ad', '#f4f1ea', '#a7a39a'], 2, 7, 0.55);
  speckle(g, S, S, rnd, 260, ['#8f8a80', '#c9a58b', '#6f6b64'], 3, 8, 0.5);
  speckle(g, S, S, rnd, 90, ['#d8bfae', '#ffffff'], 6, 12, 0.5);
  g.fillStyle = 'rgba(70,66,60,.55)';
  for (const p of [0, S / 2]) { g.fillRect(p - 1, 0, 3, S); g.fillRect(0, p - 1, S, 3); }
  return toTexture(c, 3);
}

function materials() {
  return cached('modern.mats', () => ({
    wall: new THREE.MeshLambertMaterial({ map: wallTexture() }),
    floor: new THREE.MeshPhongMaterial({ map: floorTexture(), specular: 0x777777, shininess: 60 }),
    ceil: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
    dark: new THREE.MeshLambertMaterial({ color: BLACK }),
    wood: new THREE.MeshLambertMaterial({ vertexColors: true }),
    streak: new THREE.MeshBasicMaterial({
      map: softStripTexture(), transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending,
    }),
    plate: new THREE.MeshLambertMaterial({ color: 0xfbfaf7 }),
    text: new THREE.MeshBasicMaterial({ transparent: true }),
    frameBlack: new THREE.MeshLambertMaterial({ color: BLACK }),
    frameOak: new THREE.MeshLambertMaterial({ color: OAK }),
    matte: new THREE.MeshLambertMaterial({ color: 0xfbfaf6 }),
  }));
}

/** Oberlicht-Streifen entlang der längeren Achse: [{x0,z0,x1,z1}]. */
function skylightRects(room) {
  const alongX = longAxis(room) === 'x';
  const [s0, s1] = alongX ? [room.z0, room.z1] : [room.x0, room.x1];
  const [l0, l1] = alongX ? [room.x0, room.x1] : [room.z0, room.z1];
  const n = Math.min(5, Math.max(2, Math.round((s1 - s0) / 3.4)));
  const width = 0.9;
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = s0 + (s1 - s0) * (i + 0.5) / n;
    out.push(alongX ? { x0: l0 + 1.4, x1: l1 - 1.4, z0: p - width / 2, z1: p + width / 2 }
      : { z0: l0 + 1.4, z1: l1 - 1.4, x0: p - width / 2, x1: p + width / 2 });
  }
  return out;
}

function addSkylights(group, room, m) {
  const h = room.height;
  const glow = new Batch(), rim = new Batch(), streak = new Batch();
  const alongX = longAxis(room) === 'x';
  for (const r of skylightRects(room)) {
    const y = h - 0.03;
    glow.quad([r.x0, y, r.z0], [r.x1, y, r.z0], [r.x1, y, r.z1], [r.x0, y, r.z1], undefined, { n: [0, -1, 0] });
    const b = 0.08, d = 0.1;
    rim.aabb(r.x0 - b, h - d, r.z0 - b, r.x1 + b, h, r.z0, undefined, 'y');
    rim.aabb(r.x0 - b, h - d, r.z1, r.x1 + b, h, r.z1 + b, undefined, 'y');
    rim.aabb(r.x0 - b, h - d, r.z0, r.x0, h, r.z1, undefined, 'y');
    rim.aabb(r.x1, h - d, r.z0, r.x1 + b, h, r.z1, undefined, 'y');
    // Spiegelung auf dem Boden: breiter, weich auslaufender Streifen
    const grow = 0.9, f = 0.004;
    const q = alongX ? [[r.x0, f, r.z1 + grow], [r.x1, f, r.z1 + grow], [r.x1, f, r.z0 - grow], [r.x0, f, r.z0 - grow]]
      : [[r.x0 - grow, f, r.z1], [r.x1 + grow, f, r.z1], [r.x1 + grow, f, r.z0], [r.x0 - grow, f, r.z0]];
    const uvs = alongX ? [[1, 0.5], [1, 0.5], [0, 0.5], [0, 0.5]] : [[0, 0.5], [1, 0.5], [1, 0.5], [0, 0.5]];
    streak.quad(q[0], q[1], q[2], q[3], undefined, { n: [0, 1, 0], uvs });
  }
  group.add(glow.mesh(m.glow), rim.mesh(m.ceil), streak.mesh(m.streak));
}

function addBench(batch, cx, cz, alongX) {
  const L = 2.6, D = 0.5, H = 0.46;
  const seat = (x, y, z, w, h, d, c) => batch.box(alongX ? w : d, h, alongX ? d : w, x, y, z, c);
  seat(cx, H - 0.04, cz, L, 0.08, D, OAK);
  for (const s of [-1, 1]) {
    const off = s * (L / 2 - 0.3);
    batch.box(alongX ? 0.07 : D - 0.1, H - 0.08, alongX ? D - 0.1 : 0.07, cx + (alongX ? off : 0), (H - 0.08) / 2, cz + (alongX ? 0 : off), BLACK);
  }
  return { hw: (alongX ? L : D) / 2, hd: (alongX ? D : L) / 2 };
}

function addBenches(group, room, m, placer) {
  const batch = new Batch();
  const alongX = longAxis(room) === 'x';
  const cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2;
  const spread = alongX ? [[0, 0], [-3.4, 0], [3.4, 0]] : [[0, 0], [0, -3.4], [0, 3.4]];
  const tries = [...spread, ...(alongX ? [[0, 2.2], [0, -2.2]] : [[2.2, 0], [-2.2, 0]])];
  let placed = 0;
  for (const [dx, dz] of tries) {
    const hw = (alongX ? 2.6 : 0.5) / 2, hd = (alongX ? 0.5 : 2.6) / 2;
    if (placed < 2 && placer.place(cx + dx, cz + dz, hw, hd)) { addBench(batch, cx + dx, cz + dz, alongX); placed++; }
  }
  if (!batch.empty) group.add(batch.mesh(m.wood));
}

function drawPlaque(g, W, H, titel, datum) {
  g.fillStyle = '#fbfaf7'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#0c0c0e'; g.textAlign = 'left'; g.textBaseline = 'middle';
  const t = fitText(g, titel, W - 40, 66, '700', SANS);
  g.fillText(t, 20, datum ? H * 0.36 : H / 2);
  if (datum) {
    g.font = `500 46px ${SANS}`; g.fillStyle = '#3f3f45';
    g.fillText(datum, 20, H * 0.75);
  }
}

export function build(room) {
  const m = materials();
  const group = new THREE.Group();
  group.add(...shell(room, m));
  const dark = new Batch();
  bandAround(dark, room, 0, 0.06, 0, 0.012, BLACK);
  bandAround(dark, room, room.height - 0.05, room.height, 0, 0.012, BLACK);
  doorLining(dark, room, 0.035, BLACK);
  const white = new Batch();
  bandAround(white, room, 0.06, 0.18, 0, 0.03);
  group.add(dark.mesh(m.dark), white.mesh(m.matte));
  addSkylights(group, room, m);
  const placer = new Placer(room);
  addBenches(group, room, m, placer);
  addLight(group, room, 0xfff6ea, 9, 0.55);
  return { group, obstacles: placer.obstacles, frame, plaque };
}

function frame(w, h) {
  const m = materials();
  const g = new THREE.Group();
  const big = w * h > 2.2;
  const b = new Batch();
  b.sweep(w, h, [[0, 0], [0, 0.012], [0.07, 0.012], [0.07, 0]]); // Passepartout
  const fw = big ? 0.035 : 0.03;
  const prof = [[0.07, 0], [0.07, 0.055], [0.07 + fw, 0.055], [0.07 + fw, 0]];
  const f = new Batch();
  f.sweep(w, h, prof);
  g.add(b.mesh(m.matte), f.mesh(big ? m.frameBlack : m.frameOak));
  return g;
}

function plaque(titel, datum) {
  const m = materials();
  return plaqueObject(0.6, 0.2, titel, datum, drawPlaque, m.text, { mat: m.plate, depth: 0.012 });
}
