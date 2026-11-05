// Eine Aktion = ein Commit. Zeigt Arbeit/Fehler im Dialog, startet danach die Statusanzeige.
import { errorText } from './github.js';
import { el } from './dom.js';

/** makePlan(snapshot) -> { changes, message }; darf UserError werfen. Gibt true zurück, wenn gespeichert wurde. */
export async function publish(app, dlg, makePlan) {
  if (dlg.busy || !app.active) return false;
  dlg.error('');
  dlg.setBusy(true);
  try {
    const snap = await app.gh.snapshot();
    const plan = makePlan(snap);
    const sha = await app.gh.commit(snap, plan.changes, plan.message);
    dlg.setBusy(false);
    dlg.close();
    app.status.track(sha);
    return true;
  } catch (err) {
    dlg.setBusy(false);
    dlg.error(errorText(err));
    return false;
  }
}

/** Dateiauswahl (muss direkt aus einem Tipp heraus aufgerufen werden, sonst blockt iOS sie). */
export function pickFile(app, onFile) {
  if (!app.fileInput) {
    app.fileInput = el('input', { type: 'file', accept: 'image/*', class: 'adm-file', tabindex: '-1', 'aria-hidden': 'true' });
    app.ctx.ui.overlayRoot.append(app.fileInput);
  }
  const input = app.fileInput;
  input.value = '';
  input.onchange = () => { if (input.files && input.files[0]) onFile(input.files[0]); };
  input.click();
}

/** Vorschau-Bild aus JPEG-Bytes; die Adresse wird beim Schließen des Dialogs freigegeben. */
export function previewImage(dlg, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
  dlg.onClose(() => URL.revokeObjectURL(url));
  return el('img', { class: 'adm-prev', src: url, alt: 'Vorschau des Fotos' });
}
