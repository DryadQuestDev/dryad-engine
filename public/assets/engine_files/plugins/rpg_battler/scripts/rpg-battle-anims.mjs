/// <reference path="./dtypes.d.ts" />

const { game, gsap } = window.engine;

import { getSpeedMult } from './rpg-battle-state.mjs';
import {
  AREA_STAGGER_MS, DEFAULT_TRAVEL_SIZE, DEFAULT_HIT_SIZE, LUNGE,
  sizePx, frameBox, flightSeconds, lobHeight, flightAt, facing, hitAnchor, hitSeconds, hitLandSeconds,
} from './rpg-vfx-geometry.mjs';
import { IMPACT_STRENGTH, JUICE_DEFAULTS, strengthOf, burst, sparks, flash, shake } from './rpg-vfx-juice.mjs';

const TICK_FLICKER_MS = 550;
const SAME_POS_THRESHOLD = 40;

/**
 * Get the character's DOM element in the battle viewport.
 * @param {string} characterId
 * @returns {HTMLElement | null}
 */
function getCharEl(characterId) {
  /** @type {HTMLElement | null} */
  const wrapper = document.querySelector(`[data-rpg-char-id="${characterId}"]`);
  return /** @type {HTMLElement | null} */ (wrapper?.querySelector('.character-content')) || wrapper;
}

// .character-content is exactly the body's height, so 100% is the sole. Every scale or
// rotation on it pivots here: a crouch pushes the head down onto planted feet and a wobble
// rocks on them, instead of scaling about the belly and sliding the feet along the floor.
const FEET = { transformOrigin: '50% 100%' };

/**
 * Squash & stretch is opt-in (Config tab) and for static plates only: a Spine doll's
 * attack/hit animations are authored in the skeleton, and a CSS squash on top would
 * fight them. When off, the tweens below are exactly the pre-existing lunge/shake/wobble.
 * @param {string} characterId
 */
function squashEnabled(characterId) {
  return !!getConfig().squash_stretch && !game.getCharacter(characterId)?.isSpineCharacter?.();
}

/**
 * Get center position of a character element.
 * @param {HTMLElement} el
 * @returns {{ x: number, y: number }}
 */
function getCenter(el) {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Set battle_state attribute on a character (drives skin layer changes for static dolls).
 * For spine dolls, also triggers spine animation if available.
 * @param {string} characterId
 * @param {RpgBattleState} state
 */
function setBattleState(characterId, state) {
  const char = game.getCharacter(characterId);
  if (!char) return;

  // Set attribute (triggers skin layer swap for static dolls + spine track animation)
  char.setAttribute('battle_state', state);
}

/**
 * Resolve the idle state based on health.
 * @param {string} characterId
 * @returns {RpgBattleState}
 */
function getIdleState(characterId) {
  const char = game.getCharacter(characterId);
  if (!char) return 'idle';
  const ratio = char.getResourceRatio('health');
  return ratio < 0.3 ? 'idle_wounded' : 'idle';
}

/**
 * Set character to appropriate idle state based on health.
 * @param {string} characterId
 */
export function setIdleState(characterId) {
  setBattleState(characterId, getIdleState(characterId));
}

/** The character's slot wrapper (the [data-rpg-char-id] grid cell), independent of CharacterSlot's inner GSAP. */
function getCharWrapper(characterId) {
  return /** @type {HTMLElement | null} */ (document.querySelector(`[data-rpg-char-id="${characterId}"]`));
}

/** Hide a freshly-summoned combatant's slot so the zoom-out reveal doesn't pop it in. */
export function prepSummon(characterId) {
  const w = getCharWrapper(characterId);
  if (w) w.style.opacity = '0';
}

/**
 * Fade a summoned combatant's slot in (wrapper opacity — no conflict with the slot's own entrance).
 * @param {string} characterId
 * @returns {Promise<void>}
 */
export function animateSummonIn(characterId) {
  const m = getSpeedMult();
  return new Promise(resolve => {
    const w = getCharWrapper(characterId);
    if (!w) { resolve(); return; }
    gsap.fromTo(w, { opacity: 0 }, {
      opacity: 1, duration: 0.45 * m, ease: 'power2.out',
      onComplete: () => { w.style.opacity = ''; resolve(); },
    });
  });
}

// ── Caster Animations ──

/**
 * Animate attack: lunge toward target, return after.
 * Spine: plays 'attack' one-shot if available, otherwise GSAP lunge.
 * @param {string} casterId
 * @param {string} targetId
 * @returns {Promise<void>}
 */
export function animateAttack(casterId, targetId) {
  setBattleState(casterId, 'attack');

  const m = getSpeedMult();

  // GSAP: lunge toward target
  return new Promise(resolve => {
    const casterEl = getCharEl(casterId);
    const targetEl = getCharEl(targetId);
    if (!casterEl || !targetEl) {
      setBattleState(casterId, getIdleState(casterId));
      resolve();
      return;
    }

    const c = getCenter(casterEl);
    const t = getCenter(targetEl);

    // Squash & stretch (opt-in) around the same lunge (same 0.2s travel, same 0.5s hold):
    // a snap of crouch before the push, stretched long during it, settling during the hold.
    // The scale beats are fast on purpose — a slow squash reads as jelly, not as force.
    const sq = squashEnabled(casterId);
    const tl = gsap.timeline();
    if (sq) tl.to(casterEl, { scaleX: 1.05, scaleY: 0.94, duration: 0.03 * m, ease: 'power2.out', ...FEET });
    tl.to(casterEl, {
      x: (t.x - c.x) * LUNGE.reach,
      y: (t.y - c.y) * LUNGE.reach,
      ...(sq ? { scaleX: 0.97, scaleY: 1.04 } : {}),
      duration: LUNGE.out * m,
      ease: 'power2.out',
      onComplete: resolve,
    });
    if (sq) tl.to(casterEl, { scaleX: 1, scaleY: 1, duration: 0.05 * m, ease: 'power2.out' });
    tl.to(casterEl, {
      x: 0, y: 0,
      duration: LUNGE.back * m,
      ease: 'power2.inOut',
      onComplete: () => setBattleState(casterId, getIdleState(casterId)),
    }, `>+=${(sq ? LUNGE.hold - 0.05 : LUNGE.hold) * m}`);
  });
}

/**
 * Animate self-cast: wiggle rotation.
 * Spine: plays 'cast' one-shot if available, otherwise GSAP wiggle.
 * @param {string} casterId
 * @returns {Promise<void>}
 */
export function animateSelfCast(casterId) {
  setBattleState(casterId, 'cast');

  const m = getSpeedMult();

  // GSAP: rotation wiggle
  return new Promise(resolve => {
    const el = getCharEl(casterId);
    if (!el) { resolve(); return; }

    const d = 0.08 * m;
    const tl = gsap.timeline({
      onComplete: () => {
        setBattleState(casterId, getIdleState(casterId));
        resolve();
      },
    });
    tl.to(el, { rotation: 3, duration: d, ease: 'power1.inOut', ...(squashEnabled(casterId) ? FEET : {}) })
      .to(el, { rotation: -3, duration: d, ease: 'power1.inOut' })
      .to(el, { rotation: 0, duration: d, ease: 'power1.inOut' });
  });
}

/**
 * Animate bump: small nudge toward target (for ally buffs).
 * @param {string} casterId
 * @param {string} targetId
 * @returns {Promise<void>}
 */
export function animateBump(casterId, targetId) {
  setBattleState(casterId, 'cast');
  const m = getSpeedMult();

  return new Promise(resolve => {
    const casterEl = getCharEl(casterId);
    const targetEl = getCharEl(targetId);
    if (!casterEl || !targetEl) {
      setBattleState(casterId, getIdleState(casterId));
      resolve();
      return;
    }

    const c = getCenter(casterEl);
    const t = getCenter(targetEl);
    const dx = t.x - c.x;
    const dy = t.y - c.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    gsap.to(casterEl, {
      x: (dx / dist) * 10,
      y: (dy / dist) * 10,
      duration: 0.15 * m,
      yoyo: true,
      repeat: 1,
      ease: 'power2.out',
      onComplete: () => {
        setBattleState(casterId, getIdleState(casterId));
        resolve();
      },
    });
  });
}

// ── Target Animations ──

/**
 * Animate hit: shake + flash. With `juice` (see takeJuice) the body flashes near-white and holds
 * still for the hit-stop, a burst and sparks go off at the point of contact and the screen jolts,
 * then the recoil shake plays; without it, the plain red flash and shake.
 * @param {string} targetId
 * @param {RpgHitJuice|null} [juice]
 * @returns {Promise<void>}
 */
export function animateHit(targetId, juice = null) {
  const m = getSpeedMult();
  const stop = juice ? juice.stopMs * m : 0;

  setBattleState(targetId, 'hit');

  return new Promise(resolve => {
    const el = getCharEl(targetId);
    if (!el) { resolve(); return; }

    const wrapper = el.closest('[data-rpg-char-id]');
    if (juice) playJuice(el, wrapper, juice, m);
    else if (wrapper) wrapper.classList.add('rpg-hit-flash');

    const amp = 4 * Math.max(1, juice?.k || 1);
    gsap.to(el, {
      x: -amp, duration: 0.05 * m, ease: 'power1.inOut', delay: stop / 1000,
      yoyo: true, repeat: 5,
      onComplete: () => { gsap.set(el, { x: 0 }); },
    });
    // Impact squash (opt-in) on top of the shake: driven flat on the feet, then springs back.
    if (squashEnabled(targetId)) {
      gsap.timeline({ delay: stop / 1000 })
        .to(el, { scaleX: 1.06, scaleY: 0.92, duration: 0.025 * m, ease: 'power2.out', ...FEET })
        .to(el, { scaleX: 1, scaleY: 1, duration: 0.06 * m, ease: 'back.out(3)' });
    }

    setTimeout(() => {
      if (wrapper) wrapper.classList.remove('rpg-hit-flash');
      setBattleState(targetId, getIdleState(targetId));
      resolve();
    }, 400 * m + stop);
  });
}

/**
 * The juice's one-shot pieces, all at the moment of contact: the body's flash (held for the
 * hit-stop), the burst and sparks at the impact point (the target's centre when the hit VFX sat on
 * its feet, or there was none), and the screen jolt on the background and the viewport together.
 * @param {HTMLElement} el @param {Element|null} wrapper @param {RpgHitJuice} j @param {number} m
 */
function playJuice(el, wrapper, j, m) {
  const doll = wrapper?.querySelector('.character-doll-wrapper') || el;
  flash(doll, j.color, j.stopMs, j.size * 0.06, m);
  const hit = { container: document.body, fixed: true, pos: j.pos || getCenter(el), size: j.size, color: j.color, k: j.k, m };
  burst(hit);
  sparks({ ...hit, sparks: getConfig().hit_sparks ?? JUICE_DEFAULTS.sparks });
  const vp = document.querySelector('.rpg-viewport');
  const px = (getConfig().hit_shake ?? JUICE_DEFAULTS.shake) * j.k * (vp?.getBoundingClientRect().height || window.innerHeight) / 1080;
  shake(document.querySelectorAll('.rpg-bg-camera, .rpg-viewport'), px, m);
}

/**
 * Animate heal: green flash.
 * @param {string} targetId
 * @returns {Promise<void>}
 */
export function animateHeal(targetId) {
  const m = getSpeedMult();
  return new Promise(resolve => {
    const el = getCharEl(targetId);
    const wrapper = el?.closest('[data-rpg-char-id]');
    if (wrapper) {
      wrapper.classList.add('rpg-heal-flash');
      setTimeout(() => {
        wrapper.classList.remove('rpg-heal-flash');
        resolve();
      }, 400 * m);
    } else {
      resolve();
    }
  });
}

/**
 * Animate flicker: brightness flash only, no pose change or shake.
 * Used for DoT ticks so they read as ambient damage, not a direct strike.
 * @param {string} targetId
 * @returns {Promise<void>}
 */
export function animateFlicker(targetId) {
  const m = getSpeedMult();
  return new Promise(resolve => {
    const el = getCharEl(targetId);
    const wrapper = el?.closest('[data-rpg-char-id]');
    if (wrapper) {
      wrapper.classList.add('rpg-tick-flicker');
      setTimeout(() => {
        wrapper.classList.remove('rpg-tick-flicker');
        resolve();
      }, TICK_FLICKER_MS * m);
    } else {
      resolve();
    }
  });
}

/**
 * Animate death: fade + shrink.
 * @param {string} characterId
 * @returns {Promise<void>}
 */
export function animateDeath(characterId) {
  setBattleState(characterId, 'death');
  const m = getSpeedMult();

  return new Promise(resolve => {
    const el = getCharEl(characterId);
    if (!el) { resolve(); return; }

    gsap.to(el, {
      opacity: 0,
      scale: 0.4,
      y: 15,
      duration: 0.5 * m,
      ease: 'power2.in',
      onComplete: resolve,
    });
  });
}

/**
 * Play the caster's animation: a lunge for `melee`; for `cast`, a nudge toward another ally or a
 * wobble in place. Without a motion, the target type picks it as for an ability with no VFX.
 * @param {string} casterId
 * @param {string} targetId
 * @param {string} targetType - ability's target type
 * @param {'melee'|'cast'} [motion]
 * @returns {Promise<void>}
 */
export function animateCaster(casterId, targetId, targetType, motion = casterMotion(null, targetType)) {
  if (motion === 'melee') return animateAttack(casterId, targetId);
  if ((targetType === 'ally' || targetType === 'self_and_ally') && targetId && targetId !== casterId) {
    return animateBump(casterId, targetId);
  }
  return animateSelfCast(casterId);
}

const FRIENDLY_TARGETS = ['self', 'ally', 'self_and_ally', 'all_allies'];

/**
 * The caster's side of a cast, from the projectile def's `caster_animation`: `melee` lunges at the
 * target in the attack pose, `cast` stays in place in the cast pose. Unset derives it: a self or
 * ally ability casts; a hostile one lunges without VFX images and casts with a travel sprite or an
 * impact.
 * @param {any} def @param {string} targetType
 * @returns {'melee'|'cast'}
 */
function casterMotion(def, targetType) {
  const chosen = def?.caster_animation;
  if (chosen === 'melee' || chosen === 'cast') return chosen;
  if (FRIENDLY_TARGETS.includes(targetType)) return 'cast';
  return def && (def.travel_image || def.hit_image) ? 'cast' : 'melee';
}

// ── Projectiles / battle VFX ──

/** Resolve a projectile/VFX definition by id from game data (Projectiles tab). */
function getProjectileDef(id) {
  if (!id) return null;
  const defs = game.getData('plugins_data/rpg_battler/projectiles', true);
  return defs?.get(id) || null;
}

function playSounds(ids) {
  if (ids && (Array.isArray(ids) ? ids.length : true)) game.playSounds(ids);
}

/** Battler config (Config tab) — holds projectile_travel_size / projectile_hit_size. */
function getConfig() {
  return game.getData('plugins_data/rpg_battler/battle_config') || {};
}

/**
 * On-screen px from a percentage of the battle viewport's height (see sizePx in rpg-vfx-geometry).
 * @param {number|undefined} pct @param {number} fallback
 */
function vfxSize(pct, fallback) {
  const vp = /** @type {HTMLElement|null} */ (document.querySelector('.rpg-viewport'));
  return sizePx(pct, fallback, vp?.getBoundingClientRect().height || window.innerHeight);
}

/** Natural sizes of VFX images (or the pending load), so a frame keeps its shape (see frameBox). */
const imageDims = new Map();

/** @param {string} url @returns {Promise<{w:number,h:number}|null>} */
function loadDims(url) {
  if (!url) return Promise.resolve(null);
  const known = imageDims.get(url);
  if (known) return known instanceof Promise ? known : Promise.resolve(known);
  const p = new Promise(resolve => {
    const img = new Image();
    img.onload = () => { const d = { w: img.naturalWidth, h: img.naturalHeight }; imageDims.set(url, d); resolve(d); };
    img.onerror = () => { imageDims.delete(url); resolve(null); };
    img.src = url;
  });
  imageDims.set(url, p);
  return p;
}

/**
 * Warm the image cache and the size table for the projectiles these combatants can cast, so the
 * first cast of an effect already knows its frame shape and its image is loaded. Only what the
 * fight can use: a projectile is named by an ability (`meta.projectile`, a battle consumable's
 * included), so a battle loads its combatants' effects, never the whole Projectiles tab. Call it
 * as combatants join — the battle's start, a wave, a summon; known images are skipped.
 * @param {Iterable<string>} charIds
 */
export function preloadProjectiles(charIds = []) {
  for (const id of charIds) {
    const abilities = game.getCharacter(id)?.getAbilities() || {};
    for (const aid in abilities) {
      const def = getProjectileDef(abilities[aid]?.meta?.projectile);
      if (def) { loadDims(def.travel_image); loadDims(def.hit_image); }
    }
  }
}

/** Frame-stepper interval ids, keyed by sprite element (cleared in killSprite). */
const spriteTimers = new WeakMap();

/**
 * Build a `position:fixed` VFX sprite at viewport `pos`, its longer side `size` px. `single` → an
 * `<img>`; `sheet` → a `<div>` whose background-image is a strip/grid, frame-stepped in JS (exact
 * per-cell background-position). `cols` = frames per row (defaults to `frames` = single row); rows
 * derive from the count, and a partial last row is trimmed (the stepper never indexes past frames-1).
 * `anchor: 'bottom'` puts the sprite's bottom edge on `pos` (ground effects), otherwise its centre.
 * Frames step at the def's fps scaled by the battle-speed setting, like every other battle tween.
 * @param {{ image: string, type?: string, frames?: number, fps?: number, cols?: number, cssClass?: string,
 *   filter?: string, pos: {x:number,y:number}, size: number, loop: boolean, anchor?: string }} o
 * @returns {HTMLElement}
 */
function spawnSprite(o) {
  const frames = o.frames || 1;
  const sheet = o.type === 'sheet' && frames > 1;
  const el = document.createElement(sheet ? 'div' : 'img');
  el.className = 'rpg-projectile' + (sheet ? ' rpg-projectile-sheet' : '')
    + (o.anchor === 'bottom' ? ' rpg-projectile-bottom' : '') + (o.cssClass ? ' ' + o.cssClass : '');
  if (o.filter) el.style.setProperty('--vfx-filter', o.filter);
  const fit = (dims) => {
    const b = frameBox(dims, frames, o.cols, o.size);
    el.style.width = b.w + 'px';
    el.style.height = b.h + 'px';
  };
  const known = imageDims.get(o.image);
  if (known && !(known instanceof Promise)) fit(known);
  else { fit(null); loadDims(o.image).then(fit); }   // square until the first load reports the shape
  if (sheet) {
    const c = o.cols || frames;
    const r = Math.ceil(frames / c);
    el.style.backgroundImage = `url('${o.image}')`;
    el.style.backgroundSize = `${c * 100}% ${r * 100}%`;
    let i = 0;
    const setFrame = () => {
      const col = i % c, row = Math.floor(i / c);
      const px = c > 1 ? (col / (c - 1)) * 100 : 0;
      const py = r > 1 ? (row / (r - 1)) * 100 : 0;
      el.style.backgroundPosition = `${px}% ${py}%`;
    };
    setFrame();
    const id = setInterval(() => {
      i++;
      if (i >= frames) {
        if (o.loop) i = 0;
        else { clearInterval(id); spriteTimers.delete(el); return; }
      }
      setFrame();
    }, (1000 / (o.fps || 12)) * getSpeedMult());
    spriteTimers.set(el, id);
  } else {
    /** @type {HTMLImageElement} */ (el).src = o.image;
  }
  el.style.left = o.pos.x + 'px';
  el.style.top = o.pos.y + 'px';
  document.body.appendChild(el);
  return el;
}

/**
 * Remove a spawned sprite, clearing its frame stepper if it has one.
 * @param {HTMLElement} el
 */
function killSprite(el) {
  const id = spriteTimers.get(el);
  if (id) { clearInterval(id); spriteTimers.delete(el); }
  el.remove();
}

/**
 * Where an impact plays on a target, by the def's `hit_anchor`: its centre (default), its feet (the
 * sprite's bottom edge on the sole — ground rings, eruptions) or its head. The character element
 * spans exactly the body, so its bottom edge is the sole (see FEET). A target that is gone (a bounce
 * off one that just died) falls back to `fallback`, centred.
 * @param {string|undefined} anchor @param {string|null} targetId @param {{x:number,y:number}|null} fallback
 * @returns {{ pos: {x:number,y:number}, anchor: string } | null}
 */
function hitPlacement(anchor, targetId, fallback) {
  const el = targetId ? getCharEl(targetId) : null;
  if (!el) return fallback ? { pos: fallback, anchor: 'center' } : null;
  const at = hitAnchor(anchor, el.getBoundingClientRect());
  return { pos: at.pos, anchor: at.bottom ? 'bottom' : 'center' };
}

/**
 * The latest impact on each target, noted as its hit VFX plays: the damage reaction that follows
 * (animateEffects → takeJuice) takes its strength, colour, point and size from it. Notes belong to
 * one cast (animateCast clears them), so damage with no cast of its own never wears the previous
 * one's; plays that deal no damage (a buff ring, a miss) leave a note nobody takes.
 * @type {Map<string, { k: number, color: string, pos: {x:number,y:number}|null, size: number, at: number }>}
 */
const impacts = new Map();

/**
 * @param {string|null} targetId @param {any} def (null: a plain lunge)
 * @param {{x:number,y:number}|null} pos @param {number} size
 */
function noteImpact(targetId, def, pos, size) {
  if (!targetId) return;
  impacts.set(targetId, { k: strengthOf(def?.impact_strength), color: impactColor(def), pos, size, at: performance.now() });
}

/**
 * A def's juice colour: its impact_color, else the colour the Projectiles tab's save hook read off
 * its sprite (impact_color_auto), else white. The battle never reads the sheets itself.
 * @param {any} def
 */
function impactColor(def) {
  return def?.impact_color || def?.impact_color_auto || '#ffffff';
}

/**
 * The juice for a damaging hit on `targetId`, or null when the Config tab's hit_juice is off or the
 * def's impact_strength is none. Takes the target's fresh impact note; damage with no cast behind it
 * (thorns, reflect) gets a light white one. A killing blow holds the hit-stop twice as long.
 * @param {string} targetId @param {boolean} lethal
 * @returns {RpgHitJuice|null}
 */
function takeJuice(targetId, lethal) {
  const cfg = getConfig();
  if (cfg.hit_juice === false) return null;
  const note = impacts.get(targetId);
  impacts.delete(targetId);
  const fresh = note && performance.now() - note.at < 2000 * getSpeedMult() ? note : null;
  const k = fresh ? fresh.k : IMPACT_STRENGTH.light;
  if (k <= 0) return null;
  return {
    k, color: fresh?.color || '#ffffff', pos: fresh?.pos || null,
    size: fresh?.size || vfxSize(undefined, cfg.projectile_hit_size || DEFAULT_HIT_SIZE),
    stopMs: (cfg.hit_stop_ms ?? JUICE_DEFAULTS.stopMs) * k * (lethal ? 2 : 1),
  };
}

/**
 * Play the hit/impact VFX on a target (single image or one spritesheet cycle) and its hit sound.
 * Resolves when the impact LANDS — on its landing frame (hitLandSeconds: `hit_frame`, else the
 * sheet's fullest frame as saved in `hit_frame_auto`), which is when an impact-only effect deals its damage — while the sprite
 * plays on to its last frame and removes itself. A no-image def just plays the sound and resolves.
 * @param {any} def @param {string|null} targetId @param {{x:number,y:number}|null} [fallback]
 * @returns {Promise<void>}
 */
function playHitVfx(def, targetId, fallback = null) {
  return new Promise(resolve => {
    playSounds(def.hit_sound);
    const place = def.hit_image ? hitPlacement(def.hit_anchor, targetId, fallback) : null;
    const size = vfxSize(def.hit_size, getConfig().projectile_hit_size || DEFAULT_HIT_SIZE);
    noteImpact(targetId, def, place?.anchor === 'center' ? place.pos : null, size);
    if (!place) { resolve(); return; }
    const m = getSpeedMult();
    const el = spawnSprite({
      image: def.hit_image, type: def.hit_type, frames: def.hit_frames, fps: def.hit_fps, cols: def.hit_cols,
      cssClass: def.css_class, filter: def.filter, pos: place.pos, size, loop: false, anchor: place.anchor,
    });
    setTimeout(resolve, hitLandSeconds(def) * 1000 * m);
    setTimeout(() => killSprite(el), hitSeconds(def) * 1000 * m);
  });
}

/**
 * Travel projectile: a sprite flies from origin to target, then plays the hit VFX. `fromPos` overrides the launch
 * point (the previous hop's landing) so a chain keeps flying even after the prior target dies and
 * its element is gone. An `arc` def lobs along a parabola and turns with it. Resolves with the
 * landing position so the next hop can launch from it.
 * @returns {Promise<{x:number,y:number}|null>}
 */
function animateProjectile(originId, targetId, def, fromPos) {
  const m = getSpeedMult();
  return new Promise(resolve => {
    const oEl = getCharEl(originId);
    const tEl = getCharEl(targetId);
    const from = fromPos || (oEl ? getCenter(oEl) : null);
    const to = tEl ? getCenter(tEl) : null;
    if (!from || !to) { resolve(to); return; }
    playSounds(def.sound);
    const size = vfxSize(def.travel_size, getConfig().projectile_travel_size || DEFAULT_TRAVEL_SIZE);
    const el = spawnSprite({
      image: def.travel_image, type: def.travel_type, frames: def.travel_frames, fps: def.travel_fps,
      cols: def.travel_cols, cssClass: def.css_class, filter: def.filter, pos: from, size, loop: true,
    });

    // On land: drop the travel sprite, play the impact VFX (fire-and-forget so damage isn't blocked).
    const land = () => { killSprite(el); playHitVfx(def, targetId, to); resolve(to); };

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);

    // Same spot — re-picked target, or a survivor that reflowed into the dead target's slot:
    // a straight tween would be invisible, so orbit the landing point instead.
    if (dist < SAME_POS_THRESHOLD) {
      const r = 30;
      const proxy = { a: 0 };
      gsap.to(proxy, {
        a: Math.PI * 2, duration: 0.5 * m, ease: 'none',
        onUpdate: () => {
          el.style.left = (to.x + Math.cos(proxy.a) * r) + 'px';
          el.style.top = (to.y + Math.sin(proxy.a) * r) + 'px';
        },
        onComplete: land,
      });
      return;
    }

    // Facing: starting_rotation corrects the drawn orientation (0 = the sprite points up), then the
    // sprite turns to its direction of travel. Only the rotation lives in `transform` (see the CSS).
    const face = (vx, vy) => { el.style.transform = `rotate(${facing(def.starting_rotation, vx, vy)}rad)`; };
    const dur = flightSeconds(dist, def.speed) * m;

    if (!def.arc) {
      face(dx, dy);
      gsap.to(el, { left: to.x, top: to.y, duration: dur, ease: 'none', onComplete: land });
      return;
    }
    // Lob: a parabola peaking above the straight line (lobHeight); the sprite faces along the
    // curve's tangent, so it climbs, tips over and dives onto the target.
    const hgt = lobHeight(dist);
    const p = { t: 0 };
    gsap.to(p, {
      t: 1, duration: dur, ease: 'none',
      onUpdate: () => {
        const at = flightAt(from, to, p.t, hgt);
        el.style.left = at.x + 'px';
        el.style.top = at.y + 'px';
        face(at.vx, at.vy);
      },
      onComplete: land,
    });
  });
}

/**
 * Ability-aware cast animation, all of it from the referenced projectile def. The caster's motion
 * (see casterMotion) is a lunge or a cast. No def (or an empty def) → the caster's animation alone;
 * only a `hit_image` with a lunge → the hit VFX on contact; a `travel_image` → a sprite flies
 * origin→target then plays the hit VFX, launched at the lunge's peak when the caster lunges; only a
 * `hit_image` otherwise → the VFX manifests at the target (no travel). `targetId` may be a list: an
 * area cast passes every target and each gets its own sprite, started AREA_STAGGER_MS apart (a
 * lunge goes at the first). Without images, or lunging into an impact, the caster always animates
 * (ignores casterPose); before a travel sprite or a manifesting impact it lunges or holds the cast
 * pose only with `opts.casterPose` (suppressed on bounces and flurry strikes). `opts.originId`/`opts.originPos` override the launch point so a bounce
 * chain survives the prior target's death. Returns the first target's landing position (null for
 * melee) so the caller can thread it into the next bounce.
 * `opts.onCast` fires at the cast's commit moment — the lunge peak (melee), the projectile launch
 * (ranged), or the VFX manifest (hit-only) — so callers can time the ability-name flash to it.
 * It resolves when the damage should land: at the lunge's contact, when every travel sprite has
 * landed, or on an impact-only effect's landing frame (on the last target of an area cast) while
 * its sprites play on.
 * Sounds: `sound` plays as the effect starts (each travel sprite's launch, a lunge's start, or once as
 * an impact-only effect appears) and `hit_sound` with every impact, so a def with no images at all
 * still gives a plain lunge its swing and its contact.
 * @param {string} casterId @param {string|string[]} targetId @param {string} targetType @param {any} ability
 * @param {{ originId?: string, originPos?: {x:number,y:number}|null, casterPose?: boolean, onCast?: () => void }} [opts]
 * @returns {Promise<{x:number,y:number}|null>}
 */
export async function animateCast(casterId, targetId, targetType, ability, opts = {}) {
  const { originId = casterId, originPos = null, casterPose = true, onCast } = opts;
  impacts.clear();
  const targets = (Array.isArray(targetId) ? targetId : [targetId]).filter(Boolean);
  const first = targets[0];
  const meta = ability?.meta || {};
  const def = getProjectileDef(meta.projectile);
  const m = getSpeedMult();
  /** @param {(id: string) => Promise<any>} fn */
  const each = (fn) => Promise.all(targets.map((t, i) =>
    (i ? new Promise(r => setTimeout(r, i * AREA_STAGGER_MS * m)) : Promise.resolve()).then(() => fn(t))));
  const motion = casterMotion(def, targetType);

  if (!def || (!def.travel_image && !def.hit_image) || !first) {
    playSounds(def?.sound);
    await animateCaster(casterId, first, targetType, motion); // resolves at the lunge peak
    onCast?.();                                        // melee: flash at the peak
    playSounds(def?.hit_sound);
    noteImpact(first, def, null, vfxSize(def?.hit_size, getConfig().projectile_hit_size || DEFAULT_HIT_SIZE));
    return null;
  }

  if (motion === 'melee' && !def.travel_image) {
    playSounds(def.sound);                             // the swing, as the lunge starts
    await animateCaster(casterId, first, targetType, motion); // the lunge resolves at the contact peak
    onCast?.();
    each(t => playHitVfx(def, t));                     // fire-and-forget, like a travel sprite's impact
    return null;
  }

  // A melee motion lunges and launches at the peak; the lunge puts the caster back to idle itself.
  if (casterPose) {
    if (motion === 'melee') await animateAttack(casterId, first);
    else setBattleState(casterId, 'cast');
  }
  let landPos = null;
  onCast?.();                                          // ranged: flash at launch; hit-only: at manifest
  if (def.travel_image) {
    const lands = await each(t => animateProjectile(originId, t, def, originPos));
    landPos = lands[0] || null;
  } else {
    playSounds(def.sound);                             // once per cast; hit_sound plays per target
    await each(t => playHitVfx(def, t));               // on the last target's landing frame
    const el = getCharEl(first);
    landPos = el ? getCenter(el) : null;
  }
  if (casterPose && motion !== 'melee') setBattleState(casterId, getIdleState(casterId));
  return landPos;
}

/**
 * Process effect results and play target animations.
 * @param {RpgEffectResult[]} results
 * @returns {Promise<void>}
 */
export async function animateEffects(results) {
  const deathQueue = [];
  const struck = new Set();   // one hit reaction per target, however many damage lines hit it

  for (const r of results) {
    if (!r.targetId) continue;
    if (r.amount > 0 && r.damageType && r.type !== 'status_dot_heal') {
      if (r.type === 'status_dot') animateFlicker(r.targetId);
      else struck.add(r.targetId);
    }
    else if (r.type === 'heal' || r.type === 'steal' || r.type === 'status_hot' || r.type === 'status_dot_heal') animateHeal(r.targetId);
    if (r.defeated) deathQueue.push(r.targetId);
  }
  let stop = 0;
  for (const id of struck) {
    const juice = takeJuice(id, deathQueue.includes(id));
    stop = Math.max(stop, juice?.stopMs || 0);
    animateHit(id, juice);
  }

  // Wait for hit/heal animations (DoT ticks use the longer flicker, shown fully before the next
  // step); a hit-stop pushes the recoil back by its length.
  if (results.length > 0) {
    const hasTick = results.some(r => r.type === 'status_dot');
    await new Promise(resolve => setTimeout(resolve, Math.max(hasTick ? TICK_FLICKER_MS : 0, 300 + stop) * getSpeedMult()));
  }

  // Play death animations sequentially. `r.defeated` was stamped when the damage landed, but a
  // later result in the same batch can heal the target back above 0 (lifesteal lands after the
  // thorns/reflect it triggered). processDeaths() re-checks liveness the same way, so trusting the
  // stale flag here let the two disagree: the body faded to opacity 0 and nothing ever resets it,
  // leaving a live combatant permanently invisible. The Set also dedupes a target flagged twice.
  for (const charId of new Set(deathQueue)) {
    if ((game.getCharacter(charId)?.getResource('health') ?? 0) > 0) continue;
    await animateDeath(charId);
  }
}
