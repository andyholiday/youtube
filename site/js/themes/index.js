// Raumthemen: buildTheme(name, room) -> { group, obstacles, frame, plaque } (Schnittstelle: .planning/SPEC-MUSEUM.md)
import { normalizeRoom } from './common.js';
import { build as modern } from './modern.js';
import { build as klassisch } from './klassisch.js';
import { build as futuristisch } from './futuristisch.js';
import { build as garten } from './garten.js';
import { build as geheim } from './geheim.js';

// THEMES ist die Rotation der normalen Räume; 'geheim' (Easter Egg) setzt nur layout.js für den geheimen Raum.
export const THEMES = ['modern', 'klassisch', 'futuristisch', 'garten'];
const BUILDERS = { modern, klassisch, futuristisch, garten, geheim };

export function buildTheme(name, room) {
  const build = BUILDERS[name];
  if (!build) throw new Error(`Unbekanntes Thema: ${name}`);
  return build(normalizeRoom(room));
}
