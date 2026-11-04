// Raumfolge und Bildanordnung (Meter, y nach oben, Boden y = 0). Schnittstelle: .planning/SPEC-MUSEUM.md
export const GAP = 0.3; // Spalt zwischen den Innenflächen benachbarter Räume
export const DOOR_W = 2.6;
export const DOOR_H = 4.0;
const EDGE = 1.0; // Abstand Bildrahmen zur Ecke
const DOOR_CLEAR = 0.9; // Abstand Bildrahmen zur Türkante
const GAP_MIN = 0.4; // Mindestabstand zwischen zwei Bildern
const PER_ROOM = 4;
const MIN_INTERVAL = 1.2;
const LONG = { L: 3.0, M: 1.8, S: 1.1 }; // lange Kante je Größenstufe
const MAX_W = 3.4;
const MAX_H = 2.8;
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
function assign(ivs, pics, entryWall) {
  const big = pics.find((p) => p.cls === 'L');
  if (big) {
    const score = (iv) => iv.b - iv.a + (iv.wall === OPPOSITE[entryWall] ? 3 : 0) - (iv.wall === entryWall ? 100 : 0);
    const iv = ivs.reduce((best, cur) => (score(cur) > score(best) ? cur : best));
    shrink(big, iv.b - iv.a - 2 * GAP_MIN);
    iv.pics.push(big);
  }
  for (const p of pics.filter((q) => q !== big)) {
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
  assign(ivs, pics, entryWall);
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
