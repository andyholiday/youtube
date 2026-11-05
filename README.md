# Unser Erinnerungs-Museum

Ein QR-Code in Herzform führt auf eine Seite, die ein begehbares 3D-Museum ist.
Statt Bildern und Skulpturen hängen dort unsere Erinnerungen. Neue Fotos kommen
einfach in den Ordner `erinnerungen/`. Eine GitHub Action baut daraus die Seite
und veröffentlicht sie auf GitHub Pages. Es muss nichts programmiert werden.

Adresse der Seite: <https://andyholiday.github.io/youtube/>

## Anleitung für Andre

### Einmalig: GitHub Pages einschalten

Im Repository: **Settings → Pages → Source: GitHub Actions**. Danach ab dem
nächsten Upload (oder über **Actions → Seite veröffentlichen → Run workflow**) ist
die Seite erreichbar.

### Erinnerung hinzufügen (am Handy)

Die GitHub-App kann keine Fotos hochladen. Es geht im Browser des Handys:

1. Im Handy-Browser **github.com** öffnen, anmelden, das Repository und den
   Ordner `erinnerungen/` aufmachen. (Fehlt der Knopf **Add file**, im Browser
   „Desktop-Version der Website“ wählen.)
2. **Add file → Upload files**, Fotos aus der Fotomediathek auswählen.
3. Unten **Commit directly to the …-Branch** (der Standard-Branch) wählen (**nicht** „Create a new
   branch / Pull Request“), dann **Commit changes**.
4. Erfolg erkennen: Reiter **Actions** öffnen. Nach etwa 1–2 Minuten steht dort
   ein **grüner Haken**. Auf den Lauf tippen: die Zusammenfassung zeigt „13
   Erinnerungen online“ und, falls etwas nicht geklappt hat, welche Dateien
   übersprungen wurden und warum (Fehler erscheinen auch als gelbe Hinweise).
   Danach die Museums-Seite neu laden.

Ein einzelnes kaputtes Foto stoppt nichts, es wird nur übersprungen und gemeldet.

Erlaubt sind Fotos als `.jpg`, `.jpeg`, `.png`, `.webp` und `.heic` (iPhone). Videos
und GIFs gehen nicht. Die Bilder werden beim Bauen automatisch gedreht, verkleinert,
in sRGB-Farben gebracht und von allen Metadaten (u. a. Ortsdaten) befreit.

### Name, Datum und Text

Alles hier ist optional, ein Foto allein reicht.

- **Datum** bekommt ein Foto, wenn der Dateiname damit beginnt
  (`2023-06-12_unser-erster-urlaub.jpg` → 12.06.2023, Titel „unser erster
  urlaub“; `_` und `-` werden zu Leerzeichen) oder wenn das Foto ein
  Aufnahmedatum in den Metadaten hat (normale Handyfotos). Bilder mit Datum
  hängen der Reihe nach, Bilder ohne Datum danach.
- **Handy-Namen** wie `IMG_0002.jpg` ergeben keinen Titel, es erscheint nur das Datum.
- **Titel und Text** über eine Textdatei mit demselben Namen wie das Foto, z. B.
  `2023-06-12_unser-erster-urlaub.txt` (oder `...urlaub.jpg.txt`). Erste Zeile
  `# Mein Titel`, darunter der Text. Am Handy: **Add file → Create new file**,
  Namen eintippen, Text schreiben, committen.
- **Löschen:** Datei öffnen → Papierkorb-Symbol → Commit. Die `.txt` dazu ebenfalls.

### Persönliche Widmung

Die Datei `erinnerungen/widmung.txt` (erste Zeile `# Titel`, darunter der Text)
ist keine Erinnerung. Der Titel erscheint auf dem Startbildschirm, der Text auf der
Abschlusskarte, nachdem alle Bilder entdeckt sind. Aktuell steht dort ein
Platzhalter zum Überschreiben.

### Notizen hinter Bildern

Zu jedem Foto kann es eine versteckte Notiz geben. Sie steht in derselben `.txt`
wie Titel und Text, nach einer Zeile `## Notiz`:

```
# Unser erster Abend am Wasser
Der Text, der immer zu sehen ist.

## Notiz
Das hier erscheint nur, wenn man das Bild lange drückt.
```

Alles unter `## Notiz` gehört zur Notiz und nicht zum normalen Text.

### Geheimnisse (Herzregen, geheimer Raum, besondere Tage)

Alles optional. Die Datei `erinnerungen/geheimnisse.txt` hat drei Abschnitte, jeder
beginnt mit einer Zeile `# Überschrift`. Die Datei im Ordner ist eine Vorlage zum
Überschreiben:

```
# Herzregen
Ich liebe dich.
# Geheimer Raum
Schön, dass du ihn gefunden hast.
# Besondere Tage
14.02. Alles Liebe zum Valentinstag!
06.07.2019 Heute vor {jahre} Jahren saßen wir zum ersten Mal am Wasser.
```

- **Herzregen:** dieser Text fällt als Herzregen auf den Bildschirm.
- **Geheimer Raum:** Begrüßungstext des Raums. Die Fotos dafür kommen (mit
  optionaler `.txt` wie sonst auch) in den Ordner `erinnerungen/geheim/`. Ein
  Beispielfoto liegt schon dort.
- **Besondere Tage:** eine Zeile pro Tag, `TT.MM.` oder mit Jahr `TT.MM.JJJJ`,
  dahinter der Text. Am Tag selbst erscheint er. `{jahre}` wird zur Zahl der
  vergangenen Jahre (nur sinnvoll mit Jahr).

Eine Zeile, die nicht passt (z. B. ein unmögliches Datum), wird übersprungen. Das
steht dann in der Zusammenfassung des Laufs unter **Actions**, die Seite wird trotzdem
gebaut. Andere Unterordner in `erinnerungen/` werden ignoriert und gemeldet.

### Verwaltung direkt in der App (am Handy, ohne GitHub-Oberfläche)

Fotos tauschen, hinzufügen, löschen, Titel, Texte und Notizen ändern, die Widmung und
die Geheimnisse bearbeiten: alles direkt im Museum. Wer die Geste nicht kennt, sieht
davon nichts.

**Einmalig: Zugangsschlüssel (Token) anlegen**

1. Auf dem Startbildschirm **5× schnell das Herz** neben dem Titel antippen. Es öffnet
   sich „Verwaltung einrichten“.
2. **GitHub öffnen** antippen, anmelden (<https://github.com/settings/personal-access-tokens/new>) und ausfüllen:
   - **Token name:** `Museum`; **Expiration:** z. B. 1 Jahr
   - **Repository access:** *Only select repositories* → `andyholiday/youtube`
   - **Repository permissions:** **Contents** = *Read and write*, **Actions** = *Read-only*
3. **Generate token**, den Token **kopieren** (er wird nur einmal gezeigt), zurück ins
   Museum, in das Feld einfügen, **Prüfen**. Der Token bleibt nur auf diesem Handy.

Danach zeigt ein kleiner Schraubenschlüssel oben rechts, dass die Verwaltung aktiv ist.

**Benutzen**

- **Foto ersetzen, bearbeiten, löschen:** Bild antippen. Unter dem Text stehen die Knöpfe
  *Foto ersetzen* (verkleinert, Ortsdaten werden entfernt), *Titel, Text & Notiz* und *Löschen*
  (mit Rückfrage). Das gilt auch für die Bilder im geheimen Raum.
- **Foto hinzufügen, Widmung, Geheimnisse:** Schraubenschlüssel antippen. Mit „In den
  geheimen Raum“ landet ein neues Foto dort.
- **Verwaltung beenden** blendet alles wieder aus, **Token entfernen** löscht den Schlüssel vom Handy.

Jede Änderung ist ein eigener Eintrag im Repository. Unten steht „Gespeichert – in ca.
2 Minuten live“, dann „Jetzt live – Seite neu laden“. Gelöschtes zurückholen: im Repository
unter „Commits“ den Eintrag „Erinnerung gelöscht: …“ öffnen und rückgängig machen (Revert).

Wenn etwas hakt: *„Token ist ungültig oder abgelaufen“* → Verwaltung öffnen, Token
entfernen, neu anlegen. *„Dafür fehlen die Rechte“* → beim Anlegen war Contents nicht auf
Read and write oder das falsche Repository gewählt. *„Es gibt inzwischen einen neueren
Stand“* → Seite neu laden und noch einmal versuchen.

Das Repository ist öffentlich: Titel, Texte, auch die versteckten Notizen, und die Fotos
kann jeder dort einsehen. Persönliches Geheimes gehört deshalb nicht hinein.

### Überraschungen im Museum

- **Herzregen:** In der Mitte des Rundgangs (zweiter Raum) hängt ein kleines Herz an der
  Wand. Antippen lässt den Text aus `# Herzregen` fallen.
- **Geheimer Raum:** Im letzten Raum führt hinter einer Efeuranke eine Tür in die Wand.
  Einfach darauf zugehen. Die Fotos dafür liegen in `erinnerungen/geheim/`.
- **Versteckte Notizen:** Ein Bild lange drücken (eine Büroklammer zeigt, wo es eine gibt).
- **Paar-Ansicht:** Der Knopf oben rechts (oder Taste **V**) zeigt zwei Figuren Hand in
  Hand von hinten.
- **Besondere Tage zum Testen:** Die Adresse mit `?heute=02-14` am Ende öffnen (statt dem
  echten Datum zählt dann der 14. Februar), z. B. `…github.io/youtube/?heute=02-14`.

### Wichtig

- **Das Repo ist öffentlich.** Alle Dateien, auch die hochgeladenen Originale
  samt Standortdaten, kann jeder im Internet einsehen. Auf dem iPhone beim
  Auswählen bzw. Teilen unter **Optionen → Standort** ausschalten. Die fertige
  Seite selbst enthält keine Metadaten mehr.
- **Das Repository nie umbenennen.** Der QR-Code enthält die Adresse
  `…github.io/youtube/`; nach einer Umbenennung zeigt er ins Leere.
- **Testfotos:** `erinnerungen/` enthält Platzhalter von Unsplash (siehe
  `QUELLEN.md`). Andre löscht sie vor der Übergabe oder bittet Claude darum.

## Lokal testen

```sh
pip install -r tools/requirements.txt
python tools/build.py
python -m http.server -d _site
```

Dann <http://localhost:8000> öffnen. `erinnerungen/` enthält Testfotos von Unsplash,
siehe `erinnerungen/QUELLEN.md` – einfach löschen und eigene Fotos hochladen.

Tests: `pip install pytest pyyaml && python -m pytest tests/build`
