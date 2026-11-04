import json
import subprocess
import sys
from pathlib import Path

import pytest
import yaml
from PIL import Image

WURZEL = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "tools"))
import build  # noqa: E402


@pytest.fixture
def dirs(tmp_path):
    erinnerungen, site, out = tmp_path / "erinnerungen", tmp_path / "site", tmp_path / "_site"
    erinnerungen.mkdir()
    site.mkdir()
    (site / "index.html").write_text("<html></html>")
    return erinnerungen, site, out


def bild(pfad, groesse=(100, 60), fmt=None, **kw):
    Image.new("RGB", groesse, (200, 100, 50)).save(pfad, fmt, **kw)


def lauf(dirs):
    erinnerungen, site, out = dirs
    build.baue(erinnerungen, site, out)
    return json.loads((out / "erinnerungen.json").read_text(encoding="utf-8"))["erinnerungen"]


@pytest.mark.parametrize("stem,datum,titel", [
    ("2023-06-12_unser-erster-urlaub", "2023-06-12", "unser erster urlaub"),
    ("2023-06-12-am_meer", "2023-06-12", "am meer"),
    ("Strand_Tag-1", None, "Strand Tag 1"),
    ("2023-13-45_kaputtes-datum", None, "2023 13 45 kaputtes datum"),
])
def test_parse_name(stem, datum, titel):
    assert build.parse_name(stem) == (datum, titel)


def test_txt_ohne_titelzeile(dirs):
    bild(dirs[0] / "a.jpg")
    (dirs[0] / "a.txt").write_text("Hallo\nWelt\n", encoding="utf-8")
    e = lauf(dirs)[0]
    assert e["titel"] == "a" and e["text"] == "Hallo\nWelt"


def test_txt_mit_titelzeile(dirs):
    bild(dirs[0] / "2024-01-02_x.jpg")
    (dirs[0] / "2024-01-02_x.txt").write_text("# Schöner Tag äöü\nText hier\n", encoding="utf-8")
    e = lauf(dirs)[0]
    assert e["titel"] == "Schöner Tag äöü" and e["text"] == "Text hier"
    assert e["datum"] == "2024-01-02"


def test_ohne_txt_text_null(dirs):
    bild(dirs[0] / "a.jpg")
    assert lauf(dirs)[0]["text"] is None


def test_sortierung(dirs):
    for name in ["b.jpg", "a.jpg", "2024-05-01_x.jpg", "2023-01-01_y.jpg"]:
        bild(dirs[0] / name)
    assert [e["bild"] for e in lauf(dirs)] == [
        "erinnerungen/2023-01-01_y.jpg", "erinnerungen/2024-05-01_x.jpg",
        "erinnerungen/a.jpg", "erinnerungen/b.jpg"]


def test_exif_rotation_hochkant(dirs):
    img = Image.new("RGB", (200, 100), (10, 200, 10))
    exif = Image.Exif()
    exif[0x0112] = 6  # um 90 Grad im Uhrzeigersinn zu drehen
    img.save(dirs[0] / "r.jpg", exif=exif)
    e = lauf(dirs)[0]
    assert (e["breite"], e["hoehe"]) == (100, 200)
    with Image.open(dirs[2] / "erinnerungen" / "r.jpg") as ausgabe:
        assert ausgabe.size == (100, 200)
        assert not ausgabe.getexif()  # EXIF entfernt


def test_verkleinerung_max_1600(dirs):
    bild(dirs[0] / "gross.jpg", (3200, 2400))
    bild(dirs[0] / "hoch.jpg", (1000, 4000))
    bild(dirs[0] / "klein.jpg", (300, 200))
    e = {x["titel"]: x for x in lauf(dirs)}
    assert (e["gross"]["breite"], e["gross"]["hoehe"]) == (1600, 1200)
    assert (e["hoch"]["breite"], e["hoch"]["hoehe"]) == (400, 1600)
    assert (e["klein"]["breite"], e["klein"]["hoehe"]) == (300, 200)  # nie vergrößert
    with Image.open(dirs[2] / "erinnerungen" / "gross.jpg") as i:
        assert max(i.size) == 1600


@pytest.mark.parametrize("name,fmt", [("a.png", "PNG"), ("b.WEBP", "WEBP"), ("c.jpeg", "JPEG")])
def test_formate_werden_jpg(dirs, name, fmt):
    bild(dirs[0] / name, fmt=fmt)
    e = lauf(dirs)
    assert e[0]["bild"].endswith(".jpg")
    with Image.open(dirs[2] / e[0]["bild"]) as i:
        assert i.format == "JPEG"


def test_png_mit_transparenz(dirs):
    Image.new("RGBA", (50, 50), (255, 0, 0, 0)).save(dirs[0] / "t.png")
    assert lauf(dirs)[0]["breite"] == 50


def test_kaputte_datei_uebersprungen(dirs, capsys):
    (dirs[0] / "kaputt.jpg").write_bytes(b"das ist kein bild")
    bild(dirs[0] / "gut.jpg")
    e = lauf(dirs)
    assert [x["titel"] for x in e] == ["gut"]
    assert "kaputt.jpg" in capsys.readouterr().err
    assert not (dirs[2] / "erinnerungen" / "kaputt.jpg").exists()


def test_andere_dateien_ignoriert(dirs):
    (dirs[0] / ".gitkeep").write_text("")
    (dirs[0] / "README.md").write_text("x")
    (dirs[0] / "nur.txt").write_text("x")
    assert lauf(dirs) == []


def test_leeres_verzeichnis(dirs):
    assert lauf(dirs) == []
    assert json.loads((dirs[2] / "erinnerungen.json").read_text()) == {"erinnerungen": []}


def test_fehlendes_erinnerungen_verzeichnis(dirs):
    dirs[0].rmdir()
    assert lauf(dirs) == []


def test_site_wird_kopiert(dirs):
    (dirs[1] / "js").mkdir()
    (dirs[1] / "js" / "app.js").write_text("1")
    lauf(dirs)
    assert (dirs[2] / "index.html").read_text() == "<html></html>"
    assert (dirs[2] / "js" / "app.js").read_text() == "1"


def test_alter_ausgabeordner_wird_ersetzt(dirs):
    dirs[2].mkdir()
    (dirs[2] / "alt.txt").write_text("alt")
    lauf(dirs)
    assert not (dirs[2] / "alt.txt").exists()


def test_schluessel_und_cli(dirs):
    bild(dirs[0] / "2023-06-12_x.jpg")
    r = subprocess.run([sys.executable, str(WURZEL / "tools" / "build.py"),
                        "--erinnerungen", str(dirs[0]), "--site", str(dirs[1]), "--out", str(dirs[2])],
                       capture_output=True, text=True)
    assert r.returncode == 0, r.stderr
    e = json.loads((dirs[2] / "erinnerungen.json").read_text())["erinnerungen"][0]
    assert set(e) == {"bild", "titel", "datum", "text", "breite", "hoehe"}
    assert (dirs[2] / e["bild"]).is_file()


def test_workflow_yaml_gueltig():
    wf = yaml.safe_load((WURZEL / ".github" / "workflows" / "pages.yml").read_text(encoding="utf-8"))
    assert wf["permissions"] == {"contents": "read", "pages": "write", "id-token": "write"}
    uses = [s["uses"].split("@")[0] for j in wf["jobs"].values() for s in j["steps"] if "uses" in s]
    for erwartet in ("actions/configure-pages", "actions/upload-pages-artifact", "actions/deploy-pages"):
        assert erwartet in uses
    assert "default_branch" in wf["jobs"]["build"]["if"]


def test_repo_platzhalter_bauen_und_klein():
    bilder = list((WURZEL / "erinnerungen").glob("*.jpg"))
    assert len(bilder) >= 8 and all(b.stat().st_size < 150_000 for b in bilder)
