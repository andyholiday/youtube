// Easter Egg 1: das kleine Porzellanherz an der Wand und der Herzregen, der beim Antippen fällt.
import { ROT, el, heartGeometry, showNearRoom, wallPoint, wallRange } from './eggs-util.js';

const COLORS = ['#7a1f33', '#a3334b', '#c9566b', '#e8a5b2', '#f7dde2', '#ffffff'];
const RAIN_SECONDS = 5;
const TAIL_SECONDS = 1.4;
const HEART_Y = 1.4; // Oberkante des Wandbords (über Lambris und Sockelleisten)
const HEART_W = 0.11; // Herzbreite in Metern (mit Abrundung ~12 cm)

let heartPath = null;
function heartPath2D() {
  if (heartPath) return heartPath;
  const p = new Path2D();
  p.moveTo(0, 0.45);
  p.bezierCurveTo(-0.15, 0.3, -0.5, 0.05, -0.5, -0.18);
  p.bezierCurveTo(-0.5, -0.38, -0.35, -0.5, -0.2, -0.5);
  p.bezierCurveTo(-0.08, -0.5, 0, -0.42, 0, -0.32);
  p.bezierCurveTo(0, -0.42, 0.08, -0.5, 0.2, -0.5);
  p.bezierCurveTo(0.35, -0.5, 0.5, -0.38, 0.5, -0.18);
  p.bezierCurveTo(0.5, 0.05, 0.15, 0.3, 0, 0.45);
  heartPath = p;
  return p;
}

function makeDrops(count, seconds, w, h) {
  return Array.from({ length: count }, (_, i) => {
    const size = (10 + Math.random() * 18) * Math.min(1.25, Math.max(0.8, w / 420));
    return {
      born: Math.random() * seconds * 0.8, x: Math.random() * w, y: -size * 2,
      vy: (h / 4.6) * (0.65 + Math.random() * 0.7), amp: 8 + Math.random() * 22, ph: Math.random() * 6.28,
      sway: 0.8 + Math.random() * 1.2, rot: (Math.random() - 0.5) * 0.7, size,
      color: COLORS[(i * 7 + Math.floor(Math.random() * 3)) % COLORS.length], alpha: 0.55 + Math.random() * 0.4,
    };
  });
}

function drawDrop(g, d, t) {
  const age = t - d.born;
  if (age < 0) return;
  const x = d.x + Math.sin(age * d.sway + d.ph) * d.amp;
  const y = d.y + d.vy * age;
  g.save();
  g.translate(x, y);
  g.rotate(d.rot + Math.sin(age * d.sway + d.ph) * 0.25);
  g.scale(d.size, d.size);
  g.globalAlpha *= d.alpha;
  g.fillStyle = d.color;
  g.fill(heartPath2D());
  if (d.color === '#ffffff' || d.color === '#f7dde2') {
    g.lineWidth = 0.05; g.strokeStyle = 'rgba(122,31,51,.55)'; g.stroke(heartPath2D());
  }
  g.restore();
}

/** Herzregen als leichtes Canvas-Overlay. start({ text, seconds, count }) kann beliebig oft gerufen werden. */
export function createRain(ctx) {
  let run = null;
  function stop() {
    if (!run) return;
    cancelAnimationFrame(run.raf);
    run.box.remove();
    run = null;
  }
  function start({ text = '', seconds = RAIN_SECONDS, count = 70 } = {}) {
    stop();
    const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    const box = el('div', 'eggs-regen');
    const cv = el('canvas', 'eggs-regen-cv');
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    box.append(cv);
    if (text) box.append(el('p', 'eggs-regen-text', text));
    ctx.ui.overlayRoot.append(box);
    const g = cv.getContext('2d');
    const drops = makeDrops(count, seconds, w, h);
    const t0 = performance.now();
    run = { box, raf: 0 };
    const total = seconds + TAIL_SECONDS;
    const tick = (now) => {
      const t = (now - t0) / 1000;
      if (t >= total) { stop(); return; }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);
      const fade = t > seconds ? 1 - (t - seconds) / TAIL_SECONDS : 1;
      g.globalAlpha = fade;
      for (const d of drops) { g.save(); drawDrop(g, d, t); g.restore(); }
      if (t > seconds - 0.4) box.classList.add('ende');
      run.raf = requestAnimationFrame(tick);
    };
    run.raf = requestAnimationFrame(tick);
  }
  return { start, stop, get active() { return !!run; } };
}

/** Beste Stelle an einer Wand: weit weg von Bildern und Türen, davor freier Boden. */
function findHeartSpot(ctx, room) {
  let best = null;
  for (const wall of ['w', 'e', 'n', 's']) {
    const [lo, hi] = wallRange(room, wall);
    for (let t = lo + 1.4; t <= hi - 1.4; t += 0.25) {
      const clear = Math.min(
        ...room.doors.filter((d) => d.wall === wall).map((d) => Math.abs(t - d.center) - d.width / 2 - 0.4),
        ...room.slots.filter((s) => s.wall === wall).map((s) => Math.abs(t - (wall === 'n' || wall === 's' ? s.x : s.z)) - s.w / 2 - 0.5),
        3,
      );
      const free = [0.7, 1.3].every((d) => { const [x, z] = wallPoint(room, wall, t, d); return !ctx.collide(x, z, 0.3); });
      if (clear >= 0.9 && free && (!best || clear > best.clear)) best = { wall, t, clear };
    }
  }
  return best;
}

function porcelain(THREE) {
  return new THREE.MeshPhongMaterial({ color: 0xfbf8f3, specular: 0xffffff, shininess: 90, emissive: 0xfff0f2, emissiveIntensity: 0.55 });
}

function glowSprite(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,205,215,.9)');
  grad.addColorStop(0.4, 'rgba(255,170,190,.3)');
  grad.addColorStop(1, 'rgba(255,170,190,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.35 });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(0.42);
  sprite.userData.noPick = true;
  sprite.raycast = () => {}; // nie ein Treffer (Sprites bräuchten sonst raycaster.camera)
  return sprite;
}

/** Baut Bord, Herz, Glimmen und Tipp-Fläche; gibt { group, hit, heart } zurück. */
function buildHeart(ctx, spot, room) {
  const THREE = ctx.THREE;
  const group = new THREE.Group();
  const [x, z] = wallPoint(room, spot.wall, spot.t, 0);
  group.position.set(x, 0, z);
  group.rotation.y = ROT[spot.wall];
  const mat = porcelain(THREE);
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.1), mat);
  shelf.position.set(0, HEART_Y - 0.01, 0.05);
  const heart = new THREE.Mesh(heartGeometry(THREE, 0.28), mat);
  heart.scale.setScalar(HEART_W);
  heart.position.set(0, HEART_Y + HEART_W * 0.46, 0.065);
  const back = new THREE.Mesh(heartGeometry(THREE, 0.1), new THREE.MeshPhongMaterial({ color: 0x7a1f33, specular: 0x886666, shininess: 60 }));
  back.scale.setScalar(HEART_W * 1.38); // bordeauxfarbene Emaille-Platte hinter dem Porzellan
  back.position.set(0, heart.position.y + 0.003, 0.03);
  const glow = glowSprite(THREE);
  glow.position.set(0, heart.position.y, 0.034); // vor Wand und Wandschmuck, hinter dem Porzellan
  const hit = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
  hit.position.set(0, heart.position.y, 0.1);
  group.add(shelf, back, heart, glow, hit);
  ctx.scene.add(group);
  return { group, hit, heart, glow };
}

/** Das Herz hängt in einem der mittleren Räume; Antippen löst den Herzregen mit geheim.herzregen aus. */
export function installHeart(ctx, geheim, rain) {
  const normal = ctx.rooms.filter((r) => !r.secret);
  const room = normal[Math.floor((normal.length - 1) / 2)];
  const spot = room && findHeartSpot(ctx, room);
  if (!spot) { console.warn('Herz: keine freie Wandstelle'); return null; }
  const parts = buildHeart(ctx, spot, room);
  showNearRoom(ctx, parts.group, room.id);
  let pop = 0;
  let t = 0;
  ctx.onFrame((dt) => {
    if (!parts.group.visible) return;
    t += dt;
    pop = Math.max(0, pop - dt * 2.2);
    parts.heart.scale.setScalar(HEART_W * (1 + 0.025 * Math.sin(t * 2.2) + 0.35 * pop));
    parts.glow.material.opacity = 0.24 + 0.1 * Math.sin(t * 1.7) + 0.4 * pop;
  });
  ctx.onObjectTap(parts.hit, () => {
    if (Math.abs(ctx.player.room - room.id) > 1) return;
    pop = 1;
    rain.start({ text: geheim.herzregen });
  });
  return { room, spot, ...parts };
}
