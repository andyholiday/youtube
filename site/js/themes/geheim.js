// Thema "geheim": der kleine, intime Raum (Easter Egg). Warmes Elfenbein, Bordeaux-Samt, Parkett, Kerzenschein.
// Wird nicht in der Themenrotation (THEMES) geführt, sondern nur von layout.js für den geheimen Raum gesetzt.
// Bewusst ohne Punktlicht: jedes zusätzliche Licht kostet auf dem Handy in der ganzen Szene Rechenzeit; die Wärme kommt von Farben und Kerzenglimmen.
import * as THREE from 'three';
import { Batch, xf } from './geo.js';
import {
  shell, bandAround, doorLining, wallBox, wallInfo, plaqueObject,
} from './common.js';
import { cached, canvas, rng, speckle, toTexture, fitText, SERIF } from '../textures.js';

export const BORDEAUX = '#7a1f33';
const PANEL = '#5a1627'; // Lambris: dunkler als der Akzent, damit er im hellen Licht nicht grell wird
const VELVET = '#55182a';
const CREAM = '#f6efe3';
const GOLD = '#c9a45c';
const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };

/** Elfenbein mit zartem Rautenmuster (Damast-Anmutung); Kachel = 1,6 m. */
function wallTexture() {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#f7e3d0'; g.fillRect(0, 0, S, S);
  speckle(g, S, S, rng(7), 900, ['#eed5bd', '#fcefe2'], 2, 6, 0.3);
  g.strokeStyle = 'rgba(190,140,110,.26)'; g.lineWidth = 2;
  const q = S / 2;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const cx = i * q + q / 2, cy = j * q + q / 2;
      g.beginPath(); g.moveTo(cx, cy - 90); g.lineTo(cx + 62, cy); g.lineTo(cx, cy + 90); g.lineTo(cx - 62, cy); g.closePath(); g.stroke();
      g.fillStyle = 'rgba(160,100,90,.16)'; g.beginPath(); g.arc(cx, cy, 7, 0, 7); g.fill();
    }
  }
  return toTexture(c, 1.6);
}

/** Warmes Fischgrät-Parkett aus Nussbaum; Kachel = 2 m. */
function floorTexture() {
  const S = 1024;
  const [c, g] = canvas(S, S);
  const rnd = rng(13);
  const tones = ['#9a6b45', '#a8774d', '#8d6040', '#b3835a', '#a06f48'];
  g.fillStyle = '#7d5436'; g.fillRect(0, 0, S, S);
  const L = 170, W = 42;
  for (let row = -1; row < S / W + 1; row++) {
    for (let col = -1; col < S / L + 2; col++) {
      const x = col * L + (row % 2 ? L / 2 : 0), y = row * W;
      g.fillStyle = tones[Math.floor(rnd() * tones.length)];
      g.fillRect(x + 1, y + 1, L - 2, W - 2);
      g.fillStyle = 'rgba(255,230,190,.07)'; g.fillRect(x + 1, y + 1, L - 2, 3);
    }
  }
  speckle(g, S, S, rnd, 700, ['#7a5233', '#c39367'], 1, 4, 0.2);
  return toTexture(c, 2);
}

/** Runder Teppich: Bordeaux mit Elfenbein-/Goldringen. Eigene Textur, UV 0..1 über die Kreisfläche. */
function rugTexture() {
  const S = 512, r = S / 2;
  const [c, g] = canvas(S, S);
  const ring = (rad, col, w = 0) => {
    g.beginPath(); g.arc(r, r, rad, 0, 7);
    if (w) { g.strokeStyle = col; g.lineWidth = w; g.stroke(); } else { g.fillStyle = col; g.fill(); }
  };
  ring(r - 4, '#44101e'); ring(r - 22, '#5c1727'); ring(r - 40, GOLD, 5); ring(r - 56, '#f1e4cf', 3);
  ring(r - 120, '#69192c'); ring(r - 128, '#d9b878', 3);
  g.save(); g.translate(r, r);
  for (let i = 0; i < 12; i++) { // zwölf kleine Herzen auf dem Ring
    g.rotate(Math.PI / 6); g.save(); g.translate(0, -(r - 86)); g.scale(15, 15);
    g.fillStyle = 'rgba(241,228,207,.8)'; g.beginPath(); g.moveTo(0, 0.45);
    g.bezierCurveTo(-0.15, 0.3, -0.5, 0.05, -0.5, -0.18); g.bezierCurveTo(-0.5, -0.38, -0.35, -0.5, -0.2, -0.5);
    g.bezierCurveTo(-0.08, -0.5, 0, -0.42, 0, -0.32); g.bezierCurveTo(0, -0.42, 0.08, -0.5, 0.2, -0.5);
    g.bezierCurveTo(0.35, -0.5, 0.5, -0.38, 0.5, -0.18); g.bezierCurveTo(0.5, 0.05, 0.15, 0.3, 0, 0.45);
    g.fill(); g.restore();
  }
  g.restore();
  g.fillStyle = '#f1e4cf'; g.beginPath(); g.arc(r, r, 22, 0, 7); g.fill();
  g.fillStyle = '#5c1727'; g.beginPath(); g.arc(r, r, 12, 0, 7); g.fill();
  return toTexture(c);
}

function glowTexture() {
  return cached('geheim.glow', () => {
    const [c, g] = canvas(128, 128);
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,214,150,.95)');
    grad.addColorStop(0.25, 'rgba(255,190,110,.45)');
    grad.addColorStop(1, 'rgba(255,170,90,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    return toTexture(c);
  });
}

function materials() {
  return cached('geheim.mats', () => ({
    wall: new THREE.MeshLambertMaterial({ map: wallTexture(), emissive: 0x4a2f1c }), // warmer Grundton statt Punktlicht
    floor: new THREE.MeshPhongMaterial({ map: floorTexture(), specular: 0x4a3a2a, shininess: 40, emissive: 0x20120a }),
    ceil: new THREE.MeshLambertMaterial({ color: 0xfff4e6, emissive: 0x3a2a1a }),
    trim: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a1812 }),
    gold: new THREE.MeshPhongMaterial({ color: GOLD, specular: 0xffe9b8, shininess: 55, emissive: 0x2a1c06 }),
    cream: new THREE.MeshLambertMaterial({ color: CREAM }),
    rug: new THREE.MeshLambertMaterial({ map: rugTexture(), alphaTest: 0.5 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffe6a8, toneMapped: false }),
    glow: new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.38 }),
    text: new THREE.MeshBasicMaterial({ transparent: true }),
    plate: new THREE.MeshLambertMaterial({ color: 0xf3e9d8 }),
  }));
}

const rectOf = (info, t0, t1, d0, d1) => {
  const [xa, za] = info.to(t0, d0), [xb, zb] = info.to(t1, d1);
  return { x0: Math.min(xa, xb), x1: Math.max(xa, xb), z0: Math.min(za, zb), z1: Math.max(za, zb) };
};

/** Lambris in Bordeaux mit goldener Leiste, Fußleiste und Deckengesims in Creme. */
function addWainscot(trim, room) {
  bandAround(trim, room, 0, 0.12, 0, 0.03, CREAM);
  bandAround(trim, room, 0.12, 0.92, 0, 0.014, PANEL);
  bandAround(trim, room, 0.92, 0.98, 0, 0.03, GOLD);
  bandAround(trim, room, room.height - 0.26, room.height, 0, 0.09, CREAM);
  bandAround(trim, room, room.height - 0.34, room.height - 0.26, 0, 0.05, GOLD);
  doorLining(trim, room, 0.06, CREAM);
}

/** Kleine Kerze samt Flamme in die Sammler. */
function candle(cream, flame, glows, x, y, z, h = 0.14) {
  cream.geo(new THREE.CylinderGeometry(0.017, 0.019, h, 8), xf(x, y + h / 2, z), CREAM);
  flame.geo(new THREE.SphereGeometry(0.02, 8, 6), xf(x, y + h + 0.025, z, 0, 0, 0, 1, 1.7, 1));
  glows.push([x, y + h + 0.03, z]);
}

/** Kronleuchter mit sechs Kerzen in Raummitte, hoch über dem Kopf. */
function addChandelier(group, room, m, glows) {
  const cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2, y = room.height - 1.7;
  const gold = new Batch(), cream = new Batch(), flame = new Batch();
  gold.geo(new THREE.TorusGeometry(0.45, 0.022, 8, 28), xf(cx, y, cz, Math.PI / 2), GOLD);
  gold.geo(new THREE.CylinderGeometry(0.008, 0.008, 1.5, 6), xf(cx, y + 0.75, cz), GOLD);
  gold.geo(new THREE.CylinderGeometry(0.34, 0.4, 0.05, 20), xf(cx, room.height - 0.03, cz), GOLD);
  gold.geo(new THREE.SphereGeometry(0.07, 10, 8), xf(cx, y - 0.1, cz, 0, 0, 0, 1, 1.6, 1), GOLD);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    candle(cream, flame, glows, cx + Math.cos(a) * 0.45, y + 0.02, cz + Math.sin(a) * 0.45, 0.16);
  }
  group.add(gold.mesh(m.gold), cream.mesh(m.trim), flame.mesh(m.flame));
}

/** Teppich in der Mitte (flache Scheibe knapp über dem Boden). */
function addRug(group, room, m) {
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), m.rug);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set((room.x0 + room.x1) / 2, 0.01, (room.z0 + room.z1) / 2);
  group.add(rug);
}

/** Samtsofa an der Wand gegenüber der Tür. Gibt die Sperrfläche zurück. */
function addSettee(group, room, m, far) {
  const info = wallInfo(room, far);
  const mid = (info.t0 + info.t1) / 2;
  const b = new Batch();
  const box = (t0, t1, y0, y1, d0, d1, c) => wallBox(b, info, mid + t0, mid + t1, y0, y1, d0, d1, c);
  box(-0.85, 0.85, 0.12, 0.42, 0.05, 0.72, VELVET); // Sitzkörper
  box(-0.85, 0.85, 0.42, 0.9, 0.05, 0.26, VELVET); // Lehne
  box(-0.95, -0.82, 0.12, 0.62, 0.05, 0.74, '#45111f'); // Armlehnen
  box(0.82, 0.95, 0.12, 0.62, 0.05, 0.74, '#45111f');
  box(-0.78, 0.78, 0.42, 0.5, 0.28, 0.7, '#6e2236'); // Sitzkissen
  box(-0.7, -0.25, 0.5, 0.84, 0.26, 0.4, CREAM); // Rückenkissen
  box(0.25, 0.7, 0.5, 0.84, 0.26, 0.4, '#e8cfc4');
  for (const t of [-0.8, 0.8]) box(t - 0.04, t + 0.04, 0, 0.12, 0.1, 0.2, GOLD);
  group.add(b.mesh(m.trim));
  return rectOf(info, mid - 0.95, mid + 0.95, 0, 0.78);
}

/** Zwei Portières (Samtvorhänge) links und rechts neben der Tür. */
function addDrapes(group, room, m, door) {
  const info = wallInfo(room, door.wall);
  const b = new Batch();
  for (const side of [-1, 1]) {
    const edge = door.center + side * (door.width / 2 + 0.05);
    for (let k = 0; k < 4; k++) {
      const t = edge + side * (0.07 + k * 0.1);
      const [x, z] = info.to(t, 0.1);
      b.geo(new THREE.CylinderGeometry(0.06, 0.06, room.height - 0.5, 8), xf(x, (room.height - 0.5) / 2 + 0.05, z), k % 2 ? VELVET : '#68182b');
    }
    wallBox(b, info, Math.min(edge, edge + side * 0.5), Math.max(edge, edge + side * 0.5), room.height - 0.62, room.height - 0.38, 0, 0.2, GOLD);
  }
  group.add(b.mesh(m.trim));
}

/** Standleuchter mit drei Kerzen; liefert die Sperrfläche. */
function addCandelabra(group, m, x, z, glows) {
  const gold = new Batch(), cream = new Batch(), flame = new Batch();
  gold.geo(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 16), xf(x, 0.03, z), GOLD);
  gold.geo(new THREE.CylinderGeometry(0.03, 0.05, 1.15, 10), xf(x, 0.62, z), GOLD);
  gold.geo(new THREE.CylinderGeometry(0.17, 0.05, 0.1, 14), xf(x, 1.24, z), GOLD);
  for (const dx of [-0.08, 0, 0.08]) candle(cream, flame, glows, x + dx, 1.28, z + (dx === 0 ? 0.04 : -0.02), 0.2);
  group.add(gold.mesh(m.gold), cream.mesh(m.trim), flame.mesh(m.flame));
  return { x0: x - 0.26, x1: x + 0.26, z0: z - 0.26, z1: z + 0.26 };
}

function addGlows(group, m, glows) {
  for (const [x, y, z] of glows) {
    const s = new THREE.Sprite(m.glow);
    s.position.set(x, y, z);
    s.scale.setScalar(0.42);
    s.userData.noPick = true;
    s.raycast = () => {}; // Glimmen ist nie ein Treffer (und Sprites bräuchten sonst raycaster.camera)
    group.add(s);
  }
}

/** Ecken an der Türwand: dort stehen die Standleuchter (Abstand zur Ecke 0,55 m). */
function doorCorners(room, wall) {
  const info = wallInfo(room, wall);
  return [info.t0 + 0.55, info.t1 - 0.55].map((t) => info.to(t, 0.55));
}

export function build(room) {
  const m = materials();
  const group = new THREE.Group();
  group.add(...shell(room, m));
  const trim = new Batch();
  addWainscot(trim, room);
  group.add(trim.mesh(m.trim));
  const door = room.doors[0];
  const far = OPPOSITE[door.wall];
  const glows = [];
  const obstacles = [];
  addRug(group, room, m);
  obstacles.push(addSettee(group, room, m, far));
  addDrapes(group, room, m, door);
  for (const [x, z] of doorCorners(room, door.wall)) obstacles.push(addCandelabra(group, m, x, z, glows));
  addChandelier(group, room, m, glows);
  addGlows(group, m, glows);
  return { group, obstacles, frame, plaque };
}

/** Rahmen: Elfenbein-Passepartout, schmale Goldleiste (Tiefe ≤ 0,08 m). */
export function frame(w, h) {
  const m = materials();
  const g = new THREE.Group();
  const mat = new Batch();
  mat.sweep(w, h, [[0, 0], [0, 0.01], [0.06, 0.01], [0.06, 0]]);
  const f = new Batch();
  f.sweep(w, h, [[0.06, 0], [0.06, 0.05], [0.1, 0.075], [0.13, 0.075], [0.16, 0.035], [0.16, 0]]);
  g.add(mat.mesh(m.cream), f.mesh(m.gold));
  return g;
}

function drawPlaque(g, W, H, titel, datum) {
  g.fillStyle = '#f6eee0'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(122,31,51,.55)'; g.lineWidth = 2; g.strokeRect(8, 8, W - 16, H - 16);
  g.fillStyle = BORDEAUX; g.textAlign = 'center'; g.textBaseline = 'middle';
  const t = fitText(g, titel, W - 50, 60, 'italic 600', SERIF);
  g.fillText(t, W / 2, datum ? H * 0.37 : H / 2);
  if (datum) {
    g.font = `400 40px ${SERIF}`; g.fillStyle = '#6b4a50';
    g.fillText(datum, W / 2, H * 0.75);
  }
}

export function plaque(titel, datum) {
  const m = materials();
  return plaqueObject(0.6, 0.2, titel, datum, drawPlaque, m.text, { mat: m.plate, depth: 0.012 });
}
