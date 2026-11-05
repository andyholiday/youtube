// Sitzung: Token-Ablage, Aktivieren/Beenden des Modus, Schraubenschlüssel im HUD, Stil laden.
import { createGithub } from './github.js';
import { createStatus } from './status.js';

const TOKEN_KEY = 'mv4t'; // localStorage: nur auf diesem Gerät
const FLAG_KEY = 'mv4a'; // sessionStorage: Modus war in diesem Tab aktiv
const CSS = 'css/admin.css';

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}
export const loadToken = () => safe(() => localStorage.getItem(TOKEN_KEY) || '', '');
export const clearToken = () => safe(() => localStorage.removeItem(TOKEN_KEY));
export const wasActive = () => safe(() => sessionStorage.getItem(FLAG_KEY) === '1', false);
const saveToken = (t) => safe(() => localStorage.setItem(TOKEN_KEY, t));
const setFlag = (on) => safe(() => (on ? sessionStorage.setItem(FLAG_KEY, '1') : sessionStorage.removeItem(FLAG_KEY)));

export function createApp(ctx) {
  const app = { ctx, gh: null, active: false, dialogs: new Set(), bars: new Set(), hud: null, fileInput: null, depth: 0, style: null };
  app.pause = (on) => {
    app.depth = Math.max(0, app.depth + (on ? 1 : -1));
    ctx.setInputPaused(app.depth > 0);
  };
  app.status = createStatus(app);
  return app;
}

/** Stylesheet erst beim ersten Bedarf laden und abwarten. */
export function ensureStyle(app) {
  if (!app.style) {
    app.style = (async () => {
      const added = await app.ctx.ui.addStyle(CSS);
      const link = added instanceof HTMLLinkElement ? added : document.querySelector('link[href$="admin.css"]');
      if (link && !link.sheet) await new Promise((done) => { link.addEventListener('load', done); link.addEventListener('error', done); setTimeout(done, 2500); });
    })();
  }
  return app.style;
}

const SVG = 'http://www.w3.org/2000/svg';
function wrenchIcon() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z');
  svg.append(path);
  return svg;
}

/** Prüft das Token (wirft GhError) und schaltet den Modus ein. */
export async function activate(app, token, onHud) {
  const gh = createGithub(token);
  await gh.check();
  app.gh = gh;
  app.active = true;
  saveToken(token);
  setFlag(true);
  if (!app.hud) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'adm-hud';
    b.setAttribute('aria-label', 'Verwaltung');
    b.append(wrenchIcon());
    b.addEventListener('click', onHud);
    app.ctx.ui.hud.append(b);
    app.hud = b;
  }
}

/** Modus beenden: alles Sichtbare entfernen. Das Token bleibt gespeichert, außer forget = true. */
export function deactivate(app, forget = false) {
  app.active = false;
  app.gh = null;
  setFlag(false);
  if (forget) clearToken();
  app.status.stop();
  [...app.dialogs].forEach((d) => d.close());
  app.bars.forEach((b) => b.remove());
  app.bars.clear();
  if (app.hud) app.hud.remove();
  if (app.fileInput) app.fileInput.remove();
  app.hud = null;
  app.fileInput = null;
}
