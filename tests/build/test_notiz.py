"""Tests für `quelle` und `notiz` jeder Erinnerung."""
import pytest

from hilfen import bild, lauf


def _txt(dirs, name, inhalt):
    (dirs[0] / name).write_text(inhalt, encoding="utf-8")


def test_quelle_ist_originalpfad(dirs):
    bild(dirs[0] / "2019-07-06_Abend.PNG", fmt="PNG")
    e = lauf(dirs)[0]
    assert e["quelle"] == "erinnerungen/2019-07-06_Abend.PNG"
    assert e["bild"].startswith("erinnerungen/2019-07-06_Abend.jpg?v=")


def test_ohne_txt_notiz_null(dirs):
    bild(dirs[0] / "a.jpg")
    assert lauf(dirs)[0]["notiz"] is None


def test_txt_ohne_notiz_abschnitt(dirs):
    bild(dirs[0] / "a.jpg")
    _txt(dirs, "a.txt", "Nur Text\n")
    e = lauf(dirs)[0]
    assert e["text"] == "Nur Text" and e["notiz"] is None


def test_notiz_wird_abgetrennt(dirs):
    bild(dirs[0] / "a.jpg")
    _txt(dirs, "a.txt", "Text eins\nText zwei\n\n## Notiz\n  Geheim\n\nMehr  \n")
    e = lauf(dirs)[0]
    assert e["text"] == "Text eins\nText zwei"
    assert e["notiz"] == "Geheim\n\nMehr"


def test_notiz_mit_titel(dirs):
    bild(dirs[0] / "a.jpg")
    _txt(dirs, "a.txt", "# Mein Titel\nText\n## Notiz\nNotiztext\n")
    e = lauf(dirs)[0]
    assert (e["titel"], e["text"], e["notiz"]) == ("Mein Titel", "Text", "Notiztext")


def test_nur_titel_und_notiz(dirs):
    bild(dirs[0] / "a.jpg")
    _txt(dirs, "a.txt", "# Titel\n\n## Notiz\nNur Notiz\n")
    e = lauf(dirs)[0]
    assert (e["titel"], e["text"], e["notiz"]) == ("Titel", None, "Nur Notiz")


def test_nur_notiz_ohne_titel_bleibt_dateititel(dirs):
    bild(dirs[0] / "a.jpg")
    _txt(dirs, "a.txt", "## Notiz\nNotiz\n")
    e = lauf(dirs)[0]
    assert (e["titel"], e["text"], e["notiz"]) == ("a", None, "Notiz")


@pytest.mark.parametrize("kopf", ["## notiz", "##Notiz", "## Notiz:", "  ## NOTIZ  "])
def test_notiz_ueberschrift_toleranz(dirs, kopf):
    bild(dirs[0] / "a.jpg")
    _txt(dirs, "a.txt", f"Text\r\n{kopf}\r\nN\r\n")
    e = lauf(dirs)[0]
    assert (e["text"], e["notiz"]) == ("Text", "N")


def test_leere_notiz_wird_null(dirs):
    bild(dirs[0] / "a.jpg")
    _txt(dirs, "a.txt", "Text\n## Notiz\n   \n")
    e = lauf(dirs)[0]
    assert (e["text"], e["notiz"]) == ("Text", None)


def test_unterueberschrift_ist_keine_notiz(dirs):
    bild(dirs[0] / "a.jpg")
    _txt(dirs, "a.txt", "Text\n## Notizen zum Tag\nmehr\n")
    e = lauf(dirs)[0]
    assert e["notiz"] is None and "## Notizen zum Tag" in e["text"]
