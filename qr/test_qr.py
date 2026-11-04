"""Prüft, dass der Herz-QR mit zwei unabhängigen Decodern die URL liefert."""
from pathlib import Path

import cv2
import numpy as np
import pytest
import zxingcpp
from PIL import Image, ImageFilter

import make_qr

HIER = Path(__file__).parent


@pytest.fixture(scope="module")
def png(tmp_path_factory):
    return make_qr.render(make_qr.URL, tmp_path_factory.mktemp("qr"))[1]


def zxing(img):
    return [r.text for r in zxingcpp.read_barcodes(img)]


def opencv(img):
    return cv2.QRCodeDetector().detectAndDecode(img)[0]


def test_png_ist_breit_genug(png):
    assert Image.open(png).width >= 2000


def test_zxing_liest_exakt_die_url(png):
    assert zxing(cv2.imread(str(png))) == [make_qr.URL]


def test_opencv_liest_exakt_die_url(png):
    assert opencv(cv2.imread(str(png))) == make_qr.URL


def test_verkleinert_und_weichgezeichnet_lesbar(png):
    img = Image.open(png).convert("RGB")
    klein = img.resize((400, round(img.height * 400 / img.width)), Image.LANCZOS)
    arr = cv2.cvtColor(np.array(klein.filter(ImageFilter.GaussianBlur(0.8))), cv2.COLOR_RGB2BGR)
    assert zxing(arr) == [make_qr.URL] or opencv(arr) == make_qr.URL


def test_eingecheckte_dateien_sind_aktuell():
    assert (HIER / "herz-qr.svg").read_text(encoding="utf-8") == make_qr.build_svg(make_qr.URL)
    png = cv2.imread(str(HIER / "herz-qr.png"))
    assert png.shape[1] >= 2000
    assert zxing(png) == [make_qr.URL]
    assert opencv(png) == make_qr.URL
