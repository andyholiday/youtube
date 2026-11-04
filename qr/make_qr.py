"""Erzeugt den QR-Code im 3D-Herz (herz-qr.png).

Das Herz wird als 3D-Szene (Three.js, headless Chromium via Playwright) gerendert,
der QR-Code danach flach und frontal in die Karte gesetzt.

Aufruf:  python3 make_qr.py [URL] [--out ORDNER] [--px PIXEL_PRO_MODUL]
Voraussetzung: node mit globalem `playwright` (Chromium vorhanden), Internet nur beim
ersten Lauf (Three.js wird in _cache/ abgelegt).
"""
import argparse
import io
import json
import random
import subprocess
import tempfile
import urllib.request
from pathlib import Path

import cairosvg
import cv2
import numpy as np
import segno
from PIL import Image

import layout
from backdrop import compose as backdrop, inner_shadow
from sparkle import add_sparkles

HIER = Path(__file__).parent
URL = "https://andyholiday.github.io/youtube/"
QUIET = 3.5          # Ruhezone in Modulen, innerhalb der hellen Karte
DARK = "#3b0a1c"     # dunkles Weinrot, hoher Kontrast zur hellen Karte
THREE = "https://cdn.jsdelivr.net/npm/three@0.169.0/"
THREE_FILES = {"three.module.js": "build/three.module.js",
               "RoomEnvironment.js": "examples/jsm/environments/RoomEnvironment.js"}
HEART_BOX = ("M.5 .94C.5 .94 .02 .62 .02 .32C.02 .14 .16 .03 .3 .03"
             "C.41 .03 .5 .1 .5 .22C.5 .1 .59 .03 .7 .03C.84 .03 .98 .14 "
             ".98 .32C.98 .62 .5 .94 .5 .94Z")
# schwebende Herzchen: Material, Groesse, Position (Module, y oben), Drehung in Grad
FLOATERS = [
    dict(mat="rose", size=13, x=-38, y=-80, z=16, rx=18, ry=-26, rz=14),
    dict(mat="ruby", size=8, x=-43, y=-61, z=11, rx=-14, ry=22, rz=-18),
    dict(mat="blush", size=10, x=39, y=-77, z=14, rx=16, ry=28, rz=-12),
    dict(mat="gold", size=6, x=33, y=-92, z=9, rx=-22, ry=-18, rz=20),
    dict(mat="ruby", size=5, x=44, y=-60, z=8, rx=12, ry=-24, rz=16),
    dict(mat="gold", size=5.5, x=-44.5, y=-5, z=8, rx=15, ry=20, rz=-14),
    dict(mat="blush", size=6.5, x=44.5, y=-4.5, z=10, rx=-16, ry=-24, rz=18),
]
SPARKLES = [(-22.5, -14, 3.6), (20, -14, 2.6), (-38, -78, 2.6), (40, -74, 3.0), (-30, -90, 1.6),
            (-12, -90, 1.4), (30, -64, 1.8), (-45, -50, 2.0), (46, -45, 1.6), (0, -6, 1.8)]


def ensure_three():
    """Lädt die fest versionierten Three.js-Dateien einmalig nach _cache/."""
    cache = HIER / "_cache"
    cache.mkdir(exist_ok=True)
    for name, remote in THREE_FILES.items():
        if not (cache / name).exists():
            (cache / name).write_bytes(urllib.request.urlopen(THREE + remote).read())
    return cache


def beads(plan, seed=7, count=34):
    """Kleine Gold- und Perlkugeln, verstreut ausserhalb des Herzens."""
    rnd = random.Random(seed)
    poly = (plan["outline"] * 100).astype(np.int32)
    left, top, w, h = plan["view"]
    out = []
    while len(out) < count:
        x, y = rnd.uniform(left + 2, left + w - 2), rnd.uniform(top - h + 2, top - 1)
        inside = cv2.pointPolygonTest(poly, (float(x * 100), float(y * 100)), True) / 100
        near = any(np.hypot(x - f["x"], y - f["y"]) < f["size"] * 0.9 for f in FLOATERS)
        if inside > -5 or near or any(np.hypot(x - b["x"], y - b["y"]) < 4 for b in out):
            continue
        out.append(dict(x=x, y=y, z=rnd.uniform(3, 9), r=rnd.uniform(0.35, 0.8),
                        mat=rnd.choice(["gold", "pearl"])))
    return out


def scene_config(plan, px):
    left, top, w, h = plan["view"]
    cx0, cy0 = plan["card"]
    side = plan["side"]
    unit = layout.heart_unit(24)
    unit = (unit - [0, (unit[:, 1].max() + unit[:, 1].min()) / 2]) / 0.96
    return {"px": px, "view": {"left": left, "top": top, "w": w, "h": h},
            "outline": plan["outline"].tolist(), "unit": unit.tolist(),
            "card": {"cx": cx0 + side / 2, "cy": cy0 + side / 2, "side": side, "frame": layout.FRAME},
            "floaters": FLOATERS, "beads": beads(plan)}


def render_scene(plan, px, target):
    cache = ensure_three()
    with tempfile.TemporaryDirectory() as tmp:
        cfg = Path(tmp) / "cfg.json"
        cfg.write_text(json.dumps(scene_config(plan, px)))
        subprocess.run(["node", str(HIER / "render_heart.js"), str(cfg), str(target), str(cache)],
                       check=True, timeout=600)


def scaled_heart(x, y):
    """Kleines Herz (Pfad) im Modulfeld mit Ecke (x, y), Kantenlaenge 1."""
    toks = HEART_BOX.replace("C", " C ").replace("M", "M ").replace("Z", " Z").split()
    out, k = [], 0
    for tok in toks:
        if tok in ("M", "C", "Z"):
            out.append(tok)
            k = 0
            continue
        v = float(tok)
        out.append(f"{x + v:.3f}" if k % 2 == 0 else f"{y + v:.3f}")
        k += 1
    return " ".join(out)


def rrect(x, y, w, r):
    """Abgerundetes Quadrat als Pfad."""
    return (f"M{x + r:.3f} {y}H{x + w - r:.3f}A{r} {r} 0 0 1 {x + w} {y + r:.3f}"
            f"V{y + w - r:.3f}A{r} {r} 0 0 1 {x + w - r:.3f} {y + w}H{x + r:.3f}"
            f"A{r} {r} 0 0 1 {x} {y + w - r:.3f}V{y + r:.3f}A{r} {r} 0 0 1 {x + r:.3f} {y}Z")


def finder(x, y):
    """Finder-Pattern; der Aussenring bleibt fast eckig (OpenCV verliert ihn sonst)."""
    return rrect(x, y, 7, 0.3) + rrect(x + 1, y + 1, 5, 0.8) + rrect(x + 2, y + 2, 3, 1.4)


def qr_svg(url, side):
    """Transparenter SVG-Block der Karte (Einheit Modul): nur dunkle Module."""
    qr = segno.make(url, error="h", boost_error=False)
    n = qr.symbol_size(border=0)[0]
    assert n + 2 * QUIET == side, (n, side)
    finders = [(0, 0), (n - 7, 0), (0, n - 7)]
    in_finder = lambda r, c: any(fx - 1 <= c < fx + 8 and fy - 1 <= r < fy + 8 for fx, fy in finders)
    hearts = [scaled_heart(QUIET + c, QUIET + r)
              for r, row in enumerate(qr.matrix) for c, v in enumerate(row)
              if v and not in_finder(r, c)]
    fin = "".join(finder(QUIET + fx, QUIET + fy) for fx, fy in finders)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {side}">'
            f'<path d="{" ".join(hearts)}" fill="{DARK}"/>'
            f'<path d="{fin}" fill="{DARK}" fill-rule="evenodd"/></svg>')


def qr_side(url):
    n = segno.make(url, error="h", boost_error=False).symbol_size(border=0)[0]
    return n + 2 * QUIET


def compose(url, out, px):
    side = qr_side(url)
    plan = layout.plan(int(side))
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        scene = Path(tmp) / "scene.png"
        render_scene(plan, px, scene)
        img = backdrop(Image.open(scene).convert("RGBA"),
                       Image.open(Path(tmp) / "scene-shadow.png").convert("RGBA"), px)
    left, top, _, _ = plan["view"]
    img = add_sparkles(img, [((x - left) * px, (top - y) * px, s * px) for x, y, s in SPARKLES])
    qr_png = cairosvg.svg2png(bytestring=qr_svg(url, side).encode(),
                              output_width=int(side * px), output_height=int(side * px))
    qr = Image.open(io.BytesIO(qr_png)).convert("RGBA")
    cx0, cy0 = plan["card"]
    x0, y0 = round((cx0 - left) * px), round((top - (cy0 + side)) * px)
    img = inner_shadow(img, (x0, y0, x0 + qr.width, y0 + qr.height), px)
    img.paste(qr, (x0, y0), qr)
    target = out / "herz-qr.png"
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
