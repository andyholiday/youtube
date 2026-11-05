# Museum v4 – Feature-Module (verbindlich)

## Dateibesitz
| Paket | Darf schreiben |
|---|---|
| H – Hooks | `site/js/main.js`, `input.js`, `ui.js`, `site/js/features/context.md` (Doku), Tests `tests/museum/hooks/` |
| P – Third Person | `site/js/features/thirdperson.js`, `site/js/features/figures.js`, `site/css/thirdperson.css`, `tests/museum/features/thirdperson/` |
| E – Easter Eggs | `site/js/features/eggs*.js`, `site/css/eggs.css`, `site/js/layout.js`, `site/js/player.js`, `site/js/themes/geheim.js`, `site/js/themes/index.js`, in `themes/common.js` nur die Tür-Behandlung für `secret`, `tests/museum/features/eggs/` |
| A – Verwaltung | `site/js/features/admin/`, `site/css/admin.css`, `tests/museum/features/admin/` |
| B – Build | `tools/`, `tests/build/`, `README.md`, `erinnerungen/` (Beispiele), `.planning/SPEC.md` nicht |

Niemand ändert `index.html` oder `style.css`/`lightbox.css`. Module hängen ihr CSS per `ctx.ui.addStyle()` ein und bauen ihr DOM selbst.

## Laden
`main.js` lädt nach dem Szenenaufbau, vor `ui.setReady()`, nacheinander per `import()`:
`./features/thirdperson.js`, `./features/eggs.js`, `./features/admin/index.js` und ruft `install(ctx)`.
Fehlt ein Modul oder wirft `install`, wird das geloggt (`console.warn`) und das Museum läuft weiter.

## `ctx` (gebaut von main.js, Paket H)
```js
ctx = {
  THREE, scene, camera, renderer,
  data,            // komplettes erinnerungen.json (inkl. geheim, widmung)
  items,           // data.erinnerungen
  rooms,           // aus layout.js (inkl. geheimer Raum mit room.secret === true, falls E ihn anlegt)
  player,          // Live-Sicht: { x, z, yaw, pitch, room } (nur lesen)
  collide(x, z, r),          // true, wenn Kreis (x,z,r) Wand/Hindernis schneidet
  wallDistance(from, to),    // THREE.Vector3 → Abstand bis zur ersten Wand/Deko auf der Strecke oder null
  onFrame(fn),               // fn(dt) nach Spieler- und Kamera-Update, vor dem Rendern
  onPictureTap(fn),          // fn(index) → true = behandelt (keine Großansicht)
  onPictureLongPress(fn),    // fn(index), lang drücken ≥ 550 ms ohne Bewegung
  onObjectTap(obj, fn),      // Antippen eines registrierten Object3D
  onStartHeartTap(fn),       // fn(countInLast3s) beim Antippen des Herzens im Startbildschirm
  onRoomEnter(fn),           // fn(room)
  onLightboxOpen(fn),        // fn(index, actionsEl): actionsEl = leerer Container in der Großansicht für Zusatzknöpfe
  setInputPaused(bool),      // Steuerung an/aus (z. B. während Verwaltungsdialogen)
  ui: { overlayRoot, hud, addStyle(href), toast(text, ms) },
  // overlayRoot: Container über allem für eigene Overlays
  // hud: Container oben rechts für kleine Knöpfe (Safe-Area beachtet), ≥ 44 px Ziele
}
```
- Third Person setzt die Kamera in `onFrame` nach (main hat sie vorher auf die Ich-Pose gesetzt).
- Klick/Tap-Raycasts nutzen die aktuelle Kamera; Figuren sind nicht anklickbar (`layers`/`userData.noPick`).
