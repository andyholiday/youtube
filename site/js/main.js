import * as THREE from 'three';
import { EYE, hallLength, startPose } from './layout.js';
import { buildHall, addLights } from './hall.js';
import { createPictures } from './pictures.js';
import { createInput } from './input.js';
import { stepPlayer } from './player.js';
import { createUi, isTouchDevice } from './ui.js';

const LAZY_INTERVAL = 0.3;

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

function createScene(items, length) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1c110c');
  scene.fog = new THREE.Fog('#1c110c', 8, 34);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 60);
  camera.rotation.order = 'YXZ';
  addLights(scene, camera);
  const { heart, glow } = buildHall(scene, length, items.length);
  const pictures = createPictures(scene, items, length, glow);
  return { scene, camera, heart, pictures };
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

function runLoop({ renderer, scene, camera, heart, pictures }, player, input, state, length) {
  let last = performance.now();
  let lazyClock = LAZY_INTERVAL;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const active = state.entered && !state.uiOpen;
    stepPlayer(player, active ? input.move() : { x: 0, y: 0 }, active ? input.turn() : 0,
      input.takeLook(), dt, length);
    camera.position.set(player.x, EYE, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
    heart.scale.setScalar(0.62 * (1 + 0.04 * Math.sin(now / 450)));
    lazyClock += dt;
    if (lazyClock >= LAZY_INTERVAL) { lazyClock = 0; pictures.updateLazy(player.z); }
    renderer.render(scene, camera);
  });
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
  const length = hallLength(items.length);
  const world = createScene(items, length);
  world.renderer = renderer;
  if (items.length === 0) ui.showEmptyHint();

  const player = startPose(length);
  const raycaster = new THREE.Raycaster();
  input = createInput({
    canvas: renderer.domElement,
    joyBase: document.querySelector('#joystick .basis'),
    joyKnob: document.querySelector('#joystick .knauf'),
    isActive: () => state.entered && !state.uiOpen,
    onTouchSeen: () => document.body.classList.add('touch'),
    onTap: (x, y) => {
      raycaster.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), world.camera);
      const hit = raycaster.intersectObjects(world.pictures.hitMeshes, false)[0];
      if (hit) ui.openLightbox(items[hit.object.userData.index]);
    },
  });

  handleResize(renderer, world.camera);
  exposeTestHook({ player, camera: world.camera, items, length, pictures: world.pictures });
  ui.setReady();
  runLoop(world, player, input, state, length);
}

/** Schmale Schnittstelle für automatische Tests. */
function exposeTestHook({ player, camera, items, length, pictures }) {
  window.__museum = {
    ready: true,
    length,
    count: items.length,
    get pos() { return { x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch }; },
    setPose: (p) => Object.assign(player, p),
    // Stellt den Spieler frontal vor Bild i (nur für Tests).
    faceEntry(i) {
      const e = pictures.entries[i];
      Object.assign(player, { x: 0, z: e.z, yaw: e.group.position.x < 0 ? Math.PI / 2 : -Math.PI / 2, pitch: 0 });
    },
    pictureSize(i) {
      const p = pictures.entries[i].pic.geometry.parameters;
      return { w: p.width, h: p.height };
    },
    texturesLoaded: () => pictures.entries.filter((e) => e.state === 2).length,
    screenPositionOf(i) {
      const v = pictures.entries[i].pic.getWorldPosition(new THREE.Vector3()).project(camera);
      return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, visible: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 };
    },
  };
}

start();
