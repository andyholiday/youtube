"""Geometrie des Herz-QR: Herzumriss, Kartenposition, Bildausschnitt (Einheit: Modul, y nach oben)."""
import numpy as np

import cv2

WIDTH = 100          # Bildbreite in Modulen
HEART_W = 94.0       # Breite des grossen Herzens in Modulen
FRAME = 1.6          # Breite des goldenen Rahmens um die Karte
# Herzumriss: sechs kubische Bezier-Segmente (Einheitsquadrat, y nach unten)
SEGMENTS = [((.5, .94), (.5, .94), (.02, .62), (.02, .32)),
            ((.02, .32), (.02, .14), (.16, .03), (.3, .03)),
            ((.3, .03), (.41, .03), (.5, .1), (.5, .22)),
            ((.5, .22), (.5, .1), (.59, .03), (.7, .03)),
            ((.7, .03), (.84, .03), (.98, .14), (.98, .32)),
            ((.98, .32), (.98, .62), (.5, .94), (.5, .94))]


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
    pts = heart_unit() / 0.96 * width
    pts[:, 1] -= pts[:, 1].max()
    return resample(pts, 1000)


def resample(pts, n):
    """Geschlossenen Umriss in n Punkte gleichen Bogenabstands umrechnen."""
    closed = np.vstack([pts, pts[:1]])
    seg = np.hypot(*np.diff(closed, axis=0).T)
    s = np.concatenate([[0], np.cumsum(seg)])
    t = np.linspace(0, s[-1], n, endpoint=False)
    return np.c_[np.interp(t, s, closed[:, 0]), np.interp(t, s, closed[:, 1])]


def inset_outline(outline, dist, res=40):
    """Umriss, der um dist Module nach innen versetzt ist (Rasterkontur, 1000 Punkte)."""
    x0, y0 = outline.min(0)
    x1, y1 = outline.max(0)
    img = np.zeros((int((y1 - y0) * res) + 3, int((x1 - x0) * res) + 3), np.uint8)
    cv2.fillPoly(img, [((outline - [x0, y0]) * res + 1).astype(np.int32)], 255)
    inner = (cv2.distanceTransform(img, cv2.DIST_L2, 5) > dist * res).astype(np.uint8)
    contours, _ = cv2.findContours(inner, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    pts = (max(contours, key=cv2.contourArea)[:, 0, :].astype(np.float64) - 1) / res + [x0, y0]
    pts = resample(pts, 1000)
    return np.c_[[np.convolve(np.r_[pts[-2:, k], pts[:, k], pts[:2, k]], np.ones(5) / 5, "valid")
                  for k in (0, 1)]].T


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


def plan(side, frame=FRAME):
    """Bildausschnitt und Karte; die Karte liegt auf ganzen Modulen im Bild."""
    outline = heart_outline()
    cx, cy, margin = best_card_center(outline, side + 2 * frame)
    card_x0 = round(cx - side / 2)
    card_y0 = round(cy - side / 2)
    left = card_x0 - round(card_x0 - (outline[:, 0].min() - 3))
    top = card_y0 + round(outline[:, 1].max() + 3 - card_y0)   # Oberkante des Ausschnitts
    height = round(-outline[:, 1].min() + 3 + 9)               # unten mehr Platz fuer Schatten
    return {"outline": outline, "card": (card_x0, card_y0), "side": side, "frame": frame, "margin": margin,
            "view": (left, top, WIDTH, height)}
