import * as THREE from 'three';
import { HALL_W, PIC_Y, slotFor, fitSize } from './layout.js';
import { formatDatum } from './format.js';
import { plaqueTexture } from './textures.js';

const LOAD_DIST = 16;
const MAX_PARALLEL = 3;
const MAT_PAD = 0.18;
const BAR = 0.1;

function shared() {
  return {
    mat: new THREE.MeshLambertMaterial({ color: '#efe6d2' }),
    frame: new THREE.MeshLambertMaterial({ color: '#7a5230' }),
    brass: new THREE.MeshLambertMaterial({ color: '#b8923f' }),
    lamp: new THREE.MeshBasicMaterial({ color: '#fff1c7' }),
  };
}

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function addFrame(group, w, h, mats) {
  const iw = w + MAT_PAD * 2;
  const ih = h + MAT_PAD * 2;
  group.add(box(iw + BAR * 2, BAR, 0.09, mats.frame, 0, ih / 2 + BAR / 2, 0.045));
  group.add(box(iw + BAR * 2, BAR, 0.09, mats.frame, 0, -ih / 2 - BAR / 2, 0.045));
  group.add(box(BAR, ih, 0.09, mats.frame, -iw / 2 - BAR / 2, 0, 0.045));
  group.add(box(BAR, ih, 0.09, mats.frame, iw / 2 + BAR / 2, 0, 0.045));
  const top = ih / 2 + BAR + 0.12;
  group.add(box(0.7, 0.05, 0.1, mats.brass, 0, top, 0.14));
  group.add(box(0.5, 0.012, 0.06, mats.lamp, 0, top - 0.04, 0.16));
  group.add(box(0.03, 0.14, 0.03, mats.brass, 0, top - 0.08, 0.1));
}

function makeEntry(item, i, length, mats, glowTex) {
  const { w, h } = fitSize(item.breite, item.hoehe);
  const { side, z } = slotFor(i, length);
  const group = new THREE.Group();
  group.position.set(side * HALL_W / 2, PIC_Y, z);
  group.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;

  const hit = new THREE.Mesh(new THREE.PlaneGeometry(w + MAT_PAD * 2, h + MAT_PAD * 2), mats.mat);
  hit.position.z = 0.012;
  hit.userData.index = i;
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color: '#d9ccb4' }));
  pic.position.z = 0.025;
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.25),
    new THREE.MeshLambertMaterial({ color: '#b8923f' }));
  plaque.position.set(0, -(h / 2 + MAT_PAD + BAR + 0.2), 0.03);
  const wash = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.5 + 1.6, h * 1.5 + 1.8),
    new THREE.MeshBasicMaterial({ map: glowTex, color: '#ffd29a', transparent: true, opacity: 0.32,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  wash.position.set(0, 0.2, 0.006);
  group.add(wash, hit, pic, plaque);
  addFrame(group, w, h, mats);
  return { group, hit, pic, plaque, item, z, state: 0 };
}

/** Bilder aufhängen; Texturen werden erst nahe der Kamera geladen. */
export function createPictures(scene, items, length, glowTex) {
  const mats = shared();
  const loader = new THREE.TextureLoader();
  const entries = items.map((item, i) => makeEntry(item, i, length, mats, glowTex));
  entries.forEach((e) => scene.add(e.group));
  let active = 0;

  function load(e) {
    e.state = 1;
    active++;
    e.plaque.material.map = plaqueTexture(e.item.titel || '', formatDatum(e.item.datum));
    e.plaque.material.color.set('#ffffff');
    e.plaque.material.needsUpdate = true;
    loader.load(e.item.bild, (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      e.pic.material.map = t;
      e.pic.material.color.set('#fff6ec');
      e.pic.material.needsUpdate = true;
      e.state = 2;
      active--;
    }, undefined, () => { e.state = 3; active--; console.warn('Bild nicht ladbar:', e.item.bild); });
  }

  function updateLazy(camZ) {
    for (const e of entries) {
      if (active >= MAX_PARALLEL) return;
      if (e.state === 0 && Math.abs(e.z - camZ) < LOAD_DIST) load(e);
    }
  }

  return { entries, hitMeshes: entries.map((e) => e.hit), updateLazy };
}
