import * as THREE from 'three';
import { HALL_W, HALL_H, SLOT, ENTRY_MARGIN, slotCount } from './layout.js';
import { floorTexture, wallTexture, panelTexture, glowTexture } from './textures.js';

const DADO = 0.5;
const WOOD = '#3b2314';

function repeated(tex, rx, ry) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

function lambert(opts) {
  return new THREE.MeshLambertMaterial(opts);
}

/** Eine Wand: Putz oben, Vertäfelung unten, Handlauf und Fußleiste. Blickrichtung +z (lokal). */
function makeWall(w, tex) {
  const g = new THREE.Group();
  const plaster = new THREE.Mesh(new THREE.PlaneGeometry(w, HALL_H - DADO),
    lambert({ map: repeated(tex.wall, w / 2, (HALL_H - DADO) / 2) }));
  plaster.position.y = DADO + (HALL_H - DADO) / 2;
  const dado = new THREE.Mesh(new THREE.PlaneGeometry(w, DADO),
    lambert({ map: repeated(tex.panel, w, 0.5) }));
  dado.position.y = DADO / 2;
  const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.07, 0.1), lambert({ color: WOOD }));
  rail.position.set(0, DADO + 0.035, 0.04);
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, 0.05), lambert({ color: WOOD }));
  base.position.set(0, 0.07, 0.02);
  g.add(plaster, dado, rail, base);
  return g;
}

function placeWall(scene, tex, w, x, z, rotY) {
  const wall = makeWall(w, tex);
  wall.position.set(x, 0, z);
  wall.rotation.y = rotY;
  scene.add(wall);
}

function addShell(scene, length, tex) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, length),
    lambert({ map: repeated(tex.floor, 4, length / 2) }));
  floor.rotation.x = -Math.PI / 2;
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, length), lambert({ color: '#8c7358' }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = HALL_H;
  scene.add(floor, ceiling);
  placeWall(scene, tex, length, -HALL_W / 2, 0, Math.PI / 2);
  placeWall(scene, tex, length, HALL_W / 2, 0, -Math.PI / 2);
  placeWall(scene, tex, HALL_W, 0, -length / 2, 0);
  placeWall(scene, tex, HALL_W, 0, length / 2, Math.PI);
}

function addBeamsAndLamps(scene, length, slots, glow) {
  const beamMat = lambert({ color: WOOD });
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#ffe2a8' });
  const glowMat = new THREE.SpriteMaterial({ map: glow, color: '#ffc880', blending: THREE.AdditiveBlending,
    transparent: true, opacity: 0.55, depthWrite: false });
  for (let k = 0; k <= slots; k++) {
    const z = length / 2 - ENTRY_MARGIN - k * SLOT;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(HALL_W, 0.22, 0.28), beamMat);
    beam.position.set(0, HALL_H - 0.11, z);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), bulbMat);
    bulb.position.set(0, HALL_H - 0.6, z - SLOT / 2);
    const sprite = new THREE.Sprite(glowMat);
    sprite.scale.set(1.1, 1.1, 1);
    sprite.position.copy(bulb.position);
    scene.add(beam, bulb, sprite);
  }
}

function heartShape() {
  const s = new THREE.Shape();
  s.moveTo(0.5, 0.5);
  s.bezierCurveTo(0.5, 0.5, 0.4, 0, 0, 0);
  s.bezierCurveTo(-0.6, 0, -0.6, 0.7, -0.6, 0.7);
  s.bezierCurveTo(-0.6, 1.1, -0.3, 1.54, 0.5, 1.9);
  s.bezierCurveTo(1.2, 1.54, 1.6, 1.1, 1.6, 0.7);
  s.bezierCurveTo(1.6, 0.7, 1.6, 0, 1, 0);
  s.bezierCurveTo(0.7, 0, 0.5, 0.5, 0.5, 0.5);
  return s;
}

/** Dezentes leuchtendes Herz an der Stirnwand. Gibt das Mesh zurück (pulsiert in main). */
function addHeart(scene, length, glow) {
  const geo = new THREE.ExtrudeGeometry(heartShape(), { depth: 0.18, bevelEnabled: true,
    bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3, curveSegments: 16 });
  geo.center();
  const heart = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: '#d6304f', emissive: '#a01232', emissiveIntensity: 0.9, roughness: 0.4, fog: false }));
  heart.scale.setScalar(0.62);
  heart.rotation.z = Math.PI; // Shape ist kopfüber definiert
  heart.position.set(0, 2.2, -length / 2 + 0.25);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({
    map: glow, color: '#ff5a7e', blending: THREE.AdditiveBlending, transparent: true,
    opacity: 0.45, depthWrite: false, fog: false }));
  halo.position.set(0, 2.2, -length / 2 + 0.06);
  scene.add(heart, halo);
  return heart;
}

export function addLights(scene, camera) {
  scene.add(new THREE.HemisphereLight(0xfff0dc, 0x6b4a30, 1.5));
  const lantern = new THREE.PointLight(0xffd9a8, 9, 16, 1.8);
  lantern.position.set(0, 0.3, 0);
  camera.add(lantern);
  scene.add(camera);
}

export function buildHall(scene, length, count) {
  const tex = { floor: floorTexture(), wall: wallTexture(), panel: panelTexture() };
  const glow = glowTexture();
  addShell(scene, length, tex);
  addBeamsAndLamps(scene, length, slotCount(count), glow);
  return { heart: addHeart(scene, length, glow), glow };
}
