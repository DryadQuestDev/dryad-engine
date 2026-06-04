<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../../game';

const props = defineProps<{
    treeId: string;
    characterId?: string;
}>();

const game = Game.getInstance();
const tree = computed(() => game.characterSystem.skillTreesMap.get(props.treeId));
const treeCharacter = computed(() => props.characterId ? game.getCharacter(props.characterId) : undefined);
</script>

<template>
    <div v-if="tree" class="popup-inner">
        <div class="popup-header">
            <span class="popup-title">{{ tree.name || tree.id }}</span>
        </div>
        <div v-if="tree.description"
            v-script="{ html: tree.description, context: { character: treeCharacter } }"
            class="popup-description"></div>
    </div>
    <div v-else class="popup-inner popup-error">
        Unknown tree: {{ treeId }}
    </div>
</template>
