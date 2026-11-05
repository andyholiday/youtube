### Verwaltung direkt in der Seite (versteckt)

Fotos tauschen, hinzufügen und löschen, Titel, Texte und Notizen ändern, die Widmung und die
Geheimnisse bearbeiten: alles direkt im Museum am Handy. Ohne die Geste unten sieht niemand
etwas davon.

#### Einmalig: Zugangsschlüssel (Token) anlegen

Das Museum darf nur mit einem Zugangsschlüssel in dein Repository schreiben. Den legst du einmal an:

1. Im Museum auf dem Startbildschirm **5× schnell das Herz antippen**. Es öffnet sich „Verwaltung einrichten“.
2. Dort **GitHub öffnen** antippen und bei GitHub anmelden (Adresse:
   <https://github.com/settings/personal-access-tokens/new>).
3. Ausfüllen:
   - **Token name:** `Museum`
   - **Expiration:** zum Beispiel 1 Jahr (danach einfach einen neuen anlegen)
   - **Repository access:** **Only select repositories**, dort **andyholiday/youtube** wählen
   - **Permissions → Repository permissions:** **Contents** auf **Read and write** und
     **Actions** auf **Read-only** stellen (alles andere bleibt auf „No access“)
4. Ganz unten **Generate token** tippen und den angezeigten Token **kopieren**. Er wird nur einmal gezeigt.
5. Zurück ins Museum wechseln, den Token in das Feld einfügen und **Prüfen** tippen.

Der Token liegt danach nur auf diesem Handy (im Browser). Er steht nie im Repository oder in der Adresse.
Ein kleiner Schraubenschlüssel oben rechts zeigt, dass die Verwaltung gerade aktiv ist. Bei den
anderen sieht man ihn nicht, solange sie die Geste nicht kennen.

#### Benutzen

- **Verwaltung öffnen:** auf dem Startbildschirm 5× das Herz antippen (oder, wenn aktiv, den Schraubenschlüssel antippen).
- **Foto ersetzen, bearbeiten oder löschen:** ein Bild antippen, damit es groß erscheint. Unter dem Text stehen die Knöpfe:
  - **Foto ersetzen:** neues Foto auswählen, Vorschau ansehen, **Jetzt ersetzen**. Das Foto wird am Handy
    verkleinert (höchstens 2000 Pixel) und von allen Ortsdaten befreit.
  - **Titel, Text & Notiz:** ändern und **Speichern**. Die Notiz erscheint, wenn man das Bild lange gedrückt hält.
  - **Löschen:** löscht Bild und Text, nach einer Rückfrage.
- **Foto hinzufügen** (im Verwaltungsfenster): Foto wählen, Datum (kommt aus dem Foto, sonst heute), Titel,
  Text und Notiz eintragen. Mit „In den geheimen Raum“ landet es im geheimen Raum.
- **Widmung bearbeiten:** erste Zeile `# Titel` (steht auf dem Startbildschirm), darunter der Text für den Schluss.
- **Geheimnisse bearbeiten:** Abschnitte `# Herzregen`, `# Geheimer Raum`, `# Besondere Tage`. Pro besonderem Tag
  eine Zeile, zum Beispiel `14.02. Alles Liebe zum Valentinstag!` oder `06.07.2019 Heute vor {jahre} Jahren …`
  (`{jahre}` wird durch die Zahl der Jahre ersetzt).
- **Verwaltung beenden:** blendet alles wieder aus, der Token bleibt gespeichert. **Token entfernen** löscht ihn vom Handy.

#### Nach dem Speichern

Jede Änderung ist ein eigener Eintrag im Repository. Unten erscheint „Gespeichert – in ca. 2 Minuten live“,
dann „Jetzt live – Seite neu laden“. Erst nach dem Neuladen sieht man die Änderung. Klappt die Veröffentlichung
nicht, steht dort ein Link zum Lauf bei GitHub.

#### Wenn etwas hakt

- **„Token ist ungültig oder abgelaufen“:** Verwaltung öffnen, **Token entfernen**, einen neuen anlegen (Schritte oben).
- **„Dafür fehlen die Rechte“:** Beim Anlegen war **Contents** nicht auf **Read and write** oder das falsche Repository gewählt.
- **„Es gibt inzwischen einen neueren Stand“:** Die Seite neu laden und die Aktion noch einmal ausführen.
- **„Keine Verbindung“:** Internet prüfen und noch einmal versuchen.
- **Statusbalken sagt „Actions: Read“:** Der Token darf den Stand der Veröffentlichung nicht lesen. Gespeichert wurde trotzdem.
  Nach etwa 2 Minuten die Seite neu laden.
- **Gelöschtes Foto zurückholen:** Im Repository unter „Commits“ den Eintrag „Erinnerung gelöscht: …“ öffnen und
  rückgängig machen (Revert).

#### Wichtig zu wissen

- Das Repository ist öffentlich: Titel, Texte und Notizen (auch die versteckten) und die Fotos sind im
  Repository für jeden einsehbar, der die Adresse kennt. Persönliches Geheimes gehört deshalb nicht hinein.
- Die Verwaltung ändert nur `erinnerungen/`. Eine Änderung löst genau einen Bau der Seite aus.
