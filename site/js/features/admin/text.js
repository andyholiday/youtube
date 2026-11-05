// Reine Textfunktionen: Slug, Datum, .txt-Format (siehe .planning/SPEC.md), Commit-Zeilen.
const UMLAUTE = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss', Ä: 'ae', Ö: 'oe', Ü: 'ue' };

/** Dateiname-Baustein: nur [a-z0-9-], Umlaute umgeschrieben, nie leer. */
export function slugify(text, max = 48) {
  const t = String(text ?? '').normalize('NFC').replace(/[äöüÄÖÜß]/g, (c) => UMLAUTE[c])
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/g, '');
  return t || 'foto';
}

export function isIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Pfad innerhalb von erinnerungen/, ohne "..", ohne leere Teile, ohne Steuerzeichen. */
export function isSafePath(path) {
  if (typeof path !== 'string' || !path.startsWith('erinnerungen/')) return false;
  return path.split('/').every((s) => s && s !== '.' && s !== '..' && !/[\\\u0000-\u001f]/.test(s));
}

const clean = (s) => String(s ?? '').replace(/\r\n?/g, '\n').trim();
const NOTIZ_ZEILE = /^\s*##\s*notiz\s*$/i;

/** Inhalt der .txt: "# Titel", Leerzeile, Text, "## Notiz", Notiz. */
export function buildTxt({ titel, text, notiz }) {
  const body = clean(text).split('\n').map((l) => (NOTIZ_ZEILE.test(l) ? 'Notiz' : l)).join('\n');
  let out = `# ${clean(titel).replace(/\n+/g, ' ')}\n`;
  if (body) out += `\n${body}\n`;
  if (clean(notiz)) out += `\n## Notiz\n${clean(notiz)}\n`;
  return out;
}

/** Gegenstück zu buildTxt: { titel, text, notiz } (leer = ""). */
export function parseTxt(inhalt) {
  const zeilen = String(inhalt ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  let titel = '';
  if (zeilen[0] && zeilen[0].startsWith('#') && !NOTIZ_ZEILE.test(zeilen[0])) titel = zeilen.shift().replace(/^#+/, '').trim();
  const i = zeilen.findIndex((l) => NOTIZ_ZEILE.test(l));
  const text = (i < 0 ? zeilen : zeilen.slice(0, i)).join('\n').trim();
  const notiz = i < 0 ? '' : zeilen.slice(i + 1).join('\n').trim();
  return { titel, text, notiz };
}

/** Freitext (Widmung, Geheimnisse): einheitliche Zeilenenden, genau ein Zeilenumbruch am Ende. */
export function normalizeFile(text) {
  const t = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  return t ? `${t}\n` : '';
}

/** Erste Zeile für Commit-Nachrichten: einzeilig, gekürzt. */
export function oneLine(text, max = 70) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
