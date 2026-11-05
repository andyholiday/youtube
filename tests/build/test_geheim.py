"""Tests für geheimnisse.txt, den Ordner erinnerungen/geheim/ und das immer vorhandene geheim-Objekt."""
import json

import pytest
from PIL import Image

from hilfen import ausgabe_pfad, bild, build, lauf

LEER = {"herzregen": "", "raumtext": "", "tage": [], "raum": []}


def geheim(dirs):
    build.baue(*dirs)
    return json.loads((dirs[2] / "erinnerungen.json").read_text(encoding="utf-8"))["geheim"]


def schreibe(dirs, inhalt, name="geheimnisse.txt"):
    (dirs[0] / name).write_text(inhalt, encoding="utf-8")


def test_geheim_immer_vorhanden_ohne_datei(dirs, capsys):
    assert geheim(dirs) == LEER
    assert capsys.readouterr().err == ""


def test_geheim_vorhanden_ohne_erinnerungen_ordner(dirs):
    dirs[0].rmdir()
    assert geheim(dirs) == LEER


def test_alle_abschnitte(dirs, capsys):
    schreibe(dirs, "# Herzregen\nIch liebe dich.\n# Geheimer Raum\nSchön, dass du ihn gefunden hast.\n"
                   "# Besondere Tage\n14.02. Alles Liebe zum Valentinstag!\n"
                   "06.07.2019 Heute vor {jahre} Jahren saßen wir am Wasser.\n")
    assert geheim(dirs) == {
        "herzregen": "Ich liebe dich.", "raumtext": "Schön, dass du ihn gefunden hast.",
        "tage": [{"tag": "02-14", "jahr": None, "text": "Alles Liebe zum Valentinstag!"},
                 {"tag": "07-06", "jahr": 2019, "text": "Heute vor {jahre} Jahren saßen wir am Wasser."}],
        "raum": []}
    assert capsys.readouterr().err == ""


def test_geheimnisse_txt_ist_keine_erinnerung_und_nicht_verwaist(dirs, capsys):
    bild(dirs[0] / "a.jpg")
    schreibe(dirs, "# Herzregen\nHallo\n", name="Geheimnisse.TXT")
    assert [e["titel"] for e in lauf(dirs)] == ["a"]
    assert capsys.readouterr().err == ""


@pytest.mark.parametrize("abschnitt,feld", [("Herzregen", "herzregen"), ("Geheimer Raum", "raumtext")])
def test_fehlende_abschnitte(dirs, abschnitt, feld):
    schreibe(dirs, f"# {abschnitt}\nNur das\n")
    g = geheim(dirs)
    assert g[feld] == "Nur das"
    assert {k: v for k, v in g.items() if k != feld} == {k: v for k, v in LEER.items() if k != feld}


def test_nur_tage(dirs):
    schreibe(dirs, "# Besondere Tage\n01.01. Neujahr\n")
    assert geheim(dirs) == {**LEER, "tage": [{"tag": "01-01", "jahr": None, "text": "Neujahr"}]}


def test_mehrzeilige_texte_und_ueberschrift_toleranz(dirs):
    schreibe(dirs, "#herzregen:\n Zeile 1 \n\n Zeile 2\n#  GEHEIMER RAUM\nDrinnen\n")
    g = geheim(dirs)
    assert g["herzregen"] == "Zeile 1\nZeile 2" and g["raumtext"] == "Drinnen"


@pytest.mark.parametrize("zeile,tag,jahr", [
    ("14.02. Text", "02-14", None), ("14.02.2020 Text", "02-14", 2020),
    ("1.2. Text", "02-01", None), ("6.7.2019 Text", "07-06", 2019),
    ("06. 07. Text", "07-06", None), ("06 . 07 . 2019 Text", "07-06", 2019),
    ("14.02.Text", "02-14", None), ("29.02. Text", "02-29", None),
    ("  14.02.   Text  ", "02-14", None), ("06.07. 2019 Text", "07-06", 2019),
    ("14.02. 24 Stunden Text", "02-14", None),
])
def test_datumsformate(dirs, capsys, zeile, tag, jahr):
    schreibe(dirs, f"# Besondere Tage\n{zeile}\n")
    erwartet = "24 Stunden Text" if "Stunden" in zeile else "Text"
    assert geheim(dirs)["tage"] == [{"tag": tag, "jahr": jahr, "text": erwartet}]
    assert capsys.readouterr().err == ""


def test_ungueltige_zeilen_warnen_und_werden_uebersprungen(dirs, capsys):
    schreibe(dirs, "# Besondere Tage\nkein Datum hier\n31.02. Kein Februartag\n13.13. Monat 13\n"
                   "29.02.2019 Kein Schaltjahr\n14.02.\n14.02. Gültig\n")
    assert geheim(dirs)["tage"] == [{"tag": "02-14", "jahr": None, "text": "Gültig"}]
    err = capsys.readouterr().err
    assert err.count("WARNUNG: geheimnisse.txt: Zeile") == 5
    for nr in (2, 3, 4, 5, 6):
        assert f"Zeile {nr}:" in err
    assert "Zeile 7" not in err


def test_unbekannte_ueberschrift_und_text_davor_warnen(dirs, capsys):
    schreibe(dirs, "Lose Zeile\n# Unsinn\nirgendwas\n# Herzregen\nOK\n")
    assert geheim(dirs)["herzregen"] == "OK"
    err = capsys.readouterr().err
    assert "Zeile 1:" in err and "Zeile 2:" in err and "Zeile 3" not in err


def test_warnung_in_annotation_und_summary(dirs, capsys, monkeypatch, tmp_path):
    summary = tmp_path / "s.md"
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary))
    schreibe(dirs, "# Besondere Tage\nmurks\n")
    lauf(dirs)
    assert "::warning file=" in capsys.readouterr().out
    text = summary.read_text(encoding="utf-8")
    assert "`geheimnisse.txt`" in text and "übersprungen: 1" in text


def test_kodierung_cp1252_und_bom(dirs):
    (dirs[0] / "geheimnisse.txt").write_bytes(
        "# Herzregen\nSüß\n# Besondere Tage\n01.01. Fröhliches Neues\n".encode("cp1252"))
    g = geheim(dirs)
    assert g["herzregen"] == "Süß" and g["tage"][0]["text"] == "Fröhliches Neues"
    (dirs[0] / "geheimnisse.txt").write_bytes("# Herzregen\nÄ\n".encode("utf-8-sig"))
    assert geheim(dirs)["herzregen"] == "Ä"


def test_geheim_ordner_ausgabe_und_json(dirs, capsys):
    (dirs[0] / "geheim").mkdir()
    bild(dirs[0] / "geheim" / "2021-08-14_zu-zweit.jpg", (3000, 2000))
    (dirs[0] / "geheim" / "2021-08-14_zu-zweit.txt").write_text(
        "# Nur wir\nText\n## Notiz\nPsst\n", encoding="utf-8")
    bild(dirs[0] / "oeffentlich.jpg")
    assert [e["titel"] for e in lauf(dirs)] == ["oeffentlich"]
    raum = geheim(dirs)["raum"]
    assert len(raum) == 1
    e = raum[0]
    assert e["bild"].startswith("erinnerungen/geheim/2021-08-14_zu-zweit.jpg?v=")
    assert e["quelle"] == "erinnerungen/geheim/2021-08-14_zu-zweit.jpg"
    assert (e["titel"], e["datum"], e["text"], e["notiz"]) == ("Nur wir", "2021-08-14", "Text", "Psst")
    assert (e["breite"], e["hoehe"]) == (1280, 853)
    pfad = ausgabe_pfad(dirs, e)
    assert pfad == dirs[2] / "erinnerungen" / "geheim" / "2021-08-14_zu-zweit.jpg"
    with Image.open(pfad) as i:
        assert i.format == "JPEG" and max(i.size) == 1280
    assert not (dirs[2] / "erinnerungen" / "oeffentlich.jpg").samefile(pfad)
    assert capsys.readouterr().err == ""


def test_geheim_ordner_sortiert_und_meldet_fehler(dirs, capsys):
    ordner = dirs[0] / "geheim"
    ordner.mkdir()
    for name in ("b.jpg", "2020-01-01_a.jpg"):
        bild(ordner / name)
    (ordner / "kaputt.jpg").write_bytes(b"x")
    (ordner / "film.mov").write_bytes(b"x")
    (ordner / "tief").mkdir()
    (ordner / "allein.txt").write_text("t")
    raum = geheim(dirs)["raum"]
    assert [e["quelle"] for e in raum] == ["erinnerungen/geheim/2020-01-01_a.jpg", "erinnerungen/geheim/b.jpg"]
    err = capsys.readouterr().err
    for name in ("kaputt.jpg", "film.mov", "tief", "allein.txt"):
        assert name in err


def test_geheim_ordner_gross_geschrieben_und_leer(dirs, capsys):
    (dirs[0] / "Geheim").mkdir()
    assert geheim(dirs) == LEER
    assert capsys.readouterr().err == ""


def test_geheim_bilder_nicht_in_normalen_erinnerungen(dirs):
    (dirs[0] / "geheim").mkdir()
    bild(dirs[0] / "geheim" / "x.jpg")
    assert lauf(dirs) == []


def test_fremde_unterordner_warnen(dirs, capsys):
    (dirs[0] / "Urlaub").mkdir()
    bild(dirs[0] / "Urlaub" / "x.jpg")
    (dirs[0] / "geheim").mkdir()
    assert lauf(dirs) == []
    err = capsys.readouterr().err
    assert "WARNUNG: Urlaub:" in err and "geheim:" not in err
    assert geheim(dirs) == LEER
    assert not (dirs[2] / "erinnerungen" / "Urlaub").exists()
