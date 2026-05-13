<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import CharacterDollStatic from './CharacterDollStatic.vue';
import CharacterDollSpine from './CharacterDollSpine.vue';

const props = defineProps<{
  character: Character;
  naturalSize?: boolean;
  mirror?: boolean;
  directRender?: boolean;
  enableAppear?: boolean;
  view?: string;
  instantLayers?: boolean;
  /** Per-slot scale; for spine it's routed into the renderer (sharp), CSS-skipped at the slot wrapper. */
  slotScale?: number;
}>();

const hasSpineForView = computed(() => {
  if (props.view) return props.character.isSpineForView(props.view);
  return props.character.isSpineCharacter();
});

// Static layers are filtered by attribute keys, so this is true only when the
// current battle_state (etc.) actually maps to an image. When the spine is also
// present, an active static layer hides the spine — covering action frames.
const hasActiveStaticLayer = computed(() => {
  if (props.directRender) {
    return props.character.buildImageLayersFromSkinLayers().length > 0;
  }
  if (props.view) {
    return props.character.getImageLayersForView(props.view).length > 0;
  }
  return props.character.imageLayersWithMeta.length > 0;
});

const showSpine = computed(() => hasSpineForView.value && !hasActiveStaticLayer.value);
const showStatic = computed(() => hasActiveStaticLayer.value || !hasSpineForView.value);

// Discover view when rendered with a non-default view (skip gallery previews)
onMounted(() => {
  if (props.view && props.character.templateId && !props.character.id.startsWith('_gallery_preview')) {
    Game.getInstance().coreSystem.discoverCharacterView(props.character.templateId, props.view);
  }
});
</script>

<template>
  <CharacterDollSpine v-if="showSpine" v-bind="props" />
  <CharacterDollStatic v-if="showStatic" v-bind="props" />
</template>
