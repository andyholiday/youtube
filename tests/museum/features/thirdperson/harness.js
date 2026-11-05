// Mini-ctx nach .planning/SPEC-FEATURES.md, damit die Paar-Ansicht ohne main.js testbar ist.
// Frames laufen deterministisch über __h.advance(), nicht über requestAnimationFrame.
import * as THREE from 'three';
import { THEMES, buildTheme } from '/site/js/themes/index.js';
import { buildLayout, startPose } from '/site/js/layout.js';
import { stepPlayer, createWalkable, EYE } from '/site/js/player.js';
import { install } from '/site/js/features/thirdperson.js';

const DT = 1 / 60;
const ITEMS = Array.from({ length: 9 }, (_, i) => ({ bild: `b${i}.jpg`, breite: i % 2 ? 3 : 4, hoehe: i % 3 === 0 ? 4 : 3 }));
const PALETTES = [['#f2a65a', '#e8505b', '#3d405b'], ['#a8dadc', '#457b9d', '#1d3557'], ['#f4d35e', '#ee964b', '#0d3b66'], ['#cdb4db', '#ffafcc', '#a2d2ff']];

function art(i) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const p = PALETTES[i % PALETTES.length];
  const grad = g.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, p[0]); grad.addColorStop(0.6, p[1]); grad.addColorStop(1, p[2]);
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function addPictures(scene, room, theme) {
  room.slots.forEach((s) => {
    const holder = new THREE.Group();
    holder.position.set(s.x, s.y, s.z);
    holder.rotation.y = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }[s.wall];
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshBasicMaterial({ map: art(s.index) }));
    pic.position.z = 0.003;
    holder.add(pic, theme.frame(s.w, s.h));
    scene.add(holder);
  });
}

function fovFor(aspect) {
  const hor = (70 * Math.PI) / 180;
  const vert = 2 * Math.atan(Math.tan(hor / 2) / Math.max(aspect, 0.01));
  return Math.min(80, Math.max(62, (vert * 180) / Math.PI));
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

const rooms = buildLayout(ITEMS, THEMES);
const themes = rooms.map((r) => buildTheme(r.theme, r));
themes.forEach((t, i) => { scene.add(t.group); addPictures(scene, rooms[i], t); });
const walk = createWalkable(rooms, themes.map((t) => t.obstacles || []));
const player = { ...startPose(rooms[0], walk.canStand, EYE), room: 0 };

const frameFns = [];
const ray = new THREE.Raycaster();
ray.camera = camera; // Sprites in Themen brauchen die Kamera zum Raycasten
const groups = themes.map((t) => t.group);
const wallDistance = (from, to) => {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  ray.set(from, dir.normalize());
  ray.near = 0;
  ray.far = len;
  const hit = ray.intersectObjects(groups, true)[0];
  return hit ? hit.distance : null;
};
const styles = [];
const ctx = {
  THREE, scene, camera, renderer, data: { erinnerungen: ITEMS }, items: ITEMS, rooms, player,
  collide: (x, z) => !walk.canStand(x, z),
  wallDistance,
  onFrame: (fn) => frameFns.push(fn),
  onPictureTap() {}, onPictureLongPress() {}, onObjectTap() {}, onStartHeartTap() {}, onRoomEnter() {}, onLightboxOpen() {},
  setInputPaused() {},
  ui: {
    overlayRoot: document.body,
    hud: document.getElementById('hud'),
    addStyle(href) {
      styles.push(href);
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `/site/${href}`;
      document.head.appendChild(link);
    },
    toast() {},
  },
};

const log = { bad: [], cam: [] };
const inRect = (x, z, r, m) => x >= r.x0 + m && x <= r.x1 - m && z >= r.z0 + m && z <= r.z1 - m;
const GAP = 0.3;
const NEAR_PLANE = 0.1; // Kamera mindestens so weit von jeder Wand: sie sieht nie in die Wand hinein

/** Liegt (x, z) in einem Raum oder einem Türdurchgang, jeweils mit Randabstand m? */
function insideMuseum(x, z, m) {
  if (rooms.some((r) => inRect(x, z, r, m))) return true;
  return rooms.some((r) => r.doors.some((d) => {
    const lo = d.center - d.width / 2 + m;
    const hi = d.center + d.width / 2 - m;
    if (d.wall === 'e') return x >= r.x1 - m && x <= r.x1 + GAP + m && z >= lo && z <= hi;
    if (d.wall === 'w') return x <= r.x0 + m && x >= r.x0 - GAP - m && z >= lo && z <= hi;
    if (d.wall === 's') return z >= r.z1 - m && z <= r.z1 + GAP + m && x >= lo && x <= hi;
    return z <= r.z0 + m && z >= r.z0 - GAP - m && x >= lo && x <= hi;
  }));
}

function checkCamera() {
  const p = camera.position;
  const pivot = new THREE.Vector3(player.x, 1.5, player.z);
  const reasons = [];
  if (!insideMuseum(p.x, p.z, NEAR_PLANE)) reasons.push('ausserhalb');
  if (wallDistance(pivot, p) !== null) reasons.push('wand-strahl');
  if (p.y < 0.2 || p.y > 3.5) reasons.push('hoehe');
  if (reasons.length) log.bad.push({ f: log.cam.length, reasons, cam: p.toArray(), player: [player.x, player.z] });
}

function frame(move, turn) {
  stepPlayer(player, move, turn, { yaw: 0, pitch: 0, held: false }, DT, walk);
  const room = walk.roomAt(player.x, player.z);
  if (room >= 0) player.room = room;
  camera.position.set(player.x, EYE, player.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
  frameFns.forEach((fn) => fn(DT));
  checkCamera();
  log.cam.push(camera.position.toArray());
}

const tp = install(ctx);

window.__h = {
  ready: true, styles, rooms, player, camera, scene, tp,
  advance(sec, move = { x: 0, y: 0 }, turn = 0, render = true) {
    const n = Math.round(sec / DT);
    for (let i = 0; i < n; i++) frame(move, turn);
    if (render) renderer.render(scene, camera);
  },
  setPose(p) { Object.assign(player, p, { idle: 0 }); },
  resetLog() { log.bad = []; log.cam = []; },
  log: () => ({ bad: log.bad, cam: log.cam }),
  state() {
    const g = tp.figures.group;
    return {
      cam: camera.position.toArray(), player: [player.x, player.z, player.yaw],
      figuresVisible: g.visible, pose: tp.figures.pose(), triangles: tp.figures.triangles(),
      opacity: tp.figures.parts.a.legs[0].children[0].material.opacity,
      ndc: g.position.clone().setY(1).project(camera).toArray(),
      view: tp.view,
    };
  },
  startPose: { ...player },
};
