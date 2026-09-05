<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Character } from '../../core/character/character';
import CharacterFace from '../CharacterFace.vue';
import CharacterSlot from './CharacterSlot.vue';
import CharacterSheet from './CharacterSheet.vue';
import { preloadCharacterAssets } from '../../utils/assetPreloader';

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

// Face list pages once it outgrows a single comfortable row-set. Below the threshold the
// whole list is one page, so short lists behave exactly as before.
const FACES_PER_PAGE = 10;

const page = ref(0);

const pageCount = computed(() => Math.max(1, Math.ceil(charactersArray.value.length / FACES_PER_PAGE)));

// Faces carry their index in the FULL array: selection, the emit payload and the caller's
// initialIndex all address the unpaged list, so the page offset must never leak into them.
const pagedCharacters = computed<{ character: Character; index: number }[]>(() => {
    const start = page.value * FACES_PER_PAGE;
    return charactersArray.value
        .slice(start, start + FACES_PER_PAGE)
        .map((character, offset) => ({ character, index: start + offset }));
});

const selectedCharacter = computed<Character | null>(() =>
    charactersArray.value[selectedIndex.value] || null
);

// The page follows the selection rather than the other way round, so initialIndex — and any
// later programmatic select — opens on the page actually holding that character.
watch(selectedIndex, index => {
    page.value = Math.floor(Math.max(0, index) / FACES_PER_PAGE);
}, { immediate: true });

// Reset index when characters change
watch(charactersArray, () => {
    if (selectedIndex.value >= charactersArray.value.length) {
        selectedIndex.value = 0;
    }
    if (page.value >= pageCount.value) {
        page.value = pageCount.value - 1;
    }
});

// Warm the visible characters' art up front, spine included — the incoming doll fades IN, so
// anything still fetching would fade in empty and pop layer by layer. Scoped to the current
// page plus the selection: a paged list can run to hundreds of characters, and warming every
// spine at once would thrash the cache for art that is not reachable without paging first.
// Watched by id signature rather than by the array reference: charactersArray returns the
// caller's own array when it is one, so a script pushing a character into it (a mid-battle
// summon) never changes that reference.
const warmedCharacters = computed<Character[]>(() => {
    const list = pagedCharacters.value.map(entry => entry.character);
    const selected = selectedCharacter.value;
    if (selected && !list.includes(selected)) list.push(selected);
    return list;
});

watch(() => warmedCharacters.value.map(char => char.id).join('|'), () => {
    for (const char of warmedCharacters.value) preloadCharacterAssets(char, { spine: true });
}, { immediate: true });

function selectCharacter(index: number) {
    selectedIndex.value = index;
    if (charactersArray.value[index]) {
        emit('select', charactersArray.value[index], index);
    }
}

function goToPage(next: number) {
    page.value = Math.min(Math.max(next, 0), pageCount.value - 1);
}
</script>

<template>
    <div class="character-viewer dark-scrollbar" v-if="selectedCharacter">
        <!-- Header: Character faces to switch (auto-hidden for single) -->
        <div class="viewer-header" v-if="showFaceList">
            <div class="viewer-faces">
                <div v-for="entry in pagedCharacters" :key="entry.character.id" class="viewer-face-item"
                    :class="{ selected: entry.index === selectedIndex }" @click="selectCharacter(entry.index)">
                    <CharacterFace class="viewer-face-image" :character="entry.character" :showName="true" />
                </div>
            </div>

            <div class="viewer-pagination" v-if="pageCount > 1">
                <button class="viewer-page-button" :disabled="page === 0" @click="goToPage(page - 1)">&lsaquo;</button>
                <span class="viewer-page-label">{{ page + 1 }} / {{ pageCount }}</span>
                <button class="viewer-page-button" :disabled="page >= pageCount - 1"
                    @click="goToPage(page + 1)">&rsaquo;</button>
            </div>
        </div>

        <!-- Body: Doll + Stats -->
        <div class="viewer-body">
            <!-- Character Doll (left)
                 Two wrappers: the outer .viewer-doll-stage takes the flex slot and gives the
                 doll horizontal room; the inner .viewer-doll-wrapper keeps the 50cqh column
                 untouched so item slot positions (calibrated in ItemSlotPickerPopup against
                 the same 50cqh frame) land on the same body parts as in CharacterTab. -->
            <div class="viewer-doll-stage">
                <div class="viewer-doll-wrapper">
                    <!-- Each character gets its OWN stacked layer, keyed by id, and the two
                         layers crossfade. The art and the wrapper transform that sizes it
                         (art_scale/art_dx/art_dy, per character) then enter and leave together.
                         A single reused slot instead snaps to the incoming character's transform
                         the moment the prop changes, while the outgoing art is still fading —
                         a 0.6-scale rat blown up into a troglodyte's 1.0 frame on the way out. -->
                    <Transition name="viewer-doll">
                        <div class="viewer-doll-layer" :key="selectedCharacter.id">
                            <CharacterSlot :character="selectedCharacter" :slot="{ scale: 1 }" :showItemSlots="true"
                                :disableItemInteraction="true" :grade="false" />
                        </div>
                    </Transition>
                </div>
            </div>

            <!-- Stats/Statuses (right) - reuses CharacterSheet in read-only viewer mode -->
            <div class="viewer-sheet-wrapper">
                <CharacterSheet :character="selectedCharacter" :viewerMode="true" />
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
    padding-left: 10px;
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

.viewer-face-item:hover .viewer-face-image :deep(.character-face) {
    outline: 2px solid rgba(0, 222, 37, 0.5);
}

.viewer-face-item.selected .viewer-face-image :deep(.character-face) {
    outline: 2px solid rgb(0, 222, 37);
}

.viewer-face-item.selected .viewer-face-image :deep(.character-face-name) {
    outline: 2px solid rgb(0, 222, 37);
}

.viewer-pagination {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 0 5px;
    color: white;
}

.viewer-page-button {
    width: 1.75rem;
    height: 1.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.06);
    color: white;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
}

.viewer-page-button:hover:not(:disabled) {
    border-color: rgb(0, 222, 37);
}

.viewer-page-button:disabled {
    opacity: 0.35;
    cursor: default;
}

.viewer-page-label {
    font-size: 0.85rem;
    opacity: 0.75;
    font-variant-numeric: tabular-nums;
}

.viewer-body {
    display: flex;
    flex: 1;
    min-height: 0;
    gap: 1rem;
    container-type: size;
}

/* Outer stage — takes the flex slot in .viewer-body. Wider than the inner column
   so the body's natural ±25cqh overflow renders without being clipped by the
   modal root. The inner .viewer-doll-wrapper remains the 50cqh authoring frame
   for item slots so positions tuned in ItemSlotPickerPopup stay valid. */
.viewer-doll-stage {
    flex-shrink: 0;
    width: 100cqh;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
}

/* Match CharacterTab.vue layout for doll wrapper. Item slots are calibrated
   against this 50cqh column — DO NOT change width here or items will drift
   relative to the body. The outer .viewer-doll-stage above provides the
   visual room instead. */
.viewer-doll-wrapper {
    width: 50cqh;
    flex-shrink: 0;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    /* Center the slot in the 50cqh column so the body lands at column-center
       when art_dx = 0 — matches CharacterTab and the editor popups. */
    justify-content: center;
}

/* Both layers occupy the full wrapper box so they overlap during the crossfade
   instead of sitting side by side — and so each one keeps the exact geometry the
   item slots are calibrated against. */
.viewer-doll-layer {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
}

.viewer-doll-enter-active,
.viewer-doll-leave-active {
    transition: opacity 0.35s ease;
}

.viewer-doll-enter-from,
.viewer-doll-leave-to {
    opacity: 0;
}

/* The outgoing layer still covers the incoming one while it fades. The descendant
   half is the load-bearing one: ItemSlots' cells set `pointer-events: auto`, which
   opts them back in past an inherited `none`, so where the outgoing character had
   a slot and the incoming one does not, that stale cell would sit on top as the
   hit target for the whole fade. */
.viewer-doll-leave-active,
.viewer-doll-leave-active :deep(*) {
    pointer-events: none;
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

.viewer-sheet-wrapper {
    flex: 1;
    overflow: hidden;
    min-height: 0;
    padding-right: 10px;
    max-width: 1000px;
    position: relative;
}
</style>
