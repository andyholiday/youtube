// Statusanzeige nach dem Speichern: fragt den Actions-Lauf zum Commit ab (alle 15 s, höchstens 5 Minuten).
import { el, btn } from './dom.js';

const POLL_MS = 15000;
const POLL_MAX_MS = 300000;
const MELDUNG = 'Gespeichert – in ca. 2 Minuten live';

const link = (url) => (/^https:\/\/github\.com\//.test(url || '') ? el('a', { href: url, target: '_blank', rel: 'noopener', text: 'Lauf ansehen' }) : null);

/** Ergebnis eines Laufs als Anzeige: [Text, ...Zusatz] oder null, solange er noch läuft. */
function verdict(run) {
  if (!run || run.status !== 'completed') return null;
  if (run.conclusion === 'success') return ['Jetzt live – Seite neu laden', btn('Neu laden', 'primary', () => location.reload())];
  return ['Die Veröffentlichung hat nicht geklappt.', link(run.url)];
}

export function createStatus(app) {
  let timer = null;
  let pill = null;
  let gen = 0;

  function stop() {
    gen++;
    if (timer) clearTimeout(timer);
    timer = null;
    if (pill) pill.remove();
    pill = null;
  }

  function show(text, ...extra) {
    if (!pill) {
      pill = el('div', { class: 'adm-status', role: 'status' });
      app.ctx.ui.overlayRoot.append(pill);
    }
    pill.replaceChildren(...[el('span', { text }), ...extra,
      el('button', { type: 'button', class: 'adm-x', 'aria-label': 'Ausblenden', text: '×', onclick: stop })].filter(Boolean));
  }

  async function check(sha, id, t0) {
    timer = null;
    let run = null;
    try { run = await app.gh.findRun(sha); } catch (err) {
      if (id !== gen) return;
      if (err.kind === 'auth' || err.kind === 'perm') { show(`${MELDUNG}. Der Status ist ohne „Actions: Read“ nicht abrufbar.`); return; }
    }
    if (id !== gen) return;
    const done = verdict(run);
    if (done) { show(...done); return; }
    if (Date.now() - t0 + POLL_MS >= POLL_MAX_MS) { show('Noch nicht bestätigt – bitte in ein paar Minuten die Seite neu laden.', link(run && run.url)); return; }
    timer = setTimeout(() => check(sha, id, t0), POLL_MS);
  }

  return {
    stop,
    /** Nach erfolgreichem Commit: Toast + Abfrage starten. */
    track(sha) {
      stop();
      const id = ++gen;
      app.ctx.ui.toast(MELDUNG, 6000);
      show('Wird veröffentlicht …');
      timer = setTimeout(() => check(sha, id, Date.now()), POLL_MS);
    },
  };
}
