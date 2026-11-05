"""Titel und Datum aus Dateinamen ableiten, begleitende .txt-Dateien lesen."""
import datetime
import re

DATUM_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:[_-]+(.*))?$", re.DOTALL)
# Datum mitten im Kameranamen: 20240101, 2024-01-01, 2024_01_01 (nicht Teil längerer Zahlen).
KAMERA_DATUM_RE = re.compile(r"(?<!\d)((?:19|20)\d{2})[-_.]?(\d{2})[-_.]?(\d{2})(?!\d)")

_TEIL = r"(?:\d+|wa\d+|\(\d+\)|copy|kopie|edited|bearbeitet)"
_KAMERA = (r"(?:img|dsc[nf]?|dcim|pxl|mvimg|pano|pict|vid|image|photo|picture|foto|bild|"
           r"screenshot|bildschirmfoto|p)")
# Auf den normalisierten Namen (klein, Trenner = Leerzeichen) angewendet.
GENERISCH_RE = re.compile("|".join([
    rf"{_KAMERA}(?: ?{_TEIL})*",             # IMG_0002, IMG-20240101-WA0001, image, photo (1)
    r"whatsapp (?:image|bild|video) \d.*",   # WhatsApp Image 2024-01-01 at 10.20.30
    r"[\d ]+",                               # nur Zahlen
    r"(?=[0-9a-f ]*\d)[0-9a-f ]{8,}",        # Hash / UUID
]))


def _iso_datum(jahr, monat, tag):
    try:
        return datetime.date(int(jahr), int(monat), int(tag)).isoformat()
    except ValueError:
        return None


def _normalisiert(text):
    return " ".join(re.sub(r"[_\-.\s]+", " ", text).split())


def parse_name(stem):
    """Gibt (datum oder None, titel) aus dem Dateinamen ohne Endung zurück.

    Generische Kameranamen (IMG_0002, PXL_..., nur Zahlen) ergeben titel "".
    """
    datum, rest = None, stem
    m = DATUM_RE.match(stem)
    if m and _iso_datum(*m.group(1).split("-")):
        datum, rest = m.group(1), m.group(2) or ""
    titel = " ".join(re.sub(r"[_-]", " ", rest).split())
    if not titel or GENERISCH_RE.fullmatch(_normalisiert(rest).lower()):
        if datum is None:
            k = KAMERA_DATUM_RE.search(rest)
            datum = _iso_datum(*k.groups()) if k else None
        return datum, ""
    return datum, titel


def dekodiere(daten):
    """Bytes einer .txt -> Text: UTF-8 (mit/ohne BOM) strikt, UTF-16 bei BOM, sonst cp1252."""
    if daten.startswith((b"\xff\xfe", b"\xfe\xff")):
        try:
            return daten.decode("utf-16")
        except UnicodeDecodeError:
            pass
    try:
        return daten.decode("utf-8-sig")
    except UnicodeDecodeError:
        return daten.decode("cp1252", errors="replace")


NOTIZ_RE = re.compile(r"##\s*notiz\s*:?", re.IGNORECASE)


def lese_text_und_notiz(txt_pfad, titel):
    """Liest die .txt (Pfad oder None): gibt (titel, text oder None, notiz oder None) zurück.

    Die Notiz ist alles nach einer Zeile `## Notiz`; sie gehört nicht zum Text.
    """
    if txt_pfad is None or not txt_pfad.is_file():
        return titel, None, None
    inhalt = dekodiere(txt_pfad.read_bytes()).lstrip("﻿")
    zeilen = inhalt.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if zeilen and zeilen[0].startswith("#") and not NOTIZ_RE.fullmatch(zeilen[0].strip()):
        neuer_titel = zeilen[0].lstrip("#").strip()
        if neuer_titel:
            titel = neuer_titel
        zeilen = zeilen[1:]
    notiz = None
    for i, zeile in enumerate(zeilen):
        if NOTIZ_RE.fullmatch(zeile.strip()):
            notiz = "\n".join(zeilen[i + 1:]).strip() or None
            zeilen = zeilen[:i]
            break
    text = "\n".join(zeilen).strip()
    return titel, text or None, notiz


def lese_text(txt_pfad, titel):
    """Wie lese_text_und_notiz, aber nur (titel, text)."""
    return lese_text_und_notiz(txt_pfad, titel)[:2]


def finde_txt(bild_pfad, txts):
    """Sucht die zum Bild gehörende .txt in {kleingeschriebener Name: Pfad}.

    Passt `name.txt` (Groß-/Kleinschreibung egal) und `name.jpg.txt`.
    """
    return (txts.get(bild_pfad.stem.lower() + ".txt")
            or txts.get(bild_pfad.name.lower() + ".txt"))


def lese_widmung(ordner):
    """Liest die optionale widmung.txt (Groß-/Kleinschreibung egal) -> {"titel", "text"} oder None."""
    if not ordner.is_dir():
        return None
    for pfad in sorted(ordner.iterdir()):
        if pfad.name.lower() == "widmung.txt" and pfad.is_file():
            titel, text = lese_text(pfad, "")
            return {"titel": titel, "text": text or ""} if titel or text else None
    return None
