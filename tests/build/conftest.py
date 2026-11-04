import pytest

from hilfen import build  # noqa: F401  (legt tools/ in den Importpfad)


@pytest.fixture(autouse=True)
def _ohne_github_umgebung(monkeypatch):
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    monkeypatch.delenv("GITHUB_STEP_SUMMARY", raising=False)


@pytest.fixture
def dirs(tmp_path):
    erinnerungen, site, out = tmp_path / "erinnerungen", tmp_path / "site", tmp_path / "_site"
    erinnerungen.mkdir()
    site.mkdir()
    (site / "index.html").write_text("<html></html>")
    return erinnerungen, site, out
