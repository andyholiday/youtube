import * as THREE from 'three';
import { THEMES, buildTheme } from './themes/index.js';
import { buildLayout, startPose } from './layout.js';
import { createPictures } from './pictures.js';
import { createInput } from './input.js';
import { stepPlayer, createWalkable, EYE } from './player.js';
import { createUi, isTouchDevice } from './ui.js';

const LAZY_INTERVAL = 0.3;
const FOCUS_INTERVAL = 0.2; // Blick-Fokus höchstens ~5× pro Sekunde prüfen
const FOCUS_RANGE = 6; // Bilder näher als 6 m zählen als „im Blick“
const NEAR_ROOMS = 2; // Tipp-Strahl: nur Räume bis zu so vielen Schritten im Rundgang
const PRELOAD_MS = 6000;
const SKY = '#eef2f6';
const MSG_LOAD = 'Die Erinnerungen konnten nicht geladen werden – bitte Seite neu laden.';
const MSG_START = 'Das Museum konnte nicht gestartet werden – bitte Seite neu laden.';

let ui = null;

/** erinnerungen.json laden. Netz-, HTTP- und JSON-Fehler werfen; eine leere Liste ist ein gültiges Ergebnis. */
async function loadData() {
  const res = await fetch('erinnerungen.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.erinnerungen)) throw new Error('erinnerungen.json hat kein Feld "erinnerungen"');
  return {
    items: data.erinnerungen.filter((e) => e && typeof e.bild === 'string'),
    widmung: data.widmung ?? null,
  };
}

const maxPixelRatio = () => ((navigator.hardwareConcurrency || 8) <= 4 ? 1.5 : 2);

function createRenderer(canvas) {
  try {
    const dpr = Math.min(window.devicePixelRatio || 1, maxPixelRatio());
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
    renderer.setPixelRatio(dpr);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Verlorener WebGL-Kontext (Speichermangel auf dem Handy): sauber neu starten statt schwarzer Fläche.
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); location.reload(); });
    return renderer;
  } catch (err) {
    console.warn('WebGL nicht verfügbar:', err);
    return null;
  }
}

function fovFor(aspect) {
  // Im Hochformat vertikal weiter öffnen, damit horizontal genug zu sehen ist – aber nicht über 80°.
  const hor = (70 * Math.PI) / 180;
  const vert = 2 * Math.atan(Math.tan(hor / 2) / Math.max(aspect, 0.01));
  return Math.min(80, Math.max(62, (vert * 180) / Math.PI));
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

/** Trefferflächen der Bilder (hits) und Raumgruppen mit Wänden und Deko (groups) bis radius Schritte um roomId. */
function nearRooms(world, roomId, radius) {
  const near = (r) => Math.abs(r - roomId) <= radius;
  return {
    hits: world.pictures.entries.filter((e) => near(e.room)).map((e) => e.hit),
    groups: world.themes.filter((_, r) => near(r)).map((t) => t.group),
  };
}

/**
 * Bild in der Bildschirmmitte (näher als FOCUS_RANGE, nicht verdeckt) → ui.focusChanged(index|null).
 * Ruft nur bei Änderung und höchstens alle FOCUS_INTERVAL Sekunden auf.
 */
function createFocus(world, ui) {
  const ray = new THREE.Raycaster();
  const centre = new THREE.Vector2(0, 0);
  let clock = 0;
  let current = null;
  function pick(roomId) {
    const { hits, groups } = nearRooms(world, roomId, 1);
    ray.far = FOCUS_RANGE;
    ray.setFromCamera(centre, world.camera);
    const hit = ray.intersectObjects(hits, false)[0];
    if (!hit) return null;
    ray.far = hit.distance; // Wand oder Deko davor? Dann ist das Bild verdeckt.
    const blocker = ray.intersectObjects(groups, true).find((h) => h.distance < hit.distance - 0.02);
    return blocker ? null : hit.object.userData.index;
  }
  return {
    update(dt, roomId, enabled) {
      clock += dt;
      if (clock < FOCUS_INTERVAL) return;
      clock = 0;
      const next = enabled ? pick(roomId) : null;
      if (next !== current) { current = next; ui.focusChanged(next); }
    },
  };
}

function trackInput(seen, mv, turn, look) {
  if (!seen.move && (mv.x || mv.y)) { seen.move = true; ui.markInteracted('move'); }
  if (!seen.look && (turn || look.yaw || look.pitch)) { seen.look = true; ui.markInteracted('look'); }
}

function runLoop(world, player, walk, input, state) {
  const { renderer, scene, camera, pictures, rooms } = world;
  const focus = createFocus(world, ui);
  const seen = { move: false, look: false };
  let last = performance.now();
  let lazyClock = LAZY_INTERVAL;
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const active = state.entered && !state.uiOpen;
    const mv = active ? input.move() : { x: 0, y: 0 };
    const turn = active ? input.turn() : 0;
    const look = input.takeLook();
    if (active) trackInput(seen, mv, turn, look);
    stepPlayer(player, mv, turn, look, dt, walk);
    const room = walk.roomAt(player.x, player.z);
    if (room >= 0 && room !== player.room) {
      player.room = room; // im Türspalt bleibt der letzte Raum
      if (state.entered) ui.roomEntered(rooms[room]);
    }
    camera.position.set(player.x, EYE, player.z);
    camera.rotation.set(player.pitch, player.yaw, 0);
    lazyClock += dt;
    if (lazyClock >= LAZY_INTERVAL) { lazyClock = 0; pictures.updateLazy(player.room); }
    pictures.update(dt);
    focus.update(dt, player.room, active);
    renderer.render(scene, camera);
  });
}

/** Test-Weiche: Tests dürfen das ui-Objekt vor der Benutzung durch einen Spion ersetzen. */
const hooked = (u) => (typeof window.__museumUiHook === 'function' ? window.__museumUiHook(u) : u);

function enterMuseum(state) {
  state.entered = true;
  ui.showControlsHint(document.body.classList.contains('touch')
    ? 'Daumen links unten aufsetzen und schieben zum Laufen\nRechts wischen zum Umschauen\nBild antippen'
    : 'W A S D oder Pfeiltasten zum Laufen · Maus ziehen zum Umschauen · Bild anklicken');
  if (state.rooms) ui.roomEntered(state.rooms[state.player.room]);
}

function setupInput(world, state, player) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 40;
  return createInput({
    canvas: world.renderer.domElement,
    joyEl: document.getElementById('joystick'),
    joyKnob: document.querySelector('#joystick .knauf'),
    isActive: () => state.entered && !state.uiOpen,
    onTouchSeen: () => document.body.classList.add('touch'),
    onTap: (x, y) => {
      raycaster.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), world.camera);
      // Das nächste getroffene Objekt zählt: Wände und Deko verdecken Bilder dahinter.
      const { hits, groups } = nearRooms(world, player.room, NEAR_ROOMS);
      const hit = raycaster.intersectObjects([...hits, ...groups], true)[0];
      if (hit && hit.object.userData.index !== undefined) ui.openLightbox(hit.object.userData.index);
    },
  });
}

async function start() {
  document.body.classList.toggle('touch', isTouchDevice());
  const state = { entered: false, uiOpen: false, rooms: null, player: null };
  let input = null;
  ui = hooked(createUi({
    onEnter: () => enterMuseum(state),
    onLightbox: (open) => { state.uiOpen = open; if (input) input.reset(); },
  }));
  ui.setLoading('Bilder werden aufgehängt …');

  const renderer = createRenderer(document.getElementById('szene'));
  if (!renderer) { ui.showFatal(); return; }
  let data;
  try { data = await loadData(); } catch (err) {
    console.warn('erinnerungen.json nicht lesbar:', err);
    ui.showFatal(MSG_LOAD);
    return;
  }
  const { items, widmung } = data;
  ui.setItems(items);
  ui.setWidmung(widmung);
  const rooms = buildLayout(items, THEMES);
  const world = createScene(items, rooms);
  world.renderer = renderer;
  world.rooms = rooms;
  if (items.length === 0) ui.showEmptyHint();

  const walk = createWalkable(rooms, world.themes.map((t) => t.obstacles || []));
  const player = { ...startPose(rooms[0], walk.canStand, EYE), room: 0 };
  Object.assign(state, { rooms, player });
  input = setupInput(world, state, player);
  handleResize(renderer, world.camera);
  exposeTestHook({ player, world, items, rooms, walk });
  await world.pictures.preload(0, PRELOAD_MS);
  ui.setReady();
  runLoop(world, player, walk, input, state);
}

/** Schmale Schnittstelle für automatische Tests. */
function exposeTestHook({ player, world, items, rooms, walk }) {
  const { pictures, themes, camera, renderer } = world;
  window.__museum = {
    ready: true,
    rooms,
    walk,
    count: items.length,
    get pos() { return { x: player.x, z: player.z, yaw: player.yaw, pitch: player.pitch, room: player.room }; },
    setPose: (p) => Object.assign(player, p, { idle: 0 }),
    roomAt: (x, z) => walk.roomAt(x, z),
    // Stellt den Spieler frontal vor Bild i (nur für Tests), Abstand passend zur Bildgröße.
    faceEntry(i) {
      const s = pictures.entries[i].slot;
      const dist = Math.min(FOCUS_RANGE - 1, 1.5 * Math.max(s.w, s.h * 0.7) + 0.8); // innerhalb der Fokus-Reichweite
      const n = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[s.wall];
      const yaw = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }[s.wall];
      Object.assign(player, { x: s.x + n[0] * dist, z: s.z + n[1] * dist, yaw, pitch: 0, idle: 0, room: pictures.entries[i].room });
    },
    pictureSize(i) {
      const p = pictures.entries[i].pic.geometry.parameters;
      return { w: p.width, h: p.height };
    },
    pictureFade: (i) => { const e = pictures.entries[i]; return { visible: e.pic.visible, opacity: e.pic.material.opacity, loaded: e.state === 2 }; },
    texturesLoaded: () => pictures.entries.filter((e) => e.state === 2).length,
    gpuTextures: () => renderer.info.memory.textures,
    roomVisible: (r) => pictures.roomShown(r) && pictures.entries.filter((e) => e.room === r).every((e) => e.group.visible),
    themeGroup: (r) => themes[r].group, // Tests hängen hier Blocker auf
    pixelRatio: () => renderer.getPixelRatio(),
    fov: () => camera.fov,
    ceilingY: (room) => new THREE.Box3().setFromObject(themes[room].group).max.y,
    loadedIn: (room) => pictures.entries.filter((e) => e.room === room && e.state === 2).length,
    screenPositionOf(i) {
      const v = pictures.entries[i].pic.getWorldPosition(new THREE.Vector3()).project(camera);
      return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight, visible: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1 };
    },
  };
}

start().catch((err) => {
  console.error(err);
  try { ui.showFatal(MSG_START); } catch (e) { const el = document.getElementById('fehler'); if (el) el.hidden = false; }
});
