const TAP_MAX_MOVE = 8;
const TAP_MAX_MS = 500;
const LONG_PRESS_MS = 550; // so lange (und fast still) drücken = langes Drücken
const LONG_PRESS_MOVE = 10;
const JOY_RADIUS = 46;
const DEAD = 0.12;
const LOOK_TOUCH = 0.0055;
const LOOK_MOUSE = 0.004;
const PITCH_FACTOR = 0.5; // Auf/Ab-Wischen ist halb so empfindlich wie links/rechts
const ZONE_W = 0.45; // Joystick-Zone: unten links, Anteil an Breite und Höhe
const ZONE_H = 0.4;

const KEYS = {
  KeyW: 'fwd', KeyS: 'back', KeyA: 'left', KeyD: 'right',
  ArrowUp: 'fwd', ArrowDown: 'back', ArrowLeft: 'turnL', ArrowRight: 'turnR',
};

const findTouch = (list, id) => [...list].find((t) => t.identifier === id) || null;
const inJoyZone = (x, y) => x < innerWidth * ZONE_W && y > innerHeight * (1 - ZONE_H);

/**
 * Langes Drücken: Liegt der Finger LONG_PRESS_MS lang (Bewegung < LONG_PRESS_MOVE px) still, ruft der Timer
 * onLongPress(x, y) und setzt rec.long; danach darf aus demselben Druck kein Tippen werden.
 */
function armLongPress(rec, isActive, onLongPress) {
  rec.long = false;
  rec.timer = setTimeout(() => {
    if (isActive()) { rec.long = true; onLongPress(rec.sx, rec.sy); }
  }, LONG_PRESS_MS);
}

function checkLongPressMove(rec, x, y) {
  if (Math.hypot(x - rec.sx, y - rec.sy) >= LONG_PRESS_MOVE) { rec.far = true; clearTimeout(rec.timer); }
}

/**
 * Beim Loslassen: Hat ein ruckelndes Bild den Timer verspätet, aber der Druck dauerte ≥ LONG_PRESS_MS und blieb still,
 * zählt er trotzdem als langes Drücken (Eingaben haben im Browser Vorrang vor Timern).
 */
function finishLongPress(rec, isActive, onLongPress) {
  clearTimeout(rec.timer);
  if (rec.long || rec.far || performance.now() - rec.t < LONG_PRESS_MS || !isActive()) return;
  rec.long = true;
  onLongPress(rec.sx, rec.sy);
}

/** Wischen/Ziehen zum Umschauen; ein Tippen (kaum Bewegung, kurz) ruft onTap(x, y), langes Drücken onLongPress(x, y). */
function createDrag(look, isActive, onTap, onLongPress) {
  let d = null;
  return {
    get id() { return d ? d.id : null; },
    start(id, x, y) {
      d = { id, x, y, sx: x, sy: y, t: performance.now(), moved: false };
      armLongPress(d, isActive, onLongPress);
    },
    move(x, y, sens) {
      look.yaw += (x - d.x) * sens;
      look.pitch += (y - d.y) * sens * PITCH_FACTOR;
      d.x = x; d.y = y;
      if (Math.hypot(x - d.sx, y - d.sy) > TAP_MAX_MOVE) d.moved = true;
      checkLongPressMove(d, x, y);
    },
    end(x, y) {
      finishLongPress(d, isActive, onLongPress);
      const tap = !d.moved && !d.long && performance.now() - d.t < TAP_MAX_MS;
      d = null;
      if (tap && isActive()) onTap(x, y);
    },
    cancel() { if (d) clearTimeout(d.timer); d = null; },
  };
}

/** Schwebender Joystick: erscheint dort, wo der Daumen in der Zone aufsetzt (left/top = Mittelpunkt). */
function createJoystick(el, knob, onTap, isActive, onLongPress) {
  const joy = { id: null, x: 0, y: 0 };
  let o = null;
  joy.start = (t) => {
    joy.id = t.identifier;
    o = { x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t: performance.now(), moved: false };
    armLongPress(o, isActive, onLongPress);
    el.style.left = `${o.x}px`;
    el.style.top = `${o.y}px`;
    el.classList.add('aktiv');
  };
  joy.move = (t) => {
    let dx = (t.clientX - o.x) / JOY_RADIUS;
    let dy = (t.clientY - o.y) / JOY_RADIUS;
    const len = Math.hypot(dx, dy);
    if (len * JOY_RADIUS > TAP_MAX_MOVE) o.moved = true;
    checkLongPressMove(o, t.clientX, t.clientY);
    if (len > 1) { dx /= len; dy /= len; }
    knob.style.transform = `translate(${dx * JOY_RADIUS}px, ${dy * JOY_RADIUS}px)`;
    const on = len > DEAD;
    joy.x = on ? dx : 0;
    joy.y = on ? -dy : 0;
  };
  joy.end = (t) => {
    if (o && t) finishLongPress(o, isActive, onLongPress); else if (o) clearTimeout(o.timer);
    const tap = o && t && !o.moved && !o.long && performance.now() - o.t < TAP_MAX_MS;
    joy.id = null; joy.x = joy.y = 0; o = null;
    knob.style.transform = '';
    el.classList.remove('aktiv');
    if (tap) onTap(t.clientX, t.clientY);
  };
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

function setupTouch({ canvas, joyEl, joy, drag, isActive, onTouchSeen }) {
  const opts = { passive: false };
  const start = (e) => {
    e.preventDefault();
    onTouchSeen();
    if (!isActive()) return;
    for (const t of e.changedTouches) {
      // Erster Finger in der Zone steuert den Joystick; alle anderen wischen.
      if (joy.id === null && inJoyZone(t.clientX, t.clientY)) joy.start(t);
      else if (drag.id === null) drag.start(t.identifier, t.clientX, t.clientY);
    }
  };
  canvas.addEventListener('touchstart', start, opts);
  joyEl.addEventListener('touchstart', start, opts);
  window.addEventListener('touchmove', (e) => {
    const j = findTouch(e.changedTouches, joy.id);
    if (j) joy.move(j);
    const t = drag.id !== null && findTouch(e.changedTouches, drag.id);
    if (t) drag.move(t.clientX, t.clientY, LOOK_TOUCH);
  }, opts);
  window.addEventListener('touchend', (e) => {
    const j = findTouch(e.changedTouches, joy.id);
    if (j) joy.end(j);
    const t = drag.id !== null && findTouch(e.changedTouches, drag.id);
    if (t) drag.end(t.clientX, t.clientY);
  });
  window.addEventListener('touchcancel', (e) => {
    if (findTouch(e.changedTouches, joy.id)) joy.end(null);
    drag.cancel();
  });
}

/** Tastatur, schwebender Joystick und Wischen/Maus. Liefert Bewegung, Drehung und Blickänderung. */
export function createInput({ canvas, joyEl, joyKnob, isActive, onTap, onLongPress = () => {}, onTouchSeen }) {
  const keys = new Set();
  const look = { yaw: 0, pitch: 0 };
  const joy = createJoystick(joyEl, joyKnob, (x, y) => { if (isActive()) onTap(x, y); }, isActive, onLongPress);
  const drag = createDrag(look, isActive, onTap, onLongPress);
  setupKeyboard(keys, isActive);
  setupMouse(canvas, drag, isActive);
  setupTouch({ canvas, joyEl, joy, drag, isActive, onTouchSeen });

  return {
    move() {
      const kx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      const ky = (keys.has('fwd') ? 1 : 0) - (keys.has('back') ? 1 : 0);
      return { x: kx || joy.x, y: ky || joy.y };
    },
    turn: () => (keys.has('turnL') ? 1 : 0) - (keys.has('turnR') ? 1 : 0),
    /** Blickänderung seit dem letzten Aufruf; held = ein Finger/die Maus liegt zum Umschauen auf. */
    takeLook() {
      const l = { yaw: look.yaw, pitch: look.pitch, held: drag.id !== null };
      look.yaw = look.pitch = 0;
      return l;
    },
    reset() { keys.clear(); joy.end(null); drag.cancel(); look.yaw = look.pitch = 0; },
  };
}
