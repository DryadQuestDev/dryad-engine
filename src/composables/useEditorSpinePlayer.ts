import { ref, watch, onBeforeUnmount, type Ref } from 'vue';
import type { Spine } from '@esotericsoftware/spine-pixi-v8';
import { spineRenderer, type SpineStats } from '../game/utils/spineRenderer';
import { applyTrackMap } from '../game/utils/spineAnimationGroups';

interface Options {
  containerRef: Ref<HTMLElement | null>;
  atlasUrl: Ref<string | null | undefined>;
  skeletonUrl: Ref<string | null | undefined>;
  /** Resolved {track → animation name} map. Caller computes this from the
   *  character's spine-type skin layers (see buildEditorSpineTrackMapFromLayers). */
  trackMap: Ref<Map<number, string>>;
  /** Resolved spine skin name list. Caller computes from spine-type skin
   *  layers via buildEditorSpineSkinsFromLayers. Combined via Skin.addSkin
   *  at runtime by spineRenderer.applySkins. */
  skins: Ref<string[]>;
  /** Optional art_scale ref. Multiplies into spine baseScale so oversized skeletons can be shrunk. */
  artScale?: Ref<number | null | undefined>;
  /** Optional art_dx ref (% of slot height). */
  artDx?: Ref<number | null | undefined>;
  /** Optional art_dy ref (% of slot height). */
  artDy?: Ref<number | null | undefined>;
  /** Optional per-game spine_character_scale ref. Defaults to 1 when not passed. */
  gameScale?: Ref<number | null | undefined>;
  /** Optional per-slot scale ref. Routed through baseScale so spine pixels stay sharp at scale > 1. */
  slotScale?: Ref<number | null | undefined>;
  slotIdPrefix: string;
}

/**
 * Shared Spine setup for editor previews. Registers the skeleton, applies
 * skins picked from the character's attributes (skin layers come from
 * attribute values that match a skin name), and applies the multi-track
 * animation map so the preview matches runtime playback. Also re-applies
 * the track map when attributes change without a full re-init.
 */
export function useEditorSpinePlayer(opts: Options) {
  const stats = ref<SpineStats | null>(null);
  let spineInstance: Spine | null = null;
  let slotId = '';

  async function init(): Promise<void> {
    if (!opts.containerRef.value || !opts.atlasUrl.value || !opts.skeletonUrl.value) return;
    dispose();

    try {
      slotId = `${opts.slotIdPrefix}_${Date.now()}`;
      const spine = await spineRenderer.register(slotId, opts.containerRef.value, {
        atlasUrl: opts.atlasUrl.value,
        skeletonUrl: opts.skeletonUrl.value,
        artScale: opts.artScale?.value ?? 1,
        artDx: opts.artDx?.value ?? 0,
        artDy: opts.artDy?.value ?? 0,
        gameScale: opts.gameScale?.value ?? 1,
        slotScale: opts.slotScale?.value ?? 1,
      });
      if (!spine) return;

      spineInstance = spine;
      stats.value = spineRenderer.getStats(spine);

      const skins = opts.skins.value;
      if (skins && skins.length > 0) spineRenderer.applySkins(spine, skins);

      applyTrackMap(spine, opts.trackMap.value);
    } catch (err) {
      console.error(`[${opts.slotIdPrefix}] Failed to initialize Spine:`, err);
    }
  }

  function dispose(): void {
    if (slotId) {
      spineRenderer.unregister(slotId);
      slotId = '';
    }
    spineInstance = null;
    stats.value = null;
  }

  // Re-apply skins whenever the resolved list changes (caller's computed
  // recomputes on attribute / layer changes).
  watch(
    () => opts.skins.value,
    (skins) => {
      if (!spineInstance || !skins) return;
      if (skins.length > 0) spineRenderer.applySkins(spineInstance, skins);
    },
    { deep: true },
  );

  // Re-apply track map whenever it changes (caller updates it from layers + attributes).
  watch(
    () => opts.trackMap.value,
    (map) => {
      if (spineInstance && map) applyTrackMap(spineInstance, map);
    },
    { deep: true },
  );

  if (opts.artScale) {
    watch(
      () => opts.artScale!.value,
      (value) => {
        if (slotId) spineRenderer.updateArtScale(slotId, value ?? 1);
      },
    );
  }

  if (opts.artDx || opts.artDy) {
    watch(
      () => [opts.artDx?.value ?? 0, opts.artDy?.value ?? 0] as const,
      ([dx, dy]) => {
        if (slotId) spineRenderer.updateArtOffset(slotId, dx, dy);
      },
    );
  }

  if (opts.gameScale) {
    watch(
      () => opts.gameScale!.value,
      (value) => {
        if (slotId) spineRenderer.updateGameScale(slotId, value ?? 1);
      },
    );
  }

  if (opts.slotScale) {
    watch(
      () => opts.slotScale!.value,
      (value) => {
        if (slotId) spineRenderer.updateSlotScale(slotId, value ?? 1);
      },
    );
  }

  onBeforeUnmount(dispose);

  return {
    stats,
    init,
    dispose,
    getSpine: () => spineInstance,
  };
}
