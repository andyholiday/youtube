// Inhalt des geheimen Raums: Bilder aus geheim.raum (mit Großansicht) oder, ohne Bilder, eine Tafel mit geheim.raumtext.
import { frame, plaque } from '../themes/geheim.js';
import { formatDatum } from '../format.js';
import { BORDEAUX, ROT, OPPOSITE, el, heartGeometry, showNearRoom, wallPoint, wallRange } from './eggs-util.js';
import { noteOf, placeClip } from './eggs-notes.js';

const PIC_Y = 2.2;
const MAX_W = 1.1;
const MAX_H = 1.35;
const MAX_PICS = 7;
const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';

// Lage der Bilder je Anzahl: [Wand-Art, Versatz von der Wandmitte]. far = Wand gegenüber der Tür, a/b = Seitenwände.
const FAR3 = [['far', -1.85], ['far', 0], ['far', 1.85]];
const LAYOUTS = {
  1: [['far', 0]],
  2: [['far', -1.1], ['far', 1.1]],
  3: FAR3,
  4: [['far', -1.1], ['far', 1.1], ['a', 0], ['b', 0]],
  5: [...FAR3, ['a', 0], ['b', 0]],
  6: [['far', -1.1], ['far', 1.1], ['a', -1.2], ['a', 1.2], ['b', -1.2], ['b', 1.2]],
  7: [...FAR3, ['a', -1.2], ['a', 1.2], ['b', -1.2], ['b', 1.2]],
};

/** Wandnamen: far = gegenüber der Tür, a und b = die Seitenwände. */
function wallsOf(room) {
  const doorWall = room.doors[0].wall;
  const far = OPPOSITE[doorWall];
  const sides = ['n', 'e', 's', 'w'].filter((w) => w !== doorWall && w !== far);
  return { far, a: sides[0], b: sides[1] };
}

export function picSize(item) {
  const a = item.breite > 0 && item.hoehe > 0 ? item.breite / item.hoehe : 4 / 3;
  const w = Math.min(MAX_W, MAX_H * a);
  return { w: Math.round(w * 100) / 100, h: Math.round((w / a) * 100) / 100 };
}

function makeSpot(room, wall, t, item) {
  const { w, h } = picSize(item);
  const mid = (wallRange(room, wall)[0] + wallRange(room, wall)[1]) / 2;
  const [x, z] = wallPoint(room, wall, mid + t, 0);
  return { x, z, wall, w, h };
}

function buildPicture(ctx, spot, item, index, newClip) {
  const THREE = ctx.THREE;
  const group = new THREE.Group();
  group.position.set(spot.x, PIC_Y, spot.z);
  group.rotation.y = ROT[spot.wall];
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(spot.w, spot.h), new THREE.MeshBasicMaterial({ color: '#e5d8c4', toneMapped: false }));
  pic.position.z = 0.012;
  const hit = new THREE.Mesh(new THREE.PlaneGeometry(spot.w + 0.3, spot.h + 0.3), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  hit.position.z = 0.034;
  group.add(frame(spot.w, spot.h), pic, hit);
  if (noteOf(item)) group.add(placeClip(newClip(), spot.w, spot.h));
  const titel = String(item.titel || '').trim();
  const datum = formatDatum(item.datum);
  if (titel || datum) {
    const tag = plaque(titel, datum);
    tag.position.set(0, -(spot.h / 2 + 0.4), 0.045);
    group.add(tag);
  }
  ctx.scene.add(group);
  return { group, pic, hit, item, index, loaded: false };
}

/** Bilder erst laden, wenn man dem geheimen Raum nahe kommt (Handy schonen). */
function loadLazily(ctx, room, pics) {
  const loader = new ctx.THREE.TextureLoader();
  let started = false;
  const start = () => {
    started = true;
    for (const p of pics) {
      loader.load(p.item.bild, (tex) => {
        tex.colorSpace = ctx.THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        p.pic.material.map = tex;
        p.pic.material.color.set('#ffffff');
        p.pic.material.needsUpdate = true;
        p.loaded = true;
      }, undefined, () => console.warn('Geheimes Bild nicht ladbar:', p.item.bild));
    }
  };
  ctx.onFrame(() => { if (!started && Math.abs(ctx.player.room - room.id) <= 1) start(); });
}

/** Eigene Großansicht (die normale Großansicht gehört nur den Erinnerungen im Rundgang). */
export function openViewer(ctx, item) {
  const box = el('div', 'eggs-viewer');
  const card = el('article', 'eggs-viewer-karte');
  const img = el('img', 'eggs-viewer-bild');
  img.alt = item.titel || '';
  img.src = item.bild;
  const info = el('div', 'eggs-viewer-info');
  const titel = String(item.titel || '').trim();
  const datum = formatDatum(item.datum);
  if (titel) info.append(el('h2', null, titel));
  if (datum) info.append(el('p', 'eggs-datum', datum));
  if (item.text) info.append(el('p', 'eggs-viewer-text', item.text));
  const close = el('button', 'eggs-schliessen', '×');
  close.type = 'button';
  close.setAttribute('aria-label', 'Schließen');
  const actions = el('div', 'lb-aktionen');
  info.append(actions);
  card.append(img, info);
  box.append(card, close);
  const opened = performance.now();
  const done = () => { box.remove(); removeEventListener('keydown', onKey); ctx.setInputPaused(false); };
  const onKey = (e) => { if (e.key === 'Escape') done(); };
  box.addEventListener('click', (e) => { if (e.target !== card && !card.contains(e.target) && performance.now() - opened > 300) done(); });
  close.addEventListener('click', done);
  addEventListener('keydown', onKey);
  ctx.ui.overlayRoot.append(box);
  ctx.setInputPaused(true);
  if (ctx.viewerOpened) ctx.viewerOpened(item, actions); // Zusatzknöpfe (Verwaltung) wie in der normalen Großansicht
  return done;
}

function boardTexture(THREE, message) {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#f7efe2'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(122,31,51,.5)'; g.lineWidth = 3; g.strokeRect(22, 22, W - 44, H - 44);
  g.strokeStyle = 'rgba(201,164,92,.8)'; g.lineWidth = 2; g.strokeRect(34, 34, W - 68, H - 68);
  g.fillStyle = BORDEAUX; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `italic 600 58px ${SERIF}`;
  const words = message.split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (g.measureText(`${cur} ${w}`.trim()).width > W - 150 && cur) { lines.push(cur); cur = w; } else cur = `${cur} ${w}`.trim();
  }
  lines.push(cur);
  const top = H / 2 - ((lines.length - 1) * 39) - 14;
  lines.slice(0, 4).forEach((l, i) => g.fillText(l, W / 2, top + i * 78));
  g.fillStyle = BORDEAUX;
  g.save(); g.translate(W / 2, H - 80); g.scale(36, 36);
  g.beginPath(); g.moveTo(0, 0.45);
  g.bezierCurveTo(-0.15, 0.3, -0.5, 0.05, -0.5, -0.18); g.bezierCurveTo(-0.5, -0.38, -0.35, -0.5, -0.2, -0.5);
  g.bezierCurveTo(-0.08, -0.5, 0, -0.42, 0, -0.32); g.bezierCurveTo(0, -0.42, 0.08, -0.5, 0.2, -0.5);
  g.bezierCurveTo(0.35, -0.5, 0.5, -0.38, 0.5, -0.18); g.bezierCurveTo(0.5, 0.05, 0.15, 0.3, 0, 0.45);
  g.fill(); g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Tafel (gerahmt) über dem Sofa, wenn keine Bilder da sind. */
function buildBoard(ctx, room, message) {
  const THREE = ctx.THREE;
  const { far } = wallsOf(room);
  const mid = (wallRange(room, far)[0] + wallRange(room, far)[1]) / 2;
  const [x, z] = wallPoint(room, far, mid, 0);
  const group = new THREE.Group();
  group.position.set(x, 2.35, z);
  group.rotation.y = ROT[far];
  const w = 1.9, h = 0.95;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: boardTexture(THREE, message), toneMapped: false }));
  face.position.z = 0.012;
  group.add(frame(w, h), face);
  ctx.scene.add(group);
  return group;
}

/** Kleines Porzellanherz mit Goldrand über dem Sofa, wenn Bilder an den Wänden hängen. */
function buildMedallion(ctx, room) {
  const THREE = ctx.THREE;
  const { far } = wallsOf(room);
  const mid = (wallRange(room, far)[0] + wallRange(room, far)[1]) / 2;
  const [x, z] = wallPoint(room, far, mid, 0);
  const group = new THREE.Group();
  group.position.set(x, 2.35, z);
  group.rotation.y = ROT[far];
  const gold = new THREE.Mesh(heartGeometry(THREE, 0.14), new THREE.MeshPhongMaterial({ color: 0xc9a45c, specular: 0xffe9b8, shininess: 55 }));
  gold.scale.setScalar(0.3);
  gold.position.z = 0.05;
  const enamel = new THREE.Mesh(heartGeometry(THREE, 0.14), new THREE.MeshPhongMaterial({ color: BORDEAUX, specular: 0x886666, shininess: 70 }));
  enamel.scale.setScalar(0.25);
  enamel.position.z = 0.065;
  group.add(gold, enamel);
  ctx.scene.add(group);
  return group;
}

/** Hängt Bilder bzw. Tafel in den geheimen Raum. entries: [{ item, hit }] für Tipp und Lang-Drücken. */
export function installRoomContent(ctx, room, geheim, newClip) {
  const items = geheim.raum.filter((it) => it && typeof it.bild === 'string').slice(0, MAX_PICS);
  const holder = new ctx.THREE.Group();
  ctx.scene.add(holder);
  if (!items.length) {
    holder.add(buildBoard(ctx, room, geheim.raumtext));
    showNearRoom(ctx, holder, room.id);
    return [];
  }
  const walls = wallsOf(room);
  const layout = LAYOUTS[items.length];
  const pics = items.map((item, i) => {
    const [kind, t] = layout[i];
    const p = buildPicture(ctx, makeSpot(room, walls[kind], t, item), item, i, newClip);
    ctx.onObjectTap(p.hit, () => { if (Math.abs(ctx.player.room - room.id) <= 1) openViewer(ctx, item); });
    holder.add(p.group);
    return p;
  });
  if (!layout.some(([kind, t]) => kind === 'far' && t === 0)) holder.add(buildMedallion(ctx, room));
  showNearRoom(ctx, holder, room.id);
  loadLazily(ctx, room, pics);
  return pics;
}
