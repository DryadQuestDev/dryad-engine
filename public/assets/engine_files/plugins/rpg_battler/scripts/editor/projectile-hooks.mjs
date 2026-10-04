// Save hook of the Projectiles tab (plugin.json `editor_hooks`): reads an effect's sprite sheet once,
// in the editor, and stores what the battler needs from it — the frame its impact lands on and its
// colour — so a battle reads two fields instead of decoding every sheet. The editor runs it on each
// entry the tab form or a popup saves. Blob-imported, so the shared modules come in through
// importPluginModule rather than relative imports.

// The fields a detected value depends on: a mod's entry that sets none of them merges over its core
// entry's art, so the core entry's detected values are the ones that apply.
const ART = ['hit_image', 'hit_type', 'hit_frames', 'hit_cols', 'travel_image', 'travel_type', 'travel_frames', 'travel_cols', 'filter'];

/**
 * `hit_frame_auto`: the impact sheet's fullest frame, 1-based like `hit_frame`, where an impact-only
 * effect deals its damage unless `hit_frame` says otherwise. `impact_color_auto`: the colour of the
 * hit juice, read off the hit sprite (the travel sprite without one) after the def's `filter`, unless
 * `impact_color` is set. A value that cannot be read is removed, and the battler falls back.
 * @param {any} entry @param {{ pluginId: string, coreEntry: any|null }} ctx
 */
export async function beforeSave(entry, ctx) {
  if (ctx.coreEntry && !ART.some((k) => k in entry)) {
    delete entry.hit_frame_auto;
    delete entry.impact_color_auto;
    return;
  }
  // @ts-ignore — editor globals are not typed
  const { importPluginModule } = window.__editorUtils;
  const [J, G] = await Promise.all([
    importPluginModule(ctx.pluginId, 'scripts/rpg-vfx-juice.mjs'),
    importPluginModule(ctx.pluginId, 'scripts/rpg-vfx-geometry.mjs'),
  ]);
  const def = { ...(ctx.coreEntry || {}), ...entry };
  const hit = def.hit_image ? await J.readSheet(def.hit_image, G.sheetOf(def, 'hit')) : null;
  const look = hit || (def.travel_image ? await J.readSheet(def.travel_image, G.sheetOf(def, 'travel')) : null);
  if (hit && hit.peak != null && G.sheetOf(def, 'hit').frames > 1) entry.hit_frame_auto = hit.peak + 1;
  else delete entry.hit_frame_auto;
  if (look && look.peak != null) entry.impact_color_auto = look.color;
  else delete entry.impact_color_auto;
}
