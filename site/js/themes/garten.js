// Thema "garten": Lichthof mit Glasdach-Raster, Pflanzen in Kübeln, Steinboden, helle Holzrahmen.
import * as THREE from 'three';
import { Batch, xf } from './geo.js';
import {
  shell, bandAround, Placer, addLight, longAxis, plaqueObject, maxPictureTop, wallInfo, WALLS,
} from './common.js';
import { cached, canvas, rng, speckle, toTexture, fitText, SERIF } from '../textures.js';

const OAK = '#d9b583';
const GREENS = ['#58a64a', '#6fbb55', '#3e8c45', '#86c75e', '#4a9b4c'];

function wallTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#f6f0e2'; g.fillRect(0, 0, 256, 256);
  const rnd = rng(13);
  speckle(g, 256, 256, rnd, 800, ['#e9e0cb', '#fffaf0'], 2, 9, 0.28);
  return toTexture(c, 2);
}

/** Kalkstein im Wildverband, warm und hell; Kachel = 3 m. */
function floorTexture() {
  const S = 1024, rows = 5, rh = S / rows;
  const [c, g] = canvas(S, S);
  const rnd = rng(17);
  g.fillStyle = '#a99f8a'; g.fillRect(0, 0, S, S);
  for (let r = 0; r < rows; r++) {
    let x = -rnd() * 200;
    while (x < S) {
      const w = 240 + rnd() * 240;
      g.fillStyle = `hsl(${36 + rnd() * 8},${16 + rnd() * 10}%,${76 + rnd() * 9}%)`;
      g.fillRect(x + 2, r * rh + 2, w - 4, rh - 4);
      x += w;
    }
  }
  speckle(g, S, S, rnd, 2600, ['#b9ad94', '#fff8e8', '#c9bda4'], 1, 4, 0.35);
  return toTexture(c, 3);
}

function skyTexture() {
  const [c, g] = canvas(512, 512);
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#b9e0f4'); grad.addColorStop(1, '#f6fbff');
  g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
  const rnd = rng(23);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 512, y = rnd() * 512, r = 40 + rnd() * 70;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255,255,255,.7)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  return toTexture(c, 8);
}

function slatTexture() {
  const [c, g] = canvas(256, 256);
  const rnd = rng(29);
  for (let i = 0; i < 8; i++) {
    g.fillStyle = `hsl(${32 + rnd() * 5},${48 + rnd() * 8}%,${66 + rnd() * 6}%)`;
    g.fillRect(i * 32, 0, 32, 256);
    g.fillStyle = 'rgba(90,60,30,.5)'; g.fillRect(i * 32, 0, 2, 256);
  }
  speckle(g, 256, 256, rnd, 400, ['#b88c55'], 1, 2, 0.4);
  return toTexture(c, 1);
}

/** Hängende Efeuranken (transparent), Kachel = 4 m breit, 2,6 m hoch. */
function vineTexture() {
  const [c, g] = canvas(512, 320);
  const rnd = rng(41);
  const leaf = (x, y, r) => {
    g.save(); g.translate(x, y); g.rotate(rnd() * 6.28);
    g.fillStyle = GREENS[Math.floor(rnd() * GREENS.length)];
    g.beginPath(); g.ellipse(0, 0, r, r * 0.55, 0, 0, 7); g.fill();
    g.restore();
  };
  for (let i = 0; i < 700; i++) { const x = rnd() * 512, y = rnd() * 70; for (const o of [-512, 0, 512]) leaf(x + o, y, 9 + rnd() * 9); }
  for (let x = 4; x < 512; x += 9 + rnd() * 10) {
    const len = 50 + rnd() * rnd() * 250;
    g.strokeStyle = '#3d7a3c'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x, 50); g.lineTo(x + Math.sin(len) * 6, 50 + len); g.stroke();
    for (let y = 50; y < 50 + len; y += 9) for (const o of [-512, 0, 512]) leaf(x + o + Math.sin(y * 0.07) * 6, y, 6 + rnd() * 6);
  }
  const t = toTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function materials() {
  return cached('garten.mats', () => ({
    wall: new THREE.MeshLambertMaterial({ map: wallTexture() }),
    floor: new THREE.MeshLambertMaterial({ map: floorTexture() }),
    ceil: new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false }),
    steel: new THREE.MeshLambertMaterial({ color: '#34413c' }),
    slat: new THREE.MeshLambertMaterial({ map: slatTexture() }),
    wood: new THREE.MeshLambertMaterial({ color: OAK }),
    pots: new THREE.MeshLambertMaterial({ vertexColors: true }),
    leaves: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    liner: new THREE.MeshLambertMaterial({ color: '#faf6ee' }),
    plate: new THREE.MeshLambertMaterial({ color: '#e6d0a6' }),
    vine: new THREE.MeshLambertMaterial({ map: vineTexture(), alphaTest: 0.5 }),
    text: new THREE.MeshBasicMaterial({ transparent: true }),
  }));
}

/** Glasdach-Raster: feine Sprossen alle ~1,9 m, kräftige Träger jede dritte Linie. */
function addGlassGrid(steel, room) {
  const W = room.x1 - room.x0, D = room.z1 - room.z0, h = room.height;
  const nx = Math.max(3, Math.round(W / 1.9)), nz = Math.max(3, Math.round(D / 1.9));
  for (let i = 0; i <= nx; i++) {
    const x = room.x0 + W * i / nx, main = i % 3 === 0;
    const w = main ? 0.16 : 0.06, d = main ? 0.34 : 0.14;
    steel.aabb(x - w / 2, h - d, room.z0, x + w / 2, h, room.z1);
  }
  for (let j = 0; j <= nz; j++) {
    const z = room.z0 + D * j / nz, main = j % 3 === 0;
    const w = main ? 0.16 : 0.06, d = main ? 0.34 : 0.14;
    steel.aabb(room.x0, h - d, z - w / 2, room.x1, h, z + w / 2);
  }
}

/** Holzlamellen-Sockel mit Handlauf. */
function addSlats(slat, wood, room) {
  bandAround(slat, room, 0, 0.45, 0, 0.04); // niedrig, damit Schilder (Mitte bei 0,65 m) frei liegen
  bandAround(wood, room, 0.45, 0.52, 0, 0.07);
  bandAround(wood, room, 0, 0.1, 0.04, 0.06);
}

const LEAF = new THREE.SphereGeometry(1, 7, 5);
const BALL = new THREE.SphereGeometry(1, 10, 7);

/** Palme: Topf, schlanker Stamm, Wedel als gebogene Ellipsoid-Ketten. */
function addPalm(pot, leaf, x, z, s, rnd) {
  const potCol = rnd() < 0.5 ? '#c98258' : '#ece5d6';
  pot.geo(new THREE.CylinderGeometry(0.44, 0.31, 0.72, 16), xf(x, 0.36, z), potCol);
  pot.geo(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 16), xf(x, 0.71, z), '#4a3524');
  const trunk = 1.1 * s;
  pot.geo(new THREE.CylinderGeometry(0.035, 0.05, trunk, 6), xf(x, 0.72 + trunk / 2, z), '#6f5a3a');
  const top = 0.72 + trunk;
  for (let i = 0; i < 11; i++) {
    const az = i * 2.4 + rnd();
    const seg = (1.5 + rnd() * 0.5) * s / 3;
    const p0 = 0.8 + rnd() * 0.5;
    let px = 0, py = 0;
    for (let k = 0; k < 3; k++) {
      const pitch = p0 - (k + 0.5) * 0.6;
      const hx = px + Math.cos(pitch) * seg / 2, hy = py + Math.sin(pitch) * seg / 2;
      leaf.geo(LEAF, xf(x + Math.cos(az) * hx, top + hy, z + Math.sin(az) * hx, 0, -az, pitch, seg * 0.62, 0.035, 0.2 * (1.1 - k * 0.3)), GREENS[i % GREENS.length]);
      px += Math.cos(pitch) * seg; py += Math.sin(pitch) * seg;
    }
  }
}

/** Krone: viele Kugeln in einer Halbkugel-Wolke, oben heller. */
function addCrown(leaf, x, y, z, R, rnd, count) {
  for (let i = 0; i < count; i++) {
    const a = i * 2.4 + rnd(), t = Math.sqrt((i + 0.5) / count);
    const rr = R * t * 0.85;
    const yy = y + R * 0.9 * Math.sqrt(1 - t * t) * (0.4 + rnd() * 0.6) - R * 0.1;
    const sz = R * (0.22 + rnd() * 0.2);
    leaf.geo(BALL, xf(x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr, 0, 0, 0, sz, sz * 0.85, sz), GREENS[(i + (yy > y + R * 0.5 ? 1 : 0)) % GREENS.length]);
  }
}

/** Baum (Ficus/Olive): Stamm und lockere Krone. */
function addTree(pot, leaf, x, z, s, rnd) {
  pot.geo(new THREE.CylinderGeometry(0.55, 0.4, 0.8, 18), xf(x, 0.4, z), '#ece5d6');
  pot.geo(new THREE.CylinderGeometry(0.51, 0.51, 0.04, 18), xf(x, 0.79, z), '#4a3524');
  const trunk = (1.5 + rnd() * 0.5) * s;
  pot.geo(new THREE.CylinderGeometry(0.06, 0.1, trunk, 7), xf(x, 0.8 + trunk / 2, z), '#6f5a3a');
  addCrown(leaf, x, 0.8 + trunk, z, 1.0 * s, rnd, 26);
}

/** Niedriger Busch im rechteckigen Pflanzkasten. */
function addPlanter(pot, leaf, x, z, alongX, rnd) {
  const L = 1.2, D = 0.5;
  pot.box(alongX ? L : D, 0.4, alongX ? D : L, x, 0.2, z, '#e7dfcf');
  pot.box(alongX ? L - 0.1 : D - 0.1, 0.03, alongX ? D - 0.1 : L - 0.1, x, 0.4, z, '#4a3524');
  for (let i = 0; i < 9; i++) {
    const t = (rnd() - 0.5) * (L - 0.35), o = (rnd() - 0.5) * (D - 0.3);
    const sz = 0.17 + rnd() * 0.1;
    leaf.geo(BALL, xf(x + (alongX ? t : o), 0.52 + rnd() * 0.12, z + (alongX ? o : t), 0, 0, 0, sz, sz * 0.9, sz), GREENS[i % GREENS.length]);
  }
}

/** Baum-Insel mit niedriger Steineinfassung (zentraler Blickfang). */
function addIsland(pot, leaf, x, z, s, rnd) {
  pot.geo(new THREE.CylinderGeometry(1.25, 1.3, 0.42, 28), xf(x, 0.21, z), '#e9e1d0');
  pot.geo(new THREE.CylinderGeometry(1.12, 1.12, 0.04, 28), xf(x, 0.42, z), '#4a3524');
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 0.3;
    const sz = 0.28 + rnd() * 0.15;
    leaf.geo(BALL, xf(x + Math.cos(a) * 0.8, 0.62, z + Math.sin(a) * 0.8, 0, 0, 0, sz, sz * 0.8, sz), GREENS[i % GREENS.length]);
  }
  const trunk = 2.4 * s;
  pot.geo(new THREE.CylinderGeometry(0.1, 0.16, trunk, 8), xf(x, 0.42 + trunk / 2, z), '#6f5a3a');
  addCrown(leaf, x, 0.42 + trunk, z, 1.5 * s, rnd, 40);
}

function addPlants(group, room, m, placer) {
  const pot = new Batch(), leaf = new Batch();
  const rnd = rng(room.id * 7 + 3);
  const s = Math.min(1.5, Math.max(0.9, room.height / 8));
  const W = room.x1 - room.x0, D = room.z1 - room.z0;
  const cx = room.x0 + W / 2, cz = room.z0 + D / 2;
  if (placer.place(cx, cz, 1.35, 1.35, 1.0, 0.8)) addIsland(pot, leaf, cx, cz, s, rnd);
  const e = 1.6 * s + 0.1; // Reichweite der Krone ab Mitte; so ragt nichts durch die Wand
  const tall = [[room.x0 + e, room.z0 + e], [room.x1 - e, room.z0 + e], [room.x0 + e, room.z1 - e], [room.x1 - e, room.z1 - e],
    [cx - W * 0.3, cz - D * 0.3], [cx + W * 0.3, cz - D * 0.3], [cx - W * 0.3, cz + D * 0.3], [cx + W * 0.3, cz + D * 0.3]];
  let n = 0;
  tall.forEach(([x, z], i) => {
    if (n >= 5 || placer.nearSlot(x, z, 0.7) || !placer.place(x, z, 0.55, 0.55, e - 0.55, 0.6)) return;
    n++;
    if (i % 2) addTree(pot, leaf, x, z, s, rnd); else addPalm(pot, leaf, x, z, s, rnd);
  });
  let planters = 0;
  const maxPlanters = Math.max(6, Math.round((W + D) / 4));
  for (const f of [0.2, 0.4, 0.6, 0.8]) {
    for (const [x, z, alongX] of [[room.x0 + W * f, room.z0 + 0.32, true], [room.x0 + W * f, room.z1 - 0.32, true],
      [room.x0 + 0.32, room.z0 + D * f, false], [room.x1 - 0.32, room.z0 + D * f, false]]) {
      if (planters < maxPlanters && placer.place(x, z, alongX ? 0.6 : 0.25, alongX ? 0.25 : 0.6, 0.05, 0.3)) { addPlanter(pot, leaf, x, z, alongX, rnd); planters++; }
    }
  }
  if (!pot.empty) group.add(pot.mesh(m.pots), leaf.mesh(m.leaves));
}

function addBenches(group, room, m, placer) {
  const b = new Batch();
  const alongX = longAxis(room) === 'x';
  const cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2;
  const offs = alongX ? [[-4.2, 0], [4.2, 0], [0, 3.2], [0, -3.2]] : [[0, -4.2], [0, 4.2], [3.2, 0], [-3.2, 0]];
  let n = 0;
  for (const [dx, dz] of offs) {
    const x = cx + dx, z = cz + dz;
    if (n >= 2 || !placer.place(x, z, alongX ? 1.1 : 0.3, alongX ? 0.3 : 1.1, 1.2, 0.8)) continue;
    n++;
    for (let i = 0; i < 4; i++) {
      const o = (i - 1.5) * 0.115;
      b.box(alongX ? 2.2 : 0.1, 0.05, alongX ? 0.1 : 2.2, x + (alongX ? 0 : o), 0.44, z + (alongX ? o : 0), OAK);
    }
    for (const s of [-1, 1]) {
      b.box(alongX ? 0.08 : 0.5, 0.42, alongX ? 0.5 : 0.08, x + (alongX ? s * 0.95 : 0), 0.21, z + (alongX ? 0 : s * 0.95), '#e4dccb');
    }
  }
  if (!b.empty) group.add(b.mesh(m.pots));
}

/** Efeu-Fries über den Bildern: hängt von der Decke herab, soweit über der höchsten Bildkante Platz ist. */
function addVines(vine, room) {
  const top = room.height - 0.1;
  const hgt = Math.min(2.6, top - (maxPictureTop(room) + 0.4));
  if (hgt < 0.8) return;
  for (const wall of WALLS) {
    const info = wallInfo(room, wall);
    const len = info.t1 - info.t0;
    const p = (t, y) => { const [x, z] = info.to(t, 0.03); return [x, y, z]; };
    const v0 = 1 - hgt / 2.6, k = len / 4;
    const q = [p(info.t0, top - hgt), p(info.t1, top - hgt), p(info.t1, top), p(info.t0, top)];
    const uvs = [[0, v0], [k, v0], [k, 1], [0, 1]];
    const n = [Math.sin(info.rotY), 0, Math.cos(info.rotY)];
    if (wall === 's' || wall === 'w') vine.quad(q[1], q[0], q[3], q[2], undefined, { n, uvs: [uvs[1], uvs[0], uvs[3], uvs[2]] });
    else vine.quad(...q, undefined, { n, uvs });
  }
}

function drawPlaque(g, W, H, titel, datum) {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#ecd8b0'); grad.addColorStop(1, '#dcc291');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(110,80,40,.45)'; g.lineWidth = 3; g.strokeRect(8, 8, W - 16, H - 16);
  g.fillStyle = '#3d5a3a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(fitText(g, titel, W - 70, 62, 'bold', SERIF), W / 2, datum ? H * 0.38 : H / 2);
  if (datum) { g.font = `italic 44px ${SERIF}`; g.fillText(datum, W / 2, H * 0.74); }
}

export function build(room) {
  const m = materials();
  const group = new THREE.Group();
  group.add(...shell(room, m));
  const steel = new Batch(), slat = new Batch(), wood = new Batch(), vine = new Batch();
  addGlassGrid(steel, room);
  addVines(vine, room);
  addSlats(slat, wood, room);
  group.add(steel.mesh(m.steel), slat.mesh(m.slat), wood.mesh(m.wood));
  if (!vine.empty) group.add(vine.mesh(m.vine));
  const placer = new Placer(room);
  addPlants(group, room, m, placer);
  addBenches(group, room, m, placer);
  addLight(group, room, 0xfff0cf, 16, 0.6);
  return { group, obstacles: placer.obstacles, frame, plaque };
}

function frame(w, h) {
  const m = materials();
  const g = new THREE.Group();
  const liner = new Batch(), wood = new Batch();
  liner.sweep(w, h, [[0, 0], [0, 0.012], [0.05, 0.012], [0.05, 0]]);
  wood.sweep(w + 0.1, h + 0.1, [[0, 0], [0, 0.04], [0.012, 0.058], [0.052, 0.058], [0.062, 0.045], [0.062, 0]]);
  g.add(liner.mesh(m.liner), wood.mesh(m.wood));
  return g;
}

function plaque(titel, datum) {
  const m = materials();
  return plaqueObject(0.6, 0.2, titel, datum, drawPlaque, m.text, { mat: m.plate, depth: 0.014 });
}
