const TAP_MAX_MOVE = 8;
const TAP_MAX_MS = 500;
const JOY_RADIUS = 46;
const DEAD = 0.12;
const LOOK_TOUCH = 0.0055;
const LOOK_MOUSE = 0.004;

const KEYS = {
  KeyW: 'fwd', KeyS: 'back', KeyA: 'left', KeyD: 'right',
  ArrowUp: 'fwd', ArrowDown: 'back', ArrowLeft: 'turnL', ArrowRight: 'turnR',
};

const findTouch = (list, id) => [...list].find((t) => t.identifier === id) || null;

/** Wischen/Ziehen zum Umschauen; ein Tippen (kaum Bewegung, kurz) ruft onTap(x, y). */
function createDrag(look, isActive, onTap) {
  let d = null;
  return {
    get id() { return d ? d.id : null; },
    start(id, x, y) { d = { id, x, y, sx: x, sy: y, t: performance.now(), moved: false }; },
    move(x, y, sens) {
      look.yaw += (x - d.x) * sens;
      look.pitch += (y - d.y) * sens;
      d.x = x; d.y = y;
      if (Math.hypot(x - d.sx, y - d.sy) > TAP_MAX_MOVE) d.moved = true;
    },
    end(x, y) {
      const tap = !d.moved && performance.now() - d.t < TAP_MAX_MS;
      d = null;
      if (tap && isActive()) onTap(x, y);
    },
    cancel() { d = null; },
  };
}

function createJoystick(base, knob) {
  const joy = { id: null, x: 0, y: 0 };
  joy.move = (t) => {
    const r = base.getBoundingClientRect();
    let dx = (t.clientX - (r.left + r.width / 2)) / JOY_RADIUS;
    let dy = (t.clientY - (r.top + r.height / 2)) / JOY_RADIUS;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    knob.style.transform = `translate(${dx * JOY_RADIUS}px, ${dy * JOY_RADIUS}px)`;
    const on = len > DEAD;
    joy.x = on ? dx : 0;
    joy.y = on ? -dy : 0;
  };
  joy.end = () => { joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  return joy;
}

function setupKeyboard(keys, isActive) {
  window.addEventListener('keydown', (e) => {
    if (KEYS[e.code] && isActive()) { keys.add(KEYS[e.code]); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => keys.delete(KEYS[e.code]));
  window.addEventListener('blur', () => keys.clear());
}

function setupMouse(canvas, drag, isActive) {
  canvas.addEventListener('mousedown', (e) => {
    if (isActive() && e.button === 0) drag.start('m', e.clientX, e.clientY);
  });
  window.addEventListener('mousemove', (e) => { if (drag.id === 'm') drag.move(e.clientX, e.clientY, LOOK_MOUSE); });
  window.addEventListener('mouseup', (e) => { if (drag.id === 'm') drag.end(e.clientX, e.clientY); });
}

function setupTouch({ canvas, joyBase, joy, drag, isActive, onTouchSeen }) {
  const opts = { passive: false };
  joyBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (joy.id !== null || !isActive()) return;
    joy.id = e.changedTouches[0].identifier;
    joy.move(e.changedTouches[0]);
  }, opts);
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onTouchSeen();
    const t = e.changedTouches[0];
    if (isActive() && drag.id === null) drag.start(t.identifier, t.clientX, t.clientY);
  }, opts);
  window.addEventListener('touchmove', (e) => {
    const j = findTouch(e.changedTouches, joy.id);
    if (j) joy.move(j);
    const t = drag.id !== null && findTouch(e.changedTouches, drag.id);
    if (t) drag.move(t.clientX, t.clientY, LOOK_TOUCH);
  }, opts);
  const end = (e) => {
    if (findTouch(e.changedTouches, joy.id)) joy.end();
    const t = drag.id !== null && findTouch(e.changedTouches, drag.id);
    if (t) drag.end(t.clientX, t.clientY);
  };
  window.addEventListener('touchend', end);
  window.addEventListener('touchcancel', (e) => {
    if (findTouch(e.changedTouches, joy.id)) joy.end();
    drag.cancel();
  });
}

/** Tastatur, virtueller Joystick und Wischen/Maus. Liefert Bewegung, Drehung und Blickänderung. */
export function createInput({ canvas, joyBase, joyKnob, isActive, onTap, onTouchSeen }) {
  const keys = new Set();
  const look = { yaw: 0, pitch: 0 };
  const joy = createJoystick(joyBase, joyKnob);
  const drag = createDrag(look, isActive, onTap);
  setupKeyboard(keys, isActive);
  setupMouse(canvas, drag, isActive);
  setupTouch({ canvas, joyBase, joy, drag, isActive, onTouchSeen });

  return {
    move() {
      const kx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      const ky = (keys.has('fwd') ? 1 : 0) - (keys.has('back') ? 1 : 0);
      return { x: kx || joy.x, y: ky || joy.y };
    },
    turn: () => (keys.has('turnL') ? 1 : 0) - (keys.has('turnR') ? 1 : 0),
    takeLook() {
      const l = { yaw: look.yaw, pitch: look.pitch };
      look.yaw = look.pitch = 0;
      return l;
    },
    reset() { keys.clear(); joy.end(); drag.cancel(); look.yaw = look.pitch = 0; },
  };
}
