// Beispielräume und Beispiel-Slots für Vorschau und Tests der Raumthemen.
export const ROOMS = {
  a: { id: 0, x0: 0, z0: 0, x1: 14, z1: 12, height: 8,
    doors: [{ wall: 'e', center: 6, width: 2.6, height: 4 }, { wall: 'n', center: 7, width: 2.6, height: 4 }] },
  b: { id: 1, x0: -4, z0: 3, x1: 4, z1: 11, height: 7,
    doors: [{ wall: 'w', center: 7, width: 2.2, height: 3.6 }, { wall: 's', center: 0, width: 2.6, height: 4 },
      { wall: 'e', center: 5, width: 2.6, height: 4.2 }] },
  c: { id: 2, x0: 10, z0: -5, x1: 30, z1: 11, height: 10, doors: [] },
  d: { id: 3, x0: 0, z0: 0, x1: 18, z1: 9, height: 9,
    doors: [{ wall: 's', center: 4.5, width: 2.6, height: 4 }, { wall: 's', center: 13.5, width: 2.6, height: 4 },
      { wall: 'n', center: 9, width: 1.8, height: 3.5 }] },
};

const SIZES = [[2.8, 1.9], [1.2, 1.6], [1.8, 1.2], [0.9, 0.9], [3.4, 2.2], [1.4, 1.0]];
const INFO = {
  n: (r) => ({ t0: r.x0, t1: r.x1, pt: (t) => ({ x: t, z: r.z0 }) }),
  s: (r) => ({ t0: r.x0, t1: r.x1, pt: (t) => ({ x: t, z: r.z1 }) }),
  w: (r) => ({ t0: r.z0, t1: r.z1, pt: (t) => ({ x: r.x0, z: t }) }),
  e: (r) => ({ t0: r.z0, t1: r.z1, pt: (t) => ({ x: r.x1, z: t }) }),
};

/** Bilder entlang der Wände, mit Abstand zu Türen und Ecken. */
export function makeSlots(room) {
  const slots = [];
  let k = 0;
  for (const wall of ['n', 's', 'w', 'e']) {
    const info = INFO[wall](room);
    const cuts = room.doors.filter((d) => d.wall === wall).map((d) => [d.center - d.width / 2 - 0.9, d.center + d.width / 2 + 0.9]);
    let spans = [[info.t0 + 0.9, info.t1 - 0.9]];
    for (const [a, b] of cuts) spans = spans.flatMap(([s, e]) => [[s, Math.min(a, e)], [Math.max(b, s), e]]).filter(([s, e]) => e > s);
    for (const [s, e] of spans) {
      let t = s;
      for (;;) {
        const [w, h] = SIZES[k % SIZES.length];
        if (t + w > e) break;
        const p = info.pt(t + w / 2);
        slots.push({ x: p.x, y: Math.max(2.3, 1.5 + h / 2), z: p.z, wall, w, h, index: k });
        t += w + 1.2 + (k % 3) * 0.4;
        k++;
      }
    }
  }
  return slots;
}
