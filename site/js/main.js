import * as THREE from 'three';
import { THEMES, buildTheme } from './themes/index.js';
import { buildLayout, startCandidates } from './layout.js';
import { createPictures } from './pictures.js';
import { createInput } from './input.js';
import { stepPlayer, createWalkable, EYE } from './player.js';
import { createUi, isTouchDevice } from './ui.js';

const LAZY_INTERVAL = 0.3;
const SKY = '#eef2f6';

async function loadItems() {
  try {
    const res = await fetch('erinnerungen.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data.erinnerungen || []).filter((e) => e && typeof e.bild === 'string');
  } catch (err) {
    console.warn('erinnerungen.json nicht lesbar:', err);
    return [];
  }
}

function createRenderer(canvas) {
  try {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
    renderer.setPixelRatio(dpr);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    return renderer;
  } catch (err) {
    console.warn('WebGL nicht verfügbar:', err);
    return null;
  }
}

function fovFor(aspect) {
  // Im Hochformat vertikal weiter öffnen, damit horizontal genug zu sehen ist.
  const hor = (70 * Math.PI) / 180;
  const vert = 2 * Math.atan(Math.tan(hor / 2) / Math.max(aspect, 0.01));
  return Math.min(95, Math.max(62, (vert * 180) / Math.PI));
}

function createScene(items, rooms) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 45, 130);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 160);
  camera.rotation.order = 'YXZ';
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf0eadf, 1.75), new THREE.AmbientLight(0xffffff, 0.7));
  const themes = rooms.map((room) => buildTheme(room.theme, room));
  themes.forEach((t) => scene.add(t.group));
  const pictures = createPictures(scene, rooms, themes, items);
  return { scene, camera, themes, pictures };
}

function handleResize(renderer, camera) {
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.fov = fovFor(camera.aspect);
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  addEventListener('orientationchange', resize);
  resize();
}

function runLoop({ renderer, scene, camera, pictures }, player, walk, input, state) {
  let last = performance.now();
  let lazyClock = LAZY_INTERVAL;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const active = state.entered && !state.uiOpen;
    stepPlayer(player, active ? input.move() : { x: 0, y: 0 }, active ? input.turn() : 0,
      input.takeLook(), dt, walk);
    const room = walk.roomAt(player.x, player.z);
    if (room >= 0) player.room = room; // im Türspalt bleibt der letzte Raum
    camera.position.set(player.x, EYE, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
    lazyClock += dt;
    if (lazyClock >= LAZY_INTERVAL) { lazyClock = 0; pictures.updateLazy(player.room); }
    renderer.render(scene, camera);
  });
}

/** Erster Startpunkt, der nicht in einer Sperrfläche der Deko liegt. */
function startPose(room, walk) {
  const pose = startCandidates(room).find((p) => walk.canStand(p.x, p.z)) || startCandidates(room)[0];
  return { ...pose, room: room.id };
}

async function start() {
  const touch = isTouchDevice();
  document.body.classList.toggle('touch', touch);
  const state = { entered: false, uiOpen: false };
  let input = null;
  const ui = createUi({
    onEnter: () => {
      state.entered = true;
      ui.showControlsHint(document.body.classList.contains('touch')
        ? 'Joystick: laufen\nWischen: umschauen\nBild antippen'
        : 'W A S D oder Pfeiltasten zum Laufen · Maus ziehen zum Umschauen · Bild anklicken');
    },
    onLightbox: (open) => { state.uiOpen = open; if (input) input.reset(); },
  });

  const renderer = createRenderer(document.getElementById('szene'));
  if (!renderer) { ui.showFatal(); return; }
  const items = await loadItems();
  const rooms = buildLayout(items, THEMES);
  const world = createScene(items, rooms);
  world.renderer = renderer;
  if (items.length === 0) ui.showEmptyHint();

  const walk = createWalkable(rooms, world.themes.map((t) => t.obstacles || []));
  const player = startPose(rooms[0], walk);
  const raycaster = new THREE.Raycaster();
  raycaster.far = 40;
  const targets = [...world.pictures.hitMeshes, ...world.themes.map((t) => t.group)];
  input = createInput({
    canvas: renderer.domElement,
    joyBase: document.querySelector('#joystick .basis'),
    joyKnob: document.querySelector('#joystick .knauf'),
    isActive: () => state.entered && !state.uiOpen,
    onTouchSeen: () => document.body.classList.add('touch'),
    onTap: (x, y) => {
      raycaster.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), world.camera);
      // Das nächste getroffene Objekt zählt: Wände und Deko verdecken Bilder dahinter.
      const hit = raycaster.intersectObjects(targets, true)[0];
      if (hit && hit.object.userData.index !== undefined) ui.openLightbox(items[hit.object.userData.index]);
    },
  });

  handleResize(renderer, world.camera);
  exposeTestHook({ player, camera: world.camera, items, rooms, walk, pictures: world.pictures, themes: world.themes });
  ui.setReady();
  runLoop(world, player, walk, input, state);
}

/** Schmale Schnittstelle für automatische Tests. */
function exposeTestHook({ player, camera, items, rooms, walk, pictures, themes }) {
  window.__museum = {
    ready: true,
    rooms,
    walk,
    count: items.length,
    get pos() { return { x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch, room: player.room }; },
    setPose: (p) => Object.assign(player, p),
    roomAt: (x, z) => walk.roomAt(x, z),
    // Stellt den Spieler frontal vor Bild i (nur für Tests), Abstand passend zur Bildgröße.
    faceEntry(i) {
      const s = pictures.entries[i].slot;
      const dist = Math.min(6, 1.5 * Math.max(s.w, s.h * 0.7) + 0.8);
      const n = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[s.wall];
      const yaw = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }[s.wall];
      Object.assign(player, { x: s.x + n[0] * dist, z: s.z + n[1] * dist, yaw, pitch: 0, room: pictures.entries[i].room });
    },
    pictureSize(i) {
      const p = pictures.entries[i].pic.geometry.parameters;
      return { w: p.width, h: p.height };
    },
    texturesLoaded: () => pictures.entries.filter((e) => e.state === 2).length,
    ceilingY: (room) => new THREE.Box3().setFromObject(themes[room].group).max.y,
    loadedIn: (room) => pictures.entries.filter((e) => e.room === room && e.state === 2).length,
    screenPositionOf(i) {
      const v = pictures.entries[i].pic.getWorldPosition(new THREE.Vector3()).project(camera);
      return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, visible: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 };
    },
  };
}

start();
