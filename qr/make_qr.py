"""Erzeugt den QR-Code im 3D-Herz: herz-qr.png (dunkel), herz-qr-hell.png (hell), herz-qr-weiss.png (weiss).

Das Bordeaux-Herz mit Messing-Fasenrand (dunkel/hell) bzw. das weisse Porzellan-Herz (weiss) wird als
3D-Szene (Three.js, headless Chromium via Playwright) gerendert, der QR-Code danach flach und frontal
gesetzt: als Karte im Messingrahmen oder als Intarsie auf dem ebenen Plateau des Porzellans.

Aufruf:  python3 make_qr.py [URL] [--out ORDNER] [--px PIXEL_PRO_MODUL] [--variante dunkel hell weiss]
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
from backdrop import PALETTES, compose as backdrop, inner_shadow
from inlay import engrave

HIER = Path(__file__).parent
URL = "https://andyholiday.github.io/youtube/"
QUIET = 3.5          # Ruhezone in Modulen, innerhalb der hellen Karte
DARK = "#2b0912"     # fast schwarzes Bordeaux, hoher Kontrast zur hellen Karte
INLAY_FRAME = 0.5    # Plateau ragt so weit (Module) ueber die Ruhezone hinaus
BEZEL = 2.0          # Breite des Messing-Fasenrands in Modulen
THREE = "https://cdn.jsdelivr.net/npm/three@0.169.0/"
THREE_FILES = {"three.module.js": "build/three.module.js",
               "RoomEnvironment.js": "examples/jsm/environments/RoomEnvironment.js"}
HEART_BOX = ("M.5 .94C.5 .94 .02 .62 .02 .32C.02 .14 .16 .03 .3 .03"
             "C.41 .03 .5 .1 .5 .22C.5 .1 .59 .03 .7 .03C.84 .03 .98 .14 "
             ".98 .32C.98 .62 .5 .94 .5 .94Z")

def ensure_three():
    """Lädt die fest versionierten Three.js-Dateien einmalig nach _cache/."""
    cache = HIER / "_cache"
    cache.mkdir(exist_ok=True)
    for name, remote in THREE_FILES.items():
        if not (cache / name).exists():
            (cache / name).write_bytes(urllib.request.urlopen(THREE + remote).read())
    return cache


def scene_config(plan, px, style="karte"):
    left, top, w, h = plan["view"]
    cx0, cy0 = plan["card"]
    side = plan["side"]
    inner = layout.inset_outline(plan["outline"], BEZEL).tolist() if style == "karte" else []
    return {"px": px, "view": {"left": left, "top": top, "w": w, "h": h}, "style": style,
            "outline": plan["outline"].tolist(), "inner": inner,
            "card": {"cx": cx0 + side / 2, "cy": cy0 + side / 2, "side": side, "frame": plan["frame"]}}


def render_scene(plan, px, target, style="karte"):
    cache = ensure_three()
    with tempfile.TemporaryDirectory() as tmp:
        cfg = Path(tmp) / "cfg.json"
        cfg.write_text(json.dumps(scene_config(plan, px, style)))
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


def tile(x, y):
    """Quadratisches Modul mit weich gerundeten Ecken und hauchfeiner Fuge (Intarsie)."""
    return rrect(x + 0.03, y + 0.03, 0.94, 0.2)


def qr_svg(url, side, module=scaled_heart, ink=DARK):
    """Transparenter SVG-Block der Karte (Einheit Modul): nur dunkle Module; module(x, y) liefert den Modulpfad."""
    qr = segno.make(url, error="h", boost_error=False)
    n = qr.symbol_size(border=0)[0]
    assert n + 2 * QUIET == side, (n, side)
    finders = [(0, 0), (n - 7, 0), (0, n - 7)]
    in_finder = lambda r, c: any(fx - 1 <= c < fx + 8 and fy - 1 <= r < fy + 8 for fx, fy in finders)
    hearts = [module(QUIET + c, QUIET + r)
              for r, row in enumerate(qr.matrix) for c, v in enumerate(row)
              if v and not in_finder(r, c)]
    fin = "".join(finder(QUIET + fx, QUIET + fy) for fx, fy in finders)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {side} {side}">'
            f'<path d="{" ".join(hearts)}" fill="{ink}"/>'
            f'<path d="{fin}" fill="{ink}" fill-rule="evenodd"/></svg>')


def qr_side(url):
    n = segno.make(url, error="h", boost_error=False).symbol_size(border=0)[0]
    return n + 2 * QUIET


def render_qr(url, side, px, pal):
    """QR-Ebene als RGBA-Bild (Modul = Herz in der Karte oder gerundete Kachel in der Intarsie)."""
    inlay = pal["style"] == "intarsie"
    ink = "#%02x%02x%02x" % pal["ink"] if inlay else DARK
    svg = qr_svg(url, side, tile if inlay else scaled_heart, ink)
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=int(side * px), output_height=int(side * px))
    return Image.open(io.BytesIO(png)).convert("RGBA")


def finish(img, qr, box, px, pal):
    """Setzt die QR-Ebene in das Hintergrundbild: als Karte (Innenschatten) oder eingelegt (Intarsie)."""
    x0, y0 = box
    if pal["style"] == "intarsie":
        return engrave(img, qr, box, px, pal["ink"])
    img = inner_shadow(img, (x0, y0, x0 + qr.width, y0 + qr.height), px)
    img.paste(qr, box, qr)
    return img


def compose_style(url, side, out, px, style, names):
    """Rendert die Szene eines Stils einmal und setzt sie je Variante (Palette) zusammen."""
    plan = layout.plan(int(side), frame=INLAY_FRAME) if style == "intarsie" else layout.plan(int(side))
    left, top, _, _ = plan["view"]
    cx0, cy0 = plan["card"]
    box = (round((cx0 - left) * px), round((top - (cy0 + side)) * px))
    with tempfile.TemporaryDirectory() as tmp:
        scene = Path(tmp) / "scene.png"
        render_scene(plan, px, scene, style)
        beauty = Image.open(scene).convert("RGBA")
        shadow = Image.open(Path(tmp) / "scene-shadow.png").convert("RGBA")
    targets = {}
    for name in names:
        pal = PALETTES[name]
        img = finish(backdrop(beauty, shadow, px, pal), render_qr(url, side, px, pal), box, px, pal)
        targets[name] = out / pal["file"]
        img.save(targets[name], dpi=(300, 300))
    return targets


def compose(url, out, px, variants=tuple(PALETTES)):
    """Erzeugt die Varianten (je Stil eine Szene); Ergebnis: {Variante: Pfad}."""
    side = qr_side(url)
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    targets = {}
    for style in dict.fromkeys(PALETTES[v]["style"] for v in variants):
        names = [v for v in variants if PALETTES[v]["style"] == style]
        targets.update(compose_style(url, side, out, px, style, names))
    return targets


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("url", nargs="?", default=URL)
    ap.add_argument("--out", default=str(HIER))
    ap.add_argument("--px", type=int, default=32, help="Pixel pro Modul (Bildbreite = 100 Module)")
    ap.add_argument("--variante", nargs="+", choices=list(PALETTES), default=list(PALETTES),
                    help="nur diese Varianten erzeugen (Standard: alle)")
    a = ap.parse_args()
    for name, path in compose(a.url, a.out, a.px, tuple(a.variante)).items():
        print(f"geschrieben ({name}): {path}")


if __name__ == "__main__":
    main()
