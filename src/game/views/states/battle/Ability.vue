<script setup lang="ts">
import { computed } from 'vue';
import type { FinalAbility } from '../../../core/character/character';

interface Props {
  abilityId: string;
  abilityData: FinalAbility | undefined;
  characterName: string;
}

const props = defineProps<Props>();

const effects = computed(() => {
  if (!props.abilityData) return [];
  const effectsList = [];
  for (const [effectId, aspects] of Object.entries(props.abilityData.effects)) {
    effectsList.push({ id: effectId, aspects });
  }
  return effectsList;
});

function useAbility() {
  if (!props.abilityData) {
    console.error(`Ability data not found for ${props.abilityId}`);
    return;
  }

  console.log('='.repeat(60));
  console.log(`${props.characterName} uses ${props.abilityData.meta.name || props.abilityId}!`);
  console.log('='.repeat(60));

  for (const effect of effects.value) {
    console.log(`\n[Effect: ${effect.id}]`);

    for (const [aspectKey, aspectValue] of Object.entries(effect.aspects as Record<string, any>)) {
      if (aspectKey === 'damage') {
        console.log(`  💥 Deal ${aspectValue} damage`);
      } else if (aspectKey === 'damage_type') {
        console.log(`  🔥 Damage type: ${aspectValue}`);
      } else if (aspectKey === 'summon') {
        if (Array.isArray(aspectValue) && aspectValue.length > 0) {
          console.log(`  👾 Summon: ${aspectValue.join(', ')}`);
        }
      } else {
        console.log(`  ✨ ${aspectKey}: ${JSON.stringify(aspectValue)}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
}
</script>

<template>
  <div v-if="!abilityData" class="ability-card ability-error">
    <div class="error-message">
      ⚠️ Ability "{{ abilityId }}" not found or failed to load
    </div>
  </div>

  <div v-else class="ability-card">
    <div class="ability-header">
      <img
        v-if="abilityData.meta.icon"
        :src="abilityData.meta.icon"
        class="ability-icon"
        @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
      />
      <div class="ability-info">
        <div class="ability-name">{{ abilityData.meta.name || abilityId }}</div>
        <div class="ability-description" v-if="abilityData.meta.description" v-html="abilityData.meta.description"></div>
        <div class="ability-cooldown" v-if="abilityData.meta.cooldown">
          Cooldown: {{ abilityData.meta.cooldown }} turns
        </div>
      </div>
    </div>

    <div class="ability-effects">
      <div v-for="effect in effects" :key="effect.id" class="effect-item">
        <div class="effect-id">Effect: {{ effect.id }}</div>
        <div class="effect-aspects">
          <div v-for="(value, key) in effect.aspects" :key="key" class="aspect-item">
            <span class="aspect-key">{{ key }}:</span>
            <span class="aspect-value">
              {{ Array.isArray(value) ? (value as any[]).join(', ') : value }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <button @click="useAbility" class="use-button">Use Ability</button>
  </div>
</template>

<style scoped>
.ability-card {
  background: #f5f5f5;
  border: 2px solid #ddd;
  border-radius: 8px;
  padding: 12px;
  margin: 8px 0;
}

.ability-error {
  background: #ffebee;
  border-color: #f44336;
}

.error-message {
  color: #c62828;
  font-weight: bold;
  text-align: center;
  padding: 8px;
}

.ability-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.ability-icon {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #ccc;
}

.ability-info {
  flex: 1;
}

.ability-name {
  font-size: 18px;
  font-weight: bold;
  color: #333;
  margin-bottom: 4px;
}

.ability-description {
  font-size: 14px;
  color: #666;
  margin-bottom: 4px;
}

.ability-cooldown {
  font-size: 12px;
  color: #888;
  font-style: italic;
}

.ability-effects {
  background: white;
  border-radius: 4px;
  padding: 8px;
  margin-bottom: 8px;
}

.effect-item {
  margin-bottom: 8px;
  padding: 8px;
  background: #fafafa;
  border-left: 3px solid #4CAF50;
}

.effect-item:last-child {
  margin-bottom: 0;
}

.effect-id {
  font-weight: bold;
  color: #4CAF50;
  margin-bottom: 6px;
  font-size: 14px;
}

.effect-aspects {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.aspect-item {
  font-size: 13px;
  display: flex;
  gap: 8px;
}

.aspect-key {
  color: #666;
  font-weight: 500;
  min-width: 100px;
}

.aspect-value {
  color: #333;
  font-family: 'Courier New', monospace;
}

.use-button {
  width: 100%;
  padding: 10px 16px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.2s;
}

.use-button:hover {
  background: #45a049;
}

.use-button:active {
  background: #3d8b40;
}
</style>
