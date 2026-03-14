<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Character } from '../../core/character/character';
import { Game } from '../../game';
import AbilityCard from './AbilityCard.vue';
import CustomComponentContainer from '../CustomComponentContainer.vue';

const props = withDefaults(defineProps<{
  character: Character;
  showDelta?: boolean;
}>(), {
  showDelta: false
});

const game = Game.getInstance();

const selectedAbilityId = ref<string | null>(null);

const abilityIds = computed(() => {
  return Array.from(props.character.abilities).filter(id => {
    const ab = props.character.getAbility(id);
    return !ab?.meta?.is_hidden;
  });
});

// Auto-select first ability when abilities change or on mount
watch(abilityIds, (ids) => {
  if (ids.length > 0 && (!selectedAbilityId.value || !ids.includes(selectedAbilityId.value))) {
    selectedAbilityId.value = ids[0];
  } else if (ids.length === 0) {
    selectedAbilityId.value = null;
  }
}, { immediate: true });

function getAbilityMeta(abilityId: string): Record<string, any> {
  const ability = props.character.getAbility(abilityId);
  if (ability) return ability.meta;
  const template = game.characterSystem.abilityTemplatesMap.get(abilityId);
  return template?.meta || {};
}

function selectAbility(abilityId: string) {
  selectedAbilityId.value = abilityId;
}
</script>

<template>
  <div class="abilities-viewer">
    <CustomComponentContainer slot="abilities-viewer-header" :context="{ character }" />

    <div v-if="abilityIds.length === 0" class="empty-state">
      No abilities
    </div>

    <div v-else class="abilities-layout">
      <div class="ability-detail" v-if="selectedAbilityId">
        <AbilityCard :abilityId="selectedAbilityId" :characterId="character.id" :showDelta="showDelta" />
      </div>

      <div class="ability-list">
        <div v-for="abilityId in abilityIds" :key="abilityId" class="ability-item"
          :class="{ selected: selectedAbilityId === abilityId }" @click="selectAbility(abilityId)">
          <img v-if="getAbilityMeta(abilityId).icon" :src="getAbilityMeta(abilityId).icon" class="ability-icon"
            @error="(e) => (e.target as HTMLImageElement).style.display = 'none'" />
          <span class="ability-name">{{ getAbilityMeta(abilityId).name || abilityId }}</span>
        </div>
        <CustomComponentContainer slot="abilities-viewer-list" :context="{ character }" />
      </div>
    </div>

    <CustomComponentContainer slot="abilities-viewer-footer" :context="{ character }" />
  </div>
</template>

<style scoped>
.abilities-viewer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px;
}

.empty-state {
  color: #888;
  text-align: center;
  padding: 20px;
}

.abilities-layout {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.ability-detail {
  flex: 0 0 auto;
}

.ability-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-content: flex-start;
  flex: 1;
}

.ability-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(40, 40, 40, 0.9);
  border: 1px solid #444;
  border-radius: 4px;
  cursor: pointer;
}

.ability-item:hover {
  outline: 2px solid #9dd0b9;
}

.ability-item.selected {
  outline: 2px solid #42b983;
}

.ability-icon {
  width: 24px;
  height: 24px;
  object-fit: cover;
  border-radius: 3px;
}

.ability-name {
  color: #ddd;
  font-size: 13px;
}

.ability-item.selected .ability-name {
  color: #42b983;
}
</style>
