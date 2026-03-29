/// <reference path="./dtypes.d.ts" />

const { game, vue } = window.engine;
const { ref } = vue;

// ── Speed multiplier ──

const SPEED_MULT = { slow: 1.8, medium: 1.0, fast: 0.5 };

/** Get the global speed multiplier for animations, delays, floating text. */
export function getSpeedMult() {
  const speed = game.getGameSetting('rpg_battle_speed') || 'medium';
  return SPEED_MULT[speed] || 1.0;
}

/** @type {import('vue').Ref<RpgBattle | null>} */
export const currentRpgBattle = ref(null);

// ── Floating combat text ──

/** @type {import('vue').Ref<RpgFloatingText[]>} */
export const floatingTexts = ref([]);

let _floatId = 0;

/**
 * @param {string} characterId
 * @param {string} text
 * @param {string} cssClass
 * @param {string | null} icon
 * @param {string} [color]
 */
export function addFloatingText(characterId, text, cssClass, icon, color) {
  floatingTexts.value.push({ id: _floatId++, characterId, text, cssClass, icon, color });
}

/**
 * @param {number} id
 */
export function removeFloatingText(id) {
  const idx = floatingTexts.value.findIndex(f => f.id === id);
  if (idx !== -1) floatingTexts.value.splice(idx, 1);
}
