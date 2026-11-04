"""Hintergrund (zartes Rosé-Champagner mit Vignette) und weicher Schlagschatten."""
import numpy as np
from PIL import Image, ImageFilter

CENTER = np.array([255, 247, 244], np.float32)
EDGE = np.array([244, 214, 221], np.float32)
SHADOW = np.array([0.42, 0.20, 0.28], np.float32)   # Schattenfarbe (multipliziert)


def gradient(w, h):
    """Radialer Verlauf, Mitte leicht ueber dem Bildmittelpunkt."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.hypot((x - w / 2) / (w * 0.72), (y - h * 0.46) / (h * 0.72))
    t = np.clip(r, 0, 1)[..., None] ** 1.6
    return CENTER * (1 - t) + EDGE * t


def blurred(mask, sigma):
    img = Image.fromarray(np.asarray(mask * 255, np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(sigma)), np.float32) / 255


def compose(beauty, shadow, px):
    """beauty/shadow: RGBA-PIL-Bilder gleicher Groesse; Ergebnis: RGB-PIL-Bild."""
    w, h = beauty.size
    bg = gradient(w, h)
    mask = np.asarray(shadow, np.float32)[..., 3] / 255
    dark = np.clip(0.30 * blurred(mask, 2.6 * px) + 0.22 * blurred(mask, 0.9 * px), 0, 0.6)[..., None]
    bg = bg * (1 - dark * (1 - SHADOW))
    fg = np.asarray(beauty, np.float32) / 255
    a = fg[..., 3:4]
    out = bg * (1 - a) + fg[..., :3] * 255 * a
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))


def inner_shadow(img, box, px):
    """Dezenter Innenschatten (oben/links staerker) auf der Karte; box = (x0, y0, x1, y1) in Pixeln."""
    x0, y0, x1, y1 = box
    h, w = y1 - y0, x1 - x0
    y, x = np.mgrid[0:h, 0:w].astype(np.float32) / px
    top, left = np.exp(-y / 0.7), np.exp(-x / 0.7)
    bottom, right = np.exp(-(h / px - y) / 0.5), np.exp(-(w / px - x) / 0.5)
    dark = np.clip(0.16 * top + 0.12 * left + 0.05 * bottom + 0.05 * right, 0, 0.3)[..., None]
    arr = np.asarray(img, np.float32)
    arr[y0:y1, x0:x1] = np.minimum(arr[y0:y1, x0:x1] * 1.07, 253) * (1 - dark)
    return Image.fromarray(np.clip(arr + 0.5, 0, 255).astype(np.uint8))
