/// <reference path="./dtypes.d.ts" />

const { game, gsap } = window.engine;

import { getSpeedMult } from './rpg-battle-state.mjs';

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
 * @param {string} [view] - spine view to check/trigger (default: 'back' for battle)
 * @param {number} [times] - spine animation play count (1 = one-shot)
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
    if (!casterEl || !targetEl) { resolve(); return; }

    const c = getCenter(casterEl);
    const t = getCenter(targetEl);

    gsap.to(casterEl, {
      x: (t.x - c.x) * 0.15,
      y: (t.y - c.y) * 0.15,
      duration: 0.2 * m,
      ease: 'power2.out',
      onComplete: () => {
        resolve();
        gsap.to(casterEl, {
          x: 0, y: 0,
          duration: 0.2 * m,
          delay: 0.5 * m,
          ease: 'power2.inOut',
          onComplete: () => setBattleState(casterId, getIdleState(casterId)),
        });
      },
    });
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
    tl.to(el, { rotation: 3, duration: d, ease: 'power1.inOut' })
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
 * Animate hit: shake + red flash.
 * @param {string} targetId
 * @returns {Promise<void>}
 */
export function animateHit(targetId) {
  const m = getSpeedMult();

  setBattleState(targetId, 'hit');

  return new Promise(resolve => {
    const el = getCharEl(targetId);
    if (!el) { resolve(); return; }

    const wrapper = el.closest('[data-rpg-char-id]');
    if (wrapper) wrapper.classList.add('rpg-hit-flash');

    gsap.to(el, {
      x: -4, duration: 0.05 * m, ease: 'power1.inOut',
      yoyo: true, repeat: 5,
      onComplete: () => { gsap.set(el, { x: 0 }); },
    });

    setTimeout(() => {
      if (wrapper) wrapper.classList.remove('rpg-hit-flash');
      setBattleState(targetId, getIdleState(targetId));
      resolve();
    }, 400 * m);
  });
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
 * Determine the appropriate caster animation based on ability target type.
 * @param {string} casterId
 * @param {string} targetId
 * @param {string} targetType - ability's target type
 * @returns {Promise<void>}
 */
export function animateCaster(casterId, targetId, targetType) {
  if (targetType === 'self' || targetType === 'all_allies') {
    return animateSelfCast(casterId);
  }
  if (targetType === 'ally' || targetType === 'self_and_ally') {
    return casterId === targetId ? animateSelfCast(casterId) : animateBump(casterId, targetId);
  }
  // enemy, all_enemies, any
  return animateAttack(casterId, targetId);
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

/** Frame-stepper interval ids, keyed by sprite element (cleared in killSprite). */
const spriteTimers = new WeakMap();

/**
 * Build a `position:fixed` VFX sprite at viewport `pos`, sized to `size` px. `single` → an `<img>`;
 * `sheet` → a `<div>` whose background-image is a strip/grid, frame-stepped in JS (exact per-cell
 * background-position). `cols` = frames per row (defaults to `frames` = single row); rows derive
 * from the count, and a partial last row is trimmed (stepper never indexes past frames-1).
 * @param {string} image @param {string} type @param {number} frames @param {number} fps
 * @param {number} cols @param {string} cssClass @param {{x:number,y:number}} pos
 * @param {number} size @param {boolean} loop
 * @returns {HTMLElement}
 */
function spawnSprite(image, type, frames, fps, cols, cssClass, pos, size, loop) {
  const sheet = type === 'sheet' && frames > 1;
  const el = document.createElement(sheet ? 'div' : 'img');
  el.className = 'rpg-projectile' + (sheet ? ' rpg-projectile-sheet' : '') + (cssClass ? ' ' + cssClass : '');
  el.style.width = size + 'px';
  el.style.height = size + 'px';
  if (sheet) {
    const c = cols || frames;
    const r = Math.ceil(frames / c);
    el.style.backgroundImage = `url('${image}')`;
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
        if (loop) i = 0;
        else { clearInterval(id); spriteTimers.delete(el); return; }
      }
      setFrame();
    }, 1000 / (fps || 12));
    spriteTimers.set(el, id);
  } else {
    /** @type {HTMLImageElement} */ (el).src = image;
  }
  el.style.left = pos.x + 'px';
  el.style.top = pos.y + 'px';
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
 * Play the hit/impact VFX at `pos` (single image or one spritesheet cycle) and its hit sound.
 * Resolves when the VFX is done; a no-image def just plays the sound and resolves.
 * @param {any} def @param {{x:number,y:number}} pos
 * @returns {Promise<void>}
 */
function playHitVfx(def, pos) {
  return new Promise(resolve => {
    playSounds(def.hit_sound);
    if (!def.hit_image) { resolve(); return; }
    const m = getSpeedMult();
    const sheet = def.hit_type === 'sheet' && def.hit_frames > 1;
    const size = getConfig().projectile_hit_size || 48;
    const el = spawnSprite(def.hit_image, def.hit_type, def.hit_frames, def.hit_fps, def.hit_cols, def.css_class, pos, size, false);
    const dur = sheet ? (def.hit_frames / (def.hit_fps || 12)) * 1000 : 400 * m;
    setTimeout(() => { killSprite(el); resolve(); }, dur);
  });
}

/**
 * Travel projectile: a sprite flies from origin to target, then plays the hit VFX. `fromPos` overrides the launch
 * point (the previous hop's landing) so a chain keeps flying even after the prior target dies and
 * its element is gone. Resolves with the landing position so the next hop can launch from it.
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
    const size = getConfig().projectile_travel_size || 48;
    const el = spawnSprite(def.travel_image, def.travel_type, def.travel_frames, def.travel_fps, def.travel_cols, def.css_class, from, size, true);

    // On land: drop the travel sprite, play the impact VFX (fire-and-forget so damage isn't blocked).
    const land = () => { killSprite(el); playHitVfx(def, to); resolve(to); };

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

    const rad = (def.starting_rotation || 0) * Math.PI / 180 + Math.atan2(dx, -dy);
    el.style.transform = `translate(-50%, -50%) rotate(${rad}rad)`;

    const dur = Math.max(0.1, dist / (def.speed || 1200)) * m;
    gsap.to(el, {
      left: to.x, top: to.y, duration: dur, ease: 'none',
      onComplete: land,
    });
  });
}

/**
 * Ability-aware cast animation. Behaviour derives from the referenced projectile def (no
 * cast_type): no def (or an empty def) → melee lunge; a `travel_image` → a sprite flies
 * origin→target then plays the hit VFX; only a `hit_image` → the VFX manifests at the target
 * (no travel). Melee always lunges (ignores casterPose); non-melee respects `opts.casterPose`
 * (suppressed on bounces). `opts.originId`/`opts.originPos` override the launch point so a bounce
 * chain survives the prior target's death. Returns the landing position (null for melee) so the
 * caller can thread it into the next bounce.
 * `opts.onCast` fires at the cast's commit moment — the lunge peak (melee), the projectile launch
 * (ranged), or the VFX manifest (hit-only) — so callers can time the ability-name flash to it.
 * @param {string} casterId @param {string} targetId @param {string} targetType @param {any} ability
 * @param {{ originId?: string, originPos?: {x:number,y:number}|null, casterPose?: boolean, onCast?: () => void }} [opts]
 * @returns {Promise<{x:number,y:number}|null>}
 */
export async function animateCast(casterId, targetId, targetType, ability, opts = {}) {
  const { originId = casterId, originPos = null, casterPose = true, onCast } = opts;
  const meta = ability?.meta || {};
  const def = getProjectileDef(meta.projectile);

  if (!def || (!def.travel_image && !def.hit_image) || !targetId) {
    await animateCaster(casterId, targetId, targetType); // resolves at the lunge peak
    onCast?.();                                          // melee: flash at the peak
    return null;
  }

  if (casterPose) setBattleState(casterId, 'attack');
  let landPos = null;
  if (def.travel_image) {
    onCast?.();                                          // ranged: flash at launch (before travel)
    landPos = await animateProjectile(originId, targetId, def, originPos);
  } else {
    onCast?.();                                          // hit-only VFX: flash at manifest
    const tEl = getCharEl(targetId);
    const pos = tEl ? getCenter(tEl) : null;
    if (pos) { await playHitVfx(def, pos); landPos = pos; }
  }
  if (casterPose) setBattleState(casterId, getIdleState(casterId));
  return landPos;
}

/**
 * Process effect results and play target animations.
 * @param {RpgEffectResult[]} results
 * @returns {Promise<void>}
 */
export async function animateEffects(results) {
  const deathQueue = [];

  for (const r of results) {
    if (!r.targetId) continue;
    if (r.amount > 0 && r.damageType && r.type !== 'status_dot_heal') {
      if (r.type === 'status_dot') animateFlicker(r.targetId);
      else animateHit(r.targetId);
    }
    else if (r.type === 'heal' || r.type === 'steal' || r.type === 'status_hot' || r.type === 'status_dot_heal') animateHeal(r.targetId);
    if (r.defeated) deathQueue.push(r.targetId);
  }

  // Wait for hit/heal animations (DoT ticks use the longer flicker, shown fully before the next step)
  if (results.length > 0) {
    const hasTick = results.some(r => r.type === 'status_dot');
    await new Promise(resolve => setTimeout(resolve, (hasTick ? TICK_FLICKER_MS : 300) * getSpeedMult()));
  }

  // Play death animations sequentially
  for (const charId of deathQueue) {
    await animateDeath(charId);
  }
}
