// Mini-ctx nach .planning/SPEC-FEATURES.md, damit die Easter Eggs ohne main.js (Paket H) testbar sind.
// Layout, Themen, Kollision sind echt; Frames laufen deterministisch über __h.advance().
// URL-Parameter: n = Zahl der Erinnerungen (Standard 9), raum=0 → geheim.raum leer, geheim=none → ganz ohne geheim-Block.
import * as THREE from 'three';
import { THEMES, buildTheme } from '/site/js/themes/index.js';
import { buildLayout, startPose } from '/site/js/layout.js';
import { stepPlayer, createWalkable, EYE } from '/site/js/player.js';
import { install } from '/site/js/features/eggs.js';

const DT = 1 / 60;
const query = new URLSearchParams(location.search);
const PALETTES = [['#f2a65a', '#e8505b', '#3d405b'], ['#a8dadc', '#457b9d', '#1d3557'], ['#f4d35e', '#ee964b', '#0d3b66'], ['#cdb4db', '#ffafcc', '#a2d2ff']];

/** Bunter Verlauf als data:-URL; die Fixture-Pfade ersetzt das Harness, damit keine Bilddateien nötig sind. */
function artUrl(i, w, h) {
  const c = document.createElement('canvas');
  c.width = 640; c.height = Math.round(640 * h / w);
  const g = c.getContext('2d');
  const p = PALETTES[i % PALETTES.length];
  const grad = g.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, p[0]); grad.addColorStop(0.6, p[1]); grad.addColorStop(1, p[2]);
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(c.width * 0.65, c.height * 0.35, c.height * 0.2, 0, 7); g.fill();
  return c.toDataURL('image/png');
}

async function loadFixture() {
  const data = await (await fetch('./fixture.json')).json();
  const n = Number(query.get('n') || 9);
  data.erinnerungen = data.erinnerungen.slice(0, n).map((e, i) => ({ ...e, bild: artUrl(i, e.breite, e.hoehe) }));
  data.geheim.raum = data.geheim.raum.map((e, i) => ({ ...e, bild: artUrl(i + 5, e.breite, e.hoehe) }));
  if (query.get('raum') === '0') data.geheim.raum = [];
  if (query.get('geheim') === 'none') delete data.geheim;
  return data;
}

const fovFor = (aspect) => {
  const hor = (70 * Math.PI) / 180;
  const vert = 2 * Math.atan(Math.tan(hor / 2) / Math.max(aspect, 0.01));
  return Math.min(80, Math.max(62, (vert * 180) / Math.PI));
};

const pictureHits = [];
function addPictures(scene, room, theme, items) {
  room.slots.forEach((s) => {
    const holder = new THREE.Group();
    holder.position.set(s.x, s.y, s.z);
    holder.rotation.y = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }[s.wall];
    const tex = new THREE.TextureLoader().load(items[s.index].bild);
    tex.colorSpace = THREE.SRGBColorSpace;
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    pic.position.z = 0.012;
    const hit = new THREE.Mesh(new THREE.PlaneGeometry(s.w + 0.3, s.h + 0.3), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
    hit.position.z = 0.032;
    hit.userData.index = s.index;
    holder.add(theme.frame(s.w, s.h), pic, hit);
    scene.add(holder);
    pictureHits.push(hit);
  });
}

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#eef2f6');
scene.fog = new THREE.Fog('#eef2f6', 45, 130);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 160);
camera.rotation.order = 'YXZ';
camera.fov = fovFor(camera.aspect);
camera.updateProjectionMatrix();
scene.add(new THREE.HemisphereLight(0xffffff, 0xf0eadf, 1.75), new THREE.AmbientLight(0xffffff, 0.7));

const data = await loadFixture();
const items = data.erinnerungen;
const rooms = buildLayout(items, THEMES);
const themes = rooms.map((r) => buildTheme(r.theme, r));
themes.forEach((t, i) => { scene.add(t.group); addPictures(scene, rooms[i], t, items); });
const walk = createWalkable(rooms, themes.map((t) => t.obstacles || []));
const player = { ...startPose(rooms[0], walk.canStand, EYE), room: 0 };

const frameFns = [], roomFns = [], pictureLong = [], objects = new Map();
const groups = themes.map((t) => t.group);
const ray = new THREE.Raycaster();
ray.camera = camera;
const toasts = [];
const styles = [];

function wallDistance(from, to) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  ray.set(from, dir.normalize()); ray.near = 0; ray.far = len;
  const hit = ray.intersectObjects(groups, true).find((h) => h.object.visible !== false && h.object.layers.test(ray.layers));
  return hit ? hit.distance : null;
}

const overlayRoot = document.createElement('div');
overlayRoot.id = 'overlay-root';
document.body.append(overlayRoot);
let paused = false;
const pauseLog = [];

const ctx = {
  THREE, scene, camera, renderer, data, items, rooms, player,
  collide: (x, z, r = 0) => !walk.canStand(x, z) || (r > 0 && ![[r, 0], [-r, 0], [0, r], [0, -r]].every(([dx, dz]) => walk.canStand(x + dx * 0.5, z + dz * 0.5))),
  wallDistance,
  onFrame: (fn) => frameFns.push(fn),
  onPictureTap() {}, onStartHeartTap() {}, onLightboxOpen() {},
  onPictureLongPress: (fn) => pictureLong.push(fn),
  onObjectTap: (obj, fn) => objects.set(obj, [...(objects.get(obj) || []), fn]),
  onRoomEnter: (fn) => roomFns.push(fn),
  setInputPaused: (p) => { paused = !!p; pauseLog.push(paused); },
  ui: {
    overlayRoot, hud: document.getElementById('hud'),
    addStyle(href) {
      styles.push(href);
      const link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = `/site/${href}`;
      document.head.appendChild(link);
    },
    toast(text, ms = 2500) {
      toasts.push(text);
      const p = document.createElement('p');
      p.className = 'x-toast'; p.textContent = text;
      overlayRoot.append(p);
      setTimeout(() => p.remove(), ms);
    },
  },
};

function render() {
  camera.position.set(player.x, EYE, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  renderer.render(scene, camera);
}

function frame(move = { x: 0, y: 0 }, turn = 0) {
  stepPlayer(player, move, turn, { yaw: 0, pitch: 0, held: false }, DT, walk);
  const room = walk.roomAt(player.x, player.z);
  if (room >= 0 && room !== player.room) { player.room = room; roomFns.forEach((fn) => fn(rooms[room])); }
  camera.position.set(player.x, EYE, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  frameFns.forEach((fn) => fn(DT));
}

/** Antippen wie in context.js: nächster Treffer unter Bildern, registrierten Objekten und Wänden. */
function tapAt(x, y) {
  render();
  ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
  ray.far = 40; ray.near = 0;
  const pics = pictureHits;
  const seen = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
  for (const h of ray.intersectObjects([...pics, ...groups, ...objects.keys()], true)) {
    let reg = null;
    for (let o = h.object; o; o = o.parent) if (objects.has(o)) { reg = o; break; }
    if (reg) { if (seen(h.object)) { objects.get(reg).forEach((fn) => fn(reg, h)); return { kind: 'object' }; } continue; }
    if (h.object.userData.index !== undefined) return { kind: 'picture', index: h.object.userData.index };
    return { kind: 'wall' };
  }
  return { kind: 'none' };
}

const project = (v) => {
  const p = v.clone().project(camera);
  return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight, visible: p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1 };
};

const worldPos = (obj) => obj.getWorldPosition(new THREE.Vector3());

/** Stellt den Spieler dist Meter vor einen Punkt (senkrecht zur Wand wall) und blickt darauf. */
function faceWorld(point, wall, dist, pitchTo = true) {
  const n = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[wall];
  player.x = point.x + n[0] * dist; player.z = point.z + n[1] * dist;
  player.yaw = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }[wall];
  player.pitch = pitchTo ? Math.atan2(point.y - EYE, dist) : 0;
  const r = walk.roomAt(player.x, player.z);
  if (r >= 0) player.room = r;
  frameFns.forEach((fn) => fn(DT));
  render();
}

install(ctx);
render();

window.__h = {
  ready: true,
  rooms, items, styles, toasts,
  get paused() { return paused; },
  pauseLog: () => pauseLog.slice(),
  pos: () => ({ x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch, room: player.room }),
  setPose(p) {
    Object.assign(player, p);
    const r = walk.roomAt(player.x, player.z);
    if (r >= 0 && p.room === undefined) player.room = r;
    frameFns.forEach((fn) => fn(DT)); // Sichtbarkeit je Raum nachziehen
    render();
  },
  /** Betritt das Museum: Klasse wie im echten UI, danach meldet der Kern den Startraum. */
  enter() { document.body.classList.add('im-saal'); roomFns.forEach((fn) => fn(rooms[player.room])); },
  advance(sec, move, turn, shot = true) {
    for (let i = 0; i < Math.round(sec / DT); i++) frame(move, turn || 0);
    if (shot) render();
  },
  render,
  faceWorld,
  tapAt, project: (v) => project(new THREE.Vector3(...v)),
  longPress: (i) => pictureLong.forEach((fn) => fn(i)),
  registered: () => [...objects.keys()].map((o) => ({ geo: o.geometry && o.geometry.type, pos: worldPos(o).toArray() })),
  /** Zeigt auf ein registriertes Objekt (Index in registered()) und gibt dessen Bildschirmposition zurück. */
  pointAtRegistered(k, dist = 1.4) {
    const obj = [...objects.keys()][k];
    const pos = worldPos(obj);
    const wall = nearestWall(pos);
    faceWorld(pos, wall, dist);
    return project(pos);
  },
  nearestWall: (p) => nearestWall(new THREE.Vector3(...p)),
  hitFirst(from, to) {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const dir = b.clone().sub(a); const len = dir.length();
    ray.set(a, dir.normalize()); ray.near = 0; ray.far = len;
    const hit = ray.intersectObjects(groups, true)[0];
    return hit ? { distance: hit.distance, panel: !!hit.object.userData.secretPanel, opacity: hit.object.material && hit.object.material.opacity } : null;
  },
  panel() {
    let p = null;
    scene.traverse((o) => { if (o.userData && o.userData.secretPanel) p = o; });
    return p ? { opacity: p.material.opacity, visible: p.visible, layer0: p.layers.test(ray.layers) } : null;
  },
  collide: (x, z, r) => ctx.collide(x, z, r),
  /** Blick auf die Geheimtür von innen im Gastgeberraum: localX = seitlicher Zielpunkt (negativ = links der Tür). */
  viewHostDoor(localX = -0.8, dist = 3.2, yawOff = 0) {
    const secret = rooms.find((r) => r.secret);
    const host = rooms[secret.doors[0].to];
    const d = host.doors.find((q) => q.secret);
    const dir = { n: [1, 0], s: [-1, 0], w: [0, -1], e: [0, 1] }[d.wall];
    const base = { n: [d.center, host.z0], s: [d.center, host.z1], w: [host.x0, d.center], e: [host.x1, d.center] }[d.wall];
    const point = new THREE.Vector3(base[0] + dir[0] * localX, 1.3, base[1] + dir[1] * localX);
    faceWorld(point, d.wall, dist);
    player.yaw += yawOff;
    frameFns.forEach((fn) => fn(DT));
    render();
    return { wall: d.wall, center: d.center, host: host.id, secret: secret.id, door: d };
  },
  /** Blick von innen im geheimen Raum auf dessen Tür. */
  viewSecretDoor(dist = 3, localX = 0) {
    const secret = rooms.find((r) => r.secret);
    const d = secret.doors[0];
    const base = { n: [d.center, secret.z0], s: [d.center, secret.z1], w: [secret.x0, d.center], e: [secret.x1, d.center] }[d.wall];
    faceWorld(new THREE.Vector3(base[0], 1.7, base[1]), d.wall, dist, false);
    return { wall: d.wall, center: d.center };
  },
  /** Im geheimen Raum: von der Türwand innen in den Raum (Blick auf die Gegenwand). */
  viewSecretFar(lateral = 0, pitch = 0.02) {
    const s = rooms.find((r) => r.secret);
    const dw = s.doors[0].wall;
    const m = { n: [(s.x0 + s.x1) / 2 + lateral, s.z0 + 0.6, Math.PI], s: [(s.x0 + s.x1) / 2 + lateral, s.z1 - 0.6, 0], w: [s.x0 + 0.6, (s.z0 + s.z1) / 2 + lateral, -Math.PI / 2], e: [s.x1 - 0.6, (s.z0 + s.z1) / 2 + lateral, Math.PI / 2] }[dw];
    Object.assign(player, { x: m[0], z: m[1], yaw: m[2], pitch, room: s.id });
    frameFns.forEach((fn) => fn(DT));
    render();
  },
  /** Im geheimen Raum: aus der Ecke an der Gegenwand schräg über den Raum zur Tür-Ecke. */
  viewSecretCorner() {
    const s = rooms.find((r) => r.secret);
    const dw = s.doors[0].wall;
    const from = { n: [s.x0 + 0.7, s.z1 - 0.7], s: [s.x0 + 0.7, s.z0 + 0.7], w: [s.x1 - 0.7, s.z0 + 0.7], e: [s.x0 + 0.7, s.z0 + 0.7] }[dw];
    const to = { n: [s.x1 - 0.55, s.z0 + 0.55], s: [s.x1 - 0.55, s.z1 - 0.55], w: [s.x0 + 0.55, s.z1 - 0.55], e: [s.x1 - 0.55, s.z1 - 0.55] }[dw];
    Object.assign(player, { x: from[0], z: from[1], yaw: Math.atan2(-(to[0] - from[0]), -(to[1] - from[1])), pitch: -0.12, room: s.id });
    frameFns.forEach((fn) => fn(DT));
    render();
  },
  facePicture(i, dist = 2.2) {
    const s = rooms.flatMap((r) => r.slots).find((q) => q.index === i);
    faceWorld(new THREE.Vector3(s.x, s.y, s.z), s.wall, dist);
    return project(new THREE.Vector3(s.x, s.y, s.z));
  },
  alphaPixels() {
    const cv = document.querySelector('.eggs-regen-cv');
    if (!cv) return -1;
    const data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 20) n++;
    return n;
  },
  scene: () => {
    const meshes = [];
    scene.traverse((o) => { if (o.isMesh || o.isSprite || o.isInstancedMesh) meshes.push({ type: o.type, geo: o.geometry && o.geometry.type, params: o.geometry && o.geometry.parameters, pos: worldPos(o).toArray(), visible: o.visible }); });
    return meshes;
  },
  heartBox() {
    const [k] = [...objects.keys()].map((o, i) => [i, o]).filter(([, o]) => o.geometry && o.geometry.type === 'SphereGeometry').map(([i]) => [i]);
    const hit = [...objects.keys()][k];
    const heart = hit.parent.children.filter((c) => c.geometry && c.geometry.type === 'ExtrudeGeometry').pop(); // das Porzellanherz (die Emaille-Platte dahinter kommt früher)
    const box = new THREE.Box3().setFromObject(heart);
    const glow = hit.parent.children.find((c) => c.isSprite);
    return { size: box.getSize(new THREE.Vector3()).toArray(), y: box.min.y, glow: glow.material.opacity };
  },
};

function nearestWall(pos) {
  const r = rooms.find((room) => pos.x >= room.x0 - 0.1 && pos.x <= room.x1 + 0.1 && pos.z >= room.z0 - 0.1 && pos.z <= room.z1 + 0.1);
  const d = { n: pos.z - r.z0, s: r.z1 - pos.z, w: pos.x - r.x0, e: r.x1 - pos.x };
  return Object.keys(d).sort((a, b) => d[a] - d[b])[0];
}
