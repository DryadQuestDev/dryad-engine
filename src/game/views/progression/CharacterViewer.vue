<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Character } from '../../core/character/character';
import CharacterFace from '../CharacterFace.vue';
import CharacterSlot from './CharacterSlot.vue';
import CharacterSheet from './CharacterSheet.vue';

const props = defineProps<{
    characters: Character | Character[];  // Single or array
    initialIndex?: number;                // Starting index (for arrays)
}>();

const emit = defineEmits<{
    (e: 'select', character: Character, index: number): void;
}>();

// Normalize to array
const charactersArray = computed<Character[]>(() =>
    Array.isArray(props.characters) ? props.characters : [props.characters]
);

// Auto-hide face list for single character
const showFaceList = computed(() => charactersArray.value.length > 1);

// Selected character index
const selectedIndex = ref(props.initialIndex ?? 0);

// Reset index when characters change
watch(charactersArray, () => {
    if (selectedIndex.value >= charactersArray.value.length) {
        selectedIndex.value = 0;
    }
});

const selectedCharacter = computed<Character | null>(() =>
    charactersArray.value[selectedIndex.value] || null
);

function selectCharacter(index: number) {
    selectedIndex.value = index;
    if (charactersArray.value[index]) {
        emit('select', charactersArray.value[index], index);
    }
}
</script>

<template>
    <div class="character-viewer dark-scrollbar" v-if="selectedCharacter">
        <!-- Header: Character faces to switch (auto-hidden for single) -->
        <div class="viewer-header" v-if="showFaceList">
            <div class="viewer-faces">
                <div v-for="(char, index) in charactersArray" :key="char.id" class="viewer-face-item"
                    :class="{ selected: index === selectedIndex }" @click="selectCharacter(index)">
                    <CharacterFace class="viewer-face-image" :character="char" :showName="true" />
                </div>
            </div>
        </div>

        <!-- Body: Doll + Stats -->
        <div class="viewer-body">
            <!-- Character Doll (left) -->
            <div class="viewer-doll-wrapper">
                <CharacterSlot :character="selectedCharacter" :slot="{ scale: 1 }" :showItemSlots="true"
                    :disableItemInteraction="true" />
            </div>

            <!-- Stats/Statuses (right) - reuses CharacterSheet without inventory -->
            <div class="viewer-sheet-wrapper">
                <CharacterSheet :character="selectedCharacter" :hideInventory="true" />
            </div>
        </div>
    </div>
</template>

<style scoped>
.character-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

.viewer-header {
    flex-shrink: 0;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    margin-bottom: 1rem;
}

.viewer-faces {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    padding: 5px;
    color: white;
}

.viewer-face-item {
    position: relative;
    cursor: pointer;
}

.viewer-face-image {
    pointer-events: none;
}

.viewer-face-image :deep(.character-face) {
    transition: outline 0.2s ease;
}

.viewer-face-item:hover .viewer-face-image :deep(.character-face) {
    outline: 2px solid rgba(0, 222, 37, 0.5);
}

.viewer-face-item.selected .viewer-face-image :deep(.character-face) {
    outline: 2px solid rgb(0, 222, 37);
}

.viewer-face-image :deep(.character-face-name) {
    transition: outline 0.2s ease;
}

.viewer-face-item.selected .viewer-face-image :deep(.character-face-name) {
    outline: 2px solid rgb(0, 222, 37);
}

.viewer-body {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 1rem;
}

/* Match CharacterTab.vue layout for doll wrapper */
.viewer-doll-wrapper {
    width: 50vh;
    flex-shrink: 0;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    padding-bottom: 4vh;
}

.viewer-doll-wrapper :deep(.character-slot) {
    position: relative;
    width: auto;
    height: 100%;
    aspect-ratio: 1 / 1;
    left: auto;
    top: auto;
}

.viewer-doll-wrapper :deep(.character-slot-positioner) {
    position: relative;
    width: 100%;
    height: 100%;
}

.viewer-doll-wrapper :deep(.character-slot-rotation-wrapper) {
    justify-content: flex-start;
}

.viewer-sheet-wrapper {
    flex: 1;
    min-width: 400px;
    overflow: hidden;
    min-height: 0;
    padding-right: 10px;
}
</style>
