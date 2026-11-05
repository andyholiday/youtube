// Kleine DOM-Helfer. Nutzereingaben gehen nur über textContent/value ins DOM, nie über innerHTML.
let uid = 0;

export function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k === 'value') n.value = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  n.append(...kids.flat().filter((x) => x != null && x !== false));
  return n;
}

/** kind: primary | ghost | danger */
export function btn(text, kind, onclick, extra = {}) {
  return el('button', { type: 'button', class: `adm-btn adm-${kind}`, text, onclick, ...extra });
}

export function field(label, { type = 'text', value = '', rows = 4, hint = '', placeholder = '' } = {}) {
  const id = `adm-f${++uid}`;
  const input = type === 'textarea'
    ? el('textarea', { id, rows, placeholder, spellcheck: 'true' })
    : el('input', { id, type, placeholder, autocomplete: 'off', autocapitalize: 'sentences' });
  input.value = value;
  const wrap = el('div', { class: 'adm-field' }, el('label', { for: id, text: label }), input,
    hint ? el('p', { class: 'adm-hint', text: hint }) : null);
  return { wrap, input };
}

const STOP = ['pointerdown', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'keydown', 'keyup', 'wheel'];

/**
 * Modales Fenster in overlayRoot. Pausiert die Steuerung, solange es offen ist.
 * dlg.body / dlg.foot nehmen Inhalt auf, dlg.error(text), dlg.setBusy(bool), dlg.close().
 */
export function openDialog(app, title) {
  const errBox = el('p', { class: 'adm-err', role: 'alert', hidden: true });
  const body = el('div', { class: 'adm-body' });
  const foot = el('div', { class: 'adm-foot' });
  const x = el('button', { type: 'button', class: 'adm-x', 'aria-label': 'Schließen', text: '×' });
  const card = el('div', { class: 'adm-card', tabindex: '-1' }, el('div', { class: 'adm-head' }, el('h2', { text: title }), x), body, errBox, foot);
  const root = el('div', { class: 'adm-ov', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, card);
  const cleanups = [];
  const dlg = { root, body, foot, busy: false, closed: false, onClose: (fn) => cleanups.push(fn) };
  dlg.close = () => {
    if (dlg.closed) return;
    dlg.closed = true;
    root.remove();
    app.dialogs.delete(dlg);
    app.pause(false);
    cleanups.forEach((fn) => fn());
  };
  dlg.error = (msg) => {
    errBox.textContent = msg || '';
    errBox.hidden = !msg;
    if (msg && errBox.scrollIntoView) errBox.scrollIntoView({ block: 'nearest' });
  };
  dlg.setBusy = (on) => {
    dlg.busy = on;
    card.inert = on;
    card.classList.toggle('adm-busy', on);
  };
  x.addEventListener('click', dlg.close);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dlg.busy) dlg.close(); });
  for (const type of STOP) root.addEventListener(type, (e) => e.stopPropagation());
  app.ctx.ui.overlayRoot.append(root);
  app.dialogs.add(dlg);
  app.pause(true);
  card.focus({ preventScroll: true });
  return dlg;
}

/** Ja/Nein-Rückfrage. onYes läuft, wenn bestätigt wird. */
export function confirmDialog(app, { title, text, yes, danger, onYes, onNo }) {
  const dlg = openDialog(app, title);
  dlg.body.append(el('p', { class: 'adm-text', text }));
  dlg.foot.append(
    btn(yes, danger ? 'danger' : 'primary', () => { dlg.close(); onYes(); }),
    btn('Abbrechen', 'ghost', () => { dlg.close(); if (onNo) onNo(); }),
  );
  return dlg;
}
