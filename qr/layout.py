"""Geometrie des Herz-QR: Herzumriss, Kartenposition, Bildausschnitt (Einheit: Modul, y nach oben)."""
import numpy as np

import cv2

WIDTH = 100          # Bildbreite in Modulen
HEART_W = 96.0       # Breite des Herzens in Modulen
PAD = 1.5            # Senke ragt so weit (Module) ueber den QR hinaus
# Herzumriss: sechs kubische Bezier-Segmente (Einheitsquadrat, y nach unten)
SEGMENTS = [((.5, .94), (.5, .94), (.02, .68), (.02, .32)),
            ((.02, .32), (.02, .14), (.16, .03), (.3, .03)),
            ((.3, .03), (.41, .03), (.46, .06), (.5, .17)),
            ((.5, .17), (.54, .06), (.59, .03), (.7, .03)),
            ((.7, .03), (.84, .03), (.98, .14), (.98, .32)),
            ((.98, .32), (.98, .68), (.5, .94), (.5, .94))]


def _bezier(p0, p1, p2, p3, n):
    t = np.linspace(0, 1, n, endpoint=False)[:, None]
    p0, p1, p2, p3 = map(np.array, (p0, p1, p2, p3))
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def heart_unit(n=120):
    """Herzumriss im Einheitsquadrat, Mitte x=0, y nach oben, Breite 0.96."""
    pts = np.vstack([_bezier(*seg, n) for seg in SEGMENTS])
    pts[:, 0] -= 0.5
    pts[:, 1] = -pts[:, 1]
    return pts


def heart_outline(width=HEART_W):
    """Grosses Herz, Mitte x=0, Oberkante y=0 (Modulgroesse), y nach oben."""
    pts = resample(heart_unit() / 0.96 * width, 1000)
    pts[:, 1] -= pts[:, 1].max()
    return round_corners(pts)


def round_corners(pts, win=11):
    """Rundet Spitze und Kerbe mit einem kreisfoermigen gleitenden Mittel (Fenster win Punkte)."""
    ext = np.vstack([pts[-win:], pts, pts[:win]])
    ker = np.ones(win) / win
    return np.c_[[np.convolve(ext[:, k], ker, "same")[win:-win] for k in (0, 1)]].T


def resample(pts, n):
    """Geschlossenen Umriss in n Punkte gleichen Bogenabstands umrechnen."""
    closed = np.vstack([pts, pts[:1]])
    seg = np.hypot(*np.diff(closed, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, s[-1], n, endpoint=False)
    return np.c_[np.interp(t, s, closed[:, 0]), np.interp(t, s, closed[:, 1])]


def best_card_center(outline, side, res=4):
    """Mitte des Quadrats der Seite side, das den groessten Abstand zum Herzrand hat."""
    x0, y0 = outline.min(0)
    x1, y1 = outline.max(0)
    w, h = int((x1 - x0) * res) + 2, int((y1 - y0) * res) + 2
    img = np.zeros((h, w), np.uint8)
    px = ((outline - [x0, y0]) * res).astype(np.int32)
    cv2.fillPoly(img, [px], 255)
    dist = cv2.distanceTransform(img, cv2.DIST_L2, 5) / res
    r = int(side * res / 2)
    best, pos = -1.0, (0, 0)
    xx = int(-x0 * res)   # symmetrisch zur Herzachse x=0
    for yy in range(r, h - r):
        # Abstand der Quadratecken und Kantenmitten reicht (Herz ist nach oben gewoelbt)
        probes = [(xx + dx * r, yy + dy * r) for dx in (-1, 0, 1) for dy in (-1, 0, 1)]
        m = min(dist[py, px_] for px_, py in probes)
        if m > best:
            best, pos = m, (xx, yy)
    cx, cy = pos[0] / res + x0, pos[1] / res + y0
    return cx, cy, best


def plan(side):
    """Bildausschnitt (symmetrisch zur Herzachse) und Karte; die Karte liegt auf ganzen Modulen im Bild."""
    outline = heart_outline()
    cx, cy, margin = best_card_center(outline, side + 2 * PAD)
    card_x0 = round(cx - side / 2)
    card_y0 = round(cy - side / 2)
    top = round(outline[:, 1].max() + 3)
    height = round(-outline[:, 1].min() + 3 + 9)               # unten mehr Platz fuer Schatten
    return {"outline": outline, "card": (card_x0, card_y0), "side": side, "margin": margin,
            "view": (-WIDTH // 2, top, WIDTH, height)}
