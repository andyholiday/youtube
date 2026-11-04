"""Gedeckter anthrazitfarbener Hintergrund (Verlauf mit feiner Koernung) und weicher Schlagschatten."""
import cv2
import numpy as np
from PIL import Image, ImageFilter

CENTER = (88, 87, 88)      # Verlauf Mitte (RGB)
EDGE = (21, 22, 24)        # Verlauf Rand
SHADOW = (0.10, 0.10, 0.11)  # Schattenfarbe (multipliziert)
GRAIN = 2.0                # Koernung


def gradient(w, h):
    """Radialer Verlauf, Mitte leicht ueber dem Bildmittelpunkt, mit feinem Korn."""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    r = np.hypot((x - w / 2) / (w * 0.72), (y - h * 0.46) / (h * 0.72))
    t = np.clip(r, 0, 1)[..., None] ** 1.6
    bg = np.array(CENTER, np.float32) * (1 - t) + np.array(EDGE, np.float32) * t
    noise = np.random.default_rng(3).normal(0, 1, (h, w)).astype(np.float32)
    noise = cv2.GaussianBlur(noise, (0, 0), 0.9) * 2.2
    return bg + noise[..., None] * GRAIN


def blurred(mask, sigma):
    img = Image.fromarray(np.asarray(mask * 255, np.uint8))
    return np.asarray(img.filter(ImageFilter.GaussianBlur(sigma)), np.float32) / 255


def compose(beauty, shadow, px):
    """beauty/shadow: RGBA-PIL-Bilder gleicher Groesse; Ergebnis: RGB-PIL-Bild."""
    w, h = beauty.size
    bg = gradient(w, h)
    mask = np.asarray(shadow, np.float32)[..., 3] / 255
    dark = np.clip(0.30 * blurred(mask, 2.6 * px) + 0.22 * blurred(mask, 0.9 * px), 0, 0.6)[..., None]
    bg = bg * (1 - dark * (1 - np.array(SHADOW, np.float32)))
    fg = np.asarray(beauty, np.float32) / 255
    a = fg[..., 3:4]
    out = bg * (1 - a) + fg[..., :3] * 255 * a
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8))
