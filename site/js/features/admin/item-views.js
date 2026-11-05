// Knöpfe in der Großansicht: Foto ersetzen, Titel/Text/Notiz bearbeiten, löschen.
import { el, btn, field, openDialog } from './dom.js';
import { errorText } from './github.js';
import { toJpeg } from './image.js';
import { parseTxt } from './text.js';
import { planReplace, planEdit, planDelete, resolveSource, txtFiles } from './plan.js';
import { publish, pickFile, previewImage } from './publish.js';

const name = (item) => item.titel || 'dieses Bild';

export function replaceFlow(app, item) {
  pickFile(app, async (file) => {
    const dlg = openDialog(app, 'Foto ersetzen');
    dlg.body.append(el('p', { class: 'adm-text', text: 'Foto wird vorbereitet …' }));
    dlg.foot.append(btn('Abbrechen', 'ghost', dlg.close));
    let img;
    try { img = await toJpeg(file); } catch (err) {
      if (!dlg.closed) { dlg.body.replaceChildren(); dlg.error(errorText(err)); }
      return;
    }
    if (dlg.closed) return;
    dlg.body.replaceChildren(
      previewImage(dlg, img.bytes),
      el('p', { class: 'adm-text', text: `Dieses Foto ersetzt „${name(item)}“. Ortsdaten werden dabei entfernt.` }),
    );
    dlg.foot.prepend(btn('Jetzt ersetzen', 'primary', () => publish(app, dlg, (snap) => planReplace(snap, item, img.bytes))));
  });
}

/** Aktueller Text aus dem Repo (falls vorhanden), sonst der Stand der Seite. */
async function loadFields(app, item) {
  const fallback = { titel: item.titel || '', text: item.text || '', notiz: item.notiz || '' };
  const snap = await app.gh.snapshot();
  const source = resolveSource(snap, item);
  const txt = source && txtFiles(snap, source)[0];
  return txt ? parseTxt(await app.gh.readText(snap.files.get(txt))) : fallback;
}

export async function editFlow(app, item) {
  const dlg = openDialog(app, 'Titel, Text & Notiz');
  dlg.body.append(el('p', { class: 'adm-text', text: 'Aktueller Stand wird geladen …' }));
  dlg.foot.append(btn('Abbrechen', 'ghost', dlg.close));
  let cur;
  let warn = '';
  try { cur = await loadFields(app, item); } catch (err) {
    cur = { titel: item.titel || '', text: item.text || '', notiz: item.notiz || '' };
    warn = `${errorText(err)} Gezeigt wird der Stand der Seite.`;
  }
  if (dlg.closed) return;
  const titel = field('Titel', { value: cur.titel });
  const text = field('Text', { type: 'textarea', rows: 5, value: cur.text });
  const notiz = field('Notiz (versteckt)', { type: 'textarea', rows: 4, value: cur.notiz, hint: 'Erscheint, wenn man das Bild lange gedrückt hält.' });
  dlg.body.replaceChildren(titel.wrap, text.wrap, notiz.wrap);
  dlg.foot.prepend(btn('Speichern', 'primary', () => {
    const fields = { titel: titel.input.value, text: text.input.value, notiz: notiz.input.value };
    publish(app, dlg, (snap) => planEdit(snap, item, fields));
  }));
  if (warn) dlg.error(warn);
}

export function deleteFlow(app, item) {
  const dlg = openDialog(app, 'Wirklich löschen?');
  dlg.body.append(el('p', { class: 'adm-text', text: `„${name(item)}“ wird mit Bild und Text endgültig aus dem Museum entfernt.` }));
  dlg.foot.append(
    btn('Ja, löschen', 'danger', () => publish(app, dlg, (snap) => planDelete(snap, item))),
    btn('Abbrechen', 'ghost', dlg.close),
  );
}

/** Zusatzknöpfe in den leeren Container der Großansicht. */
export function renderLightboxBar(app, item, actionsEl) {
  const old = actionsEl.querySelector('.adm-lbbar');
  if (old) { app.bars.delete(old); old.remove(); }
  const go = (fn) => () => { if (app.active) fn(app, item); };
  const bar = el('div', { class: 'adm-lbbar' },
    btn('Foto ersetzen', 'lb', go(replaceFlow)),
    btn('Titel, Text & Notiz', 'lb', go(editFlow)),
    btn('Löschen', 'lb adm-lbdel', go(deleteFlow)),
  );
  actionsEl.append(bar);
  app.bars.add(bar);
}
