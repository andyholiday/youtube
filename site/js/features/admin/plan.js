// Planung der Änderungen: aus Repo-Stand (snapshot.files: Pfad -> sha) und Eingabe die Liste der Dateiänderungen.
// Reine Funktionen ohne Netz. changes: { path, bytes } (schreiben) | { path, remove: true } (löschen).
import { buildTxt, normalizeFile, isIsoDate, isSafePath, slugify, oneLine } from './text.js';

export class UserError extends Error {
  constructor(message) {
    super(message);
    this.kind = 'eingabe';
  }
}

export const IMG_RE = /\.(jpe?g|png|webp|heic|heif)$/i;
const enc = (s) => new TextEncoder().encode(s);

export function splitPath(path) {
  const i = path.lastIndexOf('/');
  const name = path.slice(i + 1);
  const dot = name.lastIndexOf('.');
  return { dir: path.slice(0, i + 1), name, stem: dot > 0 ? name.slice(0, dot) : name };
}

/** Echter Pfad im Repo (Groß-/Kleinschreibung egal) oder null. */
export function findFile(snap, path) {
  if (snap.files.has(path)) return path;
  const low = path.toLowerCase();
  for (const p of snap.files.keys()) if (p.toLowerCase() === low) return p;
  return null;
}

// Wie tools/build.py den Ausgabenamen bildet: Sonderzeichen -> "_", Endung .jpg.
const outName = (stem) => `${stem.replace(/[^\p{L}\p{N}_.\-]/gu, '_')}.jpg`.toLowerCase();

/**
 * Quelldatei einer Erinnerung. Bevorzugt item.quelle (vom Build). Fehlt sie, wird sie
 * best-effort aus item.bild abgeleitet: das Bild im selben Ordner, dessen Ausgabename passt.
 */
export function resolveSource(snap, item) {
  if (typeof item.quelle === 'string' && item.quelle) return isSafePath(item.quelle) ? findFile(snap, item.quelle) : null;
  const bild = String(item.bild || '').split('?')[0];
  if (!isSafePath(bild)) return null;
  const { dir, name } = splitPath(bild);
  const found = [...snap.files.keys()].filter((p) => IMG_RE.test(p) && splitPath(p).dir === dir
    && outName(splitPath(p).stem) === name.toLowerCase()).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  return found[0] || null;
}

/** Vorhandene Textdateien zum Bild (foto.txt und foto.jpg.txt), echte Pfade. */
export function txtFiles(snap, source) {
  const { dir, name, stem } = splitPath(source);
  return [findFile(snap, `${dir}${stem}.txt`), findFile(snap, `${dir}${name}.txt`)].filter((p, i, a) => p && a.indexOf(p) === i);
}

function needSource(snap, item) {
  const source = resolveSource(snap, item);
  if (!source) throw new UserError('Das Originalfoto wurde im Repository nicht gefunden. Bitte die Seite neu laden und noch einmal versuchen.');
  return source;
}

const titelOf = (item, source) => oneLine(item.titel || splitPath(source).stem);

export function planReplace(snap, item, jpegBytes) {
  const source = needSource(snap, item);
  const { dir, stem } = splitPath(source);
  const path = `${dir}${stem}.jpg`;
  const changes = [{ path, bytes: jpegBytes }];
  if (source !== path) changes.push({ path: source, remove: true });
  return { changes, message: `Erinnerung ersetzt: ${titelOf(item, source)}` };
}

export function planEdit(snap, item, fields) {
  const source = needSource(snap, item);
  const { dir, stem } = splitPath(source);
  const path = txtFiles(snap, source)[0] || `${dir}${stem}.txt`;
  return { changes: [{ path, bytes: enc(buildTxt(fields)) }], message: `Erinnerung bearbeitet: ${oneLine(fields.titel) || titelOf(item, source)}` };
}

export function planDelete(snap, item) {
  const source = needSource(snap, item);
  const changes = [source, ...txtFiles(snap, source)].map((path) => ({ path, remove: true }));
  return { changes, message: `Erinnerung gelöscht: ${titelOf(item, source)}` };
}

/** Freier Dateistamm in dir: hängt -2, -3 … an, falls Bild oder Text mit diesem Namen schon existieren. */
function freeStem(snap, dir, base) {
  const taken = new Set([...snap.files.keys()].map((p) => p.toLowerCase().replace(/\.[^./]+$/, '')));
  let stem = base;
  for (let n = 2; taken.has(`${dir}${stem}`.toLowerCase()); n++) stem = `${base}-${n}`;
  return stem;
}

export function planAdd(snap, { datum, titel, text, notiz, geheim }, jpegBytes) {
  if (!isIsoDate(datum)) throw new UserError('Bitte ein gültiges Datum angeben.');
  const dir = geheim ? 'erinnerungen/geheim/' : 'erinnerungen/';
  const stem = freeStem(snap, dir, `${datum}_${slugify(titel)}`);
  const changes = [
    { path: `${dir}${stem}.jpg`, bytes: jpegBytes },
    { path: `${dir}${stem}.txt`, bytes: enc(buildTxt({ titel, text, notiz })) },
  ];
  if (!changes.every((c) => isSafePath(c.path))) throw new UserError('Der Dateiname ist ungültig.');
  return { changes, message: `Erinnerung hinzugefügt${geheim ? ' (geheimer Raum)' : ''}: ${oneLine(titel) || stem}` };
}

export function planFile(path, content, message) {
  return { changes: [{ path, bytes: enc(normalizeFile(content)) }], message };
}
