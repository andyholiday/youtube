"""Prueft den weissen 3D-Herz-QR (herz-qr.png): beide unabhaengigen Decoder (zxing-cpp, OpenCV) lesen die URL."""
from pathlib import Path

import cv2
import numpy as np
import pytest
import zxingcpp
from PIL import Image, ImageFilter

import layout
import make_qr

HIER = Path(__file__).parent
PX = 32


@pytest.fixture(scope="module")
def frisch(tmp_path_factory):
    """Das Bild einmal frisch erzeugt (die Szene wird nur einmal gerendert)."""
    return make_qr.compose(make_qr.URL, tmp_path_factory.mktemp("qr"), PX)


@pytest.fixture(params=["frisch erzeugt", "eingecheckt"])
def png(request, frisch):
    return frisch if request.param == "frisch erzeugt" else HIER / make_qr.DATEI


def zxing(img):
    return [r.text for r in zxingcpp.read_barcodes(img)]


def opencv(img):
    return cv2.QRCodeDetector().detectAndDecode(img)[0]


def verkleinert(png, breite, blur=0.0):
    img = Image.open(png).convert("RGB")
    klein = img.resize((breite, round(img.height * breite / img.width)), Image.LANCZOS)
    if blur:
        klein = klein.filter(ImageFilter.GaussianBlur(blur))
    return cv2.cvtColor(np.array(klein), cv2.COLOR_RGB2BGR)


def qr_flaeche(png):
    """Graubild-Ausschnitt der QR-Flaeche samt Ruhezone (Pixel) und ihre Lage."""
    side = make_qr.qr_side(make_qr.URL)
    plan = layout.plan(int(side))
    left, top, _, _ = plan["view"]
    cx0, cy0 = plan["card"]
    x0, y0 = round((cx0 - left) * PX), round((top - (cy0 + side)) * PX)
    grau = np.asarray(Image.open(png).convert("L"), np.float32)
    n = int(side * PX)
    return grau[y0:y0 + n, x0:x0 + n]


def test_nur_eine_ausgabedatei():
    assert sorted(p.name for p in HIER.glob("herz-qr*.png")) == [make_qr.DATEI]


def test_png_ist_druckfaehig_breit(png):
    assert Image.open(png).width >= 3000


def test_zxing_liest_exakt_die_url(png):
    assert zxing(cv2.imread(str(png))) == [make_qr.URL]


def test_opencv_liest_exakt_die_url(png):
    assert opencv(cv2.imread(str(png))) == make_qr.URL


def test_800px_lesen_beide_decoder(png):
    arr = verkleinert(png, 800)
    assert zxing(arr) == [make_qr.URL]
    assert opencv(arr) == make_qr.URL


def test_400px_weichgezeichnet_lesbar(png):
    arr = verkleinert(png, 400, blur=0.8)
    assert zxing(arr) == [make_qr.URL] or opencv(arr) == make_qr.URL


def test_qr_ist_nicht_kleiner_als_bisher():
    """Der Code (samt Ruhezone) fuellt mindestens 44 % der Bildbreite, die Ruhezone mindestens 3 Module."""
    assert make_qr.qr_side(make_qr.URL) / layout.WIDTH >= 0.44
    assert make_qr.QUIET >= 3


def test_kontrast_module_dunkel_flaeche_hell(png):
    flaeche = qr_flaeche(png)
    assert np.percentile(flaeche, 98) > 200 and np.percentile(flaeche, 2) < 80


def test_ruhezone_und_plateau_gleichmaessig_hell_ohne_glanzpunkte():
    """Die helle Flaeche um die Module (inkl. Ruhezone) hat gleichmaessiges Licht, keine Glanzlichter, keinen Verlauf."""
    flaeche = qr_flaeche(HIER / make_qr.DATEI)
    dunkel = cv2.dilate((flaeche < 150).astype(np.uint8), np.ones((15, 15), np.uint8)) > 0   # Modulkanten ausnehmen
    hell = flaeche[~dunkel]
    assert hell.size > 10000
    assert np.percentile(hell, 1) > 220 and np.percentile(hell, 99) < 250
    assert np.percentile(hell, 99) - np.percentile(hell, 1) < 15
    rand = int(make_qr.QUIET * PX)
    ring = np.ones(flaeche.shape, bool)
    ring[rand:-rand, rand:-rand] = False
    assert np.percentile(flaeche[ring], 1) > 220 and np.ptp(np.percentile(flaeche[ring], [1, 99])) < 15
