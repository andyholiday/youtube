#!/usr/bin/env python3
"""Erzeugt die Platzhalterbilder (und zwei .txt) in erinnerungen/. Nur zum Ersetzen durch echte Fotos."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ZIEL = Path(__file__).resolve().parent.parent / "erinnerungen"
SCHRIFTEN = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
             "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"]

# (Dateiname, Breite, Höhe, Farbe oben, Farbe unten)
BILDER = [
    ("2023-06-12_unser-erster-urlaub", 1200, 800, (255, 183, 120), (214, 86, 108)),
    ("2023-09-30_herbstspaziergang", 800, 1100, (250, 204, 110), (176, 90, 60)),
    ("2024-02-14_valentinstag", 1000, 1000, (255, 150, 170), (150, 50, 100)),
    ("2024-07-21_am-meer", 1280, 720, (130, 200, 230), (70, 110, 170)),
    ("2025-01-01_neujahr", 900, 1200, (200, 160, 230), (90, 70, 150)),
    ("platzhalter-5", 1200, 900, (240, 200, 150), (190, 120, 90)),
    ("platzhalter-6", 1000, 1000, (170, 215, 170), (70, 130, 110)),
    ("platzhalter-7", 1100, 800, (255, 170, 140), (200, 80, 90)),
]
TEXTE = {
    "2023-06-12_unser-erster-urlaub": "# Unser erster Urlaub\nDas war die schönste Woche am Meer.\nPlatzhaltertext: hier steht später deine Erinnerung.",
    "2024-02-14_valentinstag": "Platzhaltertext ohne eigenen Titel.\nHier kann ein paar Sätze Erinnerung stehen.",
}


def lade_schrift(groesse):
    for pfad in SCHRIFTEN:
        if Path(pfad).exists():
            return ImageFont.truetype(pfad, groesse)
    return ImageFont.load_default(size=groesse)


def verlauf(b, h, oben, unten):
    img = Image.new("RGB", (b, h))
    d = ImageDraw.Draw(img)
    for y in range(h):
        t = y / (h - 1)
        d.line([(0, y), (b, y)], fill=tuple(round(o + (u - o) * t) for o, u in zip(oben, unten)))
    return img


def zeichne(name, b, h, oben, unten, nummer):
    img = verlauf(b, h, oben, unten)
    d = ImageDraw.Draw(img)
    text = f"Platzhalter {nummer}"
    schrift = lade_schrift(b // 9)
    box = d.textbbox((0, 0), text, font=schrift)
    x, y = (b - (box[2] - box[0])) / 2 - box[0], (h - (box[3] - box[1])) / 2 - box[1]
    d.text((x + 3, y + 3), text, font=schrift, fill=tuple(round(u * 0.6) for u in unten))
    d.text((x, y), text, font=schrift, fill=(255, 255, 255))
    img.save(ZIEL / f"{name}.jpg", "JPEG", quality=80, optimize=True)


def main():
    ZIEL.mkdir(exist_ok=True)
    for nummer, (name, b, h, oben, unten) in enumerate(BILDER, 1):
        zeichne(name, b, h, oben, unten, nummer)
    for name, text in TEXTE.items():
        (ZIEL / f"{name}.txt").write_text(text + "\n", encoding="utf-8")
    print(f"{len(BILDER)} Platzhalterbilder in {ZIEL}")


if __name__ == "__main__":
    main()
