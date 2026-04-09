/// <reference path="./dtypes.d.ts" />

const { game, gsap } = window.engine;

import { getSpeedMult } from './rpg-battle-state.mjs';

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
      x: (t.x - c.x) * 0.10, // 0.3
      y: (t.y - c.y) * 0.10, // 0.3
      duration: 0.25 * m,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(casterEl, {
          x: 0, y: 0,
          duration: 0.2 * m,
          ease: 'power2.out',
          onComplete: () => {
            setBattleState(casterId, getIdleState(casterId));
            resolve();
          },
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

/**
 * Process effect results and play target animations.
 * @param {RpgEffectResult[]} results
 * @returns {Promise<void>}
 */
export async function animateEffects(results) {
  const deathQueue = [];

  for (const r of results) {
    if (!r.targetId) continue;
    if (r.amount > 0 && r.damageType) animateHit(r.targetId);
    else if (r.type === 'heal' || r.type === 'steal' || r.type === 'token_hot') animateHeal(r.targetId);
    if (r.defeated) deathQueue.push(r.targetId);
  }

  // Wait for hit/heal animations
  if (results.length > 0) {
    await new Promise(resolve => setTimeout(resolve, 300 * getSpeedMult()));
  }

  // Play death animations sequentially
  for (const charId of deathQueue) {
    await animateDeath(charId);
  }
}
