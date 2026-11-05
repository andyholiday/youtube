// Versteckter Verwaltungsmodus (Paket A): 5× Herz auf dem Startbildschirm. Bis dahin: kein DOM, kein CSS, keine Ausgabe.
import { createApp, activate, wasActive, loadToken, ensureStyle } from './session.js';
import { openAdmin, showMain } from './views.js';
import { renderLightboxBar } from './item-views.js';

const HEART_TAPS = 5;

export function install(ctx) {
  const app = createApp(ctx);
  ctx.onStartHeartTap((count) => { if (count >= HEART_TAPS) openAdmin(app); });
  ctx.onLightboxOpen((index, actionsEl) => {
    const item = ctx.items && ctx.items[index];
    if (app.active && item && actionsEl) renderLightboxBar(app, item, actionsEl);
  });
  // Geheimraum-Bilder haben eine eigene Großansicht (eggs); der Eintrag trägt seine quelle unter erinnerungen/geheim/.
  if (ctx.onViewerOpen) ctx.onViewerOpen((item, actionsEl) => { if (app.active && item && actionsEl) renderLightboxBar(app, item, actionsEl); });
  // Nach „Seite neu laden“ im selben Tab den Modus ohne Fenster wieder einschalten.
  const token = wasActive() ? loadToken() : '';
  if (token) ensureStyle(app).then(() => activate(app, token, () => showMain(app))).catch(() => {});
}

