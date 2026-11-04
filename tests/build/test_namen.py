"""Tests für Titel/Datum aus Namen, EXIF-Datum, .txt-Kodierungen, Widmung."""
import json

import pytest
from PIL import Image

from hilfen import bild, build, lauf


@pytest.mark.parametrize("stem,datum,titel", [
    ("IMG_0002", None, ""),
    ("IMG_1234 (1)", None, ""),
    ("DSC01234", None, ""),
    ("DSCN0042", None, ""),
    ("P1010023", None, ""),
    ("PXL_20240101_123456789", "2024-01-01", ""),
    ("IMG-20240101-WA0001", "2024-01-01", ""),
    ("IMG_20231224_181500", "2023-12-24", ""),
    ("WhatsApp Image 2024-03-05 at 10.20.30", "2024-03-05", ""),
    ("image", None, ""),
    ("Photo 3", None, ""),
    ("1699999999", None, ""),
    ("3f2a9c1e7b4d", None, ""),
    ("123e4567-e89b-12d3-a456-426614174000", None, ""),
    ("2023-06-12_IMG_0002", "2023-06-12", ""),
    ("2023-06-12", "2023-06-12", ""),
    ("IMG_0002_am_strand", None, "IMG 0002 am strand"),
    ("Urlaub_Foto_2", None, "Urlaub Foto 2"),
    ("deadbeef", None, "deadbeef"),  # Hex ohne Ziffer ist ein Wort
])
def test_generische_namen(stem, datum, titel):
    assert build.parse_name(stem) == (datum, titel)


def test_generischer_name_im_json(dirs):
    bild(dirs[0] / "IMG_0002.jpg")
    e = lauf(dirs)[0]
    assert e["titel"] == "" and e["datum"] is None


def test_txt_titelzeile_gewinnt_bei_generischem_namen(dirs):
    bild(dirs[0] / "IMG_0002.jpg")
    (dirs[0] / "IMG_0002.txt").write_text("# Am Strand\nWar schön.", encoding="utf-8")
    e = lauf(dirs)[0]
    assert (e["titel"], e["text"]) == ("Am Strand", "War schön.")


def exif_bild(pfad, datum="2021:05:06 12:30:00"):
    exif = Image.Exif()
    exif[0x8769] = {0x9003: datum}
    Image.new("RGB", (50, 40)).save(pfad, exif=exif)


def test_datum_aus_exif_wenn_name_keins_hat(dirs):
    exif_bild(dirs[0] / "IMG_0002.jpg")
    e = lauf(dirs)[0]
    assert (e["datum"], e["titel"]) == ("2021-05-06", "")


def test_namensdatum_gewinnt_vor_exif(dirs):
    exif_bild(dirs[0] / "2019-01-02_x.jpg")
    assert lauf(dirs)[0]["datum"] == "2019-01-02"


def test_kaputtes_exif_datum_wird_ignoriert(dirs):
    exif_bild(dirs[0] / "a.jpg", datum="0000:00:00 00:00:00")
    assert lauf(dirs)[0]["datum"] is None


@pytest.mark.parametrize("kodierung", ["utf-8", "utf-8-sig", "utf-16", "cp1252"])
def test_txt_kodierungen(dirs, kodierung):
    bild(dirs[0] / "a.jpg")
    inhalt = "# Schöner Tag\nGrüße aus Köln – ÄÖÜ ß €\n"
    (dirs[0] / "a.txt").write_bytes(inhalt.encode(kodierung))
    e = lauf(dirs)[0]
    assert e["titel"] == "Schöner Tag"
    assert e["text"] == "Grüße aus Köln – ÄÖÜ ß €"


def test_txt_utf16_big_endian_mit_bom(dirs):
    bild(dirs[0] / "a.jpg")
    (dirs[0] / "a.txt").write_bytes(b"\xfe\xff" + "Hallo Welt äöü".encode("utf-16-be"))
    assert lauf(dirs)[0]["text"] == "Hallo Welt äöü"


def test_txt_grossbuchstaben(dirs):
    bild(dirs[0] / "Foto.JPG")
    (dirs[0] / "FOTO.TXT").write_text("Text A", encoding="utf-8")
    assert lauf(dirs)[0]["text"] == "Text A"


def test_txt_in_der_form_name_jpg_txt(dirs):
    bild(dirs[0] / "strand.jpg")
    (dirs[0] / "strand.jpg.txt").write_text("# Strandtag\nSand", encoding="utf-8")
    e = lauf(dirs)[0]
    assert (e["titel"], e["text"]) == ("Strandtag", "Sand")


def test_widmung_mit_titel(dirs):
    (dirs[0] / "widmung.txt").write_text("# Für dich\nHallo ❤\nZweite Zeile", encoding="utf-8")
    bild(dirs[0] / "a.jpg")
    lauf(dirs)
    daten = json.loads((dirs[2] / "erinnerungen.json").read_text(encoding="utf-8"))
    assert daten["widmung"] == {"titel": "Für dich", "text": "Hallo ❤\nZweite Zeile"}
    assert len(daten["erinnerungen"]) == 1


def test_widmung_ohne_titelzeile_und_grossbuchstaben(dirs):
    (dirs[0] / "Widmung.TXT").write_bytes("Nur Text äöü".encode("cp1252"))
    lauf(dirs)
    daten = json.loads((dirs[2] / "erinnerungen.json").read_text(encoding="utf-8"))
    assert daten["widmung"] == {"titel": "", "text": "Nur Text äöü"}


def test_ohne_widmung_kein_schluessel(dirs):
    bild(dirs[0] / "a.jpg")
    lauf(dirs)
    daten = json.loads((dirs[2] / "erinnerungen.json").read_text(encoding="utf-8"))
    assert "widmung" not in daten


def test_widmung_ist_keine_erinnerung_und_nicht_verwaist(dirs, capsys):
    (dirs[0] / "widmung.txt").write_text("# Titel\nText", encoding="utf-8")
    assert lauf(dirs) == []
    assert capsys.readouterr().err == ""
