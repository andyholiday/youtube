#!/usr/bin/env python3
"""Baut die Seite: site/ -> _site/, erinnerungen/ -> verkleinerte JPGs + erinnerungen.json."""
import argparse
import datetime
import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageOps

BILD_ENDUNGEN = {".jpg", ".jpeg", ".png", ".webp"}
MAX_KANTE = 1600
QUALITAET = 85
DATUM_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:[_-]+(.*))?$", re.DOTALL)


def warn(msg):
    print(f"WARNUNG: {msg}", file=sys.stderr)


def parse_name(stem):
    """Gibt (datum oder None, titel) aus dem Dateinamen ohne Endung zurück."""
    datum, rest = None, stem
    m = DATUM_RE.match(stem)
    if m:
        try:
            datetime.date.fromisoformat(m.group(1))
            datum, rest = m.group(1), m.group(2) or ""
        except ValueError:
            pass
    titel = " ".join(re.sub(r"[_-]", " ", rest).split())
    return datum, titel or datum or stem


def lese_text(txt_pfad, titel):
    """Liest die .txt: gibt (titel, text oder None) zurück."""
    if not txt_pfad.is_file():
        return titel, None
    inhalt = txt_pfad.read_text(encoding="utf-8-sig", errors="replace")
    zeilen = inhalt.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if zeilen and zeilen[0].startswith("#"):
        neuer_titel = zeilen[0].lstrip("#").strip()
        if neuer_titel:
            titel = neuer_titel
        zeilen = zeilen[1:]
    text = "\n".join(zeilen).strip()
    return titel, text or None


def verkleinere(quelle, ziel):
    """Dreht per EXIF, entfernt Metadaten, skaliert, speichert JPEG. Gibt (b, h) zurück."""
    with Image.open(quelle) as img:
        img.load()
        img = ImageOps.exif_transpose(img)
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGBA")
            grund = Image.new("RGB", img.size, (255, 255, 255))
            grund.paste(img, mask=img.getchannel("A"))
            img = grund
        else:
            img = img.convert("RGB")
        img.thumbnail((MAX_KANTE, MAX_KANTE), Image.LANCZOS)
        # Neues Bild ohne info/exif: nichts von GPS u. Ä. wird übernommen.
        sauber = Image.new("RGB", img.size)
        sauber.paste(img)
        sauber.save(ziel, "JPEG", quality=QUALITAET, optimize=True)
        return sauber.size


def sortier_schluessel(e):
    return (e["datum"] is None, e["datum"] or "", e["bild"].lower())


def baue_erinnerungen(quelle, ziel_bilder):
    eintraege, benutzt = [], set()
    if not quelle.is_dir():
        warn(f"{quelle} existiert nicht, keine Erinnerungen.")
        return eintraege
    for pfad in sorted(quelle.iterdir(), key=lambda p: p.name.lower()):
        if not pfad.is_file() or pfad.suffix.lower() not in BILD_ENDUNGEN:
            continue
        ausgabe = re.sub(r"[^\w.\-]", "_", pfad.stem) + ".jpg"
        if ausgabe.lower() in benutzt:
            warn(f"{pfad.name}: Ausgabename {ausgabe} schon vergeben, übersprungen.")
            continue
        ziel_bilder.mkdir(parents=True, exist_ok=True)
        try:
            breite, hoehe = verkleinere(pfad, ziel_bilder / ausgabe)
        except Exception as fehler:  # kaputte Datei darf den Build nicht stoppen
            warn(f"{pfad.name}: kein lesbares Bild, übersprungen ({fehler}).")
            (ziel_bilder / ausgabe).unlink(missing_ok=True)
            continue
        benutzt.add(ausgabe.lower())
        datum, titel = parse_name(pfad.stem)
        titel, text = lese_text(pfad.with_suffix(".txt"), titel)
        eintraege.append({
            "bild": f"erinnerungen/{ausgabe}", "titel": titel, "datum": datum,
            "text": text, "breite": breite, "hoehe": hoehe,
        })
    return sorted(eintraege, key=sortier_schluessel)


def baue(erinnerungen, site, ausgabe):
    if ausgabe.exists():
        shutil.rmtree(ausgabe)
    if site.is_dir():
        shutil.copytree(site, ausgabe)
    else:
        warn(f"{site} existiert nicht, _site bleibt ohne Seite.")
        ausgabe.mkdir(parents=True)
    eintraege = baue_erinnerungen(erinnerungen, ausgabe / "erinnerungen")
    (ausgabe / "erinnerungen.json").write_text(
        json.dumps({"erinnerungen": eintraege}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    return eintraege


def main(argv=None):
    wurzel = Path(__file__).resolve().parent.parent
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--erinnerungen", type=Path, default=wurzel / "erinnerungen")
    p.add_argument("--site", type=Path, default=wurzel / "site")
    p.add_argument("--out", type=Path, default=wurzel / "_site")
    a = p.parse_args(argv)
    eintraege = baue(a.erinnerungen, a.site, a.out)
    print(f"Fertig: {len(eintraege)} Erinnerung(en) in {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
