"""Gemeinsame Hilfen für die Build-Tests."""
import json
import sys
from pathlib import Path

from PIL import Image

WURZEL = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "tools"))
import build  # noqa: E402


def bild(pfad, groesse=(100, 60), fmt=None, farbe=(200, 100, 50), **kw):
    Image.new("RGB", groesse, farbe).save(pfad, fmt, **kw)


def lauf(dirs):
    erinnerungen, site, out = dirs
    build.baue(erinnerungen, site, out)
    return json.loads((out / "erinnerungen.json").read_text(encoding="utf-8"))["erinnerungen"]


def ausgabe_pfad(dirs, e):
    """Pfad der Ausgabedatei zu einem JSON-Eintrag (ohne ?v=-Parameter)."""
    return dirs[2] / e["bild"].split("?")[0]


def _s15(wert):
    return int(round(wert * 65536)).to_bytes(4, "big", signed=True)


def display_p3_profil():
    """Baut ein minimales ICC-v2-Matrixprofil mit Display-P3-Primärvalenzen (D50-adaptiert)."""
    def xyz(x, y, z):
        return b"XYZ \0\0\0\0" + _s15(x) + _s15(y) + _s15(z)

    def text(s):
        return b"text\0\0\0\0" + s.encode("ascii") + b"\0"

    name = b"Display P3"
    desc = (b"desc\0\0\0\0" + (len(name) + 1).to_bytes(4, "big") + name + b"\0"
            + bytes(4 + 4 + 2 + 1 + 67))
    gamma = b"curv\0\0\0\0" + (1).to_bytes(4, "big") + round(2.2 * 256).to_bytes(2, "big") + b"\0\0"
    tags = [(b"desc", desc), (b"cprt", text("Test")), (b"wtpt", xyz(0.9642, 1.0, 0.8249)),
            (b"rXYZ", xyz(0.5151, 0.2412, -0.0011)), (b"gXYZ", xyz(0.2920, 0.6922, 0.0419)),
            (b"bXYZ", xyz(0.1571, 0.0666, 0.7841)),
            (b"rTRC", gamma), (b"gTRC", gamma), (b"bTRC", gamma)]
    tabelle, daten = b"", b""
    start = 128 + 4 + 12 * len(tags)
    for sig, inhalt in tags:
        inhalt += bytes(-len(inhalt) % 4)
        tabelle += sig + (start + len(daten)).to_bytes(4, "big") + len(inhalt).to_bytes(4, "big")
        daten += inhalt
    kopf = bytearray(128)
    kopf[4:8] = b"lcms"
    kopf[8:12] = bytes([2, 0x40, 0, 0])
    kopf[12:24] = b"mntrRGB XYZ "
    kopf[36:40] = b"acsp"
    kopf[68:80] = _s15(0.9642) + _s15(1.0) + _s15(0.8249)
    gesamt = bytes(kopf) + len(tags).to_bytes(4, "big") + tabelle + daten
    return len(gesamt).to_bytes(4, "big") + gesamt[4:]
