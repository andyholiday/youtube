// Laufprüfungen mit der echten Kollision samt Deko-Hindernissen der Themen (laufen im Browser per page.evaluate).
const YAW = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }; // Blickrichtung zur Wand

/**
 * Standpunkt im Raum r, von dem aus ein gerader Weg bis zur Wand frei ist (keine Tür, keine Deko).
 * Bevorzugt große Entfernung und Raummitte.
 */
function clearApproach(page, r, wall) {
  return page.evaluate(([room, w, yaw]) => {
    const walk = window.__museum.walk;
    const horiz = w === 'n' || w === 's';
    const [lo, hi] = horiz ? [room.x0, room.x1] : [room.z0, room.z1];
    const mid = (lo + hi) / 2;
    const doors = room.doors.filter((d) => d.wall === w);
    const at = (lat, dist) => (horiz
      ? { x: lat, z: w === 'n' ? room.z0 + dist : room.z1 - dist }
      : { x: w === 'w' ? room.x0 + dist : room.x1 - dist, z: lat });
    const lanes = [];
    for (let lat = lo + 1.5; lat <= hi - 1.5; lat += 0.5) lanes.push(lat);
    lanes.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    for (const dist of [6, 4.5, 3, 2]) {
      for (const lat of lanes) {
        if (doors.some((d) => Math.abs(d.center - lat) < d.width / 2 + 1.5)) continue;
        let clear = true;
        for (let s = dist; s >= 0.5 && clear; s -= 0.1) { const p = at(lat, s); clear = walk.canStand(p.x, p.z); }
        if (clear) return { ...at(lat, dist), yaw, pitch: 0 };
      }
    }
    return null;
  }, [r, wall, YAW[wall]]);
}

const S = 0.25; // Rasterweite der Wegsuche in Metern

/** Breitensuche auf dem Raster über alle Standpunkte (läuft im Browser). Gibt Wegpunkte oder null zurück. */
function findPath(walk, from, to, S) {
  const key = (i, j) => `${i},${j}`;
  const [si, sj] = [Math.round(from.x / S), Math.round(from.z / S)];
  const [ti, tj] = [Math.round(to[0] / S), Math.round(to[1] / S)];
  const prev = new Map([[key(si, sj), null]]);
  const queue = [[si, sj]];
  for (let q = 0; q < queue.length; q++) {
    const [i, j] = queue[q];
    if (i === ti && j === tj) {
      const path = [];
      for (let c = [i, j]; c; c = prev.get(key(...c))) path.unshift([c[0] * S, c[1] * S]);
      return path;
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const [a, b] = [i + di, j + dj];
      if (!prev.has(key(a, b)) && walk.canStand(a * S, b * S)) { prev.set(key(a, b), [i, j]); queue.push([a, b]); }
    }
  }
  return null;
}

/** Läuft mit stepPlayer (echte Kollision) zum Punkt t (läuft im Browser). */
function goTo(stepPlayer, walk, p, t) {
  for (let k = 0; k < 200 && Math.hypot(t[0] - p.x, t[1] - p.z) > 0.08; k++) {
    p.yaw = Math.atan2(-(t[0] - p.x), -(t[1] - p.z));
    stepPlayer(p, { x: 0, y: 1 }, 0, { yaw: 0, pitch: 0 }, 0.02, walk);
  }
}

/** Läuft zu Fuß von Raum 0 durch jede Tür bis in den letzten Raum, mit den Deko-Hindernissen der echten Themen. */
function reachAllRooms(page, count) {
  return page.evaluate(async ([n, findSrc, goSrc, step]) => {
    const [{ stepPlayer, createWalkable }, { buildLayout, startCandidates, GAP }, { THEMES, buildTheme }] = await Promise.all([
      import('./js/player.js'), import('./js/layout.js'), import('./js/themes/index.js')]);
    const findPath = new Function(`return ${findSrc}`)();
    const goTo = new Function(`return ${goSrc}`)();
    const items = Array.from({ length: n }, (_, i) => ({ breite: 1600 - (i % 3) * 300, hoehe: 1000 }));
    const rooms = buildLayout(items, THEMES);
    const walk = createWalkable(rooms, rooms.map((r) => buildTheme(r.theme, r).obstacles));
    const first = startCandidates(rooms[0]).find((c) => walk.canStand(c.x, c.z));
    const p = { x: first.x, z: first.z, yaw: 0, pitch: 0 };
    const seen = [];
    for (let i = 0; i < rooms.length - 1; i++) {
      const r = rooms[i];
      const d = r.doors.find((q) => q.to === i + 1);
      const into = 1.5 + GAP;
      const target = { e: [r.x1 + into, d.center], w: [r.x0 - into, d.center], s: [d.center, r.z1 + into], n: [d.center, r.z0 - into] }[d.wall];
      const path = findPath(walk, p, target, step);
      if (!path) { seen.push(-1); break; }
      path.forEach((wp) => goTo(stepPlayer, walk, p, wp));
      seen.push(walk.roomAt(p.x, p.z));
    }
    return seen;
  }, [count, findPath.toString(), goTo.toString(), S]);
}

/** Wegpunkte (Sichtlinien-Abkürzung) von der aktuellen Position der Seite zum Ziel [x, z]; null ohne Weg. */
function planRoute(page, target) {
  return page.evaluate(([findSrc, step, to]) => {
    const findPath = new Function(`return ${findSrc}`)();
    const { walk, pos } = window.__museum;
    const path = findPath(walk, pos, to, step);
    if (!path) return null;
    const clear = (a, b) => {
      const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1);
      for (let k = 1; k < n; k++) if (!walk.canStand(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n)) return false;
      return true;
    };
    const out = [];
    for (let i = 0; i < path.length - 1;) {
      let j = path.length - 1;
      while (j > i + 1 && !clear(path[i], path[j])) j--;
      out.push(path[j]);
      i = j;
    }
    return out;
  }, [findPath.toString(), S, target]);
}

module.exports = { clearApproach, reachAllRooms, planRoute };
