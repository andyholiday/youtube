"""Liest erinnerungen/geheimnisse.txt: Herzregen, Text des geheimen Raums, besondere Tage."""
import datetime
import re
from pathlib import Path

from namen import dekodiere

DATEINAME = "geheimnisse.txt"
ABSCHNITTE = {"herzregen": "herzregen", "geheimer raum": "raumtext", "besondere tage": "tage"}
# T.M. oder TT.MM. (Leerzeichen um die Punkte erlaubt), optional gefolgt von JJJJ (1900-2099), dann Text.
TAG_RE = re.compile(r"(\d{1,2})\s*\.\s*(\d{1,2})\s*\.(?:\s*((?:19|20)\d{2})(?=\s|$))?\s*(.*)", re.DOTALL)


def leeres_geheim():
    return {"herzregen": "", "raumtext": "", "tage": [], "raum": []}


def _tag(zeile):
    """Zeile -> {"tag": "MM-TT", "jahr": int|None, "text": str} oder Fehlertext (str)."""
    m = TAG_RE.fullmatch(zeile)
    if not m:
        return "keine Datumszeile (erwartet z. B. 14.02. Text oder 06.07.2019 Text)"
    tag, monat, jahr, text = int(m[1]), int(m[2]), m[3], m[4].strip()
    try:
        datetime.date(int(jahr) if jahr else 2000, monat, tag)  # 2000: Schaltjahr, 29.02. erlaubt
    except ValueError:
        return f"{m[1]}.{m[2]}.{jahr or ''} ist kein gültiges Datum"
    if not text:
        return "nach dem Datum fehlt der Text"
    return {"tag": f"{monat:02d}-{tag:02d}", "jahr": int(jahr) if jahr else None, "text": text}


def _abschnitte(zeilen, melde):
    """Zerlegt in {feld: [(zeilennummer, zeile), ...]}; Unbekanntes wird gemeldet und übersprungen."""
    ergebnis, aktuell = {}, None  # aktuell: None = vor erster Überschrift, "" = unbekannter Abschnitt
    for nr, zeile in enumerate(zeilen, 1):
        if zeile.lstrip().startswith("#"):
            name = zeile.lstrip().lstrip("#").strip().rstrip(":").strip().lower()
            aktuell = ABSCHNITTE.get(name, "")
            if aktuell:
                ergebnis.setdefault(aktuell, [])
            else:
                melde(nr, f"Überschrift „{zeile.strip()}“ unbekannt (erlaubt: # Herzregen, "
                          "# Geheimer Raum, # Besondere Tage), Abschnitt übersprungen.")
        elif zeile.strip() and aktuell is None:
            melde(nr, "Zeile steht vor der ersten Überschrift, übersprungen.")
        elif zeile.strip() and aktuell:
            ergebnis[aktuell].append((nr, zeile))
    return ergebnis


def lese_geheimnisse(ordner, bericht):
    """Gibt {"herzregen", "raumtext", "tage"} zurück (ggf. leer); Fehler gehen als Warnung an den Bericht."""
    geheim = leeres_geheim()
    ordner = Path(ordner)
    pfad = next((p for p in sorted(ordner.iterdir())
                 if p.name.lower() == DATEINAME and p.is_file()), None) if ordner.is_dir() else None
    if pfad is None:
        return geheim
    zeilen = dekodiere(pfad.read_bytes()).lstrip("﻿").replace("\r\n", "\n").replace("\r", "\n").split("\n")

    def melde(nr, text):
        bericht.uebersprungen(pfad, f"Zeile {nr}: {text}")

    for feld, inhalt in _abschnitte(zeilen, melde).items():
        if feld == "tage":
            for nr, zeile in inhalt:
                tag = _tag(zeile.strip())
                if isinstance(tag, str):
                    melde(nr, f"{tag}, übersprungen.")
                else:
                    geheim["tage"].append(tag)
        else:
            geheim[feld] = "\n".join(z.strip() for _, z in inhalt)
    return geheim
