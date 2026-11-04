"""Erzeugt einen QR-Code im Herz (SVG + PNG).

Aufruf:  python3 make_qr.py [URL] [--out ORDNER] [--breite PIXEL]
"""
import argparse
import math
from pathlib import Path

import cairosvg
import segno

URL = "https://andyholiday.github.io/youtube/"
QUIET = 3.5       # Ruhezone in Modulen, innerhalb der hellen Fläche
INNER_HALF = 8.0  # halbe Seite des größten Quadrats im Herz (Herzeinheiten)
INNER_CY = -2.0   # dessen Mittelpunkt (y nach unten, Herzeinheiten)
DARK = "#5b0c26"  # dunkles Weinrot, Kontrast zur weißen Fläche
HEART_BOX = ("M.5 .94C.5 .94 .02 .62 .02 .32C.02 .14 .16 .03 .3 .03"
             "C.41 .03 .5 .1 .5 .22C.5 .1 .59 .03 .7 .03C.84 .03 .98 .14 "
             ".98 .32C.98 .62 .5 .94 .5 .94Z")


def big_heart(scale, steps=360):
    """Umriss des großen Herzens als Punktliste (Modul-Einheiten, Mitte x=0)."""
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        x = 16 * math.sin(t) ** 3
        y = (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
             + 5 * (1 + math.cos(t)) / 2)  # letzter Term hebt die Kerbe an
        pts.append((x * scale, -y * scale))
    return pts


def scaled_heart(x, y, size=1.0):
    """Kleines Herz (Pfad) im Feld (x, y) mit Kantenlänge size."""
    nums = HEART_BOX.replace("C", " C ").replace("M", "M ").replace("Z", " Z").split()
    out, k = [], 0
    for tok in nums:
        if tok in "MCZ":
            out.append(tok)
            k = 0
            continue
        for part in tok.replace("-", " -").split():
            v = float(part)
            out.append(f"{x + v * size:.3f}" if k % 2 == 0 else f"{y + v * size:.3f}")
            k += 1
    return " ".join(out)


def rrect(x, y, w, r):
    """Abgerundetes Quadrat als Pfad ."""
    return (f"M{x + r:.3f} {y}H{x + w - r:.3f}A{r} {r} 0 0 1 {x + w} {y + r:.3f}"
            f"V{y + w - r:.3f}A{r} {r} 0 0 1 {x + w - r:.3f} {y + w}H{x + r:.3f}"
            f"A{r} {r} 0 0 1 {x} {y + w - r:.3f}V{y + r:.3f}A{r} {r} 0 0 1 {x + r:.3f} {y}Z")


def finder(x, y):
    """Finder-Pattern: Ring (7x7 mit Loch 5x5) und Kern 3x3, abgerundet.

    Die Ecken des Rings sind nur leicht gerundet: OpenCVs Detektor verliert
    das Finder-Pattern bei stärkerer Rundung, der Kern darf rund sein.
    """
    return rrect(x, y, 7, 0.3) + rrect(x + 1, y + 1, 5, 0.8) + rrect(x + 2, y + 2, 3, 1.4)


def build_svg(url):
    qr = segno.make(url, error="h", boost_error=False)
    n = qr.symbol_size(border=0)[0]
    panel = n + 2 * QUIET
    scale = (panel / 2 + 1.5) / INNER_HALF
    heart = big_heart(scale)
    pad = 3
    x0 = min(p[0] for p in heart) - pad
    y0 = min(p[1] for p in heart) - pad
    w = max(p[0] for p in heart) + pad - x0
    h = max(p[1] for p in heart) + pad - y0
    px, py = -panel / 2, INNER_CY * scale - panel / 2
    qx, qy = px + QUIET, py + QUIET

    finders = [(0, 0), (n - 7, 0), (0, n - 7)]
    in_finder = lambda r, c: any(fx - 1 <= c < fx + 8 and fy - 1 <= r < fy + 8 for fx, fy in finders)
    hearts = [scaled_heart(qx + c, qy + r, 1.0)
              for r, row in enumerate(qr.matrix) for c, v in enumerate(row)
              if v and not in_finder(r, c)]
    finder_d = "".join(finder(qx + fx, qy + fy) for fx, fy in finders)
    outline = "M" + "L".join(f"{x:.3f} {y:.3f}" for x, y in heart) + "Z"
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.2f} {y0:.2f} {w:.2f} {h:.2f}">
<title>QR-Code im Herz: {url}</title>
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#f2557f"/><stop offset="1" stop-color="#b3123f"/></linearGradient></defs>
<rect x="{x0:.2f}" y="{y0:.2f}" width="{w:.2f}" height="{h:.2f}" fill="#fff"/>
<path d="{outline}" fill="url(#g)"/>
<rect x="{px:.3f}" y="{py:.3f}" width="{panel}" height="{panel}" rx="3" fill="#fff"/>
<path d="{" ".join(hearts)}" fill="{DARK}"/>
<path d="{finder_d}" fill="{DARK}" fill-rule="evenodd"/>
</svg>
'''


def render(url, out, breite=2400):
    """Schreibt herz-qr.svg und herz-qr.png in den Ordner out."""
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    svg = build_svg(url)
    (out / "herz-qr.svg").write_text(svg, encoding="utf-8")
    cairosvg.svg2png(bytestring=svg.encode(), write_to=str(out / "herz-qr.png"),
                     output_width=breite)
    return out / "herz-qr.svg", out / "herz-qr.png"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("url", nargs="?", default=URL)
    ap.add_argument("--out", default=str(Path(__file__).parent))
    ap.add_argument("--breite", type=int, default=2400, help="PNG-Breite in Pixeln")
    a = ap.parse_args()
    svg, png = render(a.url, a.out, a.breite)
    print(f"geschrieben: {svg}, {png}")


if __name__ == "__main__":
    main()
