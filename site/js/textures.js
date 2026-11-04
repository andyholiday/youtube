// Gemeinsame Helfer für prozedurale Canvas-Texturen der Raumthemen (alle ≤ 1024 px).
import * as THREE from 'three';

export const SANS = '"Helvetica Neue",Helvetica,Arial,"Segoe UI",sans-serif';
export const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';

export function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

/**
 * Canvas -> Textur. tile = Kantenlänge einer Kachel in Metern (UVs der Themen sind Meter),
 * ohne tile wird nicht wiederholt.
 */
export function toTexture(c, tile) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (tile) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / tile, 1 / tile);
  }
  return t;
}

const store = new Map();
/** Einmal pro Seite erzeugen und für alle Räume teilen. */
export function cached(key, make) {
  if (!store.has(key)) store.set(key, make());
  return store.get(key);
}

/** Zufälliges Rauschen aus kleinen Rechtecken (Putz, Stein, Terrazzo). */
export function speckle(g, w, h, rnd, count, colors, minS, maxS, alpha) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    g.globalAlpha = alpha * (0.4 + rnd() * 0.6);
    const s = minS + rnd() * (maxS - minS);
    g.fillRect(rnd() * w, rnd() * h, s, s * (0.6 + rnd() * 0.8));
  }
  g.globalAlpha = 1;
}

/** Einzeiliger Text, der in maxW passt (verkleinert, kürzt notfalls mit …). */
export function fitText(g, text, maxW, size, weight, family) {
  let s = size;
  g.font = `${weight} ${s}px ${family}`;
  while (g.measureText(text).width > maxW && s > 14) { s -= 2; g.font = `${weight} ${s}px ${family}`; }
  let out = text;
  while (g.measureText(out).width > maxW && out.length > 1) out = out.slice(0, -1);
  return out === text ? out : `${out.trimEnd()}…`;
}

/** Weicher Streifen: quer zur Streifenbreite transparent -> weiß -> transparent. */
export function softStripTexture() {
  return cached('softstrip', () => {
    const [c, g] = canvas(64, 4);
    const grad = g.createLinearGradient(0, 0, 64, 0);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 4);
    return toTexture(c);
  });
}
