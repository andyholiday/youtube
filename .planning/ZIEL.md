# Ziel

**Status:** aktiv
**Auftraggeber:** Andre
**Datum:** 2026-11-04

## Andres Ziel (Wortlaut sinngemäß)
Ein QR-Code in Herzform. Andres Frau scannt ihn und landet auf einer Seite, die ein
begehbares 3D-Museum ist. Statt Bildern und Skulpturen hängen dort Erinnerungen der
beiden. Andre kann die Erinnerungen (Bilder) selbst hochladen.

## Rahmen (von Andre entschieden)
- Erstmal ein Test, im öffentlichen Repo `andyholiday/youtube`, GitHub Pages.
- Hochladen über den Ordner `erinnerungen/` im Repo (kein eigener Server).
- Noch keine echten Fotos: Platzhalter.

## Erfolgskriterien
1. QR-Code im Herz (PNG + SVG) führt auf die Seiten-URL; zwei unabhängige Decoder lesen ihn.
2. Museum lädt im Handy-Browser, ist per Touch (Joystick + Wischen) und am Desktop
   (WASD/Maus) begehbar, man läuft nicht durch Wände, Antippen zeigt Bild groß mit Text.
3. Neues Bild in `erinnerungen/` hochladen → nach Push baut eine Action die Seite neu
   und das Bild hängt im Museum. Keine Codeänderung nötig.
4. Jedes Paket hat Tests, die laufen und grün sind.
