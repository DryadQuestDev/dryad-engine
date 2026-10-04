// Battle layout and projectile geometry: plain numbers and pure functions, shared by the battler
// (RpgBattleScreen.mjs, rpg-battle-anims.mjs) and the editor's Projectile Editor preview, so the
// preview cannot drift from the game. Keep it free of imports and of `window.engine`: the editor
// blob-imports it (editorUtils.importPluginModule), where relative imports do not resolve.

// ── Battle layout ──
// A slot's x/y put the body's centre at (50 + x)% of the viewport's width and (50 + y)% of its
// height; `scale` is the body's height as a share of the viewport height (CharacterSlot scales the
// body about its centre). The review server's arenas tab parses these names out of this file.
export const LAYOUT = {
  // Enemies: the front row stands on the floor line; each row farther back stacks upward and is
  // smaller by DEPTH_SCALE (size only).
  startX: 0, dx: 15, dy: 25, cols: 3, floorY: 2, baseScale: 0.35, DEPTH_SCALE: 0.8,
  // The party: one row along the bottom, seen from behind (view "back").
  outStartX: -35, outDx: 20, outY: 31, outScale: 0.39,
  // The acting party member while the camera is zoomed in, and the world camera's zoom then.
  inX: -30, inY: 5, inScale: 1,
  WORLD_ZOOM_IN: 1.12,
};

/** Enemy slot `i` (front row first, `cols` per row). @param {number} i */
export function enemySlot(i) {
  const L = LAYOUT;
  const row = Math.floor(i / L.cols);
  return { x: L.startX + (i % L.cols) * L.dx, y: L.floorY - row * L.dy, scale: L.baseScale * Math.pow(L.DEPTH_SCALE, row), row };
}

/** Party slot `i` in the zoomed-out row. @param {number} i */
export function partySlot(i) {
  const L = LAYOUT;
  return { x: L.outStartX + i * L.outDx, y: L.outY, scale: L.outScale, row: 0 };
}

/**
 * The shot while a party member the player controls acts: the camera zooms in, that member stands
 * at the front (activeSlot) and the rest of the party row is hidden, and the world (backdrop and
 * enemies) scales by WORLD_ZOOM_IN about that member's point, cameraOrigin. It stays zoomed in
 * through casts at enemies; enemy turns and casts at allies are zoomed out.
 */
export function activeSlot() {
  const L = LAYOUT;
  return { x: L.inX, y: L.inY, scale: L.inScale, row: 0 };
}

/** The zoomed-in camera's fixed point, as a slot offset (the battle screen's world transform-origin). */
export function cameraOrigin() {
  return { x: LAYOUT.inX, y: LAYOUT.inY };
}

/** A world slot (an enemy) as the zoomed-in camera shows it. @param {{x:number,y:number,scale:number}} slot */
export function zoomedSlot(slot) {
  const z = LAYOUT.WORLD_ZOOM_IN, o = cameraOrigin();
  return { ...slot, x: o.x + (slot.x - o.x) * z, y: o.y + (slot.y - o.y) * z, scale: slot.scale * z };
}

// ── Projectiles ──
// An area cast plays one sprite per target, started this far apart (scaled by the battle speed).
export const AREA_STAGGER_MS = 60;
// A lobbed (arc) projectile peaks this far above the straight line, as a share of the distance,
// and never less than ARC_MIN_PX.
export const ARC_HEIGHT = 0.25;
export const ARC_MIN_PX = 40;
// Sizes in % of the battle viewport's height (the Config tab overrides, a def overrides both).
export const DEFAULT_TRAVEL_SIZE = 9;
export const DEFAULT_HIT_SIZE = 18;
// px per second when a def sets no speed.
export const DEFAULT_SPEED = 1200;
// How long a single-image (not sheet) impact stays up.
export const SINGLE_HIT_MS = 400;
// The attack lunge: toward the target by `reach` of the centre-to-centre distance in `out`
// seconds, a `hold`, then back in `back` seconds. A melee impact plays at the end of `out`.
export const LUNGE = { reach: 0.15, out: 0.2, hold: 0.5, back: 0.2 };

/**
 * On-screen px from a percentage of the viewport height (`fallback` when `pct` is unset), never
 * under 8 px. Characters are laid out as a share of the viewport, so VFX sized the same way keep
 * their proportion to the bodies on any screen.
 * @param {number|undefined} pct @param {number} fallback @param {number} viewportHeight
 */
export function sizePx(pct, fallback, viewportHeight) {
  const p = Number(pct) > 0 ? Number(pct) : fallback;
  return Math.max(8, viewportHeight * p / 100);
}

/**
 * The box for a `size` px sprite: a frame (or a single image) keeps its own aspect, its longer
 * side `size` px. `dims` is the whole image; `cols` frames per row (default: one row).
 * @param {{w:number,h:number}|null} dims @param {number|undefined} frames @param {number|undefined} cols @param {number} size
 */
export function frameBox(dims, frames, cols, size) {
  if (!dims) return { w: size, h: size };
  const c = cols || frames || 1;
  const r = Math.ceil((frames || 1) / c);
  const a = (dims.w / c) / (dims.h / r);
  return a >= 1 ? { w: size, h: size / a } : { w: size * a, h: size };
}

/** Seconds a flight of `dist` px takes at `speed` px/s (before the battle-speed multiplier). */
export function flightSeconds(dist, speed) {
  return Math.max(0.1, dist / (speed || DEFAULT_SPEED));
}

/** How high a lob over `dist` px peaks above the straight line. */
export function lobHeight(dist) {
  return Math.max(ARC_MIN_PX, dist * ARC_HEIGHT);
}

/**
 * Position and heading at `t` (0..1) of a flight from `from` to `to`: straight, or with `hgt` > 0
 * a parabola peaking `hgt` above the line (screen y grows downward).
 * @param {{x:number,y:number}} from @param {{x:number,y:number}} to @param {number} t @param {number} [hgt]
 */
export function flightAt(from, to, t, hgt = 0) {
  const dx = to.x - from.x, dy = to.y - from.y;
  return { x: from.x + dx * t, y: from.y + dy * t - 4 * hgt * t * (1 - t), vx: dx, vy: dy - 4 * hgt * (1 - 2 * t) };
}

/**
 * Rotation in radians for a sprite drawn pointing UP, moving along (vx, vy); `startingRotation`
 * (degrees, clockwise) corrects art drawn another way (pointing left needs 90).
 */
export function facing(startingRotation, vx, vy) {
  return (startingRotation || 0) * Math.PI / 180 + Math.atan2(vx, -vy);
}

/**
 * Where an impact goes on a target's box by `hit_anchor`: the centre (default), the feet (the
 * sprite's bottom edge on the sole, `bottom: true`) or the head.
 * @param {string|undefined} anchor @param {{left:number,top:number,width:number,height:number,bottom:number}} rect
 */
export function hitAnchor(anchor, rect) {
  const x = rect.left + rect.width / 2;
  if (anchor === 'feet') return { pos: { x, y: rect.bottom }, bottom: true };
  if (anchor === 'head') return { pos: { x, y: rect.top + rect.height * 0.12 }, bottom: false };
  return { pos: { x, y: rect.top + rect.height / 2 }, bottom: false };
}

/** Seconds an impact stays up: one pass of its sheet, or SINGLE_HIT_MS for a single image. */
export function hitSeconds(def) {
  const sheet = def.hit_type === 'sheet' && def.hit_frames > 1;
  return sheet ? def.hit_frames / (def.hit_fps || 12) : SINGLE_HIT_MS / 1000;
}

/**
 * How a def's travel or hit image divides into frames, for reading it (rpg-vfx-juice readSheet, in
 * the editor — the Projectiles tab's save hook and the Projectile Editor's preview):
 * a `single` image is one frame whatever its frame count says.
 * @param {any} def @param {'travel'|'hit'} kind
 * @returns {{ frames: number, cols: number|undefined, filter: string|undefined }}
 */
export function sheetOf(def, kind) {
  const sheet = def[`${kind}_type`] === 'sheet' && def[`${kind}_frames`] > 1;
  return { frames: sheet ? Number(def[`${kind}_frames`]) : 1, cols: sheet ? Number(def[`${kind}_cols`]) || undefined : undefined, filter: def.filter };
}

/**
 * The 0-based frame an impact lands on — where an impact-only effect deals its damage: `hit_frame`
 * (1-based, as a dev counts along the strip) when set; else `peak`, a live read of the sheet's
 * fullest frame (the Projectile Editor, before a save); else `hit_frame_auto`, that frame as the
 * Projectiles tab's save hook stored it (1-based); else a third of the way in. A single image lands
 * as it appears (0).
 * @param {any} def @param {number|null} [peak]
 */
export function hitLandFrame(def, peak = null) {
  const n = def.hit_type === 'sheet' && def.hit_frames > 1 ? def.hit_frames : 1;
  if (n === 1) return 0;
  const at = (f) => Math.min(n, Math.round(Number(f))) - 1;
  if (Number(def.hit_frame) > 0) return at(def.hit_frame);
  if (peak != null) return peak;
  if (Number(def.hit_frame_auto) > 0) return at(def.hit_frame_auto);
  return Math.floor(n / 3);
}

/**
 * Seconds from an impact's start to the frame it lands on (see hitLandFrame), before the battle speed.
 * @param {any} def @param {number|null} [peak]
 */
export function hitLandSeconds(def, peak = null) {
  return hitLandFrame(def, peak) / (def.hit_fps || 12);
}
