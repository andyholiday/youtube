// Easter Egg 4: versteckte Notizen. Lang drücken auf ein Bild mit Notiz zeigt eine handgeschriebene Karte;
// eine kleine Büroklammer am Bild verrät, dass dort eine Notiz steckt.
import { ROT, el, showNearRoom } from './eggs-util.js';

const LONG_MS = 550;
const MOVE_PX = 10;
const CLOSE_GUARD_MS = 350;

export const noteOf = (item) => (item && typeof item.notiz === 'string' && item.notiz.trim() ? item.notiz.trim() : '');

/** Notizkarte: Papier per CSS, leicht schräg, Schließen per Tippen. Gibt eine Schließen-Funktion zurück. */
export function showNote(ctx, message) {
  const wrap = el('div', 'eggs-notiz-wrap');
  const paper = el('div', 'eggs-notiz');
  paper.setAttribute('role', 'dialog');
  paper.setAttribute('aria-label', 'Notiz');
  paper.append(el('div', 'eggs-klebeband'), el('p', 'eggs-notiz-text', message), el('p', 'eggs-notiz-fuss', 'zum Schließen tippen'));
  wrap.append(paper);
  ctx.ui.overlayRoot.append(wrap);
  ctx.setInputPaused(true);
  const opened = performance.now();
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    if (!wrap.isConnected) return;
    removeEventListener('keydown', onKey);
    wrap.classList.add('zu');
    setTimeout(() => wrap.remove(), 300);
    ctx.setInputPaused(false);
  }
  wrap.addEventListener('click', () => { if (performance.now() - opened > CLOSE_GUARD_MS) close(); });
  addEventListener('keydown', onKey);
  return close;
}

function clipTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 160;
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const path = () => {
    g.beginPath();
    g.moveTo(34, 110); g.lineTo(34, 52); g.arc(27, 52, 7, 0, Math.PI, true);
    g.lineTo(20, 124); g.arc(30, 124, 10, Math.PI, 0, true);
    g.lineTo(40, 36); g.arc(27, 36, 13, 0, Math.PI, true); g.lineTo(14, 100);
  };
  g.strokeStyle = 'rgba(40,36,44,.35)'; g.lineWidth = 8; g.save(); g.translate(2, 3); path(); g.stroke(); g.restore();
  const grad = g.createLinearGradient(14, 0, 50, 0);
  grad.addColorStop(0, '#8e949c'); grad.addColorStop(0.45, '#eef1f4'); grad.addColorStop(1, '#7d838b');
  g.strokeStyle = grad; g.lineWidth = 6; path(); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Fabrik für Büroklammern (geteilte Geometrie und Textur): clip() liefert ein neues Mesh, bereit zum Anbringen. */
export function createClipFactory(THREE) {
  const mat = new THREE.MeshBasicMaterial({ map: clipTexture(THREE), transparent: true, toneMapped: false, depthWrite: false });
  const geo = new THREE.PlaneGeometry(0.08, 0.2);
  return () => {
    const clip = new THREE.Mesh(geo, mat);
    clip.rotation.z = -0.1;
    clip.userData.noPick = true;
    return clip;
  };
}

/** Klammer an der oberen rechten Ecke eines Bildes der Größe w × h (Koordinaten der Bildgruppe). */
export function placeClip(clip, w, h) {
  clip.position.set(w / 2 - Math.min(0.24, w * 0.12), h / 2 - 0.06, 0.038);
  return clip;
}

/** Büroklammer an jedem Bild mit Notiz (pro Raum eine Gruppe, nur in der Nähe sichtbar). */
export function addClips(ctx, newClip) {
  const THREE = ctx.THREE;
  const clips = [];
  for (const room of ctx.rooms) {
    const group = new THREE.Group();
    for (const s of room.slots) {
      if (!noteOf(ctx.items[s.index])) continue;
      const holder = new THREE.Group();
      holder.position.set(s.x, s.y, s.z);
      holder.rotation.y = ROT[s.wall];
      holder.add(placeClip(newClip(), s.w, s.h));
      group.add(holder);
      clips.push(s.index);
    }
    if (group.children.length) { ctx.scene.add(group); showNearRoom(ctx, group, room.id); }
  }
  return clips;
}

/** Lang drücken auf Bilder, die der Kern nicht kennt (geheimer Raum): { hit, item }[] → Notizkarte. */
export function watchLongPress(ctx, entries) {
  const withNote = entries.filter((e) => noteOf(e.item));
  if (!withNote.length) return;
  const canvas = ctx.renderer.domElement;
  const ray = new ctx.THREE.Raycaster();
  let press = null;
  const cancel = () => { if (press) { clearTimeout(press.timer); press = null; } };
  canvas.addEventListener('pointerdown', (e) => {
    cancel();
    const x = e.clientX, y = e.clientY;
    press = { x, y, timer: setTimeout(() => {
      press = null;
      ray.setFromCamera(new ctx.THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1), ctx.camera);
      const hit = ray.intersectObjects(withNote.map((en) => en.hit), false)[0];
      const wall = hit && ctx.wallDistance(ctx.camera.position, hit.point);
      if (hit && wall === null) showNote(ctx, noteOf(withNote.find((en) => en.hit === hit.object).item));
    }, LONG_MS) };
  });
  canvas.addEventListener('pointermove', (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > MOVE_PX) cancel(); });
  for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, cancel);
}

export function installNotes(ctx, newClip, secretEntries = []) {
  ctx.onPictureLongPress((i) => {
    const message = noteOf(ctx.items[i]);
    if (message) showNote(ctx, message);
  });
  addClips(ctx, newClip);
  watchLongPress(ctx, secretEntries);
}
