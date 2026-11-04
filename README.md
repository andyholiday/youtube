# Unser Erinnerungs-Museum

Ein QR-Code in Herzform führt auf eine Seite, die ein begehbares 3D-Museum ist.
Statt Bildern und Skulpturen hängen dort unsere Erinnerungen. Neue Fotos kommen
einfach in den Ordner `erinnerungen/`. Eine GitHub Action baut daraus die Seite
und veröffentlicht sie auf GitHub Pages. Es muss nichts programmiert werden.

Adresse der Seite: <https://andyholiday.github.io/youtube/>

## Anleitung für Andre

### Einmalig: GitHub Pages einschalten

Im Repository: **Settings → Pages → Source: GitHub Actions**. Danach ab dem
nächsten Push (oder über **Actions → Seite veröffentlichen → Run workflow**) ist
die Seite erreichbar.

### Erinnerung hinzufügen (Browser oder Handy)

1. Das Repository auf github.com (oder in der GitHub-App) öffnen und den Ordner
   `erinnerungen/` aufmachen.
2. **Add file → Upload files**, Foto(s) auswählen bzw. hineinziehen.
3. Unten **Commit changes** bestätigen. Nach etwa ein bis zwei Minuten hängt das
   Bild im Museum (Fortschritt unter dem Reiter **Actions**).

Erlaubt sind `.jpg`, `.jpeg`, `.png` und `.webp`. Die Bilder werden beim Bauen
automatisch verkleinert, gedreht und von Ortsdaten (GPS) befreit.

### Name, Datum und Text

- Dateiname mit Datum vorn: `2023-06-12_unser-erster-urlaub.jpg`. Daraus wird das
  Datum 12.06.2023 und der Titel „unser erster urlaub“ (`_` und `-` werden zu
  Leerzeichen). Ohne Datum geht auch: `am-strand.jpg`. Bilder mit Datum hängen
  der Reihe nach, Bilder ohne Datum danach.
- Text zum Bild: eine gleichnamige Textdatei daneben hochladen, z. B.
  `2023-06-12_unser-erster-urlaub.txt` (UTF-8). Beginnt die erste Zeile mit
  `# Mein Titel`, ist das der Titel; der Rest ist der Text.
- Bild löschen (Datei öffnen → Papierkorb-Symbol → Commit) = Erinnerung ist
  nach dem nächsten Bauen weg. Die `.txt` dazu ebenfalls löschen.

### Wichtig: das Repo ist öffentlich

Alles in diesem Repository, also auch die Originalfotos in `erinnerungen/`, kann
jeder im Internet sehen. Nur Bilder hochladen, die so öffentlich sein dürfen.

## Lokal testen

```sh
pip install -r tools/requirements.txt
python tools/build.py
python -m http.server -d _site
```

Dann <http://localhost:8000> öffnen. Die Platzhalterbilder entstehen mit
`python tools/platzhalter.py` und können gelöscht werden, sobald echte Fotos da sind.

Tests: `pip install pytest pyyaml && python -m pytest tests/build`
