import { formatDatum } from './format.js';

const $ = (id) => document.getElementById(id);

export function isTouchDevice() {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/** Großansicht eines Bildes mit Titel, Datum und Text. */
function createLightbox(onToggle) {
  const box = $('lightbox');
  let openedAt = 0;

  function close() {
    if (box.hidden) return;
    box.hidden = true;
    document.body.classList.remove('lb-offen');
    $('lb-img').removeAttribute('src');
    onToggle(false);
  }
  function open(item) {
    $('lb-img').src = item.bild;
    $('lb-img').alt = item.titel || '';
    $('lb-titel').textContent = item.titel || '';
    $('lb-datum').textContent = formatDatum(item.datum);
    $('lb-text').textContent = item.text || '';
    box.hidden = false;
    document.body.classList.add('lb-offen');
    box.querySelector('.lb-karte').scrollTop = 0;
    openedAt = performance.now();
    onToggle(true);
  }

  $('lb-close').addEventListener('click', close);
  box.addEventListener('click', (e) => {
    if (e.target === box && performance.now() - openedAt > 300) close();
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  return { open };
}

/** Startoverlay, Hinweise und Großansicht. */
export function createUi({ onEnter, onLightbox }) {
  const lightbox = createLightbox(onLightbox);
  let hintTimer = null;

  $('start-btn').addEventListener('click', () => {
    $('start').hidden = true;
    document.body.classList.add('im-saal');
    onEnter();
  });

  return {
    setReady() {
      const b = $('start-btn');
      b.disabled = false;
      b.textContent = 'Eintreten';
    },
    showEmptyHint() { $('leer-hinweis').hidden = false; },
    showControlsHint(text) {
      const el = $('hinweis');
      el.textContent = text;
      el.classList.remove('weg');
      el.hidden = false;
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => {
        el.classList.add('weg');
        setTimeout(() => { el.hidden = true; }, 900);
      }, 7000);
    },
    openLightbox: lightbox.open,
    showFatal() { $('fehler').hidden = false; },
  };
}
