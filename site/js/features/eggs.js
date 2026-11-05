// Easter Eggs für Andres Frau: Herzregen, geheimer Raum, besondere Tage, versteckte Notizen.
// Schnittstelle: .planning/SPEC-FEATURES.md (install(ctx)); Texte aus data.geheim (.planning/SPEC.md, Erweiterungen v4).
import { guard, text } from './eggs-util.js';
import { createRain, installHeart } from './eggs-heart.js';
import { installSecretDoor } from './eggs-secret.js';
import { installRoomContent } from './eggs-secret-room.js';
import { installDays } from './eggs-days.js';
import { createClipFactory, installNotes } from './eggs-notes.js';

const DEFAULTS = {
  herzregen: 'Von Herzen.',
  raumtext: 'Schön, dass du ihn gefunden hast.',
};

/** geheim-Block mit dezenten Standardtexten, falls etwas fehlt. */
export function normalizeGeheim(g) {
  const src = g && typeof g === 'object' ? g : {};
  return {
    herzregen: text(src.herzregen, DEFAULTS.herzregen),
    raumtext: text(src.raumtext, DEFAULTS.raumtext),
    tage: Array.isArray(src.tage) ? src.tage : [],
    raum: Array.isArray(src.raum) ? src.raum : [],
  };
}

export function install(ctx) {
  ctx.ui.addStyle('css/eggs.css');
  const geheim = normalizeGeheim(ctx.data && ctx.data.geheim);
  const rain = createRain(ctx);
  guard('Herzregen', () => installHeart(ctx, geheim, rain));
  const newClip = createClipFactory(ctx.THREE);
  const door = guard('geheimer Raum', () => installSecretDoor(ctx, geheim.raumtext));
  const pics = (door && guard('Raum-Inhalt', () => installRoomContent(ctx, door.secret, geheim, newClip))) || [];
  guard('besondere Tage', () => installDays(ctx, geheim, rain));
  guard('Notizen', () => installNotes(ctx, newClip, pics));
}
