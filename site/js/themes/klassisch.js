// Thema "klassisch": hell und festlich, Wandfelder und Stuck, Kassettendecke, Marmorboden, Goldrahmen.
import * as THREE from 'three';
import { Batch, xf } from './geo.js';
import {
  shell, bandAround, wallBox, wallInfo, doorsOn, spans, hitsSlot, maxPictureTop,
  Placer, addLight, longAxis, plaqueObject, WALLS,
} from './common.js';
import { cached, canvas, rng, speckle, toTexture, fitText, SERIF } from '../textures.js';

const CREAM = '#f4ecda';
const GOLD = '#d6ab45';

function wallTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#f5ecd9'; g.fillRect(0, 0, 256, 256);
  const rnd = rng(9);
  speckle(g, 256, 256, rnd, 900, ['#e8dcc2', '#fff8ea'], 2, 7, 0.3);
  return toTexture(c, 2);
}

/** Schachbrett auf der Spitze aus cremefarbenem und grauem Marmor mit Adern; Kachel = 2,4 m. */
function floorTexture() {
  const S = 1024, q = S / 4;
  const [c, g] = canvas(S, S);
  const rnd = rng(31);
  const cols = ['#f1eadb', '#cdc5b6'];
  for (let i = -1; i <= 4; i++) {
    for (let j = -1; j <= 4; j++) {
      if ((i + j) % 2) continue;
      g.save();
      g.beginPath();
      g.moveTo(i * q, j * q - q); g.lineTo(i * q + q, j * q); g.lineTo(i * q, j * q + q); g.lineTo(i * q - q, j * q);
      g.closePath(); g.clip();
      g.fillStyle = cols[((i % 2) + 2) % 2]; g.fillRect(i * q - q, j * q - q, 2 * q, 2 * q);
      for (let k = 0; k < 9; k++) {
        g.strokeStyle = `rgba(110,100,90,${0.06 + rnd() * 0.14})`; g.lineWidth = 0.6 + rnd() * 1.8;
        g.beginPath(); g.moveTo(i * q - q + rnd() * 2 * q, j * q - q);
        g.bezierCurveTo(i * q + (rnd() - 0.5) * q * 2, j * q - q * 0.3, i * q + (rnd() - 0.5) * q * 2, j * q + q * 0.3, i * q - q + rnd() * 2 * q, j * q + q);
        g.stroke();
      }
      g.restore();
      g.strokeStyle = 'rgba(160,125,55,.55)'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(i * q, j * q - q); g.lineTo(i * q + q, j * q); g.lineTo(i * q, j * q + q); g.lineTo(i * q - q, j * q);
      g.closePath(); g.stroke();
    }
  }
  return toTexture(c, 2.4);
}

/** Eine Kassette: abgesetztes Feld mit goldener Rosette. UVs laufen 0..1 je Kassette. */
function cofferTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#f1e7d2'; g.fillRect(0, 0, 256, 256);
  const grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#e6d8bb'); grad.addColorStop(1, '#fbf4e4');
  g.fillStyle = grad; g.fillRect(26, 26, 204, 204);
  g.strokeStyle = 'rgba(160,125,55,.7)'; g.lineWidth = 3; g.strokeRect(26, 26, 204, 204);
  g.strokeStyle = 'rgba(160,125,55,.4)'; g.lineWidth = 2; g.strokeRect(38, 38, 180, 180);
  g.translate(128, 128);
  for (let i = 0; i < 12; i++) {
    g.rotate(Math.PI / 6);
    g.fillStyle = i % 2 ? '#d8b25a' : '#c9a043';
    g.beginPath(); g.ellipse(0, -34, 9, 24, 0, 0, 7); g.fill();
  }
  g.fillStyle = '#b8903a'; g.beginPath(); g.arc(0, 0, 14, 0, 7); g.fill();
  return toTexture(c, 1);
}

function materials() {
  return cached('klassisch.mats', () => {
    const gold = new THREE.MeshPhongMaterial({ color: GOLD, specular: 0xffe7a0, shininess: 45, emissive: 0x3a2a08 });
    return {
      wall: new THREE.MeshLambertMaterial({ map: wallTexture() }),
      floor: new THREE.MeshPhongMaterial({ map: floorTexture(), specular: 0x666655, shininess: 70 }),
      ceil: new THREE.MeshLambertMaterial({ map: cofferTexture() }),
      trim: new THREE.MeshLambertMaterial({ color: CREAM }),
      dado: new THREE.MeshLambertMaterial({ color: '#e6d8bb' }),
      gold,
      marble: new THREE.MeshPhongMaterial({ color: 0xf3eee3, specular: 0x555555, shininess: 50 }),
      velvet: new THREE.MeshLambertMaterial({ vertexColors: true }),
      flame: new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false }),
      liner: new THREE.MeshLambertMaterial({ color: 0xf6efe0 }),
      text: new THREE.MeshBasicMaterial({ transparent: true }),
      brass: new THREE.MeshPhongMaterial({ color: 0xc9a352, specular: 0xffe9a8, shininess: 40 }),
    };
  });
}

/** Kassettendecke: Balkenraster mit Goldkante; gibt die Zellgröße zurück. */
function addCoffers(trim, gold, room) {
  const W = room.x1 - room.x0, D = room.z1 - room.z0, h = room.height;
  const nx = Math.max(2, Math.round(W / 2.6)), nz = Math.max(2, Math.round(D / 2.6));
  const bw = 0.3, bd = 0.3;
  for (let i = 1; i < nx; i++) {
    const x = room.x0 + W * i / nx;
    trim.aabb(x - bw / 2, h - bd, room.z0, x + bw / 2, h, room.z1);
    gold.aabb(x - bw / 2 + 0.03, h - bd - 0.012, room.z0, x + bw / 2 - 0.03, h - bd, room.z1, undefined, 'yY');
  }
  for (let j = 1; j < nz; j++) {
    const z = room.z0 + D * j / nz;
    trim.aabb(room.x0, h - bd, z - bw / 2, room.x1, h, z + bw / 2);
    gold.aabb(room.x0, h - bd - 0.012, z - bw / 2 + 0.03, room.x1, h - bd, z + bw / 2 - 0.03, undefined, 'yY');
  }
  return (v) => [(v[0] - room.x0) / (W / nx), (v[2] - room.z0) / (D / nz)];
}

/** Sockelzone, Täfelung mit Feldern, Handlauf, Gesims. */
function addWallTrim(trim, gold, dado, room) {
  const h = room.height;
  bandAround(trim, room, 0, 0.28, 0, 0.05);
  bandAround(trim, room, 0.28, 0.33, 0, 0.07);
  bandAround(dado, room, 0.33, 1.05, 0, 0.025);
  bandAround(trim, room, 1.05, 1.13, 0, 0.065);
  bandAround(gold, room, 1.13, 1.16, 0, 0.075);
  bandAround(trim, room, h - 0.18, h, 0, 0.3);
  bandAround(trim, room, h - 0.36, h - 0.18, 0, 0.2);
  bandAround(trim, room, h - 0.54, h - 0.36, 0, 0.1);
  bandAround(gold, room, h - 0.6, h - 0.54, 0, 0.12);
}

function addField(trim, gold, info, t0, t1, y0, y1) {
  const b = 0.05, d = 0.04, i = 0.1, g = 0.014;
  wallBox(trim, info, t0, t1, y0, y0 + b, 0, d);
  wallBox(trim, info, t0, t1, y1 - b, y1, 0, d);
  wallBox(trim, info, t0, t0 + b, y0, y1, 0, d);
  wallBox(trim, info, t1 - b, t1, y0, y1, 0, d);
  wallBox(gold, info, t0 + i, t1 - i, y0 + i, y0 + i + g, 0, 0.012);
  wallBox(gold, info, t0 + i, t1 - i, y1 - i - g, y1 - i, 0, 0.012);
  wallBox(gold, info, t0 + i, t0 + i + g, y0 + i, y1 - i, 0, 0.012);
  wallBox(gold, info, t1 - i - g, t1 - i, y0 + i, y1 - i, 0, 0.012);
}

/** Wandfelder: unten in der Täfelung, oben über den Bildern. */
function addFields(trim, gold, room) {
  const h = room.height;
  const top = Math.max(4.7, maxPictureTop(room) + 0.5);
  for (const wall of WALLS) {
    const info = wallInfo(room, wall);
    for (const [s, e] of spans(room, wall, 0.4)) {
      const n = Math.max(1, Math.floor((e - s - 0.4) / 1.3));
      const w = (e - s - 0.4) / n;
      for (let i = 0; i < n; i++) {
        const t0 = s + 0.2 + i * w + 0.1, t1 = s + 0.2 + (i + 1) * w - 0.1;
        if (!hitsSlot(room, wall, t0, t1, 0.4, 1.0)) addField(trim, gold, info, t0, t1, 0.45, 0.95);
      }
    }
    if (h - 1.45 - top < 0.9) continue;
    const n = Math.max(1, Math.floor((info.t1 - info.t0 - 0.8) / 2.8));
    const w = (info.t1 - info.t0 - 0.8) / n;
    for (let i = 0; i < n; i++) {
      const t0 = info.t0 + 0.4 + i * w + 0.15, t1 = info.t0 + 0.4 + (i + 1) * w - 0.15;
      if (!hitsSlot(room, wall, t0, t1, top, h - 1.45)) addField(trim, gold, info, t0, t1, top, h - 1.45);
    }
  }
}

function addArchitraves(trim, gold, room) {
  for (const wall of WALLS) {
    const info = wallInfo(room, wall);
    for (const door of doorsOn(room, wall)) {
      const a = door.center - door.width / 2, b = door.center + door.width / 2, hd = door.height;
      const lw = 0.17;
      wallBox(trim, info, a - lw, a, 0, hd + 0.17, 0, 0.055);
      wallBox(trim, info, b, b + lw, 0, hd + 0.17, 0, 0.055);
      wallBox(trim, info, a - lw, b + lw, hd, hd + 0.17, 0, 0.055);
      wallBox(trim, info, a - lw - 0.1, b + lw + 0.1, hd + 0.17, hd + 0.3, 0, 0.13);
      wallBox(gold, info, a - lw - 0.12, b + lw + 0.12, hd + 0.3, hd + 0.34, 0, 0.14);
    }
  }
}

/** Eckpilaster mit Sockel und goldenem Kapitell (nur, wenn kein Bild dort hängt). */
function addCornerPilasters(trim, gold, room) {
  const h = room.height, s = 0.42;
  const corners = [[room.x0, room.z0, 1, 1], [room.x1, room.z0, -1, 1], [room.x0, room.z1, 1, -1], [room.x1, room.z1, -1, -1]];
  const blk = (b, cx, cz, dx, dz, size, y0, y1) => b.aabb(Math.min(cx, cx + dx * size), y0, Math.min(cz, cz + dz * size), Math.max(cx, cx + dx * size), y1, Math.max(cz, cz + dz * size));
  for (const [cx, cz, dx, dz] of corners) {
    const nearSlot = room.slots.some((sl) => Math.hypot(sl.x - cx, sl.z - cz) < sl.w / 2 + 0.9);
    if (nearSlot) continue;
    blk(trim, cx, cz, dx, dz, 0.5, 0, 0.35);
    blk(trim, cx, cz, dx, dz, s, 0.35, h - 0.95);
    blk(trim, cx, cz, dx, dz, 0.5, h - 0.95, h - 0.6);
    blk(gold, cx, cz, dx, dz, 0.52, h - 1.03, h - 0.95);
  }
}

function addColumn(marble, gold, x, z, T) {
  marble.box(0.72, 0.18, 0.72, x, 0.09, z);
  marble.box(0.6, 0.2, 0.6, x, 0.28, z);
  gold.geo(new THREE.CylinderGeometry(0.31, 0.31, 0.08, 20), xf(x, 0.42, z), GOLD);
  marble.geo(new THREE.CylinderGeometry(0.24, 0.26, T - 1.18, 20), xf(x, 0.46 + (T - 1.18) / 2, z));
  gold.geo(new THREE.CylinderGeometry(0.29, 0.29, 0.07, 20), xf(x, T - 0.685, z), GOLD);
  marble.geo(new THREE.CylinderGeometry(0.46, 0.27, 0.45, 20), xf(x, T - 0.425, z));
  marble.box(0.9, 0.2, 0.9, x, T - 0.1, z);
}

function addColumns(group, room, m, placer) {
  const marble = new Batch(), gold = new Batch();
  const cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2;
  const ax = (room.x1 - room.x0) * 0.27, az = (room.z1 - room.z0) * 0.27;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = cx + sx * ax, z = cz + sz * az;
    if (placer.place(x, z, 0.45, 0.45, 1.3, 0.6)) addColumn(marble, gold, x, z, room.height - 0.3);
  }
  if (!marble.empty) group.add(marble.mesh(m.marble), gold.mesh(m.gold));
}

function addBenches(group, room, m, placer) {
  const b = new Batch();
  const alongX = longAxis(room) === 'x';
  const cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2;
  const area = (room.x1 - room.x0) * (room.z1 - room.z0);
  const offs = [[0, 0], [alongX ? 0 : 3.2, alongX ? 3.2 : 0], [alongX ? 0 : -3.2, alongX ? -3.2 : 0]];
  let n = 0;
  for (const [dx, dz] of offs) {
    const x = cx + dx, z = cz + dz;
    const hw = alongX ? 1.1 : 0.45, hd = alongX ? 0.45 : 1.1;
    if (n >= (area > 130 ? 2 : 1) || !placer.place(x, z, hw, hd, 1.2, 0.8)) continue;
    n++;
    const red = '#7d2c3b', dark = '#5e1f2c';
    b.box(alongX ? 1.9 : 0.7, 0.3, alongX ? 0.7 : 1.9, x, 0.32, z, red);
    b.box(alongX ? 1.7 : 0.6, 0.1, alongX ? 0.6 : 1.7, x, 0.52, z, dark);
    b.geo(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 14), xf(x + (alongX ? 0.95 : 0), 0.42, z + (alongX ? 0 : 0.95), alongX ? Math.PI / 2 : 0, 0, alongX ? 0 : Math.PI / 2), dark);
    b.geo(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 14), xf(x - (alongX ? 0.95 : 0), 0.42, z - (alongX ? 0 : 0.95), alongX ? Math.PI / 2 : 0, 0, alongX ? 0 : Math.PI / 2), dark);
    for (const [fx, fz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      b.box(0.08, 0.14, 0.08, x + fx * (alongX ? 0.85 : 0.28), 0.07, z + fz * (alongX ? 0.28 : 0.85), GOLD);
    }
  }
  if (!b.empty) group.add(b.mesh(m.velvet));
}

function addChandelier(gold, flame, x, z, room) {
  const h = room.height;
  const ringY = Math.max(5.2, h - 3.2);
  gold.geo(new THREE.CylinderGeometry(0.02, 0.02, h - ringY, 6), xf(x, (h + ringY) / 2, z), GOLD);
  gold.geo(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 20), xf(x, h - 0.03, z), GOLD);
  gold.geo(new THREE.TorusGeometry(0.75, 0.035, 8, 28), xf(x, ringY, z, Math.PI / 2), GOLD);
  gold.geo(new THREE.TorusGeometry(0.4, 0.03, 8, 20), xf(x, ringY + 0.35, z, Math.PI / 2), GOLD);
  gold.geo(new THREE.SphereGeometry(0.14, 10, 8), xf(x, ringY + 0.02, z), GOLD);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const px = x + Math.cos(a) * 0.75, pz = z + Math.sin(a) * 0.75;
    gold.geo(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), xf(px, ringY + 0.13, pz), '#f7f0df');
    flame.geo(new THREE.SphereGeometry(0.045, 6, 5), xf(px, ringY + 0.28, pz, 0, 0, 0, 1, 1.5, 1));
  }
}

function addChandeliers(group, room, m) {
  const gold = new Batch(), flame = new Batch();
  const cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2;
  const W = room.x1 - room.x0, D = room.z1 - room.z0;
  const pts = W > D * 1.6 ? [[cx - W / 4, cz], [cx + W / 4, cz]] : D > W * 1.6 ? [[cx, cz - D / 4], [cx, cz + D / 4]] : [[cx, cz]];
  pts.forEach(([x, z]) => addChandelier(gold, flame, x, z, room));
  group.add(gold.mesh(new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0xffe7a0, shininess: 45, emissive: 0x2a1c05 })), flame.mesh(m.flame));
}

function drawPlaque(g, W, H, titel, datum) {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#e1c27a'); grad.addColorStop(1, '#b38d3f');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(70,45,10,.65)'; g.lineWidth = 4; g.strokeRect(10, 10, W - 20, H - 20);
  g.lineWidth = 1.5; g.strokeRect(18, 18, W - 36, H - 36);
  g.fillStyle = '#2d1c0a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(fitText(g, titel, W - 90, 52, 'bold', SERIF), W / 2, datum ? H * 0.38 : H / 2);
  if (datum) { g.font = `italic 38px ${SERIF}`; g.fillText(datum, W / 2, H * 0.72); }
}

export function build(room) {
  const m = materials();
  const group = new THREE.Group();
  const trim = new Batch(), gold = new Batch(), dado = new Batch();
  const ceilGold = new Batch(), ceilTrim = new Batch();
  const ceilUV = addCoffers(ceilTrim, ceilGold, room);
  group.add(...shell(room, m, ceilUV));
  addWallTrim(trim, gold, dado, room);
  addFields(trim, gold, room);
  addArchitraves(trim, gold, room);
  addCornerPilasters(trim, gold, room);
  group.add(trim.mesh(m.trim), dado.mesh(m.dado), gold.mesh(m.gold), ceilTrim.mesh(m.trim), ceilGold.mesh(m.gold));
  const placer = new Placer(room);
  addColumns(group, room, m, placer);
  addBenches(group, room, m, placer);
  addChandeliers(group, room, m);
  addLight(group, room, 0xffe6bd, 14, 0.5);
  return { group, obstacles: placer.obstacles, frame, plaque };
}

const PROFILE = [[0, 0], [0, 0.04], [0.025, 0.056], [0.05, 0.03], [0.075, 0.036], [0.095, 0.095],
  [0.14, 0.115], [0.18, 0.1], [0.197, 0.062], [0.215, 0.062], [0.215, 0]];

function frame(w, h) {
  const m = materials();
  const g = new THREE.Group();
  const s = Math.min(1.1, Math.max(0.65, Math.min(w, h) / 1.6));
  const lin = 0.035;
  const liner = new Batch(), fr = new Batch();
  liner.sweep(w, h, [[0, 0], [0, 0.012], [lin, 0.012], [lin, 0]]);
  fr.sweep(w + 2 * lin, h + 2 * lin, PROFILE.map(([d, z]) => [d * s, z]));
  g.add(liner.mesh(m.liner), fr.mesh(m.gold));
  return g;
}

function plaque(titel, datum) {
  const m = materials();
  return plaqueObject(0.56, 0.18, titel, datum, drawPlaque, m.text, { mat: m.brass, depth: 0.014 });
}
