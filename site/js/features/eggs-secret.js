// Easter Egg 2: der geheime Raum. Eingang als scheinbar normale Wand (Spalt + Efeu als Hinweis),
// das Wandpaneel löst sich auf, sobald man hineingeht; beim ersten Betreten ein Toast.
import { ROT, OPPOSITE, heartShape, showNearRoom } from './eggs-util.js';

const OPEN_RANGE = 1.0; // so nah an der Wand (im Gastgeberraum) löst sich das Paneel auf
const FADE_OPEN = 4; // Deckkraft pro Sekunde beim Öffnen
const FADE_CLOSE = 1.4;
const SEAM_ALPHA = 0.2;
const GREENS = ['#3f5d3a', '#4f7344', '#35502f', '#5d8250'];

function leafGeometry(THREE) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(0.55, -0.3, 0.5, 0.25, 0, 0.5);
  s.bezierCurveTo(-0.5, 0.25, -0.55, -0.3, 0, -0.5);
  return new THREE.ShapeGeometry(s, 6);
}

/** Efeuranke links neben der Tür: zwei dünne Zweige, Blätter als eine InstancedMesh, ein winziges Herz dazwischen. */
function buildIvy(THREE, door) {
  const g = new THREE.Group();
  const x0 = -door.width / 2 - 0.06;
  const vines = [
    [[x0, 0.05], [x0 - 0.12, 0.5], [x0 - 0.02, 0.95], [x0 - 0.2, 1.4], [x0 - 0.1, 1.9]],
    [[x0 - 0.05, 0.05], [x0 - 0.3, 0.3], [x0 - 0.28, 0.7], [x0 - 0.45, 0.95]],
  ].map((pts) => new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0.012))));
  const stem = new THREE.MeshLambertMaterial({ color: '#4a4a30' });
  vines.forEach((c) => g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 24, 0.007, 5), stem)));
  const count = 30;
  const leaves = new THREE.InstancedMesh(leafGeometry(THREE), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const curve = vines[i < 19 ? 0 : 1];
    const k = i < 19 ? i : i - 19;
    const p = curve.getPoint((k + 0.5) / (i < 19 ? 19 : 11));
    const side = i % 2 ? 1 : -1;
    const size = 0.085 + ((i * 37) % 7) * 0.01;
    q.setFromEuler(new THREE.Euler(-0.1, 0, (i * 1.7) % 6.28));
    m.compose(new THREE.Vector3(p.x + side * 0.055, p.y, 0.02 + (i % 3) * 0.004), q, new THREE.Vector3(size, size * 1.25, 1));
    leaves.setMatrixAt(i, m);
    leaves.setColorAt(i, color.set(GREENS[i % GREENS.length]));
  }
  const heart = new THREE.Mesh(new THREE.ShapeGeometry(heartShape(THREE), 8), new THREE.MeshBasicMaterial({ color: '#7a1f33' }));
  heart.scale.setScalar(0.034);
  heart.position.set(x0 - 0.1, 1.12, 0.03);
  heart.rotation.z = 0.2;
  g.add(leaves, heart);
  return g;
}

/** Feine Fuge um das Paneel (Pfosten + Sturz) und der Efeu: der einzige Hinweis am Eingang. */
function buildHint(ctx, host, door) {
  const THREE = ctx.THREE;
  const group = new THREE.Group();
  const [x, z] = { n: [door.center, host.z0], s: [door.center, host.z1], w: [host.x0, door.center], e: [host.x1, door.center] }[door.wall];
  group.position.set(x, 0, z);
  group.rotation.y = ROT[door.wall];
  const seamMat = new THREE.MeshBasicMaterial({
    color: '#4a2f2a', transparent: true, opacity: SEAM_ALPHA, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const line = (w, h, px, py) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), seamMat);
    mesh.position.set(px, py, 0.004);
    mesh.userData.noPick = true;
    return mesh;
  };
  const half = door.width / 2;
  group.add(line(0.012, door.height, -half, door.height / 2), line(0.012, door.height, half, door.height / 2),
    line(door.width + 0.012, 0.012, 0, door.height), buildIvy(THREE, door));
  group.traverse((o) => { o.userData.noPick = true; });
  ctx.scene.add(group);
  showNearRoom(ctx, group, host.id, 0);
  return { group, seamMat };
}

/** Abstand in den Gastgeberraum (n > 0 = im Raum) und Versatz zur Türmitte (a). */
function offsetToDoor(host, door, p) {
  const along = door.wall === 'n' || door.wall === 's' ? p.x : p.z;
  const into = { e: host.x1 - p.x, w: p.x - host.x0, s: host.z1 - p.z, n: p.z - host.z0 }[door.wall];
  return { n: into, a: along - door.center };
}

function findPanels(ctx) {
  const out = [];
  ctx.scene.traverse((o) => { if (o.userData && o.userData.secretPanel) out.push(o); });
  return out;
}

/** Bandstücke (Sockel, Handlauf) vor dem Paneel: Sie schließen die Wand und verschwinden mit ihm (siehe bandAround in themes/common.js). */
function findFillers(ctx) {
  const out = [];
  ctx.scene.traverse((o) => { if (o.userData && o.userData.secretFiller) out.push(o); });
  return out;
}

function setPanel(panel, fillers, op) {
  panel.material.opacity = op;
  const solid = op > 0.03;
  panel.visible = solid;
  if (solid) panel.layers.set(0); else panel.layers.set(1); // aufgelöst: nicht mehr antippbar, kein Strahl trifft es
  const bandShown = op > 0.5; // Bandstücke sind opak (gemeinsames Material): sie springen kurz vor dem Ende aus
  for (const f of fillers) { f.visible = bandShown; f.layers.set(bandShown ? 0 : 1); }
}

/** Paneel löst sich auf, wenn man in der Türflucht gegen die Wand läuft oder im geheimen Raum ist. */
export function watchPanel(ctx, host, door, secret, hint) {
  const panel = findPanels(ctx).find((p) => p.userData.secretPanel.wall === door.wall && Math.abs(p.userData.secretPanel.center - door.center) < 0.01);
  if (!panel) { console.warn('Geheimtür: kein Wandpaneel gefunden'); return null; }
  const fillers = findFillers(ctx);
  let op = 1;
  ctx.onFrame((dt) => {
    const { n, a } = offsetToDoor(host, door, ctx.player);
    const aligned = Math.abs(a) < door.width / 2 + 0.1;
    const open = ctx.player.room === secret.id || (aligned && n <= OPEN_RANGE && n >= -0.5);
    const target = open ? 0 : 1;
    const next = op + Math.max(-dt * FADE_OPEN, Math.min(dt * FADE_CLOSE, target - op));
    if (next === op) return;
    op = next;
    setPanel(panel, fillers, op);
    hint.seamMat.opacity = SEAM_ALPHA * op;
  });
  return panel;
}

/** Beim ersten Betreten des geheimen Raums erscheint der Text dezent. */
export function toastOnFirstEntry(ctx, secret, message) {
  let shown = false;
  ctx.onRoomEnter((room) => {
    if (shown || !room || room.id !== secret.id) return;
    shown = true;
    ctx.ui.toast(message, 5500);
  });
}

export function installSecretDoor(ctx, message) {
  const secret = ctx.rooms.find((r) => r.secret);
  if (!secret) return null;
  const host = ctx.rooms.find((r) => r.id === secret.doors[0].to);
  const door = host.doors.find((d) => d.secret && d.to === secret.id);
  if (!door) return null;
  const hint = buildHint(ctx, host, door);
  const panel = watchPanel(ctx, host, door, secret, hint);
  toastOnFirstEntry(ctx, secret, message);
  return { secret, host, door, hint, panel, back: OPPOSITE[door.wall] };
}
