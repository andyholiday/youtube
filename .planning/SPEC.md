# Gemeinsame Schnittstelle (für alle Pakete verbindlich)

## Adresse
Ziel-URL der Seite: `https://andyholiday.github.io/youtube/`

## Verzeichnisse (jedes Paket schreibt NUR in seine eigenen)
| Paket | Darf schreiben |
|---|---|
| A – QR-Herz | `qr/` |
| B – Museum | `site/`, `tests/museum/` |
| C – Pipeline | `tools/`, `erinnerungen/`, `.github/`, `tests/build/`, `README.md` |

## Quelle: `erinnerungen/`
- Bilder: `.jpg`, `.jpeg`, `.png`, `.webp`, `.heic`, `.heif` (Groß-/Kleinschreibung egal).
- Dateiname optional mit Datum vorn: `2023-06-12_unser-erster-urlaub.jpg`.
  - `datum` = `2023-06-12`, `titel` = `unser erster urlaub` (`_` und `-` → Leerzeichen).
  - Ohne Datum: `datum` = null, `titel` aus dem ganzen Namen.
- Optional gleichnamige `.txt` (UTF-8) daneben: Inhalt = `text`. Ist die erste Zeile
  `# Irgendwas`, ersetzt sie den Titel und wird aus `text` entfernt.

## Build-Ausgabe: `_site/` (nicht eingecheckt)
- `_site/` = Kopie von `site/` + `_site/erinnerungen/<name>.jpg` (verkleinert, lange Kante
  max. 1600 px, JPEG) + `_site/erinnerungen.json`.

## `erinnerungen.json`
```json
{
  "erinnerungen": [
    {
      "bild": "erinnerungen/2023-06-12_unser-erster-urlaub.jpg",
      "titel": "unser erster urlaub",
      "datum": "2023-06-12",
      "text": "Freitext oder null",
      "breite": 1600,
      "hoehe": 1200
    }
  ]
}
```
- Sortierung: mit Datum aufsteigend zuerst, danach ohne Datum nach Dateiname.
- `bild` ist relativ zu `index.html`.
- Optional oberste Ebene `"widmung": {"titel": "…", "text": "…"}` aus `erinnerungen/widmung.txt` (erste Zeile `# Titel`, Rest Text); fehlt die Datei → kein Schlüssel.
- Leere Liste ist gültig.
- `titel` darf `""` sein (generischer Kamera-Dateiname wie `IMG_1234`); die Seite zeigt dann nur das Datum.
- `bild` darf einen Cache-Parameter tragen (`…jpg?v=<hash>`).

## Erweiterungen v4 (verbindlich)
- Jede Erinnerung hat zusätzlich `"quelle": "erinnerungen/<Originaldateiname>"` (für den Verwaltungsmodus)
  und `"notiz": "…" | null` (aus der `.txt`: alles nach einer Zeile `## Notiz`, nicht Teil von `text`).
- Optional `erinnerungen/geheimnisse.txt` (Abschnitte mit `# Überschrift`):
  ```
  # Herzregen
  Ich liebe dich.
  # Geheimer Raum
  Schön, dass du ihn gefunden hast.
  # Besondere Tage
  14.02. Alles Liebe zum Valentinstag!
  06.07.2019 Heute vor {jahre} Jahren saßen wir zum ersten Mal am Wasser.
  ```
- Optional Ordner `erinnerungen/geheim/` mit Bildern (+ `.txt`) für den geheimen Raum, verarbeitet wie
  normale Erinnerungen, Ausgabe unter `erinnerungen/geheim/…`.
- JSON oberste Ebene `"geheim"` (immer vorhanden, Felder ggf. leer):
  ```json
  "geheim": {
    "herzregen": "Ich liebe dich." ,
    "raumtext": "Schön, dass du ihn gefunden hast.",
    "tage": [{ "tag": "02-14", "jahr": null, "text": "…" }, { "tag": "07-06", "jahr": 2019, "text": "Heute vor {jahre} Jahren …" }],
    "raum": [ /* Einträge wie in "erinnerungen", inkl. quelle/notiz */ ]
  }
  ```
  `{jahre}` ersetzt die Seite. Fehlende Datei/Abschnitte → `""` bzw. `[]`.
