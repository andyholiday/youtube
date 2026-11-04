#!/usr/bin/env python3
"""Erzeugt Fixture-Bilder und JSON-Dateien (0 / 1 / 7 Einträge) für die Museums-Tests."""
import json, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "fixtures")
os.makedirs(os.path.join(OUT, "erinnerungen"), exist_ok=True)

# (Dateiname, Breite, Hoehe, Titel, Datum, Text, Farben)
EINTRAEGE = [
    ("2021-05-01_erster-ausflug.jpg", 1600, 1200, "Erster Ausflug", "2021-05-01", "Ein sonniger Tag am See.", ((240, 150, 90), (120, 60, 90))),
    ("2022-02-14_valentinstag.jpg", 1200, 1600, "Valentinstag", "2022-02-14", "Wir haben zusammen gekocht.\nUnd viel gelacht.", ((230, 80, 110), (90, 30, 70))),
    ("2022-08-20_quadrat.jpg", 1200, 1200, "Sommerabend auf dem Balkon", "2022-08-20", None, ((90, 170, 200), (30, 60, 110))),
    ("2023-06-12_unser-erster-urlaub.jpg", 1600, 900, "Unser erster Urlaub mit einem sehr langen Titel, der nicht aufs Schild passt", "2023-06-12", "Italien, Pizza, Meer.", ((250, 200, 90), (200, 80, 60))),
    ("2023-12-24_weihnachten.jpg", 900, 1600, "Weihnachten", "2023-12-24", "Der schönste Baum.", ((60, 140, 90), (20, 60, 50))),
    ("2024-04-10_spaziergang.jpg", 1500, 1000, "Spaziergang im Frühling", "2024-04-10", "Kirschblüten überall.", ((250, 190, 210), (150, 90, 130))),
    ("ohne-datum_zufallsfoto.jpg", 1000, 1500, "Zufallsfoto", None, "Ohne Datum, aber nicht ohne Herz.", ((170, 150, 230), (60, 50, 120))),
]


def font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def bild(name, w, h, farben, nr):
    img = Image.new("RGB", (w, h))
    px = img.load()
    (r1, g1, b1), (r2, g2, b2) = farben
    for y in range(h):
        t = y / (h - 1)
        row = (int(r1 + (r2 - r1) * t), int(g1 + (g2 - g1) * t), int(b1 + (b2 - b1) * t))
        for x in range(w):
            px[x, y] = row
    d = ImageDraw.Draw(img)
    d.ellipse([w * .25, h * .25, w * .75, h * .75], outline=(255, 255, 255), width=max(6, w // 100))
    d.text((w / 2, h / 2), str(nr), fill=(255, 255, 255), font=font(h // 3), anchor="mm")
    d.text((w / 2, h * .92), f"{w}x{h}", fill=(255, 255, 255), font=font(h // 14), anchor="mm")
    img.save(os.path.join(OUT, "erinnerungen", name), quality=82)


eintraege = []
for nr, (name, w, h, titel, datum, text, farben) in enumerate(EINTRAEGE, 1):
    bild(name, w, h, farben, nr)
    eintraege.append({"bild": f"erinnerungen/{name}", "titel": titel, "datum": datum,
                      "text": text, "breite": w, "hoehe": h})

for dateiname, liste in (("data-0.json", []), ("data-1.json", eintraege[:1]), ("data-7.json", eintraege)):
    with open(os.path.join(OUT, dateiname), "w", encoding="utf-8") as f:
        json.dump({"erinnerungen": liste}, f, ensure_ascii=False, indent=2)
print("Fixtures geschrieben:", OUT)
