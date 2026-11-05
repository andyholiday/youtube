# Feature-Module: die `ctx`-Schnittstelle

Ein Feature-Modul ist eine ES-Datei mit `export function install(ctx)` (auch `async`).
`main.js` lädt nacheinander `./features/thirdperson.js`, `./features/eggs.js` und `./features/admin/index.js`,
nach dem Szenenaufbau und vor `ui.setReady()`. Fehlt ein Modul, wirft `install` oder dauert es länger als 8 s,
gibt es nur `console.warn`, und das Museum läuft weiter. Code: `site/js/context.js`, `site/js/ui-extras.js`.
Verbindlich ist `.planning/SPEC-FEATURES.md`.

```js
export function install(ctx) {
  ctx.ui.addStyle('css/meins.css');            // Promise<boolean>, jedes href nur einmal
  ctx.onFrame((dt) => { /* nach Spieler- und Kamera-Update, vor dem Rendern */ });
}
```

## Felder und Funktionen

| Name | Bedeutung |
|---|---|
| `THREE, scene, camera, renderer` | die Objekte des Museums |
| `data` | komplettes `erinnerungen.json` (inkl. `geheim`, `widmung`) |
| `items` | gültige Erinnerungen (`data.erinnerungen` ohne Einträge ohne `bild`); Index = Bildnummer in allen Hooks |
| `rooms` | Räume aus `layout.js` (dasselbe Array wie `window.__museum.rooms`) |
| `player` | Live-Sicht `{ x, z, yaw, pitch, room }`, nur lesen |
| `collide(x, z, r)` | `true`, wenn der Kreis eine Wand, Türlaibung oder ein Hindernis schneidet (Berühren zählt nicht; quadratische Näherung wie die Spielerkollision, `r = 0.45` entspricht `!walk.canStand`) |
| `wallDistance(from, to)` | `THREE.Vector3` (oder `{x,y,z}`) → Abstand bis zur ersten Wand/Deko der Themengruppen auf der Strecke, sonst `null`. Bilder und Figuren zählen nicht; Objekte mit `userData.noPick` werden übersprungen |
| `onFrame(fn)` | `fn(dt)`, `0 ≤ dt ≤ 0.05`. Die Kamera steht in der Ich-Pose; Third Person setzt sie hier nach. Wirft `fn`, wird sie abgeschaltet |
| `onPictureTap(fn)` | `fn(index)` vor der Großansicht; `true` zurückgeben = behandelt, keine Großansicht |
| `onPictureLongPress(fn)` | `fn(index)` bei Drücken ≥ 550 ms ohne Bewegung (< 10 px); danach folgt kein Tap |
| `onObjectTap(obj, fn)` | `fn(obj, intersection)` beim Antippen eines `Object3D` (samt Kindern). Nur sichtbare Objekte, nur wenn keine Wand davor liegt |
| `onStartHeartTap(fn)` | `fn(anzahlInDenLetzten3s)` beim Antippen des Herzens im Startbildschirm; löst das Eintreten nicht aus |
| `onRoomEnter(fn)` | `fn(room)` beim Eintreten (Startraum) und bei jedem Raumwechsel |
| `onLightboxOpen(fn)` | `fn(index, actionsEl)` bei jedem Öffnen und Blättern. `actionsEl` ist leer (wird vorher geleert), liegt unter dem Text und ist unsichtbar, solange er leer bleibt |
| `setInputPaused(bool)` | Steuerung (Laufen, Umschauen, Tippen, Tasten) aus/an, z. B. für Dialoge mit Eingabefeldern. Jedes Modul bekommt ein eigenes `ctx`: Seine Pause zählt getrennt, die Steuerung ruht, solange irgendein Modul pausiert (ein geschlossener Verwaltungsdialog hebt also die Pause einer offenen Großansicht nicht auf) |
| `onViewerOpen(fn)` | `fn(item, actionsEl)` wenn ein Modul eine eigene Großansicht öffnet (die Geheimraum-Bilder von `eggs`; sie laufen nicht über `onLightboxOpen`). `actionsEl` verhält sich wie bei `onLightboxOpen`; `item` ist der Eintrag mit `quelle` unter `erinnerungen/geheim/` |
| `viewerOpened(item, actionsEl)` | meldet eine solche Großansicht an alle `onViewerOpen`-Handler (ruft das Modul mit der eigenen Großansicht) |
| `ui.overlayRoot` | Vollbild-Container über allem (`z-index` 30, `pointer-events: none`); eigene Kinder brauchen `pointer-events: auto` |
| `ui.hud` | Container oben rechts unter dem „entdeckt“-Zähler (Safe-Area beachtet); nur im Saal sichtbar, nicht über der Großansicht. Knöpfe ≥ 44 px |
| `ui.addStyle(href)` | hängt ein Stylesheet ein; löst `true`/`false` auf |
| `ui.toast(text, ms = 2500)` | kurze Meldung oben; ein neuer ersetzt den alten |

Alle Handler laufen abgesichert: Ein Fehler wird per `console.warn` gemeldet und stört weder andere Module noch das Museum.

## Beispiele

```js
// Knopf im HUD
const btn = document.createElement('button');
btn.textContent = '👥';
btn.setAttribute('aria-label', 'Ansicht wechseln');
btn.style.cssText = 'width:44px;height:44px';
ctx.ui.hud.append(btn);

// Zusatzknopf in der Großansicht
ctx.onLightboxOpen((index, actionsEl) => {
  const b = document.createElement('button');
  b.textContent = 'Bearbeiten';
  b.onclick = () => edit(ctx.items[index]);
  actionsEl.append(b);
});

// Verstecktes Ei: 5× Herz auf dem Start
ctx.onStartHeartTap((n) => { if (n >= 5) openAdmin(); });

// Langes Drücken auf ein Bild zeigt eine Notiz, Tippen bleibt normal
ctx.onPictureLongPress((i) => ctx.ui.toast(ctx.items[i].notiz || '…'));

// Objekt in der Szene antippbar machen
ctx.onObjectTap(mesh, () => ctx.ui.toast('Gefunden!'));

// Dialog mit Eingabefeld: Tasten gehören dem Feld
ctx.setInputPaused(true);   // … Dialog schließen → ctx.setInputPaused(false)

// Kamera nicht in die Wand schieben (Third Person)
ctx.onFrame(() => {
  const d = ctx.wallDistance(head, wanted);
  if (d !== null) wanted.copy(head).lerp(wanted, Math.max(0, d - 0.2) / head.distanceTo(wanted));
});

// Wohin darf eine Figur?
if (!ctx.collide(x, z, 0.3)) { figure.position.set(x, 0, z); }
```

Tests: `node tests/museum/hooks/run.js`.
