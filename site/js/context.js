// Feature-Schnittstelle `ctx` (Schnittstelle: .planning/SPEC-FEATURES.md, Doku: features/context.md).
// Baut ctx aus dem Museum, verteilt Tipper/Frames/Raumwechsel an die Feature-Module und lädt diese.
import { GAP } from './layout.js';

const FEATURES = ['./features/thirdperson.js', './features/eggs.js', './features/admin/index.js'];
const LOAD_TIMEOUT_MS = 8000;
const WALL_PAD = 0.5; // Räume, die die Strecke um weniger als das verfehlt, zählen für wallDistance mit

/** Ruft fn(...args); wirft ein Modul, wird das gemeldet und das Museum läuft weiter. */
function safe(label, fn, ...args) {
  try { return fn(...args); } catch (err) { console.warn(`${label} fehlgeschlagen:`, err); return undefined; }
}

const inside = (a, x, z) => x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1;

/** Türdurchgang für einen Kreis mit Radius r (gleiche Geometrie wie player.js, aber mit freiem Radius). */
function passage(room, d, r) {
  const a = d.center - d.width / 2 + r;
  const b = d.center + d.width / 2 - r;
  switch (d.wall) {
    case 'e': return { x0: room.x1 - r, x1: room.x1 + GAP + r, z0: a, z1: b };
    case 'w': return { x0: room.x0 - GAP - r, x1: room.x0 + r, z0: a, z1: b };
    case 's': return { x0: a, x1: b, z0: room.z1 - r, z1: room.z1 + GAP + r };
    default: return { x0: a, x1: b, z0: room.z0 - GAP - r, z1: room.z0 + r };
  }
}

/** collide(x, z, r): schneidet der Kreis eine Wand, eine Türlaibung oder ein Hindernis? Berührung zählt nicht. */
function createCollide(rooms, themes) {
  return (x, z, r = 0) => {
    const free = rooms.some((room) => inside({ x0: room.x0 + r, z0: room.z0 + r, x1: room.x1 - r, z1: room.z1 - r }, x, z)
      || room.doors.some((d) => inside(passage(room, d, r), x, z)));
    if (!free) return true;
    return themes.some((t) => (t.obstacles || []).some((o) => x > o.x0 - r && x < o.x1 + r && z > o.z0 - r && z < o.z1 + r));
  };
}

const ancestors = (obj, test) => { for (let o = obj; o; o = o.parent) if (test(o)) return o; return null; };
const isNoPick = (obj) => !!ancestors(obj, (o) => o.userData && o.userData.noPick);
const isShown = (obj) => !ancestors(obj, (o) => o.visible === false);

/** wallDistance(from, to): Abstand bis zur ersten Wand/Deko der Räume entlang der Strecke, sonst null. */
function createWallDistance(THREE, camera, rooms, themes) {
  const ray = new THREE.Raycaster();
  ray.camera = camera;
  return (from, to) => {
    const a = new THREE.Vector3().copy(from);
    const dir = new THREE.Vector3().copy(to).sub(a);
    const len = dir.length();
    if (len < 1e-6) return null;
    ray.set(a, dir.divideScalar(len));
    ray.near = 0;
    ray.far = len;
    const lo = { x: Math.min(a.x, to.x) - WALL_PAD, z: Math.min(a.z, to.z) - WALL_PAD };
    const hi = { x: Math.max(a.x, to.x) + WALL_PAD, z: Math.max(a.z, to.z) + WALL_PAD };
    const groups = themes.filter((_, i) => {
      const r = rooms[i];
      return r && r.x1 + GAP >= lo.x && r.x0 - GAP <= hi.x && r.z1 + GAP >= lo.z && r.z0 - GAP <= hi.z;
    }).map((t) => t.group);
    const hit = ray.intersectObjects(groups, true).find((h) => !isNoPick(h.object));
    return hit ? hit.distance : null;
  };
}

/** Findet das Ziel eines Tipps: ein Bild ({index}), ein registriertes Objekt ({object, hit}) oder nichts. */
function createPicker({ THREE, camera, near, getRoom, objects }) {
  const ray = new THREE.Raycaster();
  ray.far = 40;
  const registered = (obj) => { const r = ancestors(obj, (o) => objects.has(o)); return r || null; };
  return (x, y) => {
    ray.setFromCamera(new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), camera);
    const { hits, groups } = near(getRoom());
    // Das nächste getroffene Objekt zählt: Wände und Deko verdecken Bilder dahinter.
    for (const h of ray.intersectObjects([...hits, ...groups, ...objects.keys()], true)) {
      const obj = registered(h.object);
      if (obj) { if (isShown(h.object)) return { object: obj, hit: h }; continue; }
      if (isNoPick(h.object)) continue;
      return h.object.userData.index !== undefined ? { index: h.object.userData.index } : null;
    }
    return null;
  };
}

/** Handler-Listen; jeder Aufruf ist abgesichert, ein Frame-Handler, der wirft, wird abgeschaltet. */
function createHooks() {
  const lists = { frame: [], pictureTap: [], pictureLong: [], roomEnter: [], viewer: [] };
  const objects = new Map(); // Object3D → [fn]
  const add = (name) => (fn) => { lists[name].push(fn); };
  return {
    objects,
    add: { frame: add('frame'), pictureTap: add('pictureTap'), pictureLong: add('pictureLong'), roomEnter: add('roomEnter'), viewer: add('viewer') },
    onObjectTap(obj, fn) { objects.set(obj, [...(objects.get(obj) || []), fn]); },
    frame(dt) {
      lists.frame = lists.frame.filter((fn) => {
        try { fn(dt); return true; } catch (err) { console.warn('onFrame fehlgeschlagen, Handler abgeschaltet:', err); return false; }
      });
    },
    roomEnter: (room) => lists.roomEnter.forEach((fn) => safe('onRoomEnter', fn, room)),
    /** true, wenn ein Handler das Antippen behandelt hat. */
    pictureTap: (i) => lists.pictureTap.reduce((done, fn) => safe('onPictureTap', fn, i) === true || done, false),
    pictureLong: (i) => lists.pictureLong.forEach((fn) => safe('onPictureLongPress', fn, i)),
    viewerOpened: (item, actionsEl) => lists.viewer.forEach((fn) => safe('onViewerOpen', fn, item, actionsEl)),
  };
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label}: Zeitüberschreitung`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Jedes Modul bekommt eine eigene Sicht auf ctx: seine Pause (setInputPaused) zählt getrennt. Die Steuerung ruht,
 * solange irgendein Modul pausiert; so hebt z. B. ein geschlossener Verwaltungsdialog nicht die Pause der Großansicht auf.
 */
function moduleContext(ctx, holders, apply) {
  const own = Object.create(ctx);
  const key = {};
  own.setInputPaused = (paused) => { if (paused) holders.add(key); else holders.delete(key); apply(holders.size > 0); };
  return own;
}

/** Lädt die Feature-Module nacheinander; fehlt eines oder wirft install, bleibt es bei einer Warnung. */
async function loadFeatures(ctx, holders, apply) {
  for (const spec of FEATURES) {
    try {
      const own = moduleContext(ctx, holders, apply);
      await withTimeout((async () => { const mod = await import(spec); await mod.install(own); })(), LOAD_TIMEOUT_MS, spec);
    } catch (err) {
      console.warn(`Feature ${spec} nicht geladen:`, err);
    }
  }
}

/**
 * deps: THREE, world (scene, camera, renderer, themes), data, items, rooms, player, ui (echtes ui-Objekt),
 * state ({ paused }), openLightbox(i), resetInput(), near(roomId) → { hits, groups }.
 * Liefert ctx sowie die Einstiegspunkte für main.js: tap, longPress, frame, roomEntered, loadFeatures.
 */
export function createContext(deps) {
  const { THREE, world, data, items, rooms, player, ui, state } = deps;
  const hooks = createHooks();
  const holders = new Set(); // Module, die die Steuerung gerade pausieren
  const applyPause = (paused) => { state.paused = paused; if (paused) deps.resetInput(); };
  const pick = createPicker({ THREE, camera: world.camera, near: deps.near, getRoom: () => player.room, objects: hooks.objects });
  const view = { get x() { return player.x; }, get z() { return player.z; }, get yaw() { return player.yaw; }, get pitch() { return player.pitch; }, get room() { return player.room; } };
  const ctx = {
    THREE, scene: world.scene, camera: world.camera, renderer: world.renderer,
    data, items, rooms,
    player: view,
    collide: createCollide(rooms, world.themes),
    wallDistance: createWallDistance(THREE, world.camera, rooms, world.themes),
    onFrame: hooks.add.frame,
    onPictureTap: hooks.add.pictureTap,
    onPictureLongPress: hooks.add.pictureLong,
    onObjectTap: hooks.onObjectTap,
    onStartHeartTap: ui.onStartHeartTap,
    onRoomEnter: hooks.add.roomEnter,
    onLightboxOpen: ui.onLightboxOpen,
    onViewerOpen: hooks.add.viewer,
    viewerOpened: hooks.viewerOpened,
    setInputPaused: (paused) => { if (paused) holders.add(ctx); else holders.delete(ctx); applyPause(holders.size > 0); },
    ui: { overlayRoot: ui.overlayRoot, hud: ui.hud, addStyle: ui.addStyle, toast: ui.toast },
  };
  return {
    ctx,
    frame: hooks.frame,
    roomEntered: hooks.roomEnter,
    loadFeatures: () => loadFeatures(ctx, holders, applyPause),
    /** Antippen: Handler für Bild-Tipper laufen vor der Großansicht, true = behandelt. */
    tap(x, y) {
      const target = pick(x, y);
      if (!target) return;
      if (target.index !== undefined) {
        if (!hooks.pictureTap(target.index)) deps.openLightbox(target.index);
      } else {
        (hooks.objects.get(target.object) || []).forEach((fn) => safe('onObjectTap', fn, target.object, target.hit));
      }
    },
    longPress(x, y) {
      const target = pick(x, y);
      if (target && target.index !== undefined) hooks.pictureLong(target.index);
    },
  };
}
