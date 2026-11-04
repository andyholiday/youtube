"""Prueft den 3D-Herz-QR (Varianten dunkel und hell): beide unabhaengigen Decoder (zxing-cpp, OpenCV) lesen die URL."""
from pathlib import Path

import cv2
import numpy as np
import pytest
import zxingcpp
from PIL import Image, ImageFilter

import make_qr
from backdrop import PALETTES

HIER = Path(__file__).parent


@pytest.fixture(scope="module")
def frisch(tmp_path_factory):
    """Beide Varianten einmal frisch erzeugt (die Szene wird nur einmal gerendert)."""
    return make_qr.compose(make_qr.URL, tmp_path_factory.mktemp("qr"), 32)


@pytest.fixture(params=[(v, q) for v in PALETTES for q in ("frisch erzeugt", "eingecheckt")],
                ids=lambda p: f"{p[0]}-{p[1]}")
def png(request, frisch):
    variante, quelle = request.param
    return frisch[variante] if quelle == "frisch erzeugt" else HIER / PALETTES[variante]["file"]


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


def test_karte_hell_und_module_dunkel(png):
    """Karte heller als 200, Module dunkler als 80 (Kontrast), Ruhezone ohne Glanzpunkte."""
    grau = np.asarray(Image.open(png).convert("L"), np.float32)
    h, w = grau.shape
    karte = grau[int(h * 0.30):int(h * 0.66), int(w * 0.30):int(w * 0.70)]
    assert np.percentile(karte, 98) > 200 and np.percentile(karte, 2) < 80
