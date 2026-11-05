#!/usr/bin/env python3
"""Baut die Seite: site/ -> _site/, erinnerungen/ -> verkleinerte JPGs + erinnerungen.json."""
import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path

from bilder import BILD_ENDUNGEN, MAX_KANTE, inhalts_hash, verkleinere  # noqa: F401
from geheim import lese_geheimnisse
from namen import finde_txt, lese_text, lese_text_und_notiz, lese_widmung, parse_name  # noqa: F401

STILLE_NAMEN = {"thumbs.db", "desktop.ini"}
GEHEIM_ORDNER = "geheim"


def _annotation(text):
    """Escaping für GitHub-Workflow-Befehle (::warning ...)."""
    return text.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")


class Bericht:
    """Sammelt Warnungen: stderr, GitHub-Annotation und Zusammenfassung des Laufs."""

    def __init__(self):
        self.meldungen = []  # (art, datei, text); art: "uebersprungen" oder "hinweis"

    def _melde(self, art, datei, text):
        name = datei.name if isinstance(datei, Path) else datei
        self.meldungen.append((art, name, text))
        print(f"WARNUNG: {name + ': ' if name else ''}{text}", file=sys.stderr)
        if os.environ.get("GITHUB_ACTIONS"):
            pfad = ""
            if isinstance(datei, Path):
                try:
                    pfad = datei.resolve().relative_to(Path.cwd().resolve()).as_posix()
                except ValueError:
                    pfad = datei.name
            prop = f" file={_annotation(pfad).replace(':', '%3A').replace(',', '%2C')}" if pfad else ""
            print(f"::warning{prop}::{_annotation(f'{name}: {text}' if name else text)}")

    def uebersprungen(self, datei, text):
        self._melde("uebersprungen", datei, text)

    def hinweis(self, datei, text):
        self._melde("hinweis", datei, text)

    def zusammenfassung(self, anzahl):
        """Schreibt die kurze deutsche Zusammenfassung nach $GITHUB_STEP_SUMMARY (falls gesetzt)."""
        ziel = os.environ.get("GITHUB_STEP_SUMMARY")
        if not ziel:
            return
        skip = [m for m in self.meldungen if m[0] == "uebersprungen"]
        hinweise = [m for m in self.meldungen if m[0] == "hinweis"]
        wort = "Erinnerung" if anzahl == 1 else "Erinnerungen"
        kopf = f"**{anzahl} {wort} online**"
        if not self.meldungen:
            zeilen = [f"{kopf} · nichts übersprungen."]
        else:
            zeilen = [f"{kopf} · übersprungen: {len(skip)} · Hinweise: {len(hinweise)}", ""]
            zeilen += [f"- `{name}`: {text}" if name else f"- {text}" for _, name, text in self.meldungen]
        try:
            with open(ziel, "a", encoding="utf-8") as f:
                f.write("## Museum aktualisiert\n\n" + "\n".join(zeilen) + "\n")
        except OSError:
            pass


def sortier_schluessel(e):
    return (e["datum"] is None, e["datum"] or "", e["bild"].split("?")[0].lower())


def klassifiere(pfad):
    """'bild', 'txt', 'still' (bewusst ignoriert), 'ordner' oder 'fremd'."""
    endung = pfad.suffix.lower()
    if pfad.is_dir():
        return "still" if pfad.name.startswith(".") else "ordner"
    if endung in BILD_ENDUNGEN:
        return "bild"
    if endung == ".txt" and pfad.stem.lower() not in ("readme", "widmung", "geheimnisse"):
        return "txt"
    if (pfad.name.startswith(".") or endung in (".md", ".txt")
            or pfad.name.lower() in STILLE_NAMEN):
        return "still"
    return "fremd"


def _eintrag(pfad, ausgabe, ziel, txt, praefix):
    """Verarbeitet ein Bild; gibt den JSON-Eintrag zurück (Fehler -> Exception)."""
    breite, hoehe, exif_datum = verkleinere(pfad, ziel / ausgabe)
    datum, titel = parse_name(pfad.stem)
    titel, text, notiz = lese_text_und_notiz(txt, titel)
    return {
        "bild": f"{praefix}/{ausgabe}?v={inhalts_hash(ziel / ausgabe)}", "titel": titel,
        "datum": datum or exif_datum, "text": text, "notiz": notiz, "breite": breite, "hoehe": hoehe,
        "quelle": f"{praefix}/{pfad.name}",
    }


def _unterordner_warnung(pfad, bericht, ist_hauptordner):
    if ist_hauptordner and pfad.name.lower() == GEHEIM_ORDNER:
        return  # erinnerungen/geheim/ ist gewollt und wird separat gebaut
    bericht.uebersprungen(pfad, "Unterordner werden nicht gelesen, Fotos bitte direkt in erinnerungen/ legen"
                                " (Ausnahme: der Ordner geheim für den geheimen Raum).")


def baue_erinnerungen(quelle, ziel_bilder, bericht, praefix="erinnerungen"):
    """Baut alle Bilder aus `quelle` nach `ziel_bilder`; `praefix` steht im JSON vor dem Dateinamen."""
    eintraege, benutzt = [], set()
    if not quelle.is_dir():
        bericht.hinweis(None, f"{quelle} existiert nicht, keine Erinnerungen.")
        return eintraege
    dateien = sorted(quelle.iterdir(), key=lambda p: p.name.lower())
    arten = {p: klassifiere(p) for p in dateien}
    txts = {p.name.lower(): p for p in reversed(dateien) if arten[p] == "txt"}
    verwendet = set()
    for pfad in dateien:
        if arten[pfad] == "ordner":
            _unterordner_warnung(pfad, bericht, praefix == "erinnerungen")
        elif arten[pfad] == "fremd":
            bericht.uebersprungen(pfad, "Dateityp wird nicht unterstützt (nur Fotos: JPG, PNG, WebP, HEIC).")
        if arten[pfad] != "bild":
            continue
        txt = finde_txt(pfad, txts)
        verwendet.add(txt)
        ausgabe = re.sub(r"[^\w.\-]", "_", pfad.stem) + ".jpg"
        if ausgabe.lower() in benutzt:
            bericht.uebersprungen(pfad, f"Ausgabename {ausgabe} schon vergeben, übersprungen.")
            continue
        ziel_bilder.mkdir(parents=True, exist_ok=True)
        try:
            eintraege.append(_eintrag(pfad, ausgabe, ziel_bilder, txt, praefix))
        except Exception as fehler:  # kaputte Datei darf den Build nicht stoppen
            bericht.uebersprungen(pfad, f"kein lesbares Bild, übersprungen ({fehler}).")
            (ziel_bilder / ausgabe).unlink(missing_ok=True)
            continue
        benutzt.add(ausgabe.lower())
    for pfad in dateien:
        if arten[pfad] == "txt" and pfad not in verwendet:
            bericht.hinweis(pfad, "Textdatei gehört zu keinem Foto (Name muss zum Foto passen, "
                                  "z. B. foto.txt oder foto.jpg.txt) und wird nicht benutzt.")
    return sorted(eintraege, key=sortier_schluessel)


def baue_geheim(erinnerungen, ziel_bilder, bericht):
    """Liest geheimnisse.txt und baut erinnerungen/geheim/; gibt immer ein vollständiges geheim-Objekt zurück."""
    geheim = lese_geheimnisse(erinnerungen, bericht)
    ordner = next((p for p in sorted(erinnerungen.iterdir()) if p.is_dir()
                   and p.name.lower() == GEHEIM_ORDNER), None) if erinnerungen.is_dir() else None
    if ordner:
        geheim["raum"] = baue_erinnerungen(ordner, ziel_bilder / GEHEIM_ORDNER, bericht,
                                           f"erinnerungen/{GEHEIM_ORDNER}")
    return geheim


def baue(erinnerungen, site, ausgabe):
    bericht = Bericht()
    if ausgabe.exists():
        shutil.rmtree(ausgabe)
    if site.is_dir():
        shutil.copytree(site, ausgabe)
    else:
        bericht.hinweis(None, f"{site} existiert nicht, _site bleibt ohne Seite.")
        ausgabe.mkdir(parents=True)
    eintraege = baue_erinnerungen(erinnerungen, ausgabe / "erinnerungen", bericht)
    daten = {"erinnerungen": eintraege}
    widmung = lese_widmung(erinnerungen)
    if widmung:
        daten["widmung"] = widmung
    daten["geheim"] = baue_geheim(erinnerungen, ausgabe / "erinnerungen", bericht)
    (ausgabe / "erinnerungen.json").write_text(
        json.dumps(daten, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    bericht.zusammenfassung(len(eintraege))
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
