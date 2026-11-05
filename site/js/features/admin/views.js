// Einrichtung (Token) und Verwaltungsfenster.
import { el, btn, field, openDialog, confirmDialog } from './dom.js';
import { errorText } from './github.js';
import { activate, deactivate, loadToken, ensureStyle } from './session.js';
import { addFlow } from './add-view.js';
import { textFileFlow, WIDMUNG, GEHEIMNISSE } from './text-views.js';

const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

function showSetup(app, message = '') {
  const dlg = openDialog(app, 'Verwaltung einrichten');
  const token = field('Token hier einfügen', { type: 'password', placeholder: 'github_pat_…' });
  token.input.autocapitalize = 'none';
  token.input.spellcheck = false;
  const steps = [
    ['Unten auf „GitHub öffnen“ tippen und bei GitHub anmelden.'],
    ['Name: Museum. Bei „Repository access“: Only select repositories, dort andyholiday/youtube wählen.'],
    ['Bei „Permissions“ → „Repository permissions“: Contents = Read and write, Actions = Read-only.'],
    ['Ganz unten „Generate token“ tippen, den Token kopieren und hier einfügen.'],
  ];
  dlg.body.append(
    el('p', { class: 'adm-text', text: 'Einmalig brauchst du einen Zugangsschlüssel (Token) von GitHub. Er bleibt nur auf diesem Handy.' }),
    el('ol', { class: 'adm-steps' }, steps.map((s) => el('li', { text: s[0] }))),
    el('a', { class: 'adm-btn adm-ghost', href: TOKEN_URL, target: '_blank', rel: 'noopener noreferrer', text: 'GitHub öffnen' }),
    token.wrap,
  );
  const check = btn('Prüfen', 'primary', async () => {
    const value = token.input.value.trim();
    if (!value) { dlg.error('Bitte den Token einfügen.'); return; }
    dlg.error('');
    dlg.setBusy(true);
    try {
      await activate(app, value, () => showMain(app));
      dlg.setBusy(false);
      dlg.close();
      showMain(app);
    } catch (err) {
      dlg.setBusy(false);
      dlg.error(errorText(err));
    }
  });
  dlg.foot.append(check, btn('Abbrechen', 'ghost', dlg.close));
  if (message) dlg.error(message);
  return dlg;
}

export function showMain(app) {
  if (!app.active) return null;
  const dlg = openDialog(app, 'Verwaltung');
  const back = () => showMain(app);
  const go = (flow) => () => { dlg.close(); flow(); };
  dlg.body.append(
    el('p', { class: 'adm-text', text: 'Fotos ersetzen, bearbeiten oder löschen: ein Bild antippen. In der Großansicht stehen dann die Knöpfe dafür.' }),
    btn('Foto hinzufügen', 'primary', go(() => addFlow(app, back))),
    btn('Widmung bearbeiten', 'ghost', go(() => textFileFlow(app, WIDMUNG, back))),
    btn('Geheimnisse bearbeiten', 'ghost', go(() => textFileFlow(app, GEHEIMNISSE, back))),
  );
  dlg.foot.append(
    btn('Verwaltung beenden', 'ghost', () => deactivate(app)),
    btn('Token entfernen', 'danger', () => {
      dlg.close();
      confirmDialog(app, {
        title: 'Token entfernen?', text: 'Der Token wird von diesem Handy gelöscht. Zum nächsten Mal musst du einen neuen anlegen.',
        yes: 'Ja, entfernen', danger: true, onYes: () => deactivate(app, true), onNo: back,
      });
    }),
  );
  return dlg;
}

/** Öffnet die Verwaltung (5× Herz): mit gespeichertem Token direkt prüfen, sonst Einrichtung. */
export async function openAdmin(app) {
  if (app.dialogs.size) return;
  await ensureStyle(app);
  if (app.active) { showMain(app); return; }
  const token = loadToken();
  if (!token) { showSetup(app); return; }
  const wait = openDialog(app, 'Verwaltung');
  wait.body.append(el('p', { class: 'adm-text', text: 'Zugang wird geprüft …' }));
  try {
    await activate(app, token, () => showMain(app));
    wait.close();
    showMain(app);
  } catch (err) {
    wait.close();
    showSetup(app, errorText(err));
  }
}
