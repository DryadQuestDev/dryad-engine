/**
 * Spine playback helpers for editor previews.
 *
 * Runtime playback lives in Character.buildSpineTrackMapForView; this file
 * mirrors it for editor-side preview popups (where we have raw template data
 * + skin layers JSON instead of a full Character instance).
 */

/**
 * Editor-side mirror of Character.buildSpineTrackMapForView — builds the
 * {track → animation name} map by walking the character template's skin
 * layers (filtered to `type === 'spine'` AND matching view), sorted by
 * z_index ascending. Track index = sort position (NOT z_index value), so
 * two layers with z_index = 0 land on tracks 0 and 1 distinctly.
 */
export function buildEditorSpineTrackMapFromLayers(
  characterSkinLayerIds: string[] | undefined | null,
  skinLayersData: any[],
  attributes: Record<string, any>,
  view?: string | null,
): Map<number, string> {
  const norm = (v: any) => (!v || v === '_default') ? '_default' : v;
  const target = norm(view);
  const ids = new Set(characterSkinLayerIds || []);

  const layers = skinLayersData
    .filter((layer) => layer && ids.has(layer.id) && layer.type === 'spine' && norm(layer.view) === target)
    .slice()
    .sort((a, b) => (a.z_index || 0) - (b.z_index || 0));

  const map = new Map<number, string>();
  layers.forEach((layer, trackIndex) => {
    let key = layer.id;
    if (Array.isArray(layer.attributes)) {
      for (const attr of layer.attributes) {
        key += '_' + (attributes?.[attr] ?? '');
      }
    }
    const animName = layer.spine_animations?.[key];
    if (animName) map.set(trackIndex, animName);
  });
  return map;
}

/**
 * Editor-side mirror of Character.getSpineSkinsForView — collects spine skin
 * names from `type: 'spine'` skin layers matching the view. Each layer
 * contributes one name (from `spine_skins[key]`) to the result list. The
 * runtime combines them via `Skin.addSkin()` so they all apply at once.
 */
export function buildEditorSpineSkinsFromLayers(
  characterSkinLayerIds: string[] | undefined | null,
  skinLayersData: any[],
  attributes: Record<string, any>,
  view?: string | null,
): string[] {
  const norm = (v: any) => (!v || v === '_default') ? '_default' : v;
  const target = norm(view);
  const ids = new Set(characterSkinLayerIds || []);
  const skins: string[] = [];

  for (const layer of skinLayersData) {
    if (!layer || !ids.has(layer.id)) continue;
    if (layer.type !== 'spine') continue;
    if (norm(layer.view) !== target) continue;

    let key = layer.id;
    if (Array.isArray(layer.attributes)) {
      for (const attr of layer.attributes) {
        key += '_' + (attributes?.[attr] ?? '');
      }
    }
    const skinName = layer.spine_skins?.[key];
    if (skinName) skins.push(skinName);
  }
  return skins;
}

/**
 * Plays each [track, name] entry, skipping animations the skeleton lacks.
 * Tracks currently playing on the spine that aren't in the new map are
 * faded out via `setEmptyAnimation` so attribute changes that drop a track
 * actually stop the previous animation.
 */
export function applyTrackMap(
  spine: { skeleton: any; state: any },
  trackMap: Map<number, string>,
  loop: boolean = true,
): void {
  const tracks = spine.state.tracks ?? [];
  for (let i = 0; i < tracks.length; i++) {
    if (tracks[i] && !trackMap.has(i)) {
      spine.state.setEmptyAnimation(i, 0.3);
    }
  }
  for (const [track, animName] of trackMap) {
    if (spine.skeleton.data.findAnimation(animName)) {
      spine.state.setAnimation(track, animName, loop);
    }
  }
}
