// Paar-Ansicht (Third Person): zwei Porzellanfiguren Hand in Hand, Kamera dahinter. Schnittstelle: .planning/SPEC-FEATURES.md
import { createFigures } from './figures.js';

const STORE_KEY = 'museum-ansicht';
const DIST = 3.2; // Abstand der Kamera hinter den Figuren
const HEIGHT = 1.9; // Kamerahöhe
const PIVOT_Y = 1.5; // Kopfhöhe: von hier aus wird auf Wände geprüft
const LOOK_AHEAD = 1.2; // Blickziel liegt etwas vor den Figuren
const LOOK_Y = 1.2;
const WALL_MARGIN = 0.4; // Mindestabstand der Kamera zur Wand
const SIDE_RAY = 0.3; // seitliche Prüfstrahlen gegen Ecken und Türpfosten
const SIDE_MARGIN = 0.25;
const SIDE_PASSES = 5;
const FADE_NEAR = 0.5; // unter diesem Kameraabstand sind die Figuren unsichtbar
const FADE_FAR = 1.5; // ab diesem voll sichtbar
const BLEND_S = 0.5;
const LIFT = 0.5; // je näher an der Wand, desto höher: Blick leicht von oben auf das Paar
const MOVE_MIN = 0.3; // m/s, ab dem die Figuren in Laufrichtung drehen
const TELEPORT = 9; // m/s: größere Sprünge sind keine Bewegung

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (t) => t * t * (3 - 2 * t);
const smooth = (tau, dt) => 1 - Math.exp(-dt / tau);

function readView() {
  try { return localStorage.getItem(STORE_KEY) === 'paar' ? 'paar' : 'ich'; } catch (e) { return 'ich'; }
}

function saveView(view) {
  try { localStorage.setItem(STORE_KEY, view); } catch (e) { /* privater Modus: Wahl wird nicht gemerkt */ }
}

const ICON = '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">'
  + '<circle cx="10" cy="6.8" r="3.6" stroke="none"/><circle cx="23" cy="11.2" r="3.1" stroke="none"/>'
  + '<path d="M4.5 28V17.6a5.5 5.5 0 0 1 11 0V28z" stroke="none"/>'
  + '<path d="M23 15.6c-3.2 0-5 1.8-5.6 4.4L16.6 28h12.8l-1.2-8c-.6-2.6-2.2-4.4-5.2-4.4z" stroke="none"/>'
  + '<path d="M13.5 21.5h6" stroke-width="2.6" stroke-linecap="round" fill="none"/></svg>';

function createButton(hud, onToggle) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tp-knopf';
  btn.setAttribute('aria-label', 'Paar-Ansicht');
  btn.title = 'Paar-Ansicht (V)';
  btn.innerHTML = ICON;
  btn.addEventListener('click', (e) => {
    onToggle();
    if (e.detail > 0) btn.blur(); // Maus/Finger: kein Fokusring, wenn danach mit Tasten gelaufen wird
  });
  hud.appendChild(btn);
  return btn;
}

function isTyping(e) {
  const t = e.target;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

/** Wandkollision der Kamera: Anteil (0..1) der Strecke Pivot→Wunschposition, der frei ist. */
function freeFraction(ctx, pivot, want, side) {
  const { THREE } = ctx;
  const end = new THREE.Vector3();
  const hitAt = (to) => ctx.wallDistance(pivot, to);
  const full = pivot.distanceTo(want);
  const hit = hitAt(want);
  let f = hit === null || hit === undefined ? 1 : Math.max(0, (hit - WALL_MARGIN) / full);
  for (let i = 0; i < SIDE_PASSES; i++) { // seitlich Luft lassen: Türpfosten, Ecken
    let clear = true;
    for (const k of [-1, 1]) {
      end.lerpVectors(pivot, want, f).addScaledVector(side, k * SIDE_RAY);
      const h = hitAt(end);
      if (h === null || h === undefined) continue;
      clear = false;
      f = Math.max(0, f * (h - SIDE_MARGIN) / pivot.distanceTo(end));
    }
    if (clear) return Math.min(1, f);
  }
  return Math.min(1, f) * 0.5; // trotz Nachrücken nicht frei: lieber näher heran
}

function createState(ctx, figures) {
  const { THREE, player } = ctx;
  const view = readView();
  return {
    ctx, figures, view, blend: view === 'paar' ? 1 : 0,
    cam: { az: player.yaw, frac: 1, fresh: true },
    body: { heading: player.yaw, x: player.x, z: player.z, speed: 0 },
    v: { pivot: new THREE.Vector3(), want: new THREE.Vector3(), side: new THREE.Vector3(), look: new THREE.Vector3(),
      pos: new THREE.Vector3(), ego: new THREE.Vector3(), egoQ: new THREE.Quaternion(), tpQ: new THREE.Quaternion(),
      m: new THREE.Matrix4(), up: new THREE.Vector3(0, 1, 0) },
  };
}

/** Geschwindigkeit und Blickrichtung der Figuren aus der Bewegung des Spielers. */
function trackBody(tp, dt) {
  const { player } = tp.ctx;
  const { body, cam } = tp;
  const dx = player.x - body.x;
  const dz = player.z - body.z;
  body.x = player.x;
  body.z = player.z;
  const speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
  if (speed > TELEPORT) { Object.assign(body, { speed: 0, heading: player.yaw }); cam.fresh = true; return; }
  body.speed += (speed - body.speed) * smooth(0.06, dt);
  const moving = speed > MOVE_MIN;
  const target = moving ? Math.atan2(-dx, -dz) : player.yaw;
  body.heading += wrap(target - body.heading) * smooth(moving ? 0.14 : 0.9, dt);
}

/** Wunschpose der Paar-Kamera: hinter den Figuren, gedämpft, nie hinter einer Wand. */
function thirdPersonPose(tp, dt) {
  const { ctx, cam, v } = tp;
  const { player } = ctx;
  if (cam.fresh) { cam.az = player.yaw; cam.frac = 1; cam.fresh = false; }
  cam.az += wrap(player.yaw - cam.az) * smooth(0.14, dt);
  const sin = Math.sin(cam.az);
  const cos = Math.cos(cam.az);
  v.pivot.set(player.x, PIVOT_Y, player.z);
  v.want.set(player.x + sin * DIST, HEIGHT - player.pitch * 0.8, player.z + cos * DIST);
  v.side.set(cos, 0, -sin);
  const free = freeFraction(ctx, v.pivot, v.want, v.side);
  cam.frac = free < cam.frac ? free : cam.frac + (free - cam.frac) * smooth(0.35, dt); // näher sofort, weiter langsam
  v.pos.lerpVectors(v.pivot, v.want, cam.frac);
  v.pos.y += (1 - cam.frac) * LIFT;
  v.look.set(player.x - Math.sin(player.yaw) * LOOK_AHEAD, LOOK_Y + player.pitch * 3, player.z - Math.cos(player.yaw) * LOOK_AHEAD);
  v.m.lookAt(v.pos, v.look, v.up);
  v.tpQ.setFromRotationMatrix(v.m);
}

/** Überblendung von der Ich-Pose (von main gesetzt) zur Paar-Pose. */
function applyCamera(tp, e) {
  const { camera } = tp.ctx;
  const { v } = tp;
  v.ego.copy(camera.position);
  v.egoQ.copy(camera.quaternion);
  camera.position.lerpVectors(v.ego, v.pos, e);
  camera.quaternion.slerpQuaternions(v.egoQ, v.tpQ, e);
}

function updateFigures(tp, dt) {
  const { player, camera } = tp.ctx;
  const { figures, body } = tp;
  figures.group.position.set(player.x, 0, player.z);
  figures.group.rotation.y = body.heading;
  figures.animate(dt, body.speed);
  const dist = camera.position.distanceTo(tp.v.pivot);
  figures.setAlpha(ease(Math.max(0, Math.min(1, (dist - FADE_NEAR) / (FADE_FAR - FADE_NEAR)))));
}

function onFrame(tp, dt) {
  trackBody(tp, dt);
  const target = tp.view === 'paar' ? 1 : 0;
  const step = dt / BLEND_S;
  tp.blend = target > tp.blend ? Math.min(target, tp.blend + step) : Math.max(target, tp.blend - step);
  if (tp.blend === 0) { tp.figures.group.visible = false; tp.cam.fresh = true; return; }
  thirdPersonPose(tp, dt);
  applyCamera(tp, ease(tp.blend));
  updateFigures(tp, dt);
}

export function install(ctx) {
  const figures = createFigures(ctx.THREE);
  figures.group.visible = false;
  ctx.scene.add(figures.group);
  ctx.ui.addStyle('css/thirdperson.css');
  const tp = createState(ctx, figures);
  const toggle = () => setView(tp.view === 'paar' ? 'ich' : 'paar');
  const button = createButton(ctx.ui.hud, toggle);
  function setView(next) {
    tp.view = next;
    button.setAttribute('aria-pressed', String(next === 'paar'));
    saveView(next);
  }
  button.setAttribute('aria-pressed', String(tp.view === 'paar'));
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e) || e.key.toLowerCase() !== 'v') return;
    toggle();
  });
  ctx.onFrame((dt) => onFrame(tp, dt));
  return { get view() { return tp.view; }, setView, figures };
}
