// Gemeinsame Helfer der Easter Eggs: DOM, Speicher, Herzform, Sichtbarkeit nach Raum.
export const BORDEAUX = '#7a1f33';
export const ROT = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }; // +z der Gruppe zeigt in den Raum
export const OPPOSITE = { n: 's', s: 'n', e: 'w', w: 'e' };

export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** localStorage ohne Absturz (privates Fenster, gesperrt, leer). */
export const store = {
  get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); return true; } catch (e) { return false; } },
};

export const text = (v, fallback = '') => (typeof v === 'string' && v.trim() ? v.trim() : fallback);

/** Herzform mit Breite 1 und Höhe ~0,95, Spitze unten (y = -0.45). */
export function heartShape(THREE) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.45);
  s.bezierCurveTo(-0.15, -0.3, -0.5, -0.05, -0.5, 0.18);
  s.bezierCurveTo(-0.5, 0.38, -0.35, 0.5, -0.2, 0.5);
  s.bezierCurveTo(-0.08, 0.5, 0, 0.42, 0, 0.32);
  s.bezierCurveTo(0, 0.42, 0.08, 0.5, 0.2, 0.5);
  s.bezierCurveTo(0.35, 0.5, 0.5, 0.38, 0.5, 0.18);
  s.bezierCurveTo(0.5, -0.05, 0.15, -0.3, 0, -0.45);
  return s;
}

/** Herz als Körper mit abgerundeter Kante (Breite 1, Tiefe depth), Vorderseite zeigt nach +z. */
export function heartGeometry(THREE, depth = 0.28) {
  const geo = new THREE.ExtrudeGeometry(heartShape(THREE), {
    depth, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelSegments: 3, curveSegments: 18,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

/** Objekt nur zeigen, wenn der Spieler im Raum roomId oder höchstens radius Räume daneben ist. */
export function showNearRoom(ctx, obj, roomId, radius = 1) {
  const update = () => { obj.visible = Math.abs(ctx.player.room - roomId) <= radius; };
  update();
  ctx.onFrame(update);
}

/** Einmal nach dem Eintreten ins Museum (Knopf „Eintreten“) rufen; sofort, wenn schon eingetreten. */
export function whenEntered(ctx, fn) {
  let done = false;
  const go = () => { if (done) return; done = true; observer.disconnect(); fn(); };
  const observer = new MutationObserver(() => { if (document.body.classList.contains('im-saal')) go(); });
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  ctx.onRoomEnter(() => { if (document.body.classList.contains('im-saal')) go(); });
  if (document.body.classList.contains('im-saal')) go();
}

/** Ein Modul darf scheitern, ohne die übrigen Eggs mitzunehmen. */
export function guard(label, fn) {
  try { return fn(); } catch (err) { console.warn(`Easter Egg ${label} nicht geladen:`, err); return undefined; }
}

/** Position auf der Wand eines Raums: t läuft entlang, d ist der Abstand von der Wand nach innen. */
export function wallPoint(room, wall, t, d = 0) {
  return {
    n: [t, room.z0 + d], s: [t, room.z1 - d], w: [room.x0 + d, t], e: [room.x1 - d, t],
  }[wall];
}

export const wallRange = (room, wall) => (wall === 'n' || wall === 's' ? [room.x0, room.x1] : [room.z0, room.z1]);
