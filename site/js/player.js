import { hallBounds } from './layout.js';

const SPEED = 3.2;
const TURN = 1.8;
const MAX_PITCH = 1.0;

/** Bewegt den Spieler; move = {x: seitlich, y: vorwärts} je -1..1. Wände begrenzen die Position. */
export function stepPlayer(p, move, turn, look, dt, length) {
  p.yaw += turn * TURN * dt + look.yaw;
  p.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p.pitch + look.pitch));
  let { x: mx, y: my } = move;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  const sin = Math.sin(p.yaw);
  const cos = Math.cos(p.yaw);
  const dx = (-sin * my + cos * mx) * SPEED * dt;
  const dz = (-cos * my - sin * mx) * SPEED * dt;
  const b = hallBounds(length);
  p.x = Math.max(b.minX, Math.min(b.maxX, p.x + dx));
  p.z = Math.max(b.minZ, Math.min(b.maxZ, p.z + dz));
}
