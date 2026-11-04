import * as THREE from 'three';
import { formatDatum } from './format.js';

const MAX_PARALLEL = 3;
const LOAD_RADIUS = 1; // Texturen werden für den aktuellen Raum und seine Nachbarn im Rundgang geladen
const KEEP_RADIUS = 2; // weiter entfernte Räume: Texturen freigeben, Gruppe ausblenden
const FADE_S = 0.6;
const ROT = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }; // +z der Gruppe zeigt in den Raum
const PIC_Z = 0.012;
const EMPTY = 0, LOADING = 1, LOADED = 2, FAILED = 3;

function makeEntry(slot, room, theme, item) {
  const group = new THREE.Group();
  group.position.set(slot.x, slot.y, slot.z);
  group.rotation.y = ROT[slot.wall];
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(slot.w, slot.h),
    new THREE.MeshBasicMaterial({ color: '#d9ccb4', toneMapped: false }));
  pic.position.z = PIC_Z;
  pic.visible = false; // erscheint erst, wenn das Bild geladen ist (Fade-in)
  // Etwas größere, unsichtbare Fläche davor: leichter zu treffen, vor allem mit dem Finger.
  const hit = new THREE.Mesh(new THREE.PlaneGeometry(slot.w + 0.3, slot.h + 0.3),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  hit.position.z = PIC_Z + 0.02;
  hit.userData.index = slot.index;
  group.add(theme.frame(slot.w, slot.h), pic, hit);
  return { group, pic, hit, item, theme, slot, room: room.id, state: EMPTY, gen: 0, plaque: null, fade: 1 };
}

const hasLight = (obj) => { let found = false; obj.traverse((o) => { if (o.isLight) found = true; }); return found; };

/**
 * Blendet Wände und Deko eines Raums ein/aus. Lichter bleiben an: Ändert sich die Lichtzahl, baut three.js
 * alle Shader neu (Ruckler), und die Lichter der Nachbarräume gehören zum gewohnten Look.
 */
function setRoomShown(ctx, r, shown) {
  if (ctx.shown[r] === shown) return;
  ctx.shown[r] = shown;
  for (const c of ctx.themes[r].group.children) if (!hasLight(c)) c.visible = shown;
}

function disposeObject(obj) {
  obj.traverse((o) => { if (o.material && o.material.map) o.material.map.dispose(); });
}

function addPlaque(e) {
  const titel = e.item.titel || '';
  const datum = formatDatum(e.item.datum);
  if (!titel && !datum) return; // nichts zu beschriften
  e.plaque = e.theme.plaque(titel, datum);
  e.plaque.position.set(0, -(e.slot.h / 2 + 0.45), 0.02);
  e.group.add(e.plaque);
}

/** Geladene Textur aufs Bild legen; das Bild blendet danach ein (update). */
function show(ctx, e, texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const m = e.pic.material;
  m.map = texture;
  m.color.set('#ffffff');
  m.transparent = true;
  m.opacity = 0;
  m.needsUpdate = true;
  e.pic.visible = true;
  e.fade = 0;
  ctx.fading.add(e);
}

function load(ctx, e) {
  const gen = ++e.gen;
  e.state = LOADING;
  ctx.active++;
  addPlaque(e);
  ctx.loader.load(e.item.bild, (t) => {
    ctx.active--;
    if (e.gen !== gen) { t.dispose(); return; } // inzwischen wieder freigegeben
    show(ctx, e, t);
    e.state = LOADED;
  }, undefined, () => {
    ctx.active--;
    if (e.gen !== gen) return;
    e.state = FAILED;
    e.pic.visible = true; // beiger Platzhalter, damit der Rahmen nicht leer wirkt
    console.warn('Bild nicht ladbar:', e.item.bild);
  });
}

/** Gibt Textur und Schild frei; ein noch laufender Ladevorgang wird verworfen. */
function unload(ctx, e) {
  e.gen++;
  const m = e.pic.material;
  if (m.map) m.map.dispose();
  m.map = null;
  m.color.set('#d9ccb4');
  m.transparent = false;
  m.opacity = 1;
  m.needsUpdate = true;
  e.pic.visible = false;
  ctx.fading.delete(e);
  if (e.plaque) { disposeObject(e.plaque); e.group.remove(e.plaque); e.plaque = null; }
  e.state = EMPTY;
}

/** Lädt Bilder nahe am Raum, gibt entfernte frei und blendet entfernte Räume aus. */
function updateLazy(ctx, roomId) {
  ctx.themes.forEach((_, r) => setRoomShown(ctx, r, Math.abs(r - roomId) <= KEEP_RADIUS));
  for (const e of ctx.entries) {
    const dist = Math.abs(e.room - roomId);
    e.group.visible = dist <= KEEP_RADIUS;
    if (dist > KEEP_RADIUS && e.state !== EMPTY) unload(ctx, e);
  }
  for (const e of ctx.entries) {
    if (ctx.active >= MAX_PARALLEL) return;
    if (e.state === EMPTY && Math.abs(e.room - roomId) <= LOAD_RADIUS) load(ctx, e);
  }
}

/** Einblenden der frisch geladenen Bilder; pro Frame mit der Frame-Zeit aufrufen. */
function fadeIn(ctx, dt) {
  for (const e of ctx.fading) {
    e.fade = Math.min(1, e.fade + dt / FADE_S);
    const m = e.pic.material;
    m.opacity = e.fade;
    if (e.fade >= 1) { m.transparent = false; m.needsUpdate = true; ctx.fading.delete(e); }
  }
}

/** Wartet, bis die Bilder eines Raums geladen sind (oder die Zeit abläuft), damit der erste Blick nicht leer ist. */
function preload(ctx, roomId, maxMs) {
  const mine = ctx.entries.filter((e) => e.room === roomId);
  const t0 = performance.now();
  return new Promise((resolve) => {
    const tick = () => {
      updateLazy(ctx, roomId);
      const done = mine.every((e) => e.state === LOADED || e.state === FAILED);
      if (done || performance.now() - t0 > maxMs) resolve();
      else setTimeout(tick, 80);
    };
    tick();
  });
}

/** Bilder an die Slots hängen; Texturen und Schilder entstehen erst, wenn der Raum nahe ist. */
export function createPictures(scene, rooms, themes, items) {
  const entries = [];
  for (const room of rooms) {
    for (const slot of room.slots) {
      const e = makeEntry(slot, room, themes[room.id], items[slot.index]);
      entries[slot.index] = e;
      scene.add(e.group);
    }
  }
  const ctx = { entries, themes, shown: [], loader: new THREE.TextureLoader(), active: 0, fading: new Set() };
  return {
    entries,
    roomShown: (r) => ctx.shown[r] !== false,
    hitMeshes: entries.map((e) => e.hit),
    updateLazy: (roomId) => updateLazy(ctx, roomId),
    update: (dt) => fadeIn(ctx, dt),
    preload: (roomId, maxMs) => preload(ctx, roomId, maxMs),
  };
}
