// Prüfungen der Raumfolge (reine Daten, kein Browser). Jede Funktion liefert eine Liste von Problemen (leer = in Ordnung).
const GAP = 0.3;
const EPS = 1e-6;
const FRAME = 0.15; // Rahmen links/rechts neben dem Bild
const horizontal = (wall) => wall === 'n' || wall === 's';
const alongRange = (r, wall) => (horizontal(wall) ? [r.x0, r.x1] : [r.z0, r.z1]);
const longEdge = (s) => Math.max(s.w, s.h);

function overlap(a, b) {
  return !(a.x1 + GAP <= b.x0 + EPS || b.x1 + GAP <= a.x0 + EPS || a.z1 + GAP <= b.z0 + EPS || b.z1 + GAP <= a.z0 + EPS);
}

function noOverlap(rooms) {
  const out = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) if (overlap(rooms[i], rooms[j])) out.push(`Raum ${i} und ${j} überlappen (oder < ${GAP} m Spalt)`);
  }
  return out;
}

/** Gegenstück zu einer Tür: Nachbarraum mit 0,3 m Spalt und derselben Tür auf der Gegenwand. */
function counterpart(rooms, r, d) {
  const opp = { n: 's', s: 'n', e: 'w', w: 'e' }[d.wall];
  const touches = (o) => ({
    e: Math.abs(o.x0 - (r.x1 + GAP)) < EPS, w: Math.abs(o.x1 - (r.x0 - GAP)) < EPS,
    s: Math.abs(o.z0 - (r.z1 + GAP)) < EPS, n: Math.abs(o.z1 - (r.z0 - GAP)) < EPS,
  })[d.wall];
  return rooms.find((o) => o !== r && touches(o) && o.doors.some((q) => q.wall === opp
    && Math.abs(q.center - d.center) < EPS && Math.abs(q.width - d.width) < EPS));
}

function doorsMatch(rooms) {
  const out = [];
  for (const r of rooms) {
    for (const d of r.doors) {
      const [lo, hi] = alongRange(r, d.wall);
      if (d.center - d.width / 2 < lo + 1 || d.center + d.width / 2 > hi - 1) out.push(`Raum ${r.id}: Tür ${d.wall} zu nah an der Ecke`);
      const o = counterpart(rooms, r, d);
      if (!o) { out.push(`Raum ${r.id}: Tür ${d.wall}@${d.center} ohne Gegenstück`); continue; }
      const [olo, ohi] = alongRange(o, d.wall);
      if (d.center - d.width / 2 < olo + 1 || d.center + d.width / 2 > ohi - 1) out.push(`Raum ${o.id}: Gegentür zu nah an der Ecke`);
    }
  }
  return out;
}

function reachable(rooms) {
  const seen = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const r = rooms[queue.shift()];
    for (const d of r.doors) {
      const o = counterpart(rooms, r, d);
      if (o && !seen.has(o.id)) { seen.add(o.id); queue.push(o.id); }
    }
  }
  return rooms.filter((r) => !seen.has(r.id)).map((r) => `Raum ${r.id} vom Start aus nicht erreichbar`);
}

/** Wände, durch die der Rundgang Raum i -> i+1 führt; mindestens ein Richtungswechsel nötig (ab 3 Räumen). */
function exitWalls(rooms) {
  return rooms.slice(0, -1).map((r, i) => (r.doors.find((d) => d.to === i + 1) || {}).wall);
}

function hasCorner(rooms) {
  const w = exitWalls(rooms);
  return w.some((x, i) => i > 0 && x !== w[i - 1]) ? [] : [`kein Richtungswechsel (${w.join('')})`];
}

function onWall(r, s) {
  const plane = { n: r.z0, s: r.z1, w: r.x0, e: r.x1 }[s.wall];
  const coord = horizontal(s.wall) ? s.z : s.x;
  const along = horizontal(s.wall) ? s.x : s.z;
  const [lo, hi] = alongRange(r, s.wall);
  const half = s.w / 2 + FRAME;
  const out = [];
  if (Math.abs(plane - coord) > EPS) out.push('liegt nicht auf der Wandfläche');
  if (along - half < lo + 0.9 || along + half > hi - 0.9) out.push('ragt in die Ecke');
  if (s.y - s.h / 2 < 0.9 || s.y + s.h / 2 > r.height - 1.5) out.push(`Höhe ${s.y - s.h / 2}..${s.y + s.h / 2} unpassend`);
  if (s.h <= 1.2 && Math.abs(s.y - 1.55) > 0.25) out.push('kleines Bild nicht auf Augenhöhe');
  return { out, along, half };
}

function slotsOk(rooms) {
  const out = [];
  for (const r of rooms) {
    const placed = r.slots.map((s) => ({ s, ...onWall(r, s) }));
    for (const p of placed) {
      out.push(...p.out.map((m) => `Raum ${r.id}, Bild ${p.s.index}: ${m}`));
      for (const d of r.doors.filter((q) => q.wall === p.s.wall)) {
        if (Math.abs(p.along - d.center) < p.half + d.width / 2) out.push(`Raum ${r.id}, Bild ${p.s.index}: in/an Tür`);
      }
      for (const q of placed) {
        if (q.s.index > p.s.index && q.s.wall === p.s.wall && Math.abs(q.along - p.along) < q.half + p.half) {
          out.push(`Raum ${r.id}: Bilder ${p.s.index} und ${q.s.index} überlappen`);
        }
      }
    }
  }
  return out;
}

function perRoom(rooms) {
  return rooms.flatMap((r) => {
    const out = [];
    if (r.height < 7 || r.height > 10) out.push(`Raum ${r.id}: Decke ${r.height} m`);
    if (r.x1 - r.x0 < 10 || r.x1 - r.x0 > 18 || r.z1 - r.z0 < 10 || r.z1 - r.z0 > 18) out.push(`Raum ${r.id}: Maße ${r.x1 - r.x0}x${r.z1 - r.z0}`);
    return out;
  });
}

function indices(rooms, n) {
  const all = rooms.flatMap((r) => r.slots.map((s) => s.index));
  const ok = all.length === n && all.every((v, i) => v === i);
  return ok ? [] : [`Bild-Indizes ${all.join(',')} statt 0..${n - 1} in Reihenfolge`];
}

function distinctSizes(rooms) {
  return new Set(rooms.flatMap((r) => r.slots.map((s) => Math.round(longEdge(s) * 10)))).size;
}

/** Alle Struktur-Prüfungen für ein Layout mit n Bildern. */
function checkAll(rooms, n) {
  return [...noOverlap(rooms), ...doorsMatch(rooms), ...reachable(rooms), ...slotsOk(rooms), ...perRoom(rooms), ...indices(rooms, n)];
}

module.exports = { noOverlap, doorsMatch, reachable, hasCorner, slotsOk, perRoom, indices, distinctSizes, checkAll, longEdge };
