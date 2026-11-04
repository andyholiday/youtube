# Museum v2 – Schnittstelle Layout ↔ Themen (verbindlich)

## Koordinaten
Meter, y nach oben, Boden y = 0. Wände: `n` bei z = z0, `s` bei z = z1, `w` bei x = x0,
`e` bei x = x1 (x0 < x1, z0 < z1 = Innenflächen). Wandnormale zeigt in den Raum.

## Raum (erzeugt von `site/js/layout.js`, Paket L)
```js
{
  id: 0,                      // Reihenfolge des Rundgangs
  theme: 'modern',            // einer aus THEMES
  x0, z0, x1, z1,             // Innenflächen der Wände
  height: 8,                  // Deckenhöhe, 7–10 m
  doors: [{ wall: 'e', center: 4.0, width: 2.6, height: 4.0 }], // center = x (n/s) bzw. z (w/e)
  slots: [{ x, y, z, wall: 'n', w: 2.8, h: 1.9, index: 3 }],   // Bildmitte auf der Wandfläche, Bildgröße ohne Rahmen, index in erinnerungen
}
```
- Nachbarräume liegen mit **0,3 m Spalt** zwischen ihren Innenflächen; jeder Raum baut seine
  Wand 0,15 m dick nach außen. Eine Tür existiert in beiden Räumen an derselben Stelle.
- Bilder hängen nicht in Türen und nicht in Wandbereichen von Hindernissen.

## Thema (Paket T, `site/js/themes/`)
```js
// site/js/themes/index.js
export const THEMES = ['modern', 'klassisch', 'futuristisch', 'garten'];
export function buildTheme(name, room) {
  return {
    group,           // THREE.Group: Boden, Wände mit Türöffnungen + Laibungen (0,15 m), Decke, Deko, Licht
    obstacles,       // [{ x0, z0, x1, z1 }] begehbare Sperrflächen der Deko (darf leer sein)
    frame(w, h),     // THREE.Object3D: Rahmen um ein Bild w×h, Bildebene bei z = 0, zeigt nach +z, Tiefe ≤ 0,12 m
    plaque(titel, datumText), // THREE.Object3D: Schild ≤ 0,6 × 0,2 m, Mitte im Ursprung, zeigt nach +z
  };
}
```
- Deko lässt vor jeder Tür und auf einer Achse zwischen den Türen ≥ 2 m frei.
- Licht: Grundhelligkeit setzt `main.js` global (Hemisphere + Ambient, ACES, sRGB, hell).
  Ein Thema fügt **höchstens 1** Punkt-/Spotlicht hinzu, **keine Schatten**; Glanz/Leuchten
  über emissive Materialien. Hintergrund/Fog setzt `main.js`.
- Performance (Handy): ≤ 60 Meshes pro Raum (gleiche Teile mergen/instancen), Texturen
  prozedural (Canvas) ≤ 1024 px, keine externen Dateien außer three@0.169.0 vom CDN
  (inkl. `three/addons/` derselben Version).
