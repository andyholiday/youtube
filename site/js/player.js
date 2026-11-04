import { GAP } from './layout.js';

export const PLAYER_R = 0.45;
export const EYE = 1.65;
const SPEED = 3.2;
const TURN = 1.8;
const MAX_PITCH = 1.0;

const inside = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** Türdurchgang: von der Raumwand durch den Spalt bis in den Nachbarraum, Breite abzüglich Spielerradius. */
function passage(room, d) {
  const R = PLAYER_R;
  const a = d.center - d.width / 2 + R;
  const b = d.center + d.width / 2 - R;
  switch (d.wall) {
    case 'e': return { x0: room.x1 - R, x1: room.x1 + GAP + R, z0: a, z1: b };
    case 'w': return { x0: room.x0 - GAP - R, x1: room.x0 + R, z0: a, z1: b };
    case 's': return { x0: a, x1: b, z0: room.z1 - R, z1: room.z1 + GAP + R };
    default: return { x0: a, x1: b, z0: room.z0 - GAP - R, z1: room.z0 + R };
  }
}

/**
 * Begehbarer Bereich: Räume (um den Spielerradius verkleinert) plus Türdurchgänge,
 * minus die Sperrflächen der Themen. obstacles: je Raum eine Liste {x0, z0, x1, z1}.
 */
export function createWalkable(rooms, obstacles = []) {
  const R = PLAYER_R;
  const areas = rooms.map((r) => ({ x0: r.x0 + R, z0: r.z0 + R, x1: r.x1 - R, z1: r.z1 - R }));
  for (const r of rooms) for (const d of r.doors) areas.push(passage(r, d));
  const blocked = obstacles.flat().map((o) => ({ x0: o.x0 - R, z0: o.z0 - R, x1: o.x1 + R, z1: o.z1 + R }));
  return {
    canStand: (x, z) => areas.some((a) => inside(a, x, z)) && !blocked.some((o) => x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1),
    roomAt: (x, z) => rooms.findIndex((r) => inside(r, x, z)),
  };
}

/** Bewegt den Spieler; move = {x: seitlich, y: vorwärts} je -1..1. Wände und Hindernisse halten ihn auf, an Wänden gleitet er entlang. */
export function stepPlayer(p, move, turn, look, dt, walk) {
  p.yaw += turn * TURN * dt + look.yaw;
  p.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p.pitch + look.pitch));
  let { x: mx, y: my } = move;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  const nx = p.x + (-sin * my + cos * mx) * SPEED * dt;
  const nz = p.z + (-cos * my - sin * mx) * SPEED * dt;
  if (walk.canStand(nx, nz)) { p.x = nx; p.z = nz; } else if (walk.canStand(nx, p.z)) p.x = nx; else if (walk.canStand(p.x, nz)) p.z = nz;
}
