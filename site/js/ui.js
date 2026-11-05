import { formatDatum, nameUndDatum } from './format.js';
import { createExtras } from './ui-extras.js';

const $ = (id) => document.getElementById(id);

const HINT_MAX_MS = 15000;
const ROOM_TITLE_MS = 2800;
const FADE_MS = 900;
const FINALE_DELAY_MS = 2500;
const SWIPE_MIN_PX = 50;
const ROOM_NAMES = {
  modern: 'Die weiße Galerie',
  klassisch: 'Der Festsaal',
  futuristisch: 'Der Lichtraum',
  garten: 'Der Wintergarten',
};
const FATAL_DEFAULT = 'Dein Browser kann das 3D-Museum leider nicht anzeigen.';

export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/** Blendet ein Element ein, hält es holdMs und blendet es dann sanft aus. */
function createToast(el, holdMs) {
  let hold = null;
  let gone = null;
  const clear = () => { clearTimeout(hold); clearTimeout(gone); };
  function hide() {
    clear();
    el.classList.add('weg');
    gone = setTimeout(() => { el.hidden = true; }, FADE_MS);
  }
  function show(text) {
    clear();
    if (text !== undefined) el.textContent = text;
    el.classList.remove('weg');
    el.hidden = false;
    hold = setTimeout(hide, holdMs);
  }
  return { show, hide };
}

/** Steuerungshinweis: weg, sobald Gehen und Umschauen vorkamen, spätestens nach 15 s. */
function createHint() {
  const el = $('hinweis');
  const toast = createToast(el, HINT_MAX_MS);
  let seen = new Set();
  return {
    show(text) { seen = new Set(); toast.show(text); },
    mark(kind) {
      seen.add(kind);
      if (seen.has('move') && seen.has('look') && !el.hidden) toast.hide();
    },
  };
}

/** Kurzer Raumtitel; vor dem Eintreten wird der Name nur gemerkt. */
function createRoomTitle() {
  const toast = createToast($('raumtitel'), ROOM_TITLE_MS);
  let lastId = null;
  let waiting = null;
  return {
    entered(room) {
      const name = room && ROOM_NAMES[room.theme];
      if (!name || room.id === lastId) return;
      lastId = room.id;
      if (document.body.classList.contains('im-saal')) toast.show(name); else waiting = name;
    },
    start() { if (waiting) toast.show(waiting); waiting = null; },
  };
}

/** Beschriftungszeile unten: "Titel · Datum – antippen zum Vergrößern". */
function createCaption(onOpen) {
  const btn = $('beschriftung');
  let index = null;
  btn.addEventListener('click', () => { if (index !== null) onOpen(index); });
  return {
    show(i, item) {
      const name = nameUndDatum(item);
      $('bes-name').textContent = name;
      $('bes-hint').textContent = name ? ' – antippen zum Vergrößern' : 'Antippen zum Vergrößern';
      btn.setAttribute('aria-label', `${name || 'Erinnerung'} – Großansicht öffnen`);
      index = i;
      btn.hidden = false;
    },
    hide() { index = null; btn.hidden = true; },
  };
}

/** Zähler "5 von 13 entdeckt". */
function createDiscovery() {
  const el = $('entdeckt');
  const found = new Set();
  let total = 0;
  const render = () => {
    el.textContent = `${found.size} von ${total} entdeckt`;
    el.hidden = total === 0;
  };
  return {
    reset(n) { found.clear(); total = n; render(); },
    add(i) { if (i >= 0 && i < total) { found.add(i); render(); } },
    // Bei nur einem Bild wäre die Abschlusskarte sofort da, das wirkt unpassend.
    get complete() { return total >= 2 && found.size === total; },
  };
}

/** Abschlusskarte, die nur einmal erscheint. */
function createFinale(onToggle) {
  const box = $('finale');
  let shown = false;
  $('fin-btn').addEventListener('click', () => {
    box.hidden = true;
    document.body.classList.remove('lb-offen');
    onToggle(false);
  });
  return {
    get shown() { return shown; },
    show(text) {
      shown = true;
      $('fin-text').textContent = text || '';
      box.hidden = false;
      document.body.classList.add('lb-offen');
      onToggle(true);
      $('fin-btn').focus({ preventScroll: true });
    },
  };
}

/** Füllt die Großansicht mit dem Bild index; Titel, Datum, Text und Zähler. */
function renderLightbox(items, index) {
  const item = items[index];
  const img = $('lb-img');
  const titel = String(item.titel || '').trim();
  const datum = formatDatum(item.datum);
  $('lb-fehler').hidden = true;
  img.hidden = false;
  img.classList.add('laedt');
  img.alt = titel || datum || `Erinnerung ${index + 1}`;
  img.src = item.bild;
  // Ohne Titel steht das Datum an dessen Stelle (wie auf dem Schild im Museum).
  $('lb-titel').textContent = titel || datum;
  $('lb-datum').textContent = titel ? datum : '';
  $('lb-text').textContent = item.text || '';
  $('lb-zaehler').textContent = items.length > 1 ? `${index + 1} / ${items.length}` : '';
  $('lb-prev').hidden = $('lb-next').hidden = items.length < 2;
  $('lightbox').querySelector('.lb-info').scrollTop = 0;
}

/** Knöpfe, Bildfehler und Klick auf den Hintergrund der Großansicht. */
function wireLightbox({ box, close, go, openedAt }) {
  const img = $('lb-img');
  img.addEventListener('load', () => img.classList.remove('laedt'));
  img.addEventListener('error', () => {
    img.hidden = true;
    $('lb-fehler').hidden = false;
  });
  $('lb-close').addEventListener('click', close);
  $('lb-prev').addEventListener('click', () => go(-1));
  $('lb-next').addEventListener('click', () => go(1));
  box.addEventListener('click', (e) => {
    if (e.target === box && performance.now() - openedAt() > 300) close();
  });
  addLightboxKeys(box, { close, go });
  addSwipe(box, go);
}

/** Großansicht mit Blättern (Pfeile, Tasten, Wischen), Zähler und Fehlerhinweis beim Bild. */
function createLightbox({ getItems, onToggle, onShown, onClosed }) {
  const box = $('lightbox');
  let index = 0;
  let openedAt = 0;

  function go(delta) {
    const n = getItems().length;
    if (n < 2) return;
    index = (index + delta + n) % n;
    renderLightbox(getItems(), index);
    onShown(index);
  }
  function open(i) {
    if (!Number.isInteger(i) || i < 0 || i >= getItems().length) return;
    const wasClosed = box.hidden;
    index = i;
    renderLightbox(getItems(), index);
    onShown(i);
    if (!wasClosed) return;
    box.hidden = false;
    document.body.classList.add('lb-offen');
    openedAt = performance.now();
    onToggle(true);
    $('lb-close').focus({ preventScroll: true });
  }
  function close() {
    if (box.hidden) return;
    box.hidden = true;
    document.body.classList.remove('lb-offen');
    $('lb-img').removeAttribute('src');
    onToggle(false);
    onClosed();
  }

  wireLightbox({ box, close, go, openedAt: () => openedAt });
  return { open, close, get isOpen() { return !box.hidden; } };
}

function addLightboxKeys(box, { close, go }) {
  window.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
    else return;
    e.preventDefault();
  });
}

/** Wischen nach links = nächstes Bild, nach rechts = vorheriges; senkrechtes Wischen scrollt nur. */
function addSwipe(box, go) {
  let start = null;
  box.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    start = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  box.addEventListener('touchend', (e) => {
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    start = null;
    if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > 1.5 * Math.abs(dy)) go(dx < 0 ? 1 : -1);
  }, { passive: true });
}

function applyWidmungTitle(w) {
  const titel = w && typeof w.titel === 'string' ? w.titel.trim() : '';
  if (titel) $('start-titel').textContent = titel;
}

function showReady() {
  const b = $('start-btn');
  b.disabled = false;
  b.textContent = 'Eintreten';
  $('lade').hidden = true;
  $('lade-fehler').hidden = true;
}

function wireStart(onEnter) {
  $('start-btn').addEventListener('click', () => {
    $('start').hidden = true;
    document.body.classList.add('im-saal');
    onEnter();
  });
}

/** Zeigt die Abschlusskarte einmal, sobald alles entdeckt ist und keine Großansicht offen ist. */
function createFinaleFlow({ discovery, finale, isLightboxOpen, getText }) {
  let pending = false;
  function check(delay) {
    if (!discovery.complete || finale.shown) return;
    setTimeout(() => {
      if (finale.shown) return;
      pending = isLightboxOpen();
      if (!pending) finale.show(getText());
    }, delay);
  }
  return { check, lightboxClosed() { if (pending) check(FADE_MS / 3); } };
}

/** Startoverlay, Hinweise, Beschriftung, Großansicht, Entdeckt-Zähler und Abschlusskarte. */
export function createUi({ onEnter, onLightbox }) {
  let items = [];
  let widmung = null;
  const hint = createHint();
  const room = createRoomTitle();
  const discovery = createDiscovery();
  const flow = createFinaleFlow({
    discovery,
    finale: createFinale(onLightbox),
    isLightboxOpen: () => lightbox.isOpen,
    getText: () => widmung && widmung.text,
  });
  const extras = createExtras();
  const lightbox = createLightbox({
    getItems: () => items,
    onToggle: onLightbox,
    onShown: (i) => { extras.lightboxShown(i); discovery.add(i); flow.check(0); },
    onClosed: flow.lightboxClosed,
  });
  const caption = createCaption((i) => lightbox.open(i));

  wireStart(() => { onEnter(); room.start(); });

  return {
    setLoading(text) { $('lade').textContent = text; $('lade').hidden = false; },
    setReady: showReady,
    setItems(list) { items = Array.isArray(list) ? list : []; discovery.reset(items.length); caption.hide(); },
    setWidmung(w) { widmung = w || null; applyWidmungTitle(w); },
    showEmptyHint() { $('leer-hinweis').hidden = false; },
    showFatal(text) { $('fehler').textContent = text || FATAL_DEFAULT; $('fehler').hidden = false; },
    showControlsHint: hint.show,
    markInteracted: hint.mark,
    roomEntered: room.entered,
    focusChanged(i) {
      if (!Number.isInteger(i) || !items[i]) { caption.hide(); return; }
      caption.show(i, items[i]);
      discovery.add(i);
      flow.check(FINALE_DELAY_MS);
    },
    openLightbox: lightbox.open,
    // Erweiterungspunkte für Feature-Module (siehe ui-extras.js)
    overlayRoot: extras.overlayRoot,
    hud: extras.hud,
    addStyle: extras.addStyle,
    toast: extras.toast,
    onStartHeartTap: extras.onStartHeartTap,
    onLightboxOpen: extras.onLightboxOpen,
  };
}
