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
}>();

const isSpine = computed(() => {
  if (props.view) {
    return props.character.isSpineForView(props.view);
  }
  return props.character.isSpineCharacter();
});

// Discover view when rendered with a non-default view (skip gallery previews)
onMounted(() => {
  if (props.view && props.character.templateId && !props.character.id.startsWith('_gallery_preview')) {
    Game.getInstance().coreSystem.discoverCharacterView(props.character.templateId, props.view);
  }
});
</script>

<template>
  <CharacterDollSpine v-if="isSpine" v-bind="props" />
  <CharacterDollStatic v-else v-bind="props" />
</template>
