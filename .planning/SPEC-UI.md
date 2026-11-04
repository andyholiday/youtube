# Museum v3 – Schnittstelle Kern (main.js) ↔ Oberfläche (ui.js) (verbindlich)

## Dateibesitz
| Paket | Darf schreiben |
|---|---|
| K – Kern | `site/js/main.js`, `input.js`, `player.js`, `layout.js`, `pictures.js`, `site/vendor/`, `tests/museum/*.js` (bestehende) |
| O – Oberfläche | `site/index.html`, `site/css/`, `site/js/ui.js`, `site/js/format.js`, `site/js/themes/common.js` (nur `plaque`), `tests/museum/ui/` |

## Three.js lokal
Datei `site/vendor/three.module.min.js` (0.169.0, Lizenzkopf bleibt). Importmap in
`index.html`: `{"imports":{"three":"./vendor/three.module.min.js"}}`. Kein CDN mehr.

## `createUi({ onEnter, onLightbox })` → Objekt (ui.js, Paket O)
| Methode | Wer ruft | Bedeutung |
|---|---|---|
| `setLoading(text)` | main | Ladezeile auf dem Start („Bilder werden aufgehängt …“) |
| `setReady()` | main | Knopf „Eintreten“ aktiv |
| `setItems(items)` | main | alle Erinnerungen in Rundgang-Reihenfolge (Index = Index in `items`) |
| `setWidmung(w)` | main | `w` = `{ titel, text }` oder `null` (aus `erinnerungen.json` → `widmung`) |
| `showEmptyHint()` | main | leeres Museum |
| `showFatal(text)` | main | Fehlermeldung, `text` optional (Standard: Browser kann 3D nicht) |
| `showControlsHint(text)` | main | Steuerungshinweis |
| `markInteracted(kind)` | main | `'move'` oder `'look'`; Hinweis verschwindet, wenn beides passiert ist, spätestens nach 15 s |
| `roomEntered(room)` | main | beim Raumwechsel; `room.id`, `room.theme` → kurzer Raumtitel |
| `focusChanged(index)` | main | Bild mittig im Blick (< 6 m) oder `null` → Beschriftungszeile „Titel · Datum“ |
| `openLightbox(index)` | main | Großansicht für `items[index]`; Wischen/Pfeile blättern, Zähler „3 / 13“ |
| `onLightbox(open)` | ui → main | Callback: Großansicht offen/zu (Kamera pausiert) |

- `titel` darf `""` sein → nur Datum zeigen; `datum` darf `null` sein.
- „Entdeckt“ = Bild war einmal fokussiert oder in der Großansicht. Sind alle entdeckt,
  zeigt ui einmalig eine Abschlusskarte (mit `widmung.text`, falls vorhanden).
- Die Klasse `body.touch` setzt ein Inline-Skript im `<head>` sofort (nicht erst main.js).
- Joystick: main/input setzt `#joystick` per Inline-Style (`left`/`top`) dorthin, wo der
  Daumen aufsetzt, und Klasse `aktiv`; CSS (Paket O) sorgt für Kontrast und Größe.
