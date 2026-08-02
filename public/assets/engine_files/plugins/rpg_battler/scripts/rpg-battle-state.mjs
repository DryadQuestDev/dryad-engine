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

// ── require_status_self ──

/**
 * Normalize a `meta.require_status_self` value to a status-id list. The field is a
 * chooseMany with OR semantics — holding ANY listed status satisfies the gate. Plain
 * strings (modifier-injected metas, older data) are accepted too.
 * @param {string | string[] | undefined} value
 * @returns {string[]}
 */
export function requiredSelfStatuses(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// ── Display name ──

/**
 * Get a character's battle display name with index for duplicates (e.g. "Bat#2").
 * @param {string} characterId
 * @returns {string}
 */
export function getBattleDisplayName(characterId) {
  const char = game.getCharacter(characterId);
  const name = char?.getTrait('name') || characterId;
  const battle = currentRpgBattle.value;
  const idx = battle?.charState?.[characterId]?.battleIndex;
  return idx > 0 ? `${name}#${idx}` : name;
}

// ── Battle log ──

/**
 * Push a text entry to the battle log. Auto-fills turn from current battle.
 * @param {string} actorId
 * @param {string} text
 * @param {string} [targetId] - Optional target character ID to show their face icon
 */
export function pushLog(actorId, text, targetId) {
  const battle = currentRpgBattle.value;
  if (!battle) return;
  const entry = { turn: battle.turn, actorId, text };
  if (targetId) entry.targetId = targetId;
  battle.log.push(entry);
}

// ── Floating combat text ──

/** @type {import('vue').Ref<RpgFloatingText[]>} */
export const floatingTexts = ref([]);

let _floatId = 0;

/** @param {RpgFloatingTextOpts} opts */
export function addFloatingText(opts) {
  floatingTexts.value.push({ id: _floatId++, ...opts });
}

/**
 * @param {number} id
 */
export function removeFloatingText(id) {
  const idx = floatingTexts.value.findIndex(f => f.id === id);
  if (idx !== -1) floatingTexts.value.splice(idx, 1);
}

// ── Floating text from effect results ──

const NEGATIVE_TYPES = new Set(['damage', 'status_dot', 'thorns']);

/**
 * Convert a single effect result to a floating text entry.
 * @param {RpgEffectResult} effect
 */
export function parseFloatingText(effect) {
  if (!effect.targetId) return;

  const e = effect;

  // Shield absorb: show separately
  if (e.type === 'damage' && e.shieldAbsorbed > 0) {
    addFloatingText({ characterId: e.targetId, text: game.getLine('float_shield', { amount: e.shieldAbsorbed }), cssClass: 'shield-absorb' });
  }

  const statusDefs = game.getData('character_statuses', true);

  // Status apply uses status def for icon/color. Non-stackable (max 1) statuses flash their
  // duration instead of "+stacks" — mirrors the persistent token badge (RpgCharOverlay).
  if (e.type === 'status_apply') {
    const def = statusDefs?.get(e.statusId);
    const live = game.getCharacter(e.targetId)?.getStatus(e.statusId);
    const singleStack = live ? live.maxStacks === 1 : (def?.max_stacks ?? 1) === 1;
    // Show the duration applied THIS time (not the accumulated total — that's the token badge's job).
    const duration = e.duration ?? 0;
    const text = (singleStack && duration > 0) ? `${duration}` : `+${e.stacks}`;
    addFloatingText({ characterId: e.targetId, text, cssClass: 'status-apply', icon: def?.image || null, color: def?.color });
    return;
  }

  // Status remove uses status def for icon/color (mirror of status_apply)
  if (e.type === 'status_remove') {
    const def = statusDefs?.get(e.statusId);
    addFloatingText({ characterId: e.targetId, text: `−${e.stacks}`, cssClass: 'status-remove', icon: def?.image || null, color: def?.color });
    return;
  }

  const sign = (e.amount != null && e.amount > 0) ? (NEGATIVE_TYPES.has(e.type) ? '-' : '+') : '';
  const text = e.amount != null ? `${sign}${e.amount}`
    : e.statusName || e.statusId || game.getLine(`float_${e.type}`);

  const css = {
    damage: e.isCrit ? `${e.damageType || 'physical'} crit` : (e.damageType || 'physical'),
    status_dot: e.damageType || 'physical', thorns: 'physical',
    heal: 'heal', steal: 'heal', status_hot: 'heal', status_dot_heal: 'heal',
    dodge: 'dodge', cleanse: 'cleanse', death_defiance: 'death-defiance',
  }[e.type] || e.type;

  addFloatingText({ characterId: e.targetId, text, cssClass: css });
}
