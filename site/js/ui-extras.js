// Erweiterungspunkte der Oberfläche für Feature-Module (Schnittstelle: .planning/SPEC-FEATURES.md, Doku: features/context.md).
// Baut Overlay-Container, HUD, Toast, Stylesheet-Einbindung, Herz-Tipper im Start und die Aktionsfläche der Großansicht.
const HEART_WINDOW_MS = 3000;
const TOAST_DEFAULT_MS = 2500;

const CSS = `
#overlay-root { position: fixed; inset: 0; z-index: 30; pointer-events: none; }
#hud { position: fixed; z-index: 6; top: calc(var(--s-o) + 44px); right: var(--s-r); display: flex; flex-direction: column; align-items: flex-end; gap: 8px; pointer-events: none; }
#hud > * { pointer-events: auto; min-width: 44px; min-height: 44px; }
body:not(.im-saal) #hud, body.lb-offen #hud { display: none; }
#hud:empty { display: none; }
.x-toast { position: absolute; left: 50%; top: calc(var(--s-o) + 96px); transform: translateX(-50%); max-width: calc(100% - 2 * (var(--s-r) + 56px)); padding: .6em 1.2em; border-radius: 18px; text-align: center; font-size: 1rem; line-height: 1.4; color: #fff; background: var(--pille); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); white-space: pre-line; animation: ein .3s ease-out; }
#start h1 .herz { box-sizing: content-box; padding: 10px; margin: -10px; cursor: pointer; touch-action: manipulation; }
.lb-aktionen { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.lb-aktionen:empty { display: none; }
`;

/** Ruft fn(...args); ein Fehler im Modul wird gemeldet und bricht die Oberfläche nicht. */
function safe(label, fn, ...args) {
  try { fn(...args); } catch (err) { console.warn(`${label} fehlgeschlagen:`, err); }
}

function makeEl(tag, id, parent) {
  const el = document.createElement(tag);
  if (id) el.id = id;
  parent.append(el);
  return el;
}

/** Stylesheet per href einhängen (jeder href nur einmal); löst auf, sobald es geladen ist oder fehlschlägt. */
function createAddStyle() {
  const loaded = new Map();
  return (href) => {
    if (!loaded.has(href)) {
      loaded.set(href, new Promise((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.addEventListener('load', () => resolve(true));
        link.addEventListener('error', () => { console.warn('Stylesheet nicht ladbar:', href); resolve(false); });
        document.head.append(link);
      }));
    }
    return loaded.get(href);
  };
}

function createToast(root) {
  let el = null;
  let timer = null;
  return (text, ms = TOAST_DEFAULT_MS) => {
    if (!el) { el = makeEl('p', null, root); el.className = 'x-toast'; el.setAttribute('role', 'status'); }
    clearTimeout(timer);
    el.textContent = String(text ?? '');
    el.hidden = false;
    timer = setTimeout(() => { el.hidden = true; }, ms);
  };
}

/** Tippen aufs Herz im Startbildschirm: Handler bekommen die Zahl der Tipper der letzten 3 s. */
function createHeartTaps() {
  const handlers = [];
  const taps = [];
  const heart = document.querySelector('#start h1 .herz');
  if (heart) {
    heart.addEventListener('click', (e) => {
      e.stopPropagation(); // nie das Eintreten auslösen
      const now = performance.now();
      taps.push(now);
      while (taps[0] < now - HEART_WINDOW_MS) taps.shift();
      handlers.forEach((fn) => safe('onStartHeartTap', fn, taps.length));
    });
  }
  return (fn) => { handlers.push(fn); };
}

/** Leerer Container unter dem Text der Großansicht; wird bei jedem Öffnen und Blättern geleert und neu gemeldet. */
function createLightboxActions() {
  const handlers = [];
  const el = document.createElement('div');
  el.className = 'lb-aktionen';
  document.querySelector('#lightbox .lb-info').append(el);
  return {
    on: (fn) => { handlers.push(fn); },
    shown(index) {
      el.replaceChildren();
      handlers.forEach((fn) => safe('onLightboxOpen', fn, index, el));
    },
  };
}

export function createExtras() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const overlayRoot = makeEl('div', 'overlay-root', document.body);
  const hud = makeEl('div', 'hud', document.body);
  const actions = createLightboxActions();
  return {
    overlayRoot,
    hud,
    addStyle: createAddStyle(),
    toast: createToast(overlayRoot),
    onStartHeartTap: createHeartTaps(),
    onLightboxOpen: actions.on,
    lightboxShown: actions.shown,
  };
}
