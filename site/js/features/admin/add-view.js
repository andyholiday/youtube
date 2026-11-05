// Foto hinzufügen: Foto wählen, Datum/Titel/Text/Notiz, optional in den geheimen Raum.
import { el, btn, field, openDialog } from './dom.js';
import { errorText } from './github.js';
import { toJpeg, exifDate } from './image.js';
import { todayIso } from './text.js';
import { planAdd } from './plan.js';
import { publish, pickFile, previewImage } from './publish.js';

export function addFlow(app, back) {
  const dlg = openDialog(app, 'Foto hinzufügen');
  let img = null;
  let dateTouched = false;
  const slot = el('div', { class: 'adm-slot' });
  const datum = field('Datum', { type: 'date', value: todayIso() });
  const titel = field('Titel');
  const text = field('Text', { type: 'textarea', rows: 4 });
  const notiz = field('Notiz (versteckt)', { type: 'textarea', rows: 3, hint: 'Erscheint, wenn man das Bild lange gedrückt hält.' });
  const geheim = el('input', { type: 'checkbox', id: 'adm-geheim' });
  datum.input.addEventListener('input', () => { dateTouched = true; });

  async function onFile(file) {
    dlg.error('');
    slot.replaceChildren(el('p', { class: 'adm-text', text: 'Foto wird vorbereitet …' }));
    try {
      const [jpeg, date] = await Promise.all([toJpeg(file), exifDate(file)]);
      if (dlg.closed) return;
      img = jpeg;
      if (!dateTouched && date) datum.input.value = date;
      slot.replaceChildren(previewImage(dlg, jpeg.bytes));
    } catch (err) {
      img = null;
      slot.replaceChildren();
      dlg.error(errorText(err));
    }
  }

  dlg.body.append(
    slot,
    btn('Foto auswählen', 'ghost', () => pickFile(app, onFile)),
    datum.wrap, titel.wrap, text.wrap, notiz.wrap,
    el('label', { class: 'adm-check', for: 'adm-geheim' }, geheim, el('span', { text: 'In den geheimen Raum' })),
  );
  dlg.foot.append(
    btn('Hinzufügen', 'primary', () => {
      if (!img) { dlg.error('Bitte zuerst ein Foto auswählen.'); return; }
      const fields = { datum: datum.input.value, titel: titel.input.value, text: text.input.value, notiz: notiz.input.value, geheim: geheim.checked };
      publish(app, dlg, (snap) => planAdd(snap, fields, img.bytes));
    }),
    btn('Abbrechen', 'ghost', () => { dlg.close(); if (back) back(); }),
  );
  return dlg;
}
