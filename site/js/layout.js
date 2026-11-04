// Raumfolge und Bildanordnung (Meter, y nach oben, Boden y = 0). Schnittstelle: .planning/SPEC-MUSEUM.md
export const GAP = 0.3; // Spalt zwischen den Innenflächen benachbarter Räume
const DOOR_W = 3.2;
const DOOR_H = 4.0;
const EDGE = 1.0; // Abstand Bildrahmen zur Ecke
const DOOR_CLEAR = 0.9; // Abstand Bildrahmen zur Türkante
const GAP_MIN = 0.4; // Mindestabstand zwischen zwei Bildern
const PER_ROOM = 4;
const MIN_INTERVAL = 1.2;
const LONG = { L: 3.9, M: 2.35, S: 1.45 }; // lange Kante je Größenstufe (in 8 m hohen Räumen wirken Bilder sonst klein)
const MAX_W = 4.4;
const MAX_H = 3.65;
const WIDTHS = [14, 16, 12, 17, 13, 15, 11, 18];
const DEPTHS = [12, 15, 14, 11, 16, 13, 17, 12];
const HEIGHTS = [8, 9, 7.5, 10, 8.5, 9.5, 7, 8];
const OFFSETS = [0, 2, 1, 3, 0, 2.5, 1, 3];
const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };
const cm = (v) => Math.round(v * 100) / 100;
const horizontal = (wall) => wall === 'n' || wall === 's';

function roomCount(n) {
  if (n === 0) return 1;
  return Math.max(Math.ceil(n / PER_ROOM), n >= 6 ? 3 : 1);
}

/** Raum i liegt je nach Schritt östlich (gerade) oder südlich (ungerade) von Raum i-1: der Rundgang führt um Ecken. */
function placeRoom(i, prev, themes) {
  const w = WIDTHS[i % WIDTHS.length];
  const d = DEPTHS[i % DEPTHS.length];
  let x0 = 0;
  let z0 = 0;
  let dir = null;
  if (prev) {
    dir = (i - 1) % 2 === 0 ? 'e' : 's';
    const off = OFFSETS[i % OFFSETS.length];
    x0 = dir === 'e' ? prev.x1 + GAP : prev.x0 + off;
    z0 = dir === 's' ? prev.z1 + GAP : prev.z0 + off;
  }
  const room = { id: i, theme: themes[i % themes.length], x0, z0, x1: x0 + w, z1: z0 + d,
    height: HEIGHTS[i % HEIGHTS.length], doors: [], slots: [] };
  return { room, dir };
}

/** Tür in beiden Räumen an derselben Stelle (Mitte des gemeinsamen Wandbereichs). */
function connect(a, b, dir) {
  const [lo, hi] = dir === 'e' ? [[a.z0, b.z0], [a.z1, b.z1]] : [[a.x0, b.x0], [a.x1, b.x1]];
  const center = cm((Math.max(...lo) + Math.min(...hi)) / 2);
  a.doors.push({ wall: dir, center, width: DOOR_W, height: DOOR_H, to: b.id });
  b.doors.push({ wall: OPPOSITE[dir], center, width: DOOR_W, height: DOOR_H, to: a.id });
}

function dims(item, edge) {
  const a = item.breite > 0 && item.hoehe > 0 ? item.breite / item.hoehe : 4 / 3;
  const w = a >= 1 ? edge : edge * a;
  const h = a >= 1 ? edge / a : edge;
  const k = Math.min(1, MAX_W / w, MAX_H / h);
  return { w: cm(w * k), h: cm(h * k) };
}

function makePic(item, index, cls) {
  const pic = { item, index, cls };
  return resize(pic, cls);
}

function resize(pic, cls) {
  pic.cls = cls;
  Object.assign(pic, dims(pic.item, LONG[cls]));
  pic.fw = Math.max(pic.w + 0.5, 1.2); // Platzbedarf entlang der Wand inkl. Rahmen und Schild
  return pic;
}

function shrink(pic, space) {
  while (pic.fw > space && pic.cls !== 'S') resize(pic, pic.cls === 'L' ? 'M' : 'S');
}

/** Freie Wandabschnitte (Wand, von, bis) ohne Türen und Ecken. */
function freeIntervals(room) {
  const out = [];
  for (const wall of ['n', 'e', 's', 'w']) {
    const start = horizontal(wall) ? room.x0 : room.z0;
    const end = (horizontal(wall) ? room.x1 : room.z1) - EDGE;
    let a = start + EDGE;
    const doors = room.doors.filter((d) => d.wall === wall).sort((p, q) => p.center - q.center);
    for (const d of doors) {
      out.push({ wall, a, b: d.center - d.width / 2 - DOOR_CLEAR, pics: [] });
      a = d.center + d.width / 2 + DOOR_CLEAR;
    }
    out.push({ wall, a, b: end, pics: [] });
  }
  return out.filter((iv) => iv.b - iv.a >= MIN_INTERVAL);
}

const used = (iv) => iv.pics.reduce((s, p) => s + p.fw + GAP_MIN, 0);
const free = (iv) => iv.b - iv.a - used(iv);

/** Blickfang bevorzugt gegenüber dem Eingang, übrige Bilder dorthin, wo am meisten Platz ist. */
function assign(room, ivs, pics, entryWall) {
  const big = pics.find((p) => p.cls === 'L');
  if (big) {
    const score = (iv) => iv.b - iv.a + (iv.wall === OPPOSITE[entryWall] ? 3 : 0) - (iv.wall === entryWall ? 100 : 0);
    const iv = ivs.reduce((best, cur) => (score(cur) > score(best) ? cur : best));
    shrink(big, iv.b - iv.a - 2 * GAP_MIN);
    iv.pics.push(big);
  }
  const rest = pics.filter((q) => q !== big);
  // Mindestens ein Bild neben der Ausgangstür: Blick auf Tür und Bild zugleich (Start, Weitergehen).
  const exit = room.doors.find((d) => d.to > room.id);
  const beside = exit && ivs.filter((iv) => iv.wall === exit.wall && free(iv) >= rest[0].fw + GAP_MIN)
    .reduce((best, cur) => (!best || free(cur) > free(best) ? cur : best), null);
  if (beside && rest.length) beside.pics.push(rest.shift());
  for (const p of rest) {
    const iv = ivs.reduce((best, cur) => (free(cur) > free(best) ? cur : best));
    shrink(p, free(iv) - GAP_MIN);
    iv.pics.push(p);
  }
}

function toSlot(room, wall, along, pic) {
  const x = wall === 'w' ? room.x0 : wall === 'e' ? room.x1 : along;
  const z = wall === 'n' ? room.z0 : wall === 's' ? room.z1 : along;
  const y = cm(Math.max(1.55, pic.h / 2 + 1.1)); // klein auf Augenhöhe, groß nicht im Boden
  return { x: cm(x), y, z: cm(z), wall, w: pic.w, h: pic.h, index: pic.index };
}

function placeSlots(room, pics, entryWall) {
  const ivs = freeIntervals(room);
  assign(room, ivs, pics, entryWall);
  for (const iv of ivs) {
    iv.pics.sort((p, q) => p.index - q.index);
    const gap = (iv.b - iv.a - iv.pics.reduce((s, p) => s + p.fw, 0)) / (iv.pics.length + 1);
    let cursor = iv.a + gap;
    for (const p of iv.pics) {
      room.slots.push(toSlot(room, iv.wall, cursor + p.fw / 2, p));
      cursor += p.fw + gap;
    }
  }
  room.slots.sort((p, q) => p.index - q.index);
}

/** Größenstufen: ein Blickfang (L) pro Raum, die übrigen wechseln zwischen M und S. */
function picsFor(room, items, start, count) {
  const big = (room.id * 2 + 1) % count;
  let o = 0;
  return Array.from({ length: count }, (_, k) => {
    const cls = k === big ? 'L' : (o++ + room.id) % 2 === 0 ? 'M' : 'S';
    return makePic(items[start + k], start + k, cls);
  });
}

/** Raumfolge für die Erinnerungen (Reihenfolge = Rundgang). themes: Liste der Themennamen, zyklisch. */
export function buildLayout(items, themes) {
  const n = items.length;
  const rooms = [];
  const entry = [];
  for (let i = 0; i < roomCount(n); i++) {
    const { room, dir } = placeRoom(i, rooms[i - 1], themes);
    if (dir) connect(rooms[i - 1], room, dir);
    entry.push(dir ? OPPOSITE[dir] : 's');
    rooms.push(room);
  }
  if (n === 0) {
    Object.assign(rooms[0], { x1: 12, z1: 12, height: 8 });
    return rooms;
  }
  const base = Math.floor(n / rooms.length);
  let start = 0;
  rooms.forEach((room, i) => {
    const count = base + (i < n % rooms.length ? 1 : 0);
    if (count) placeSlots(room, picsFor(room, items, start, count), entry[i]);
    start += count;
  });
  return rooms;
}

/** Startpunkt im ersten Raum: nahe der Südwand, Blick nach Norden in den Raum. */
export function startCandidates(room) {
  const cx = (room.x0 + room.x1) / 2;
  return [0, -2, 2, -4, 4].map((dx) => ({ x: cx + dx, z: room.z1 - 2.2, yaw: 0, pitch: -0.05 }));
}

// Start-Blick: Die Tür zum nächsten Raum und mindestens ein Bild müssen im Blick sein,
// auch auf dem schmalsten Handy-Hochformat (horizontal ca. 40°, vertikal 80°).
const VIEW_H = (20 * Math.PI) / 180; // halber horizontaler Öffnungswinkel
const VIEW_V = (35 * Math.PI) / 180;
const VIEW_MARGIN = 0.85;
const FACING_MIN = 0.45; // Wandnormale gegen Blickrichtung: nicht zu schräg
const START_PITCH = -0.03;
const normAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const NORMAL = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] };

function doorPoint(room, d) {
  const along = d.center;
  const x = d.wall === 'w' ? room.x0 : d.wall === 'e' ? room.x1 : along;
  const z = d.wall === 'n' ? room.z0 : d.wall === 's' ? room.z1 : along;
  return { x, y: d.height / 2, z, wall: d.wall };
}

/** Liegt der Punkt (auf einer Wand) im Blickfeld, schaut man nicht zu schräg darauf und ist die Sicht frei? */
function seen(pose, eye, pt, canStand) {
  const dx = pt.x - pose.x;
  const dz = pt.z - pose.z;
  const depth = -(dx * Math.sin(pose.yaw) + dz * Math.cos(pose.yaw));
  const side = dx * Math.cos(pose.yaw) - dz * Math.sin(pose.yaw);
  const dist = Math.hypot(dx, dz);
  if (depth < 1 || dist < 2.5 || dist > 11) return false;
  if (Math.abs(Math.atan2(side, depth)) > VIEW_H * VIEW_MARGIN) return false;
  if (Math.abs(Math.atan2(pt.y - eye, depth) - pose.pitch) > VIEW_V * VIEW_MARGIN) return false;
  const [nx, nz] = NORMAL[pt.wall];
  if (-(dx * nx + dz * nz) / dist < FACING_MIN) return false;
  for (let s = 0.25; s < dist - 1; s += 0.25) { // freie Sicht: nirgends Deko im Weg
    if (!canStand(pose.x + (dx * s) / dist, pose.z + (dz * s) / dist)) return false;
  }
  return true;
}

/** Bester Blick von einem Standpunkt aus: mittig zwischen Tür und einem Bild. */
function bestFrom(spot, door, pics, eye, canStand) {
  const bearing = (t) => Math.atan2(-(t.x - spot.x), -(t.z - spot.z));
  let best = null;
  for (const p of pics) {
    const yaw = door ? bearing(door) + normAngle(bearing(p) - bearing(door)) / 2 : bearing(p);
    const pose = { x: spot.x, z: spot.z, yaw, pitch: START_PITCH };
    if (door && !seen(pose, eye, door, canStand)) continue;
    const count = pics.filter((q) => seen(pose, eye, q, canStand)).length;
    if (count > 0 && (!best || count > best.count)) best = { pose, count };
  }
  return best;
}

/**
 * Startpose im ersten Raum: Standpunkt und Blickrichtung so, dass die Tür zum nächsten Raum
 * (falls vorhanden) und mindestens ein Bild im Blick sind. canStand(x, z) schließt Deko aus.
 */
export function startPose(room, canStand, eye = 1.65) {
  const door = room.doors.find((d) => d.to === room.id + 1);
  const doorPt = door && doorPoint(room, door);
  const pics = room.slots.map((s) => ({ x: s.x, y: s.y, z: s.z, wall: s.wall }));
  const home = { x: (room.x0 + room.x1) / 2, z: room.z1 - 2.2 };
  let best = null;
  for (let x = room.x0 + 1.5; x <= room.x1 - 1.5; x += 0.5) {
    for (let z = room.z0 + 1.5; z <= room.z1 - 1.5; z += 0.5) {
      if (!canStand(x, z)) continue;
      const r = bestFrom({ x, z }, doorPt, pics, eye, canStand);
      if (!r) continue;
      const score = r.count * 10 - Math.hypot(x - home.x, z - home.z);
      if (!best || score > best.score) best = { score, pose: r.pose };
    }
  }
  if (best) return { x: best.pose.x, z: best.pose.z, yaw: best.pose.yaw, pitch: START_PITCH };
  const fallback = startCandidates(room).find((p) => canStand(p.x, p.z)) || startCandidates(room)[0];
  return { ...fallback };
}
