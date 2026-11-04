import * as THREE from 'three';
import { formatDatum } from './format.js';

const MAX_PARALLEL = 3;
const ROT = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }; // +z der Gruppe zeigt in den Raum
const PIC_Z = 0.012;

function makeEntry(slot, room, theme, item) {
  const group = new THREE.Group();
  group.position.set(slot.x, slot.y, slot.z);
  group.rotation.y = ROT[slot.wall];
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(slot.w, slot.h),
    new THREE.MeshBasicMaterial({ color: '#d9ccb4', toneMapped: false }));
  pic.position.z = PIC_Z;
  // Etwas größere, unsichtbare Fläche davor: leichter zu treffen, vor allem mit dem Finger.
  const hit = new THREE.Mesh(new THREE.PlaneGeometry(slot.w + 0.3, slot.h + 0.3),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  hit.position.z = PIC_Z + 0.02;
  hit.userData.index = slot.index;
  group.add(theme.frame(slot.w, slot.h), pic, hit);
  return { group, pic, hit, item, theme, slot, room: room.id, state: 0 };
}

/** Bilder an die Slots hängen; Texturen und Schilder entstehen erst, wenn der Raum nahe ist. */
export function createPictures(scene, rooms, themes, items) {
  const loader = new THREE.TextureLoader();
  const entries = [];
  for (const room of rooms) {
    for (const slot of room.slots) {
      const e = makeEntry(slot, room, themes[room.id], items[slot.index]);
      entries[slot.index] = e;
      scene.add(e.group);
    }
  }
  let active = 0;

  function load(e) {
    e.state = 1;
    active++;
    const plaque = e.theme.plaque(e.item.titel || '', formatDatum(e.item.datum));
    plaque.position.set(0, -(e.slot.h / 2 + 0.45), 0.02);
    e.group.add(plaque);
    loader.load(e.item.bild, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      e.pic.material.map = t;
      e.pic.material.color.set('#ffffff');
      e.pic.material.needsUpdate = true;
      e.state = 2;
      active--;
    }, undefined, () => { e.state = 3; active--; console.warn('Bild nicht ladbar:', e.item.bild); });
  }

  /** Lädt die Bilder des aktuellen Raums und seiner Nachbarn im Rundgang. */
  function updateLazy(roomId) {
    for (const e of entries) {
      if (active >= MAX_PARALLEL) return;
      if (e.state === 0 && Math.abs(e.room - roomId) <= 1) load(e);
    }
  }

  return { entries, hitMeshes: entries.map((e) => e.hit), updateLazy };
}
