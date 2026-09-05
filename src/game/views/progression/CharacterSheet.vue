<script setup lang="ts">
import { computed } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import { showConfirm } from '../../../services/dialogService';
import CharacterStatuses from './CharacterStatuses.vue';
import CharacterStats from './CharacterStats.vue';
import CharacterRename from './CharacterRename.vue';
import AbilitiesViewer from './AbilitiesViewer.vue';
import CustomComponentContainer from '../CustomComponentContainer.vue';

const props = defineProps<{
  character: Character;
  viewerMode?: boolean;
}>();

const game = Game.getInstance();

const hasStats = computed(() => {
  return props.character.statIds.size > 0;
});

const hasAbilities = computed(() => props.character.abilities.size > 0);

// Characters whose template sets traits.dismissable can be released from the sheet: confirm,
// unequip their own gear, delete. viewerMode marks read-only contexts (e.g. the battle inspect
// popup) — management actions must not appear there: deleting a live combatant would leave the
// battle roster pointing at a missing character.
const canDismiss = computed(() =>
  !props.viewerMode
  && !!props.character.getTrait('dismissable')
  && game.isCharacterInParty(props.character));

// traits.renameable shows the inline rename control (the same engine component games gate
// through their own panels). Hidden in viewer contexts like dismiss.
const canRename = computed(() => !props.viewerMode && !!props.character.getTrait('renameable'));

async function onDismiss() {
  const name = props.character.getName();
  const confirmed = await showConfirm({
    message: game.getLine('dismiss_confirm', { name }),
    header: game.getLine('dismiss'),
  });
  if (!confirmed) return;
  // The shared party inventory's getEquippedItems() spans EVERY member's gear — scope to the
  // items sitting in this character's own slots (unequipItem throws on anyone else's).
  const ownItemUids = new Set(props.character.getItemSlots().map(slot => slot.itemUid).filter(uid => uid));
  for (const item of props.character.getEquippedItems()) {
    if (ownItemUids.has(item.uid)) props.character.unequipItem(item);
  }
  game.deleteCharacter(props.character);
  // Keep the sheet alive: fall back to the first remaining party member (the MC in practice)
  // instead of leaving a stale/empty selection behind.
  const next = game.getParty()[0];
  game.setState('selected_character', next ? next.id : '');
}
</script>

<template>
  <div class="character-sheet-container">
    <!-- Top slot -->
    <CustomComponentContainer slot="character-sheet-top" :context="{ character }" />

    <CharacterRename v-if="canRename" :character="character" />

    <button v-if="canDismiss" class="dismiss-btn" @click="onDismiss">
      <i class="pi pi-user-minus"></i> {{ game.getLine('dismiss') }}
    </button>

    <div class="stats-wrapper">
      <div class="statuses-section">
        <CharacterStatuses :character="character" :showItems="false" />
      </div>
      <div class="stats-section" v-if="hasStats">
        <CharacterStats :character="character" />
      </div>
    </div>
    <div class="abilities-section" v-if="hasAbilities">
      <AbilitiesViewer :character="character" :show-delta="true" />
    </div>

    <!-- Bottom slot -->
    <CustomComponentContainer slot="character-sheet-bottom" :context="{ character }" />
  </div>
</template>

<style scoped>
.character-sheet-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  gap: 0.5rem;
  padding-right: 4px;
}

.character-sheet-container > * {
  flex-shrink: 0;
}

.stats-wrapper {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  gap: 0.5rem;
}

.statuses-section {
  flex: 0 0 auto;
}

.stats-section {
  flex: 0 0 auto;
}


.dismiss-btn {
  background: transparent;
  border: 1px solid #5a4a45;
  border-radius: 8px;
  color: #c08a8a;
  padding: 0.3em 0.8em;
  cursor: pointer;
  align-self: flex-start;
}

.dismiss-btn:hover {
  border-color: #c08a8a;
  background: rgba(192, 138, 138, 0.1);
}
</style>
