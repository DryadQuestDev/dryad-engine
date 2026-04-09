<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import type { BaseStatusObject } from '../../../schemas/characterStatusSchema';
import StatusStatsDisplay from './StatusStatsDisplay.vue';
import AbilityCard from './AbilityCard.vue';

const props = withDefaults(defineProps<{
  data: BaseStatusObject;
  stacks?: number;
  multiplier?: number;
  isActive?: boolean;
  characterId?: string;
}>(), {
  isActive: true
});

const game = Game.getInstance();

// Filter stats by visibility
const visibleStats = computed((): Record<string, number> => {
  const stats = props.data.stats as Record<string, number> | undefined;
  if (!stats) return {};

  const showHidden = game.coreSystem.getDebugSetting('show_hidden_stats');
  const activeMap = showHidden
    ? game.characterSystem.statsMap
    : game.characterSystem.statsVisibleMap;

  const result: Record<string, number> = {};
  for (const statId in stats) {
    if (activeMap.has(statId)) {
      const val = stats[statId];
      if (typeof val === 'number') result[statId] = val;
    }
  }
  return result;
});

const hasVisibleStats = computed(() => Object.keys(visibleStats.value).length > 0);

// Normalize a raw ability_modifier into the { meta, effects } shape for AbilityCard improvementData
function normalizeModifier(modifier: any): { meta: Record<string, any>, effects: Record<string, Record<string, any>> } {
  const effects: Record<string, Record<string, any>> = {};
  if (modifier.effects) {
    for (const effect of modifier.effects) {
      const normalized: any = { ...(effect.aspects || {}) };
      if (effect.name) normalized.__name = effect.name;
      effects[effect.id] = normalized;
    }
  }
  return { meta: modifier.meta || {}, effects };
}

function checkInactive(template: any): boolean {
  if (!template?.requires_status || !props.characterId) return false;
  const char = game.getCharacter(props.characterId);
  return !char?.getStatuses().some((s: any) => s.id === template.requires_status);
}

// Build ability entries: granted abilities + modifier-only improvements
const abilityEntries = computed((): Array<{
  abilityId: string;
  isGranted: boolean;
  improvementData: { meta: Record<string, any>, effects: Record<string, Record<string, any>> } | null;
  isInactive: boolean;
}> => {
  const abilities = props.data.abilities || [];
  const rawMods: any[] = props.data.ability_modifiers || [];

  // Resolve string IDs to template objects (same logic as Status.setValues)
  const modifiersByAbility = new Map<string, any>();
  for (const mod of rawMods) {
    if (typeof mod === 'string') {
      const template = game.characterSystem.abilityTemplatesMap.get(mod);
      if (template?.modifies) modifiersByAbility.set(template.modifies, template);
    } else if (mod.ability_id) {
      modifiersByAbility.set(mod.ability_id, mod);
    }
  }

  const entries: typeof abilityEntries.value = [];
  const seen = new Set<string>();

  // Granted abilities
  for (const abilityId of abilities) {
    seen.add(abilityId);
    const mod = modifiersByAbility.get(abilityId) || null;
    const template = game.characterSystem.abilityTemplatesMap.get(abilityId);
    entries.push({
      abilityId,
      isGranted: true,
      improvementData: mod ? normalizeModifier(mod) : null,
      isInactive: checkInactive(template),
    });
  }

  // Modifier-only (not granted)
  for (const [abilityId, mod] of modifiersByAbility) {
    if (!seen.has(abilityId)) {
      seen.add(abilityId);
      entries.push({
        abilityId,
        isGranted: false,
        improvementData: normalizeModifier(mod),
        isInactive: checkInactive(mod),
      });
    }
  }

  // Sort by cooldown ascending
  entries.sort((a, b) => {
    const cdA = (game.characterSystem.abilityTemplatesMap.get(a.abilityId)?.meta as any)?.cooldown || 0;
    const cdB = (game.characterSystem.abilityTemplatesMap.get(b.abilityId)?.meta as any)?.cooldown || 0;
    return cdA - cdB;
  });

  return entries;
});
</script>

<template>
  <div class="status-object-display">
    <StatusStatsDisplay v-if="hasVisibleStats" :stats="visibleStats"
      :stacks="stacks" :multiplier="multiplier" :isActive="isActive" />

    <div v-if="abilityEntries.length" class="popup-abilities">
      <div v-for="entry in abilityEntries" :key="entry.abilityId" class="ability-entry">
        <AbilityCard :ability-id="entry.abilityId"
          :character-id="characterId"
          :improvement-data="entry.improvementData || undefined"
          :is-granted="entry.isGranted"
          :is-inactive="entry.isInactive" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.popup-abilities {
  margin-top: 8px;
  border-top: 1px solid #444;
  padding-top: 8px;
}

.ability-entry {
  margin-bottom: 8px;
}

.ability-entry:last-child {
  margin-bottom: 0;
}
</style>
