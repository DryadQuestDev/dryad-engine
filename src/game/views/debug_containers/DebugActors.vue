<script setup lang="ts">
import { Game } from '../../game';
import { computed } from 'vue';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import Tag from 'primevue/tag';
import type { SceneAsset, SceneSlot } from '../../systems/dungeonSystem';
import { debugSerialize } from '../../../utility/debug-serializer';

const game = Game.getInstance();

const slots = computed<SceneSlot[]>(() => game.dungeonSystem.sceneSlots.value);
const assets = computed<SceneAsset[]>(() => game.dungeonSystem.assets.value);

// Dungeon/room defaults: the backdrop that `clear` and `solo` sweeps keep, alongside `bg`.
const defaultAssetIds = computed<Set<string>>(() => {
  const ids = new Set<string>(game.dungeonSystem.currentDungeon.value?.default_assets ?? []);
  for (const id of game.dungeonSystem.currentRoom.value?.defaultAssets ?? []) ids.add(id);
  return ids;
});

function assetFlags(asset: SceneAsset): string[] {
  const flags: string[] = [];
  if (defaultAssetIds.value.has(asset.id)) flags.push('default');
  if (asset.bg) flags.push('bg');
  if (asset.solo) flags.push('solo');
  if (asset.hide_actors) flags.push('hide_actors');
  return flags;
}

function assetFile(asset: SceneAsset): string {
  const file = asset.file_image || asset.file_video || asset.file_spine_skeleton || '';
  return file ? file.split('/').pop() ?? file : '–';
}

function getCharacterName(slot: SceneSlot): string {
  const character = game.characterSystem.getCharacter(slot.char);
  return character ? character.getName() : 'character not found';
}

const groups: { label: string; keys: (keyof SceneSlot)[] }[] = [
  { label: 'Slot', keys: ['id', 'char', 'isRemoving'] },
  { label: 'Position', keys: ['x', 'y', 'z', 'scale'] },
  { label: 'Transform', keys: ['rotation', 'xanchor', 'yanchor', 'alpha', 'blur', 'mirror'] },
  { label: 'Enter', keys: ['enter', 'enter_duration', 'enter_delay', 'enter_ease'] },
  { label: 'Exit', keys: ['exit', 'exit_duration', 'exit_ease'] },
  { label: 'Idle', keys: ['idle', 'idle_duration', 'idle_intensity'] },
  { label: 'Filters', keys: ['brightness', 'contrast', 'saturate', 'sepia', 'hue'] },
];

const assetGroups: { label: string; keys: (keyof SceneAsset)[] }[] = [
  { label: 'Asset', keys: ['id', 'type', 'fit_mode', 'isRemoving'] },
  { label: 'Position', keys: ['x', 'y', 'z', 'scale', 'xscale', 'yscale', 'rotation', 'alpha', 'blur'] },
  { label: 'Enter', keys: ['enter', 'enter_duration', 'enter_delay', 'enter_ease'] },
  { label: 'Exit', keys: ['exit', 'exit_duration', 'exit_ease'] },
  { label: 'Idle', keys: ['idle', 'idle_duration', 'idle_intensity'] },
  { label: 'Filters', keys: ['brightness', 'contrast', 'saturate', 'sepia', 'hue'] },
  { label: 'Tween', keys: ['tween', 'tween_ease'] },
];

function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '–';
  return String(value);
}

function serializeSlot(slot: SceneSlot): string {
  return debugSerialize(slot, 1);
}

function serializeAsset(asset: SceneAsset): string {
  const { removalTimeoutId, ...rest } = asset;
  return debugSerialize(rest, 1);
}
</script>

<template>
  <div class="debug-actors">
    <div class="actors-list">
      <h3>Current Actors ({{ slots.length }})</h3>
      <Accordion v-if="slots.length > 0">
        <AccordionPanel v-for="slot in slots" :key="slot.char" :value="slot.char">
          <AccordionHeader>
            <span class="actor-header">
              <strong>{{ slot.char }}</strong>
              <span class="actor-name">{{ getCharacterName(slot) }}</span>
              <span class="actor-slot-id">→ {{ slot.id }}</span>
              <Tag v-if="slot.isRemoving" value="removing" severity="danger" />
            </span>
          </AccordionHeader>
          <AccordionContent>
            <div class="slot-groups">
              <div v-for="group in groups" :key="group.label" class="slot-group">
                <h4>{{ group.label }}</h4>
                <div class="slot-fields">
                  <template v-for="key in group.keys" :key="key">
                    <span class="field-key">{{ key }}</span>
                    <span class="field-value">{{ formatValue(slot[key]) }}</span>
                  </template>
                </div>
              </div>
            </div>
            <pre class="slot-data">{{ serializeSlot(slot) }}</pre>
          </AccordionContent>
        </AccordionPanel>
      </Accordion>
      <p v-else class="no-actors">No actors in the current scene</p>
    </div>
    <div class="actors-list">
      <h3>Current Assets ({{ assets.length }})</h3>
      <Accordion v-if="assets.length > 0">
        <AccordionPanel v-for="asset in assets" :key="asset.id" :value="asset.id">
          <AccordionHeader>
            <span class="actor-header">
              <strong>{{ asset.id }}</strong>
              <span class="actor-name">{{ assetFile(asset) }}</span>
              <span class="actor-slot-id">{{ asset.type }}</span>
              <Tag v-for="flag in assetFlags(asset)" :key="flag" :value="flag" severity="secondary" />
              <Tag v-if="asset.isRemoving" value="removing" severity="danger" />
            </span>
          </AccordionHeader>
          <AccordionContent>
            <div class="slot-groups">
              <div v-for="group in assetGroups" :key="group.label" class="slot-group">
                <h4>{{ group.label }}</h4>
                <div class="slot-fields">
                  <template v-for="key in group.keys" :key="key">
                    <span class="field-key">{{ key }}</span>
                    <span class="field-value">{{ formatValue(asset[key]) }}</span>
                  </template>
                </div>
              </div>
            </div>
            <pre class="slot-data">{{ serializeAsset(asset) }}</pre>
          </AccordionContent>
        </AccordionPanel>
      </Accordion>
      <p v-else class="no-actors">No assets in the current scene</p>
    </div>
  </div>
</template>

<style scoped>
.debug-actors {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.actors-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.actors-list h3 {
  margin: 0;
}

.actor-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.actor-name {
  color: var(--text-color-secondary);
}

.actor-slot-id {
  color: var(--primary-color);
  font-size: 0.9em;
}

.slot-groups {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background-color: var(--surface-section);
  border-radius: 4px;
  margin-bottom: 1rem;
}

.slot-group h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.95em;
  font-weight: 600;
}

.slot-fields {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 1rem;
  font-size: 0.9em;
}

.field-key {
  color: var(--text-color-secondary);
}

.field-value {
  font-family: monospace;
}

.slot-data {
  background-color: var(--surface-ground);
  border-radius: 4px;
  overflow-x: auto;
  margin: 0;
  font-size: 0.9em;
  line-height: 1.5;
}

.no-actors {
  color: var(--text-color-secondary);
  font-style: italic;
}
</style>
