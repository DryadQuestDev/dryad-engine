<script setup lang="ts">
import { computed } from 'vue';
import { shouldShowEntityIds } from '../../../utils/idBadge';
import { Game } from '../../../game';
import { Global } from '../../../../global/global';

const showIds = computed(() => shouldShowEntityIds());

const props = defineProps<{
    treeId: string;
    characterId?: string;
}>();

const game = Game.getInstance();
const global = Global.getInstance();
const tree = computed(() => game.characterSystem.skillTreesMap.get(props.treeId));
const treeCharacter = computed(() => props.characterId ? game.getCharacter(props.characterId) : undefined);

const unknownLabel = computed(() => global.getString('card.unknown', { id: props.treeId }));
</script>

<template>
    <div v-if="tree" class="popup-inner">
        <div class="popup-header">
            <span class="popup-title">{{ tree.name || tree.id }}
                <span v-if="showIds" class="entity-id-badge">{{ treeId }}</span>
            </span>
        </div>
        <div v-if="tree.description"
            v-script="{ html: tree.description, context: { character: treeCharacter } }"
            class="popup-description"></div>
    </div>
    <div v-else class="popup-inner popup-error">
        {{ unknownLabel }}
    </div>
</template>
