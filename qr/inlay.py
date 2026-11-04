"""Intarsie fuer die weisse Variante: dunkle Module wirken in das Porzellan eingelegt/graviert (Format: PIL-Bilder, Pixel)."""
import cv2
import numpy as np
from PIL import Image


def _shift(a, dy, dx):
    """a[y + dy, x + dx] an der Stelle (y, x); ausserhalb 0."""
    out = np.zeros_like(a)
    h, w = a.shape
    out[max(0, -dy):h - max(0, dy), max(0, -dx):w - max(0, dx)] = a[max(0, dy):h - max(0, -dy), max(0, dx):w - max(0, -dx)]
    return out


def engrave(img, qr, box, px, ink):
    """Setzt die Module (RGBA-Bild qr, Alpha = Maske) bei box=(x0, y0) als vertiefte Intarsie in img.

    Licht kommt von links oben: ein feiner Schatten umgibt die Kante, die untere/rechte Innenkante faengt
    Licht (heller Saum). Die Porzellanflaeche selbst bleibt unberuehrt, die Module bleiben vollkontrastig.
    """
    x0, y0 = box
    h, w = qr.height, qr.width
    a = np.asarray(qr, np.float32)[..., 3] / 255
    base = np.asarray(img, np.float32)
    area = base[y0:y0 + h, x0:x0 + w]
    halo = cv2.GaussianBlur(a, (0, 0), 0.16 * px) * (1 - a)
    d = max(1, round(0.09 * px))
    lip = cv2.GaussianBlur(a * (1 - _shift(a, d, d)), (0, 0), 0.03 * px)
    ink_rgb = np.array(ink, np.float32)
    shade = cv2.GaussianBlur(a * (1 - _shift(a, -d, -d)), (0, 0), 0.04 * px)   # Innenwand im Schatten (oben/links)
    mod = ink_rgb * (1 - 0.6 * shade[..., None]) * (1 - 0.55 * lip[..., None]) + 176 * 0.55 * lip[..., None]
    area *= (1 - 0.16 * halo)[..., None]
    base[y0:y0 + h, x0:x0 + w] = area * (1 - a[..., None]) + mod * a[..., None]
    return Image.fromarray(np.clip(base + 0.5, 0, 255).astype(np.uint8))
