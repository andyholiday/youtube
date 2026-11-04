"""Erzeugt den QR-Code im weissen 3D-Porzellan-Herz: herz-qr.png.

Das Herz wird als 3D-Szene (Three.js, headless Chromium via Playwright) gerendert, der QR-Code danach
flach und frontal als Intarsie (dunkle, gerundete Kacheln) auf die ebene Senke des Porzellans gesetzt.

Aufruf:  python3 make_qr.py [URL] [--out ORDNER] [--px PIXEL_PRO_MODUL]
Voraussetzung: node mit globalem `playwright` (Chromium vorhanden), Internet nur beim
ersten Lauf (Three.js wird in _cache/ abgelegt).
"""
import argparse
import io
import json
import subprocess
import tempfile
import urllib.request
from pathlib import Path

import cairosvg
import segno
from PIL import Image

import layout
from backdrop import compose as backdrop
from inlay import engrave

HIER = Path(__file__).parent
URL = "https://andyholiday.github.io/youtube/"
QUIET = 3.5          # Ruhezone in Modulen (helle Porzellanflaeche um den Code)
INK = (38, 14, 22)   # fast schwarzes Bordeaux, hoher Kontrast zum Porzellan
DATEI = "herz-qr.png"
THREE = "https://cdn.jsdelivr.net/npm/three@0.169.0/"
THREE_FILES = {"three.module.js": "build/three.module.js",
               "RoomEnvironment.js": "examples/jsm/environments/RoomEnvironment.js"}


def ensure_three():
    """Lädt die fest versionierten Three.js-Dateien einmalig nach _cache/."""
    cache = HIER / "_cache"
    cache.mkdir(exist_ok=True)
    for name, remote in THREE_FILES.items():
        if not (cache / name).exists():
            (cache / name).write_bytes(urllib.request.urlopen(THREE + remote).read())
    return cache


def scene_config(plan, px):
    left, top, w, h = plan["view"]
    cx0, cy0 = plan["card"]
    side = plan["side"]
    return {"px": px, "view": {"left": left, "top": top, "w": w, "h": h}, "outline": plan["outline"].tolist(),
            "card": {"cx": cx0 + side / 2, "cy": cy0 + side / 2, "side": side, "pad": layout.PAD}}


def render_scene(plan, px, target):
    cache = ensure_three()
    with tempfile.TemporaryDirectory() as tmp:
        cfg = Path(tmp) / "cfg.json"
        cfg.write_text(json.dumps(scene_config(plan, px)))
        subprocess.run(["node", str(HIER / "render_heart.js"), str(cfg), str(target), str(cache)],
                       check=True, timeout=600)


def rrect(x, y, w, r):
    """Abgerundetes Quadrat als Pfad."""
    return (f"M{x + r:.3f} {y}H{x + w - r:.3f}A{r} {r} 0 0 1 {x + w} {y + r:.3f}"
            f"V{y + w - r:.3f}A{r} {r} 0 0 1 {x + w - r:.3f} {y + w}H{x + r:.3f}"
            f"A{r} {r} 0 0 1 {x} {y + w - r:.3f}V{y + r:.3f}A{r} {r} 0 0 1 {x + r:.3f} {y}Z")


def finder(x, y):
    """Finder-Pattern; der Aussenring bleibt fast eckig (OpenCV verliert ihn sonst)."""
    return rrect(x, y, 7, 0.3) + rrect(x + 1, y + 1, 5, 0.8) + rrect(x + 2, y + 2, 3, 1.4)


def tile(x, y):
    """Quadratisches Modul mit weich gerundeten Ecken und hauchfeiner Fuge (Intarsie)."""
    return rrect(x + 0.03, y + 0.03, 0.94, 0.2)


def qr_svg(url, side):
    """Transparenter SVG-Block des Codes (Einheit Modul): nur dunkle Module."""
    qr = segno.make(url, error="h", boost_error=False)
    n = qr.symbol_size(border=0)[0]
    assert n + 2 * QUIET == side, (n, side)
    finders = [(0, 0), (n - 7, 0), (0, n - 7)]
    in_finder = lambda r, c: any(fx - 1 <= c < fx + 8 and fy - 1 <= r < fy + 8 for fx, fy in finders)
    tiles = [tile(QUIET + c, QUIET + r)
             for r, row in enumerate(qr.matrix) for c, v in enumerate(row)
             if v and not in_finder(r, c)]
    fin = "".join(finder(QUIET + fx, QUIET + fy) for fx, fy in finders)
    ink = "#%02x%02x%02x" % INK
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {side}">'
            f'<path d="{" ".join(tiles)}" fill="{ink}"/>'
            f'<path d="{fin}" fill="{ink}" fill-rule="evenodd"/></svg>')


def qr_side(url):
    n = segno.make(url, error="h", boost_error=False).symbol_size(border=0)[0]
    return n + 2 * QUIET


def render_qr(url, side, px):
    """QR-Ebene als RGBA-Bild (gerundete Kacheln)."""
    png = cairosvg.svg2png(bytestring=qr_svg(url, side).encode(),
                           output_width=int(side * px), output_height=int(side * px))
    return Image.open(io.BytesIO(png)).convert("RGBA")


def compose(url, out, px):
    """Erzeugt herz-qr.png in out; Ergebnis: Pfad."""
    side = qr_side(url)
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    plan = layout.plan(int(side))
    left, top, _, _ = plan["view"]
    cx0, cy0 = plan["card"]
    box = (round((cx0 - left) * px), round((top - (cy0 + side)) * px))
    with tempfile.TemporaryDirectory() as tmp:
        scene = Path(tmp) / "scene.png"
        render_scene(plan, px, scene)
        beauty = Image.open(scene).convert("RGBA")
        shadow = Image.open(Path(tmp) / "scene-shadow.png").convert("RGBA")
    img = engrave(backdrop(beauty, shadow, px), render_qr(url, side, px), box, px, INK)
    target = out / DATEI
    img.save(target, dpi=(300, 300))
    return target


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("url", nargs="?", default=URL)
    ap.add_argument("--out", default=str(HIER))
    ap.add_argument("--px", type=int, default=32, help="Pixel pro Modul (Bildbreite = 100 Module)")
    a = ap.parse_args()
    print(f"geschrieben: {compose(a.url, a.out, a.px)}")


if __name__ == "__main__":
    main()
