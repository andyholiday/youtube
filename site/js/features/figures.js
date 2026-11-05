// Zwei stilisierte Figuren wie aus mattem Porzellan, Hand in Hand. Nur einfache Formen, geteilte Materialien,
// keine Schatten. Blickrichtung der Figuren: -Z (wie yaw 0 im Museum). Einheiten: Meter.
const TAU = Math.PI * 2;
const Y_AXIS_UP = [0, 1, 0];
const HAND_Y = 0.74; // Höhe der verbundenen Hände
const SHADOW_ALPHA = 0.26;

/** Matcap-Textur (Kugelschattierung aus drei Farbstufen), unabhängig vom Raumlicht. */
function matcapTexture(THREE, [hi, mid, edge]) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(50, 42, 4, 64, 64, 66);
  grad.addColorStop(0, hi);
  grad.addColorStop(0.45, mid);
  grad.addColorStop(1, edge);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const spot = g.createRadialGradient(44, 36, 0, 44, 36, 16);
  spot.addColorStop(0, 'rgba(255,255,255,.55)');
  spot.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = spot;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeMaterials(THREE) {
  const mk = (stops) => new THREE.MeshMatcapMaterial({ matcap: matcapTexture(THREE, stops), toneMapped: false });
  return {
    porcelain: mk(['#ffffff', '#f3eee8', '#b9aea6']),
    dark: mk(['#85808a', '#3f3b41', '#1b191c']),
    wine: mk(['#c4586f', '#7a1f33', '#3a0b16']),
  };
}

function shadowBlob(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(40,30,35,1)');
  grad.addColorStop(0.55, 'rgba(40,30,35,.45)');
  grad.addColorStop(1, 'rgba(40,30,35,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false,
    opacity: SHADOW_ALPHA, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.012;
  mesh.renderOrder = -1;
  return mesh;
}

function part(THREE, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.raycast = () => {}; // Figuren sind nie anklickbar
  m.userData.noPick = true;
  return m;
}

const capsule = (THREE, r, len, cap = 2, rad = 8) => new THREE.CapsuleGeometry(r, Math.max(0.01, len), cap, rad);
const ball = (THREE, r, w = 10, h = 7) => new THREE.SphereGeometry(r, w, h);
/** Drehkörper aus (Radius, Höhe)-Paaren, von unten nach oben. */
const lathe = (THREE, pts, seg) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

/** Kopf mit Haarkappe (anthrazit), gesichtslos. */
function buildHead(THREE, m, { r, bun }) {
  const head = new THREE.Group();
  const skull = part(THREE, ball(THREE, r, 14, 9), m.porcelain);
  skull.scale.y = 1.1;
  const cap = part(THREE, new THREE.SphereGeometry(r * 1.1, 14, 5, 0, TAU, 0, Math.PI * (bun ? 0.58 : 0.52)), m.dark);
  cap.scale.y = 1.1;
  cap.rotation.x = bun ? 0.5 : 0.38;
  head.add(skull, cap);
  if (bun) head.add(part(THREE, ball(THREE, r * 0.5, 8, 6), m.dark, 0, r * 0.95, r * 0.85));
  return head;
}

const LEG = [[0, 0.02], [0.05, 0.04], [0.052, 0.12], [0.056, 0.4], [0.066, 0.62], [0.07, 0.8], [0.062, 0.9], [0, 0.91]];

function buildLegs(THREE, m, { trousers, slim }) {
  const mat = trousers ? m.dark : m.porcelain;
  return [-1, 1].map((side) => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.085, 0.9, 0);
    const shape = part(THREE, lathe(THREE, LEG, 8), mat, 0, -0.9, 0);
    shape.scale.set(slim, 1, slim);
    const shoe = part(THREE, ball(THREE, 0.062, 6, 4), m.dark, 0, -0.84, -0.04);
    shoe.scale.set(1, 0.62, 1.7);
    leg.add(shape, shoe);
    leg.userData.side = side;
    return leg;
  });
}

function buildArm(THREE, m, side, shoulderX, tilt) {
  const arm = new THREE.Group();
  arm.position.set(side * shoulderX, 1.36, 0);
  arm.add(part(THREE, capsule(THREE, 0.038, 0.52), m.porcelain, 0, -0.3, 0));
  arm.rotation.z = side * tilt;
  return arm;
}

const TORSO_A = [[0, 0.86], [0.1, 0.87], [0.145, 0.95], [0.14, 1.08], [0.15, 1.22], [0.175, 1.35], [0.16, 1.44], [0.085, 1.49], [0, 1.5]];
const TORSO_B = [[0, 1.0], [0.09, 1.01], [0.1, 1.08], [0.105, 1.2], [0.135, 1.33], [0.13, 1.42], [0.07, 1.47], [0, 1.48]];

/** Eine Figur. kind 'a': Hose, Schal; kind 'b': Kleid, Gürtel, Dutt. */
function buildFigure(THREE, m, kind) {
  const isA = kind === 'a';
  const root = new THREE.Group();
  root.scale.setScalar(isA ? 1 : 0.92);
  const upper = new THREE.Group(); // alles über der Hüfte: atmet, dreht leicht
  const shoulderX = isA ? 0.175 : 0.135;
  const torso = part(THREE, lathe(THREE, isA ? TORSO_A : TORSO_B, 12), m.porcelain);
  torso.scale.z = 0.72;
  const neck = part(THREE, new THREE.CylinderGeometry(0.046, 0.052, 0.12, 8, 1, true), m.porcelain, 0, 1.52, 0);
  const head = buildHead(THREE, m, { r: 0.105, bun: !isA });
  head.position.y = 1.65;
  const outer = buildArm(THREE, m, isA ? -1 : 1, shoulderX, isA ? 0.07 : 0.2);
  upper.add(torso, neck, head, outer);
  const legs = buildLegs(THREE, m, { trousers: isA, slim: isA ? 1 : 0.85 });
  root.add(upper, ...legs);
  const extras = isA ? addScarf(THREE, m, upper) : addDress(THREE, m, root, upper);
  return { root, upper, head, outer, legs, shoulderX, scale: root.scale.x, outerSide: isA ? -1 : 1, extras };
}

function addScarf(THREE, m, upper) {
  const ring = part(THREE, new THREE.TorusGeometry(0.118, 0.032, 5, 14), m.wine, 0, 1.455, 0);
  ring.rotation.x = Math.PI / 2;
  ring.scale.y = 0.85;
  const tail = new THREE.Group();
  tail.position.set(0.06, 1.45, 0.115);
  const strip = part(THREE, capsule(THREE, 0.03, 0.2), m.wine, 0, -0.13, 0);
  strip.scale.z = 0.4;
  tail.add(strip);
  upper.add(ring, tail);
  return { tail };
}

function addDress(THREE, m, root, upper) {
  const skirt = part(THREE, lathe(THREE, [[0.285, 0.5], [0.255, 0.6], [0.2, 0.78], [0.14, 0.95], [0.105, 1.06]], 18), m.porcelain);
  skirt.scale.z = 0.85;
  const belt = part(THREE, new THREE.TorusGeometry(0.112, 0.02, 5, 14), m.wine, 0, 1.06, 0);
  belt.rotation.x = Math.PI / 2;
  belt.scale.y = 0.8;
  root.add(skirt);
  upper.add(belt);
  return { skirt };
}

/** Ein Arm als Kapsel von der Schulter zur Hand; Länge und Richtung werden je Bild gesetzt. */
function makeLink(THREE, m, r) {
  const geo = new THREE.CapsuleGeometry(r, 0.4, 2, 6);
  const mesh = part(THREE, geo, m.porcelain);
  mesh.userData.base = 0.4 + 2 * r;
  return mesh;
}

function placeLink(mesh, from, to, tmp) {
  tmp.dir.subVectors(to, from);
  const len = tmp.dir.length();
  mesh.position.addVectors(from, to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(tmp.up, tmp.dir.divideScalar(len || 1));
  mesh.scale.y = len / mesh.userData.base;
}

const smooth = (rate, dt) => 1 - Math.exp(-dt * rate);

function swingLegs(rig, fig, off, k) {
  const { st } = rig;
  fig.legs.forEach((leg) => { leg.rotation.x = Math.sin(st.phase + off + (leg.userData.side > 0 ? Math.PI : 0)) * 0.6 * st.amp * k; });
  const lead = fig.legs.find((l) => l.userData.side === fig.outerSide);
  fig.outer.rotation.x = -lead.rotation.x * 0.75; // Arm schwingt gegen das gleichseitige Bein
}

/** Ruhe: Atmen, Kopf wiegt leicht; Gehen: Oberkörper dreht, Schal und Rock schwingen. */
function breathe(rig, fig, i) {
  const { st } = rig;
  const idle = 1 - st.amp;
  fig.upper.position.y = Math.sin(st.t * 1.7 + i * 1.3) * 0.005 * idle;
  fig.upper.rotation.y = Math.sin(st.phase) * 0.07 * st.amp * (i ? -1 : 1);
  fig.head.rotation.y = Math.sin(st.t * 0.45 + i * 2) * 0.14 * idle;
  fig.head.rotation.x = Math.sin(st.t * 0.7 + i) * 0.02 * idle;
  if (fig.extras.tail) fig.extras.tail.rotation.x = 0.1 + st.amp * 0.35 + Math.sin(st.phase * 2) * 0.1 * st.amp;
  if (fig.extras.skirt) fig.extras.skirt.rotation.z = Math.sin(st.phase) * 0.05 * st.amp;
}

function bob(rig, fig, off) {
  const { st } = rig;
  fig.root.position.y = 0.5 * (1 + Math.cos(2 * (st.phase + off))) * 0.032 * st.amp;
  fig.root.rotation.x = -0.06 * st.amp;
}

/** Beide Arme laufen von den inneren Schultern zur gemeinsamen Hand. */
function joinHands(rig) {
  const { st, a, b, tmp, hand } = rig;
  const sway = Math.sin(st.t * 1.1) * 0.012 * (1 - st.amp);
  hand.set((a.root.position.x + b.root.position.x) / 2 + 0.02, HAND_Y, -Math.sin(st.phase) * 0.07 * st.amp + sway);
  rig.clasp.position.copy(hand);
  const sa = tmp.from.set(a.root.position.x + a.shoulderX * a.scale, 1.36 * a.scale + a.root.position.y, 0);
  placeLink(rig.armA, sa, hand, tmp);
  const sb = tmp.from.set(b.root.position.x - b.shoulderX * b.scale, 1.36 * b.scale + b.root.position.y, 0);
  placeLink(rig.armB, sb, hand, tmp);
}

function animateRig(rig, dt, speed) {
  const { st, a, b } = rig;
  st.t += dt;
  st.amp += (Math.min(1, speed / 2.4) - st.amp) * smooth(9, dt);
  st.phase += dt * TAU * (0.9 + 0.3 * Math.min(speed, 3.4));
  swingLegs(rig, a, 0, 1);
  swingLegs(rig, b, 0.25, 0.9);
  bob(rig, a, 0);
  bob(rig, b, 0.25);
  breathe(rig, a, 0);
  breathe(rig, b, 1);
  joinHands(rig);
}

function applyAlpha(rig, v) {
  const solid = v >= 0.999;
  for (const mat of Object.values(rig.mats)) {
    if (mat.transparent === solid) { mat.transparent = !solid; mat.needsUpdate = true; }
    mat.opacity = v;
  }
  rig.shadow.material.opacity = SHADOW_ALPHA * v;
  rig.group.visible = v > 0.01;
}

function countTriangles(group) {
  let n = 0;
  group.traverse((o) => { if (o.geometry) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  return n;
}

function assemble(THREE) {
  const mats = makeMaterials(THREE);
  const group = new THREE.Group();
  group.name = 'paar-figuren';
  group.userData.noPick = true;
  const a = buildFigure(THREE, mats, 'a');
  const b = buildFigure(THREE, mats, 'b');
  a.root.position.x = -0.25;
  b.root.position.x = 0.23;
  a.head.rotation.z = -0.05;
  b.head.rotation.z = 0.06;
  const armA = makeLink(THREE, mats, 0.04);
  const armB = makeLink(THREE, mats, 0.037);
  const clasp = part(THREE, ball(THREE, 0.052, 8, 6), mats.porcelain);
  const shadow = shadowBlob(THREE);
  group.add(a.root, b.root, armA, armB, clasp, shadow);
  group.traverse((o) => { o.frustumCulled = false; });
  const tmp = { dir: new THREE.Vector3(), up: new THREE.Vector3(...Y_AXIS_UP), from: new THREE.Vector3() };
  return { mats, group, a, b, armA, armB, clasp, shadow, tmp, hand: new THREE.Vector3(), st: { phase: 0, amp: 0, t: 0 } };
}

/**
 * Paar-Figuren. animate(dt, speed): speed in m/s. setAlpha(0..1). group zeigt in -Z.
 * pose() liefert Messwerte für Tests (Beinwinkel, Amplitude, Hand).
 */
export function createFigures(THREE) {
  const rig = assemble(THREE);
  const animate = (dt, speed) => animateRig(rig, dt, speed);
  const setAlpha = (v) => applyAlpha(rig, v);
  const pose = () => ({ legA: rig.a.legs[0].rotation.x, legB: rig.b.legs[0].rotation.x, amp: rig.st.amp,
    bobY: rig.a.root.position.y, hand: rig.clasp.position.toArray() });
  animate(0, 0);
  setAlpha(1);
  return { group: rig.group, animate, setAlpha, pose, triangles: () => countTriangles(rig.group), parts: { a: rig.a, b: rig.b } };
}
