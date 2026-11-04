// Gemeinsame Bausteine der Raumthemen: Hülle (Boden, Wände mit Türöffnungen, Decke),
// Bänder an den Wänden, Freiflächen-Platzierung, Licht und Schilder.
import * as THREE from 'three';
import { Batch } from './geo.js';
import { canvas, toTexture } from '../textures.js';

export const WALL_T = 0.15;
export const WALLS = ['n', 's', 'w', 'e'];
const FRONT_DEPTH = 2.4; // Tiefe der freien Zone vor einer Tür
const PATH_HALF = 1.1; // halbe Breite der freien Achse zwischen Türen

/** Raum mit Standardwerten, damit Themen nie auf undefined stoßen. */
export function normalizeRoom(room) {
  return { doors: [], slots: [], height: 8, ...room };
}

/** Wand-Koordinaten: t läuft entlang der Wand, d ist der Abstand von der Innenfläche nach innen. */
export function wallInfo(room, wall) {
  const { x0, z0, x1, z1 } = room;
  const info = {
    n: { t0: x0, t1: x1, rotY: 0, to: (t, d) => [t, z0 + d] },
    s: { t0: x0, t1: x1, rotY: Math.PI, to: (t, d) => [t, z1 - d] },
    w: { t0: z0, t1: z1, rotY: Math.PI / 2, to: (t, d) => [x0 + d, t] },
    e: { t0: z0, t1: z1, rotY: -Math.PI / 2, to: (t, d) => [x1 - d, t] },
  }[wall];
  return { wall, ...info };
}

export function doorsOn(room, wall) {
  return room.doors.filter((d) => d.wall === wall).sort((a, b) => a.center - b.center);
}

/** Quader in Wandkoordinaten: t0..t1 entlang, y0..y1 hoch, d0..d1 in den Raum (negativ = ins Mauerwerk). */
export function wallBox(batch, info, t0, t1, y0, y1, d0, d1, color, skip) {
  const [xa, za] = info.to(t0, d0);
  const [xb, zb] = info.to(t1, d1);
  batch.aabb(Math.min(xa, xb), y0, Math.min(za, zb), Math.max(xa, xb), y1, Math.max(za, zb), color, skip);
}

/** Wandabschnitte (t-Intervalle) in Höhe y0, in denen keine Tür ist. */
export function spans(room, wall, y0, from, to) {
  const info = wallInfo(room, wall);
  let out = [[from ?? info.t0, to ?? info.t1]];
  for (const door of doorsOn(room, wall)) {
    if (y0 >= door.height - 1e-6) continue;
    const a = door.center - door.width / 2, b = door.center + door.width / 2;
    out = out.flatMap(([s, e]) => (b <= s || a >= e ? [[s, e]] : [[s, Math.min(a, e)], [Math.max(b, s), e]]))
      .filter(([s, e]) => e - s > 0.01);
  }
  return out;
}

/** Umlaufendes Band (Sockel, Gesims, Leiste) an allen Wänden; Türen werden ausgespart, wenn das Band sie schneidet. */
export function bandAround(batch, room, y0, y1, d0, d1, color) {
  for (const wall of WALLS) {
    const info = wallInfo(room, wall);
    for (const [a, b] of spans(room, wall, y0)) wallBox(batch, info, a, b, y0, y1, d0, d1, color);
  }
}

/** Bildflächen (Wandkoordinaten) aller Slots einer Wand, mit Rand für Rahmen und Schild. */
export function slotRects(room, wall, pad = 0.3) {
  return room.slots.filter((s) => s.wall === wall).map((s) => {
    const t = wall === 'n' || wall === 's' ? s.x : s.z;
    return { t0: t - s.w / 2 - pad, t1: t + s.w / 2 + pad, y0: s.y - s.h / 2 - pad - 0.35, y1: s.y + s.h / 2 + pad };
  });
}

/** true, wenn ein Wandstück (t0..t1, y0..y1) ein Bild überdecken würde. */
export function hitsSlot(room, wall, t0, t1, y0, y1) {
  return slotRects(room, wall).some((r) => t0 < r.t1 && t1 > r.t0 && y0 < r.y1 && y1 > r.y0);
}

/** Höchste Bildkante im Raum (für Zierleisten über den Bildern). */
export function maxPictureTop(room) {
  return room.slots.reduce((m, s) => Math.max(m, s.y + s.h / 2), 0);
}

/** Futter: Leisten innen in der Türöffnung (Seiten + Sturz), Öffnungsmitte bleibt frei. */
export function doorLining(batch, room, thick, color) {
  for (const door of room.doors) {
    const info = wallInfo(room, door.wall);
    const a = door.center - door.width / 2, b = door.center + door.width / 2;
    wallBox(batch, info, a, a + thick, 0, door.height, -WALL_T, 0.0, color);
    wallBox(batch, info, b - thick, b, 0, door.height, -WALL_T, 0.0, color);
    wallBox(batch, info, a + thick, b - thick, door.height - thick, door.height, -WALL_T, 0.0, color);
  }
}

/** Boden + Türschwellen, Wände (mit Öffnungen), Decke. Gibt drei Meshes zurück. */
export function shell(room, mats, ceilUV) {
  const { x0, z0, x1, z1, height: h } = room;
  const floor = new Batch();
  floor.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], undefined, { n: [0, 1, 0] });
  for (const door of room.doors) {
    const info = wallInfo(room, door.wall);
    const a = door.center - door.width / 2, b = door.center + door.width / 2;
    const [xa, za] = info.to(a, -WALL_T), [xb, zb] = info.to(b, 0);
    const [lx, hx] = [Math.min(xa, xb), Math.max(xa, xb)], [lz, hz] = [Math.min(za, zb), Math.max(za, zb)];
    floor.quad([lx, 0, hz], [hx, 0, hz], [hx, 0, lz], [lx, 0, lz], undefined, { n: [0, 1, 0] });
  }
  const walls = new Batch();
  for (const wall of WALLS) {
    const info = wallInfo(room, wall);
    const ext = wall === 'n' || wall === 's' ? WALL_T : 0;
    let cursor = info.t0 - ext;
    for (const door of doorsOn(room, wall)) {
      const a = door.center - door.width / 2, b = door.center + door.width / 2;
      if (a > cursor) wallBox(walls, info, cursor, a, 0, h, -WALL_T, 0);
      wallBox(walls, info, a, b, door.height, h, -WALL_T, 0);
      cursor = b;
    }
    if (info.t1 + ext > cursor) wallBox(walls, info, cursor, info.t1 + ext, 0, h, -WALL_T, 0);
  }
  const ceil = new Batch();
  ceil.uvFn = ceilUV || null;
  const [cx0, cx1, cz0, cz1] = [x0 - WALL_T, x1 + WALL_T, z0 - WALL_T, z1 + WALL_T];
  ceil.quad([cx0, h, cz0], [cx1, h, cz0], [cx1, h, cz1], [cx0, h, cz1], undefined, { n: [0, -1, 0] });
  return [floor.mesh(mats.floor), walls.mesh(mats.wall), ceil.mesh(mats.ceil)];
}

function rectsHit(a, b, pad = 0) {
  return a.x0 < b.x1 + pad && a.x1 > b.x0 - pad && a.z0 < b.z1 + pad && a.z1 > b.z0 - pad;
}

/** Liang-Barsky: schneidet die Strecke das (um r aufgeweitete) Rechteck? */
function segHitsRect(p, q, rect, r) {
  let t0 = 0, t1 = 1;
  const d = [q[0] - p[0], q[1] - p[1]];
  const lo = [rect.x0 - r, rect.z0 - r], hi = [rect.x1 + r, rect.z1 + r];
  for (let i = 0; i < 2; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (p[i] < lo[i] || p[i] > hi[i]) return false; continue; }
    let ta = (lo[i] - p[i]) / d[i], tb = (hi[i] - p[i]) / d[i];
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/** Freiflächen: Zone vor jeder Tür und Achsen zwischen den Türen. */
export function reservedZones(room) {
  const rects = room.doors.map((door) => {
    const info = wallInfo(room, door.wall);
    const [xa, za] = info.to(door.center - door.width / 2 - 0.6, -0.1);
    const [xb, zb] = info.to(door.center + door.width / 2 + 0.6, FRONT_DEPTH);
    return { x0: Math.min(xa, xb), z0: Math.min(za, zb), x1: Math.max(xa, xb), z1: Math.max(za, zb) };
  });
  const pts = room.doors.map((door) => wallInfo(room, door.wall).to(door.center, 1.0));
  const paths = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) paths.push([pts[i], pts[j]]);
  return { rects, paths };
}

/** Sammelt Hindernisse und prüft vor dem Platzieren, ob die Fläche frei ist. */
export class Placer {
  constructor(room) {
    this.room = room;
    this.zones = reservedZones(room);
    this.obstacles = [];
  }

  /** Rechteck (Mitte cx,cz; Halbmaße hw,hd) frei? margin = Abstand zu den Wänden, gap = zu anderen Hindernissen. */
  free(cx, cz, hw, hd, margin = 0.6, gap = 0.5) {
    const r = { x0: cx - hw, z0: cz - hd, x1: cx + hw, z1: cz + hd };
    const R = this.room;
    if (r.x0 < R.x0 + margin || r.x1 > R.x1 - margin || r.z0 < R.z0 + margin || r.z1 > R.z1 - margin) return false;
    if (this.zones.rects.some((z) => rectsHit(r, z, 0.2))) return false;
    if (this.zones.paths.some(([p, q]) => segHitsRect(p, q, r, PATH_HALF))) return false;
    return !this.obstacles.some((o) => rectsHit(r, o, gap));
  }

  /** Platziert, wenn frei; gibt true zurück und merkt sich die Sperrfläche. */
  place(cx, cz, hw, hd, margin, gap) {
    if (!this.free(cx, cz, hw, hd, margin, gap)) return false;
    this.obstacles.push({ x0: cx - hw, z0: cz - hd, x1: cx + hw, z1: cz + hd });
    return true;
  }

  /** Würde hohe Deko mit Radius r bei (x,z) ein Bild verdecken (vor dem Slot, näher als depth zur Wand)? */
  nearSlot(x, z, r, depth = 1.8) {
    const R = this.room;
    return R.slots.some((s) => {
      const horizontal = s.wall === 'n' || s.wall === 's';
      const dist = { n: z - R.z0, s: R.z1 - z, w: x - R.x0, e: R.x1 - x }[s.wall];
      return dist < depth + r && Math.abs((horizontal ? x - s.x : z - s.z)) < s.w / 2 + r;
    });
  }
}

/** Ein Punktlicht in Raummitte, ohne Schatten. */
export function addLight(group, room, color, intensity, heightFrac = 0.6) {
  const span = Math.max(room.x1 - room.x0, room.z1 - room.z0);
  const light = new THREE.PointLight(color, intensity, span * 1.4, 1.5);
  light.position.set((room.x0 + room.x1) / 2, room.height * heightFrac, (room.z0 + room.z1) / 2);
  light.castShadow = false;
  group.add(light);
}

/** Ausrichtung entlang der längeren Raumachse: 'x' oder 'z'. */
export function longAxis(room) {
  return room.x1 - room.x0 >= room.z1 - room.z0 ? 'x' : 'z';
}

const PLAQUE_PX = 1024;
const PLAQUE_ZOOM = 1.2; // Schrift relativ zum Schild größer setzen, damit sie auch von weitem lesbar ist

/**
 * Zeichnet das Schild in doppelter Auflösung. Ohne Titel steht das Datum an dessen Stelle
 * (größer gesetzt), sonst wären Titel und Datum je nach Thema leer bzw. klein.
 */
function drawPlaqueText(g, W, H, draw, titel, datum) {
  const k = W / 512 * PLAQUE_ZOOM;
  g.save();
  g.scale(k, k);
  if (titel) draw(g, W / k, H / k, titel, datum);
  else draw(g, W / k, H / k, datum, '');
  g.restore();
}

const planeCache = new Map();
function plane(w, h) {
  const key = `${w}x${h}`;
  if (!planeCache.has(key)) planeCache.set(key, new THREE.PlaneGeometry(w, h));
  return planeCache.get(key);
}

/**
 * Schild: optional Rückplatte (plate = {mat, depth}) plus Textfläche. draw(g, W, H, titel, datum)
 * zeichnet auf ein Canvas im Seitenverhältnis w:h. Die Mitte liegt im Ursprung, Blick nach +z.
 */
export function plaqueObject(w, h, titel, datum, draw, textMat, plate) {
  const [c, g] = canvas(PLAQUE_PX, Math.round(PLAQUE_PX * h / w));
  drawPlaqueText(g, c.width, c.height, draw, String(titel ?? '').trim(), String(datum ?? ''));
  const tex = toTexture(c);
  const group = new THREE.Group();
  let z = 0.004;
  if (plate) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, plate.depth), plate.mat);
    back.position.z = plate.depth / 2;
    group.add(back);
    z = plate.depth + 0.002;
  }
  const mat = textMat.clone();
  mat.map = tex;
  const face = new THREE.Mesh(plane(w, h), mat);
  face.position.z = z;
  group.add(face);
  return group;
}
