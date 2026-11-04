"""Tests für Bildverarbeitung: HEIC, Metadaten, Farbprofil, Größe, Cache-Hash."""
import pytest
from PIL import Image

from hilfen import ausgabe_pfad, bild, display_p3_profil, lauf

pillow_heif = pytest.importorskip("pillow_heif")


def exif_mit_gps(orientierung=1, datum=None):
    exif = Image.Exif()
    exif[0x0112] = orientierung
    exif[0x8825] = {1: "N", 2: (52.0, 31.0, 0.0), 3: "E", 4: (13.0, 24.0, 0.0)}
    if datum:
        exif[0x8769] = {0x9003: datum}
    return exif


def pruefe_sauber(pfad):
    with Image.open(pfad) as i:
        assert i.format == "JPEG"
        assert not i.getexif() and not i.getexif().get_ifd(0x8825)
        assert "icc_profile" not in i.info and "exif" not in i.info
    daten = pfad.read_bytes()
    assert b"Exif" not in daten and b"GPS" not in daten


def test_heic_gedreht_und_ohne_gps(dirs):
    img = Image.new("RGB", (200, 100), (10, 200, 10))
    img.save(dirs[0] / "iphone.heic", exif=exif_mit_gps(6).tobytes())
    with Image.open(dirs[0] / "iphone.heic") as quelle:  # Vorbedingung: GPS ist wirklich drin
        assert quelle.getexif().get_ifd(0x8825)
    e = lauf(dirs)
    assert len(e) == 1 and (e[0]["breite"], e[0]["hoehe"]) == (100, 200)
    with Image.open(ausgabe_pfad(dirs, e[0])) as i:
        assert i.size == (100, 200)
    pruefe_sauber(ausgabe_pfad(dirs, e[0]))


def test_heif_endung_und_grossbuchstaben(dirs):
    Image.new("RGB", (60, 40), (1, 2, 3)).save(dirs[0] / "A.HEIF", format="HEIF")
    assert [x["breite"] for x in lauf(dirs)] == [60]


def test_jpeg_gps_wird_entfernt(dirs):
    Image.new("RGB", (80, 60)).save(dirs[0] / "g.jpg", exif=exif_mit_gps(1))
    with Image.open(dirs[0] / "g.jpg") as quelle:
        assert quelle.getexif().get_ifd(0x8825)
    pruefe_sauber(ausgabe_pfad(dirs, lauf(dirs)[0]))


def test_display_p3_wird_nach_srgb(dirs):
    Image.new("RGB", (40, 40), (180, 90, 60)).save(dirs[0] / "p3.jpg", icc_profile=display_p3_profil())
    pfad = ausgabe_pfad(dirs, lauf(dirs)[0])
    with Image.open(pfad) as i:
        assert "icc_profile" not in i.info
        r, g, b = i.convert("RGB").getpixel((5, 5))
    # P3 -> sRGB: gesättigter (R rauf, G/B runter), aber dieselbe Farbfamilie
    assert 180 < r <= 215 and 60 <= g < 90 and 30 <= b < 60


def test_srgb_ohne_profil_bleibt_farbtreu(dirs):
    bild(dirs[0] / "s.jpg", farbe=(180, 90, 60))
    with Image.open(ausgabe_pfad(dirs, lauf(dirs)[0])) as i:
        r, g, b = i.getpixel((5, 5))
    assert abs(r - 180) <= 3 and abs(g - 90) <= 3 and abs(b - 60) <= 3


def test_kante_hoechstens_1280(dirs):
    bild(dirs[0] / "breit.png", (5000, 1000))
    bild(dirs[0] / "hoch.png", (900, 3000))
    for e in lauf(dirs):
        assert max(e["breite"], e["hoehe"]) == 1280
        with Image.open(ausgabe_pfad(dirs, e)) as i:
            assert max(i.size) <= 1280


def test_cache_hash_aendert_sich_mit_inhalt(dirs):
    bild(dirs[0] / "x.jpg", farbe=(10, 10, 10))
    erst = lauf(dirs)[0]["bild"]
    assert erst.startswith("erinnerungen/x.jpg?v=")
    assert lauf(dirs)[0]["bild"] == erst  # gleicher Inhalt, gleicher Hash
    bild(dirs[0] / "x.jpg", farbe=(240, 20, 20))  # gleichnamig ersetzt
    neu = lauf(dirs)[0]["bild"]
    assert neu.startswith("erinnerungen/x.jpg?v=") and neu != erst
    assert (dirs[2] / "erinnerungen" / "x.jpg").is_file()  # Dateiname ohne Hash
