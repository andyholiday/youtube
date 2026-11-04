// Thema "futuristisch": helle, glänzende Flächen, Neon-Lichtlinien, Ringleuchten, schwebende Bilder.
import * as THREE from 'three';
import { Batch, xf } from './geo.js';
import {
  shell, bandAround, wallBox, wallInfo, spans, Placer, addLight, longAxis, plaqueObject, WALLS, WALL_T,
} from './common.js';
import { cached, canvas, toTexture, fitText, SANS } from '../textures.js';

const CYAN = '#10e0ff';
const MAGENTA = '#ff2bd0';
const NAVY = '#1a2742';

/** Glatte Paneele (1,2 m) mit feinen Fugen; Kachel = 2,4 m. */
function panelTexture(base, top, seam) {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (const [x, y] of [[0, 0], [S / 2, 0], [0, S / 2], [S / 2, S / 2]]) {
    const grad = g.createLinearGradient(x, y, x + S / 2, y + S / 2);
    grad.addColorStop(0, top); grad.addColorStop(1, base);
    g.fillStyle = grad; g.fillRect(x + 3, y + 3, S / 2 - 6, S / 2 - 6);
  }
  g.fillStyle = seam;
  for (const p of [0, S / 2]) { g.fillRect(p - 2, 0, 4, S); g.fillRect(0, p - 2, S, 4); }
  return toTexture(c, 2.4);
}

function materials() {
  return cached('futuristisch.mats', () => ({
    wall: new THREE.MeshPhongMaterial({ map: panelTexture('#e9f0f5', '#fbfdff', '#b9c8d4'), specular: 0x8fa3b5, shininess: 70 }),
    floor: new THREE.MeshPhongMaterial({ map: panelTexture('#dce7ef', '#f4faff', '#8fd3e6'), specular: 0xb0c8d8, shininess: 140 }),
    ceil: new THREE.MeshLambertMaterial({ map: panelTexture('#f3f7fa', '#ffffff', '#cfdbe4') }),
    navy: new THREE.MeshPhongMaterial({ color: NAVY, specular: 0x6688aa, shininess: 90 }),
    neon: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    pod: new THREE.MeshPhongMaterial({ vertexColors: true, specular: 0xaaccdd, shininess: 80 }),
    text: new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false }),
  }));
}

/** Neon-Linien an den Wänden, Eckleisten, Türrahmen aus Licht. */
function addNeon(neon, room) {
  const h = room.height;
  bandAround(neon, room, 0.22, 0.26, 0, 0.05, CYAN);
  bandAround(neon, room, h - 0.62, h - 0.58, 0, 0.05, CYAN);
  bandAround(neon, room, h - 0.36, h - 0.32, 0, 0.05, MAGENTA);
  const { x0, x1, z0, z1 } = room;
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    const sx = x === x0 ? 1 : -1, sz = z === z0 ? 1 : -1;
    neon.aabb(Math.min(x, x + sx * 0.05), 0.26, Math.min(z, z + sz * 0.05), Math.max(x, x + sx * 0.05), h - 0.62, Math.max(z, z + sz * 0.05), CYAN);
  }
  room.doors.forEach((door, i) => {
    const info = wallInfo(room, door.wall);
    const col = i % 2 ? MAGENTA : CYAN;
    const a = door.center - door.width / 2, b = door.center + door.width / 2, hd = door.height;
    wallBox(neon, info, a - 0.1, a - 0.05, 0, hd + 0.1, 0, 0.045, col);
    wallBox(neon, info, b + 0.05, b + 0.1, 0, hd + 0.1, 0, 0.045, col);
    wallBox(neon, info, a - 0.1, b + 0.1, hd + 0.05, hd + 0.1, 0, 0.045, col);
    wallBox(neon, info, a, a + 0.04, 0, hd, -WALL_T, -0.001, '#d8fbff');
    wallBox(neon, info, b - 0.04, b, 0, hd, -WALL_T, -0.001, '#d8fbff');
  });
}

/** Leuchtende Ringe in der Decke + deren weiche Spiegelung auf dem Boden (nur Fake, ohne Reflexion). */
function addRings(neon, glow, room) {
  const cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2;
  const R = Math.min(room.x1 - room.x0, room.z1 - room.z0) * 0.3;
  const defs = [[R, 0.16, CYAN], [R * 0.6, 0.1, '#ffffff'], [R * 0.22, 0.2, MAGENTA]];
  const q = Math.PI / 2;
  for (const [r, t, col] of defs) {
    neon.geo(new THREE.RingGeometry(r - t / 2, r + t / 2, 72), xf(cx, room.height - 0.02, cz, q), col);
    glow.geo(new THREE.RingGeometry(r - t * 1.6, r + t * 1.6, 72), xf(cx, 0.006, cz, -q), [col, 0.22]);
  }
}

/** Weiche Lichtpfützen auf dem Boden entlang der Wände. */
function addPools(glow, room) {
  for (const wall of WALLS) {
    const info = wallInfo(room, wall);
    for (const [a, b] of spans(room, wall, 0)) {
      const p = (t, d) => { const [x, z] = info.to(t, d); return [x, 0.005, z]; };
      glow.quad(p(a, 0), p(b, 0), p(b, 1.1), p(a, 1.1), undefined,
        { n: [0, 1, 0], colors: [[CYAN, 0.42], [CYAN, 0.42], [CYAN, 0], [CYAN, 0]] });
    }
  }
}

/** Weiche Lichtscheibe auf dem Boden: in der Mitte deckend, am Rand transparent. */
function disc(glow, x, z, r, col, alpha) {
  const N = 24;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    glow.tri([x, 0.007, z], [x + Math.sin(a1) * r, 0.007, z + Math.cos(a1) * r], [x + Math.sin(a0) * r, 0.007, z + Math.cos(a0) * r], col,
      { n: [0, 1, 0], colors: [[col, alpha], [col, 0], [col, 0]] });
  }
}

function addPod(pod, glow, neon, x, z) {
  pod.geo(new THREE.CylinderGeometry(0.5, 0.46, 0.34, 28), xf(x, 0.3, z), '#f4f8fb');
  pod.geo(new THREE.CylinderGeometry(0.47, 0.47, 0.07, 28), xf(x, 0.505, z), '#bfe9f3');
  neon.geo(new THREE.TorusGeometry(0.48, 0.018, 6, 36), xf(x, 0.12, z, Math.PI / 2), CYAN);
  disc(glow, x, z, 1.0, CYAN, 0.4);
}

function addRingSculpture(pod, neon, x, z, alongX) {
  const ry = alongX ? 0 : Math.PI / 2;
  pod.box(alongX ? 0.9 : 0.35, 0.12, alongX ? 0.35 : 0.9, x, 0.06, z, NAVY);
  neon.geo(new THREE.TorusGeometry(1.1, 0.05, 10, 56), xf(x, 1.35, z, 0, ry), MAGENTA);
  neon.geo(new THREE.TorusGeometry(0.78, 0.035, 8, 48), xf(x, 1.35, z, 0, ry), CYAN);
  pod.geo(new THREE.SphereGeometry(0.2, 18, 14), xf(x, 1.35, z), '#ffffff');
}

function addDecor(group, room, m, placer, neon, glow) {
  const pod = new Batch();
  const alongX = longAxis(room) === 'x';
  const cx = (room.x0 + room.x1) / 2, cz = (room.z0 + room.z1) / 2;
  const u = (a, b) => (alongX ? [a, b] : [b, a]);
  const sw = alongX ? [0.6, 1.3] : [1.3, 0.6];
  if (placer.place(cx, cz, sw[0], sw[1], 1.0, 0.6)) addRingSculpture(pod, neon, cx, cz, alongX);
  let n = 0;
  for (const [a, b] of [[-3.6, 0], [3.6, 0], [-3.6, 2.4], [3.6, -2.4], [0, 2.6], [0, -2.6], [-3.6, -2.4], [3.6, 2.4]]) {
    const [dx, dz] = u(a, b);
    if (n < 3 && placer.place(cx + dx, cz + dz, 0.65, 0.65, 1.0, 0.5)) { addPod(pod, glow, neon, cx + dx, cz + dz); n++; }
  }
  if (!pod.empty) group.add(pod.mesh(m.pod));
}

function drawPlaque(g, W, H, titel, datum) {
  g.clearRect(0, 0, W, H);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(12,28,52,.93)'); grad.addColorStop(1, 'rgba(18,42,74,.93)');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.strokeStyle = CYAN; g.lineWidth = 3;
  g.strokeRect(6, 6, W - 12, H - 12);
  g.fillStyle = MAGENTA; g.fillRect(6, H - 10, 64, 6);
  g.textAlign = 'left'; g.textBaseline = 'middle';
  g.shadowColor = CYAN; g.shadowBlur = 12;
  g.fillStyle = '#d9fbff';
  g.fillText(fitText(g, titel, W - 64, 48, '600', SANS), 32, datum ? H * 0.38 : H / 2);
  if (datum) { g.shadowBlur = 8; g.fillStyle = '#7fe9ff'; g.font = `300 34px ${SANS}`; g.fillText(datum, 32, H * 0.74); }
}

export function build(room) {
  const m = materials();
  const group = new THREE.Group();
  group.add(...shell(room, m));
  const neon = new Batch(), glow = new Batch(), navy = new Batch();
  bandAround(navy, room, 0, 0.22, 0, 0.04);
  addNeon(neon, room);
  addPools(glow, room);
  addRings(neon, glow, room);
  const placer = new Placer(room);
  addDecor(group, room, m, placer, neon, glow);
  group.add(navy.mesh(m.navy), neon.mesh(m.neon), glow.mesh(m.glow));
  addLight(group, room, 0xe4f4ff, 14, 0.5);
  return { group, obstacles: placer.obstacles, frame, plaque };
}

/** Schwebendes Bild: nur eine dünne Leuchtkante (oben/links cyan, unten/rechts magenta) und ein weicher Lichthof. */
function frame(w, h) {
  const m = materials();
  const g = new THREE.Group();
  const e = 0.022, dp = 0.03;
  const edge = new Batch();
  edge.aabb(-w / 2 - e, h / 2, 0, w / 2 + e, h / 2 + e, dp, CYAN);
  edge.aabb(-w / 2 - e, -h / 2 - e, 0, w / 2 + e, -h / 2, dp, MAGENTA);
  edge.aabb(-w / 2 - e, -h / 2, 0, -w / 2, h / 2, dp, CYAN);
  edge.aabb(w / 2, -h / 2, 0, w / 2 + e, h / 2, dp, MAGENTA);
  const halo = new Batch();
  halo.sweep(w + 2 * e, h + 2 * e, [[0, 0.006, [CYAN, 0.5]], [0.34, 0.006, [CYAN, 0]]]);
  g.add(edge.mesh(m.neon), halo.mesh(m.glow));
  return g;
}

function plaque(titel, datum) {
  const m = materials();
  const obj = plaqueObject(0.56, 0.18, titel, datum, drawPlaque, m.text, null);
  obj.children[0].position.z = 0.03;
  return obj;
}
