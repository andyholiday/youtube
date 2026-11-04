"""Tests für Warnungen: stderr, GitHub-Annotationen, Step-Summary, Exit-Code."""
import os
import subprocess
import sys

from hilfen import WURZEL, bild, lauf


def test_unbekannte_dateitypen_werden_gemeldet(dirs, capsys):
    for name in ("clip.mov", "film.MP4", "bewegt.gif", "ohne_endung"):
        (dirs[0] / name).write_bytes(b"x")
    assert lauf(dirs) == []
    err = capsys.readouterr().err
    for name in ("clip.mov", "film.MP4", "bewegt.gif", "ohne_endung"):
        assert name in err


def test_stille_dateien_ohne_warnung(dirs, capsys):
    for name in (".gitkeep", "README.md", "QUELLEN.md", ".DS_Store", "Thumbs.db"):
        (dirs[0] / name).write_text("x")
    bild(dirs[0] / "a.jpg")
    (dirs[0] / "a.txt").write_text("t")
    lauf(dirs)
    assert capsys.readouterr().err == ""


def test_verwaiste_txt_und_unterordner(dirs, capsys):
    (dirs[0] / "allein.txt").write_text("t")
    (dirs[0] / "Urlaub").mkdir()
    lauf(dirs)
    err = capsys.readouterr().err
    assert "allein.txt" in err and "Urlaub" in err


def test_doppelter_ausgabename_gemeldet(dirs, capsys):
    bild(dirs[0] / "a.jpg")
    bild(dirs[0] / "a.png", fmt="PNG")
    assert len(lauf(dirs)) == 1
    assert "a.png" in capsys.readouterr().err


def test_annotationen_nur_in_github_actions(dirs, capsys, monkeypatch):
    (dirs[0] / "kaputt.jpg").write_bytes(b"kein bild")
    lauf(dirs)
    assert "::warning" not in capsys.readouterr().out
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    lauf(dirs)
    out = capsys.readouterr().out
    assert "::warning file=" in out and "kaputt.jpg::" in out


def test_annotation_escaping(dirs, capsys, monkeypatch):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    (dirs[0] / "100%,a:b.mov").write_bytes(b"x")
    lauf(dirs)
    zeile = [z for z in capsys.readouterr().out.splitlines() if z.startswith("::warning")][0]
    assert "100%25%2Ca%3Ab.mov" in zeile.split("::")[1]
    assert "\n" not in zeile


def test_step_summary(dirs, monkeypatch, tmp_path):
    summary = tmp_path / "summary.md"
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary))
    bild(dirs[0] / "a.jpg")
    bild(dirs[0] / "b.jpg")
    (dirs[0] / "clip.mov").write_bytes(b"x")
    lauf(dirs)
    text = summary.read_text(encoding="utf-8")
    assert "2 Erinnerungen online" in text and "übersprungen: 1" in text and "`clip.mov`" in text


def test_step_summary_ohne_probleme_und_einzahl(dirs, monkeypatch, tmp_path):
    summary = tmp_path / "summary.md"
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary))
    bild(dirs[0] / "a.jpg")
    lauf(dirs)
    assert "1 Erinnerung online" in summary.read_text(encoding="utf-8")
    assert "nichts übersprungen" in summary.read_text(encoding="utf-8")


def test_exit_code_bleibt_null_mit_kaputtem_foto(dirs, tmp_path):
    (dirs[0] / "kaputt.jpg").write_bytes(b"kein bild")
    (dirs[0] / "clip.mov").write_bytes(b"x")
    summary = tmp_path / "s.md"
    env = {**os.environ, "GITHUB_ACTIONS": "true", "GITHUB_STEP_SUMMARY": str(summary)}
    r = subprocess.run([sys.executable, str(WURZEL / "tools" / "build.py"), "--erinnerungen", str(dirs[0]),
                        "--site", str(dirs[1]), "--out", str(dirs[2])],
                       capture_output=True, text=True, env=env)
    assert r.returncode == 0, r.stderr
    assert "::warning" in r.stdout and "übersprungen: 2" in summary.read_text(encoding="utf-8")
