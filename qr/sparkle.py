"""Vierzackige Glanzpunkte (additiv ueberblendet)."""
import numpy as np
from PIL import Image


def star(size):
    """Intensitaet eines Sterns im Quadrat der Kantenlaenge 2*size (Wert 0..1)."""
    n = int(size * 2)
    y, x = np.mgrid[-n:n + 1, -n:n + 1].astype(np.float32)
    thin = size * 0.035
    h = np.exp(-np.abs(x) / (size * 0.28)) * np.exp(-(y / thin) ** 2)
    v = np.exp(-np.abs(y) / (size * 0.28)) * np.exp(-(x / thin) ** 2)
    core = np.exp(-(x ** 2 + y ** 2) / (size * 0.07) ** 2)
    return np.clip(h + v + core, 0, 1)


def add_sparkles(img, spots):
    """spots: Liste (x_px, y_px, groesse_px); Ergebnis: neues Bild."""
    arr = np.asarray(img, dtype=np.float32) / 255
    for x, y, size in spots:
        s = star(size)[..., None] * np.array([1.0, 0.97, 0.92], np.float32)
        r = s.shape[0] // 2
        x0, y0 = int(x) - r, int(y) - r
        xs, ys = max(x0, 0), max(y0, 0)
        xe, ye = min(x0 + s.shape[1], arr.shape[1]), min(y0 + s.shape[0], arr.shape[0])
        sub = s[ys - y0:ye - y0, xs - x0:xe - x0]
        arr[ys:ye, xs:xe] = 1 - (1 - arr[ys:ye, xs:xe]) * (1 - sub)
    return Image.fromarray((arr * 255 + 0.5).astype(np.uint8))
