// Widmung und Geheimnisse als Textfeld bearbeiten (Dateien im Repo).
import { el, btn, field, openDialog } from './dom.js';
import { errorText } from './github.js';
import { publish } from './publish.js';
import { planFile } from './plan.js';

export const WIDMUNG = {
  title: 'Widmung bearbeiten',
  path: 'erinnerungen/widmung.txt',
  message: 'Widmung geändert',
  template: '',
  help: '# Titel (steht auf dem Startbildschirm)\nDarunter der Text, den sie am Ende liest.',
};

export const GEHEIMNISSE = {
  title: 'Geheimnisse bearbeiten',
  path: 'erinnerungen/geheimnisse.txt',
  message: 'Geheimnisse geändert',
  template: '# Herzregen\n\n# Geheimer Raum\n\n# Besondere Tage\n',
  help: '# Herzregen\nText zum Herzregen\n# Geheimer Raum\nText im geheimen Raum\n# Besondere Tage\n14.02. Alles Liebe!\n06.07.2019 Heute vor {jahre} Jahren …',
};

export async function textFileFlow(app, cfg, back) {
  const dlg = openDialog(app, cfg.title);
  dlg.body.append(el('p', { class: 'adm-text', text: 'Aktueller Stand wird geladen …' }));
  dlg.foot.append(btn('Abbrechen', 'ghost', () => { dlg.close(); if (back) back(); }));
  let content = cfg.template;
  try {
    const snap = await app.gh.snapshot();
    if (snap.files.has(cfg.path)) content = await app.gh.readText(snap.files.get(cfg.path));
  } catch (err) {
    if (dlg.closed) return;
    dlg.body.replaceChildren();
    dlg.error(errorText(err));
    return;
  }
  if (dlg.closed) return;
  const area = field('Text', { type: 'textarea', rows: 11, value: content });
  dlg.body.replaceChildren(
    area.wrap,
    el('p', { class: 'adm-hint', text: 'So ist die Datei aufgebaut:' }),
    el('pre', { class: 'adm-help', text: cfg.help }),
  );
  dlg.foot.prepend(btn('Speichern', 'primary', () => publish(app, dlg, () => planFile(cfg.path, area.input.value, cfg.message))));
}
