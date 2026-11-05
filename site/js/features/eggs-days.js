// Easter Egg 3: besondere Tage. Steht heute ein Eintrag in geheim.tage, erscheint nach dem Eintreten eine Karte,
// danach fällt ein sanfter Herzregen und einige Porzellanherzen schweben im Startraum. Einmal pro Tag und Gerät.
import { el, heartGeometry, showNearRoom, store, whenEntered } from './eggs-util.js';

const CARD_DELAY_MS = 900;
const FLOATERS = 8;

const pad = (n) => String(n).padStart(2, '0');

/** Heute als { tag: 'MM-DD', jahr }; ?heute=MM-DD überschreibt den Tag (zum Ausprobieren). */
export function today(search = location.search, now = new Date()) {
  const given = new URLSearchParams(search).get('heute');
  const m = given && /^(\d{1,2})-(\d{1,2})$/.exec(given.trim());
  const tag = m ? `${pad(m[1])}-${pad(m[2])}` : `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return { tag, jahr: now.getFullYear(), test: !!m };
}

const normTag = (t) => {
  const m = /^(\d{1,2})[-.\/](\d{1,2})\.?$/.exec(String(t || '').trim());
  return m ? `${pad(m[1])}-${pad(m[2])}` : '';
};

/** Eintrag für heute samt aufgelöstem Text ({jahre} = aktuelles Jahr − jahr). */
export function entryFor(tage, now) {
  const e = (tage || []).find((t) => t && normTag(t.tag) === now.tag && typeof t.text === 'string' && t.text.trim());
  if (!e) return null;
  const hasYear = Number.isInteger(e.jahr);
  const jahre = hasYear ? now.jahr - e.jahr : null;
  const text = e.text.replace(/\{jahre\}/g, jahre === null ? '' : String(jahre)).replace(/ {2,}/g, ' ').trim();
  return { text };
}

const ORNAMENT = '<svg viewBox="0 0 32 29" aria-hidden="true"><path d="M16 28C5 20 1 14 1 8.5 1 4 4.5 1 8.5 1 11.7 1 14.5 2.8 16 6 17.5 2.8 20.3 1 23.5 1 27.5 1 31 4 31 8.5 31 14 27 20 16 28Z"/></svg>';

function showCard(ctx, message, onClose) {
  const wrap = el('div', 'eggs-karte-wrap');
  const card = el('div', 'eggs-karte');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  const orn = el('div', 'eggs-orn');
  orn.innerHTML = ORNAMENT;
  const body = el('p', 'eggs-karte-text', message);
  const btn = el('button', 'eggs-knopf', 'Weiter');
  btn.type = 'button';
  card.append(orn, body, btn);
  wrap.append(card);
  ctx.ui.overlayRoot.append(wrap);
  ctx.setInputPaused(true);
  btn.focus({ preventScroll: true });
  btn.addEventListener('click', () => {
    wrap.classList.add('zu');
    setTimeout(() => wrap.remove(), 450);
    ctx.setInputPaused(false);
    onClose();
  });
  return wrap;
}

/** Porzellanherzen, die vor dem Startblick schweben (nur an besonderen Tagen). */
function addFloaters(ctx, p) {
  const THREE = ctx.THREE;
  const geo = heartGeometry(THREE, 0.3);
  const mats = [[0xffffff, 0.5], [0xf6c9d3, 0.4], [0xb0304c, 0.35], [0x8f2540, 0.3], [0xf6c9d3, 0.4]].map(([color, glow]) => new THREE.MeshPhongMaterial({
    color, specular: 0xffffff, shininess: 80, emissive: color, emissiveIntensity: glow,
  }));
  const group = new THREE.Group();
  const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  const hearts = Array.from({ length: FLOATERS }, (_, i) => {
    const forward = 3.2 + (i % 4) * 1.3, side = ((i * 2.3) % 5) - 2.5, y = 2.1 + ((i * 0.77) % 2.2);
    const mesh = new THREE.Mesh(geo, mats[i % mats.length]);
    mesh.position.set(p.x + fx * forward + rx * side, y, p.z + fz * forward + rz * side);
    mesh.userData = { y, ph: i * 1.3, size: 0.26 + (i % 3) * 0.07, noPick: true };
    group.add(mesh);
    return mesh;
  });
  ctx.scene.add(group);
  showNearRoom(ctx, group, 0);
  let t = 0;
  ctx.onFrame((dt) => {
    t += dt;
    for (const m of hearts) {
      const k = Math.min(1, t / 1.6); // sanft einblenden: wachsen
      m.scale.setScalar(m.userData.size * k);
      m.position.y = m.userData.y + Math.sin(t * 0.9 + m.userData.ph) * 0.12;
      m.rotation.y = t * 0.5 + m.userData.ph;
      m.rotation.z = Math.sin(t * 0.7 + m.userData.ph) * 0.12;
    }
  });
  return group;
}

/** Karte (einmal pro Tag und Gerät) samt Festdeko. */
export function installDays(ctx, geheim, rain) {
  const now = today();
  const entry = entryFor(geheim.tage, now);
  if (!entry) return null;
  const start = { x: ctx.player.x, z: ctx.player.z, yaw: ctx.player.yaw };
  const key = `museum.tag.${now.jahr}-${now.tag}`;
  const params = new URLSearchParams(location.search);
  if (store.get(key) && !params.has('neu')) return { entry, shown: false };
  whenEntered(ctx, () => {
    setTimeout(() => {
      store.set(key, '1');
      showCard(ctx, entry.text, () => {
        rain.start({ seconds: 5, count: 55 });
        addFloaters(ctx, start);
      });
    }, CARD_DELAY_MS);
  });
  return { entry, shown: true };
}
