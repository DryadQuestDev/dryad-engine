import type { ManifestObject } from '../../schemas/manifestSchema';

/**
 * Engine-wide reference height (CSS px) the spine renderer uses to compute
 * the natural scale for skeletons. Authors size skeletons against this so
 * 1 skeleton unit ≈ 1 CSS pixel in a slot rendered at this height. Per-game
 * `manifest.spine_character_scale` and per-character `art_scale` multiply
 * on top of the resulting baseScale.
 */
export const SPINE_REFERENCE_HEIGHT = 700;

/**
 * CSS `aspect-ratio` value for the character wrapper. Both spine and static
 * characters render into this shape so slot anchors line up regardless of art
 * source. Wider than the body's natural 5/7 frame so wide accessories (axes,
 * hair, claws, etc.) have horizontal canvas room. Used as `v-bind()` in scoped
 * CSS across CharacterDollSpine, CharacterDollStatic, and editor preview popups.
 */
export const CHARACTER_VIEWPORT_ASPECT_RATIO = '1 / 1';

/** Parses a `'W / H'` aspect-ratio string to a numeric W/H ratio. */
export function parseAspectRatio(aspect: string): number {
  const [w, h] = aspect.split('/').map(s => parseFloat(s.trim()));
  return h > 0 ? w / h : 1;
}

/** Reference width derived from `SPINE_REFERENCE_HEIGHT × CHARACTER_VIEWPORT_ASPECT_RATIO`. */
export const SPINE_REFERENCE_WIDTH = SPINE_REFERENCE_HEIGHT * parseAspectRatio(CHARACTER_VIEWPORT_ASPECT_RATIO);

/**
 * On-screen scale of the character overlay (name/HP/status bricks). A single fixed
 * base so every character's overlay is the same size regardless of slot.scale — the
 * overlay wrapper is a sibling of the body (cqh = slot-relative), so slot.scale never
 * scales it. Shared by the in-game `CharacterSlot` and the editor preview/slot.
 */
export const OVERLAY_BASE_SCALE = 1;

/**
 * Resolves the per-view spine size multiplier from the active manifest.
 * `viewId` of '', undefined, or '_default' all read the `_default` entry.
 * Returns 1 when unset.
 */
export function getSpineCharacterScale(
  viewId: string | undefined | null,
  manifest: Partial<ManifestObject> | null | undefined,
): number {
  const key = (!viewId || viewId === '_default') ? '_default' : viewId;
  const map = manifest?.spine_character_scale as Record<string, number> | undefined;
  const value = map?.[key];
  return typeof value === 'number' ? value : 1;
}
