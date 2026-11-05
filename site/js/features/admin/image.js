// Foto im Browser neu kodieren (entfernt EXIF/GPS) und Aufnahmedatum aus dem EXIF lesen.
export const MAX_EDGE = 2000;
export const QUALITY = 0.88;

export class ImageError extends Error { kind = 'bild'; }

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* weiter mit <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
}

/** Datei -> { bytes: Uint8Array (JPEG), breite, hoehe }. Wirft ImageError, wenn der Browser sie nicht lesen kann. */
export async function toJpeg(file) {
  let src;
  try { src = await decode(file); } catch { throw new ImageError('decode'); }
  const w0 = src.naturalWidth || src.width;
  const h0 = src.naturalHeight || src.height;
  if (!w0 || !h0) throw new ImageError('decode');
  const k = Math.min(1, MAX_EDGE / Math.max(w0, h0));
  const breite = Math.max(1, Math.round(w0 * k));
  const hoehe = Math.max(1, Math.round(h0 * k));
  const canvas = document.createElement('canvas');
  canvas.width = breite;
  canvas.height = hoehe;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, breite, hoehe);
  g.drawImage(src, 0, 0, breite, hoehe);
  if (typeof src.close === 'function') src.close();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', QUALITY));
  if (!blob) throw new ImageError('encode');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), breite, hoehe };
}

const EXIF_DATUM = /^(\d{4}):(\d{2}):(\d{2})/;

function tiffReader(dv, base) {
  const le = dv.getUint16(base) === 0x4949;
  return { u16: (o) => dv.getUint16(base + o, le), u32: (o) => dv.getUint32(base + o, le), base };
}

/** Liest in einem IFD den Wert (ASCII-Offset) der gesuchten Tags: gibt { tag: Offset } zurück. */
function readIfd(r, offset, wanted) {
  const out = {};
  const n = r.u16(offset);
  for (let i = 0; i < n; i++) {
    const e = offset + 2 + i * 12;
    const tag = r.u16(e);
    if (wanted.includes(tag)) out[tag] = { type: r.u16(e + 2), count: r.u32(e + 4), value: r.u32(e + 8), at: e + 8 };
  }
  return out;
}

function asciiAt(dv, r, entry) {
  const start = entry.count > 4 ? r.base + entry.value : r.base + entry.at;
  let s = '';
  for (let i = 0; i < Math.min(entry.count, 19) && start + i < dv.byteLength; i++) s += String.fromCharCode(dv.getUint8(start + i));
  return s;
}

function findExifSegment(dv) {
  if (dv.byteLength < 4 || dv.getUint16(0) !== 0xffd8) return -1;
  let p = 2;
  while (p + 4 < dv.byteLength) {
    if (dv.getUint8(p) !== 0xff) return -1;
    const marker = dv.getUint8(p + 1);
    const len = dv.getUint16(p + 2);
    if (marker === 0xe1 && dv.getUint32(p + 4) === 0x45786966) return p + 10; // "Exif" -> TIFF-Kopf
    if (marker === 0xda || len < 2) return -1;
    p += 2 + len;
  }
  return -1;
}

/** Aufnahmedatum "YYYY-MM-DD" aus dem EXIF eines JPEG, sonst null (HEIC/PNG o. Ä. -> null). */
export async function exifDate(file) {
  try {
    const dv = new DataView(await file.slice(0, 262144).arrayBuffer());
    const tiff = findExifSegment(dv);
    if (tiff < 0) return null;
    const r = tiffReader(dv, tiff);
    const ifd0 = readIfd(r, r.u32(4), [0x8769, 0x0132]);
    const sub = ifd0[0x8769] ? readIfd(r, ifd0[0x8769].value, [0x9003, 0x9004]) : {};
    const entry = sub[0x9003] || sub[0x9004] || ifd0[0x0132];
    const m = entry && EXIF_DATUM.exec(asciiAt(dv, r, entry));
    return m && +m[1] > 1900 && m[2] !== '00' && m[3] !== '00' ? `${m[1]}-${m[2]}-${m[3]}` : null;
  } catch { return null; }
}
