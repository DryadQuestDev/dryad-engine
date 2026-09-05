/// <reference path="./dtypes.d.ts" />
// Ability-aspect renderers for AbilityCard tooltips — how numeric aspects print
// ("150% of power", colored damage types, signed bonuses).
//
// SELF-CONTAINED ON PURPOSE: the editor's preview hook (plugin.json `editor_preview`)
// imports this file via a blob URL, where relative imports do not resolve. Keep it
// import-free; runtime-only dependencies (getEffectivePower) are injected by main.mjs
// and simply absent in the editor — the character-bound paths never fire there.

function colorize(text, cls) {
  return `<span class="${cls}">${text}</span>`;
}

// Status ids that have a dedicated color class; everything else falls back to .value.
const STATUS_COLOR_CLASSES = new Set(['burn', 'poison', 'bleeding']);
function statusClassFor(statusIds) {
  if (Array.isArray(statusIds)) {
    for (const id of statusIds) if (STATUS_COLOR_CLASSES.has(id)) return id;
  }
  return 'value';
}

export function registerAspectRenderers(game, { getEffectivePower } = {}) {
  const getStatusDefinitions = () => game.getData('character_statuses', true);

  function powerScaledRenderer({ value, character, ability }, colorClass = 'value') {
    // Delta-overlaid values arrive as { _base, _merged } objects; unwrap them for scaling.
    const isDelta = value && typeof value === 'object' && '_base' in value && '_merged' in value;
    const num = isDelta ? value._merged : value;
    const display = isDelta
      ? `${value._base}➜<span class="delta-value">${num}</span>`
      : num;
    if (ability?.meta?.flat) return `<b>${colorize(display, colorClass)}</b>`;
    let txt = `<b>${display}% of power</b>`;
    if (character && getEffectivePower && typeof num === 'number' && isFinite(num)) {
      const effective = getEffectivePower(character, ability);
      txt += ` <b>(${colorize(Math.round(effective * num / 100), colorClass)})</b>`;
    }
    return txt;
  }

  game.registerAspectRenderer('damage', (ctx) => powerScaledRenderer(ctx, ctx.aspects?.damage_type || 'value'));
  game.registerAspectRenderer('healing', (ctx) => powerScaledRenderer(ctx, 'heal'));
  game.registerAspectRenderer('healing_self', (ctx) => powerScaledRenderer(ctx, 'heal'));

  function statusStacksRenderer(applyAspectId) {
    return ({ value, aspects, character, ability }) => {
      const statusIds = aspects[applyAspectId];
      const cls = statusClassFor(statusIds);
      const isDelta = value && typeof value === 'object' && '_base' in value && '_merged' in value;
      const plainDisplay = isDelta
        ? `${value._base}➜<span class="delta-value">${value._merged}</span>`
        : value;
      if (ability?.meta?.flat || !Array.isArray(statusIds) || statusIds.length === 0) {
        return `<b>${colorize(plainDisplay, cls)}</b>`;
      }
      const defs = getStatusDefinitions();
      const anyScaled = statusIds.some(id => defs?.get(id)?.meta?.power_scaling);
      if (!anyScaled) return `<b>${colorize(plainDisplay, cls)}</b>`;
      return powerScaledRenderer({ value, character, ability }, cls);
    };
  }
  game.registerAspectRenderer('status_stacks_target', statusStacksRenderer('status_apply_target'));
  game.registerAspectRenderer('status_stacks_self', statusStacksRenderer('status_apply_self'));
  game.registerAspectRenderer('status_stacks_allies', statusStacksRenderer('status_apply_allies'));
  game.registerAspectRenderer('status_stacks_enemies', statusStacksRenderer('status_apply_enemies'));

  // Generic yellow highlight for any other numeric ability-effect aspect that hits the
  // default <b>${value}</b> fallback (durations, cooldowns, charges, splash, conditions, etc.).
  function valueRenderer({ value }) {
    const isDelta = value && typeof value === 'object' && '_base' in value && '_merged' in value;
    const display = isDelta
      ? `${value._base}➜<span class="delta-value">${value._merged}</span>`
      : value;
    return `<b>${colorize(display, 'value')}</b>`;
  }
  for (const id of [
    'status_duration_target', 'status_duration_self', 'status_duration_allies', 'status_duration_enemies',
    'status_remove_stacks_target', 'status_remove_stacks_self', 'status_remove_stacks_allies', 'status_remove_stacks_enemies',
    'splash_count', 'splash_damage', 'splash_statuses', 'bounce', 'flurry', 'chance',
    'caster_min_health', 'caster_max_health', 'target_min_health', 'target_max_health',
    'charges',
  ]) {
    game.registerAspectRenderer(id, valueRenderer);
  }

  // Signed aspects, for two reasons. Bidirectional slots (cooldown_change, and the crit/accuracy cast
  // bonuses) take a buff or a penalty in the same field, so a bare "20" and "-20" would read as two
  // different sentences. Cast bonuses that ADD to a caster stat (lifesteal) want the sign for a second
  // reason: "+50%" says "on top of what you already have" where a bare "50%" reads as the total.
  function signedRenderer({ value }) {
    const sign = (n) => (typeof n === 'number' && n > 0 ? `+${n}` : `${n}`);
    const isDelta = value && typeof value === 'object' && '_base' in value && '_merged' in value;
    const display = isDelta
      ? `${sign(value._base)}➜<span class="delta-value">${sign(value._merged)}</span>`
      : sign(value);
    return `<b>${colorize(display, 'value')}</b>`;
  }
  for (const id of ['crit_chance', 'crit_multi', 'accuracy', 'lifesteal', 'cooldown_change', 'charges_change']) {
    game.registerAspectRenderer(id, signedRenderer);
  }
}

// Editor preview hook entry point (pluginManager.initEditorPreview invokes the default
// export with the hydrated editor-side game singleton — no getEffectivePower there).
export default registerAspectRenderers;
