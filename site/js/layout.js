// Maße der Galeriehalle (Meter) und Anordnung der Bilder.
export const HALL_W = 8;
export const HALL_H = 3.8;
export const SLOT = 4.6;
export const ENTRY_MARGIN = 3.6;
export const END_MARGIN = 6;
export const EYE = 1.65;
export const PLAYER_R = 0.55;
export const PIC_Y = 2.0;
export const MAX_PIC_W = 2.4;
export const MAX_PIC_H = 1.6;

export function slotCount(n) {
  return Math.ceil(n / 2);
}

export function hallLength(n) {
  return Math.max(14, slotCount(n) * SLOT + ENTRY_MARGIN + END_MARGIN);
}

/** Bild i: gerade links (side -1), ungerade rechts (side +1), von vorn nach hinten. */
export function slotFor(i, length) {
  const side = i % 2 === 0 ? -1 : 1;
  const z = length / 2 - ENTRY_MARGIN - SLOT / 2 - Math.floor(i / 2) * SLOT;
  return { side, z };
}

export function fitSize(breite, hoehe) {
  const aspect = breite > 0 && hoehe > 0 ? breite / hoehe : 4 / 3;
  let w = MAX_PIC_W;
  let h = w / aspect;
  if (h > MAX_PIC_H) { h = MAX_PIC_H; w = h * aspect; }
  return { w, h };
}

export function hallBounds(length) {
  return {
    minX: -HALL_W / 2 + PLAYER_R, maxX: HALL_W / 2 - PLAYER_R,
    minZ: -length / 2 + PLAYER_R + 1.2, maxZ: length / 2 - PLAYER_R,
  };
}

export function startPose(length) {
  return { x: 0, z: length / 2 - 1.8, yaw: 0, pitch: -0.2 };
}
