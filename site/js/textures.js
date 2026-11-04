import * as THREE from 'three';

const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';

function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function floorTexture() {
  const [c, g] = canvas(512, 512);
  const rnd = rng(7);
  const planks = 6;
  const pw = 512 / planks;
  for (let i = 0; i < planks; i++) {
    let y = -rnd() * 100;
    while (y < 512) {
      const h = 260 + rnd() * 250;
      g.fillStyle = `hsl(${23 + rnd() * 5},${44 + rnd() * 8}%,${32 + rnd() * 4}%)`;
      g.fillRect(i * pw, y, pw, h);
      for (let k = 0; k < 16; k++) {
        g.strokeStyle = `rgba(50,25,8,${0.05 + rnd() * 0.1})`;
        const x = i * pw + rnd() * pw;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 8, y + h); g.stroke();
      }
      g.fillStyle = 'rgba(25,12,4,.45)';
      g.fillRect(i * pw, y, pw, 2);
      y += h;
    }
    g.fillStyle = 'rgba(25,12,4,.65)';
    g.fillRect(i * pw, 0, 2, 512);
  }
  return tex(c, true);
}

export function wallTexture() {
  const [c, g] = canvas(256, 256);
  const rnd = rng(3);
  g.fillStyle = '#e3cfae'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '120,90,50' : '255,245,225'},${0.03 + rnd() * 0.05})`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  return tex(c, true);
}

/** Holzvertäfelung mit Füllungen; eine Kachel = 1 m breit. */
export function panelTexture() {
  const [c, g] = canvas(256, 256);
  const rnd = rng(11);
  g.fillStyle = '#5a3a24'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(30,14,6,${0.08 + rnd() * 0.12})`;
    const x = rnd() * 256;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rnd() - 0.5) * 10, 256); g.stroke();
  }
  g.fillStyle = '#6b4630'; g.fillRect(24, 24, 208, 208);
  g.strokeStyle = 'rgba(20,8,2,.7)'; g.lineWidth = 4; g.strokeRect(24, 24, 208, 208);
  g.strokeStyle = 'rgba(255,220,170,.18)'; g.lineWidth = 2; g.strokeRect(30, 30, 196, 196);
  return tex(c, true);
}

export function glowTexture() {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return tex(c, false);
}

function fitText(g, text, maxW, size, weight) {
  let s = size;
  g.font = `${weight} ${s}px ${SERIF}`;
  while (g.measureText(text).width > maxW && s > 16) { s -= 2; g.font = `${weight} ${s}px ${SERIF}`; }
  let out = text;
  while (g.measureText(out).width > maxW && out.length > 1) out = out.slice(0, -1);
  return out === text ? out : `${out.trimEnd()}…`;
}

/** Messingschild mit Titel und Datum. */
export function plaqueTexture(titel, datum) {
  const [c, g] = canvas(384, 96);
  const grad = g.createLinearGradient(0, 0, 0, 96);
  grad.addColorStop(0, '#d8b66e'); grad.addColorStop(1, '#a8843f');
  g.fillStyle = grad; g.fillRect(0, 0, 384, 96);
  g.strokeStyle = 'rgba(70,45,10,.6)'; g.lineWidth = 3; g.strokeRect(5, 5, 374, 86);
  g.fillStyle = '#2b1a0c'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const hasDate = Boolean(datum);
  const t = fitText(g, titel, 340, 32, 'bold');
  g.fillText(t, 192, hasDate ? 36 : 48);
  if (hasDate) {
    g.font = `italic 24px ${SERIF}`;
    g.fillText(datum, 192, 72);
  }
  return tex(c, false);
}
