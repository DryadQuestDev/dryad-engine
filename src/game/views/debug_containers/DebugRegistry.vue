<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { Game } from '../../game';
import Accordion from 'primevue/accordion';
import AccordionPanel from 'primevue/accordionpanel';
import AccordionHeader from 'primevue/accordionheader';
import AccordionContent from 'primevue/accordioncontent';
import InputText from 'primevue/inputtext';

const game = Game.getInstance();

// Search query
const searchQuery = ref<string | undefined>('');

// Collect all registry data
const emitters = ref<string[]>([]);
// States are now computed directly from the reactive game state
const stateKeys = ref<string[]>([]);
const actions = ref<string[]>([]);
const conditions = ref<string[]>([]);
const placeholders = ref<string[]>([]);
const statComputers = ref<string[]>([]);
const componentSlots = ref<Map<string, Array<{ id: string; slot: string; title?: string; order?: number }>>>(new Map());

// Reactive states computed from game state
const states = computed(() => {
  return stateKeys.value.map(key => ({
    key,
    value: game.coreSystem.state.value.get(key)
  }));
});

// Filtered data based on search query
const filteredEmitters = computed(() => {
  if (!searchQuery.value) return emitters.value;
  const query = searchQuery.value.toLowerCase();
  return emitters.value.filter(e => e.toLowerCase().includes(query));
});

const filteredStates = computed(() => {
  if (!searchQuery.value) return states.value;
  const query = searchQuery.value.toLowerCase();
  return states.value.filter(s => s.key.toLowerCase().includes(query));
});

const filteredActions = computed(() => {
  if (!searchQuery.value) return actions.value;
  const query = searchQuery.value.toLowerCase();
  return actions.value.filter(a => a.toLowerCase().includes(query));
});

const filteredConditions = computed(() => {
  if (!searchQuery.value) return conditions.value;
  const query = searchQuery.value.toLowerCase();
  return conditions.value.filter(c => c.toLowerCase().includes(query));
});

const filteredPlaceholders = computed(() => {
  if (!searchQuery.value) return placeholders.value;
  const query = searchQuery.value.toLowerCase();
  return placeholders.value.filter(p => p.toLowerCase().includes(query));
});

const filteredStatComputers = computed(() => {
  if (!searchQuery.value) return statComputers.value;
  const query = searchQuery.value.toLowerCase();
  return statComputers.value.filter(s => s.toLowerCase().includes(query));
});

const componentsBySlot = computed(() => {
  let slots: Map<string, Array<{ id: string; slot: string; title?: string; order?: number }>>;

  if (!searchQuery.value) {
    slots = componentSlots.value;
  } else {
    // Filter components by search query
    const query = searchQuery.value.toLowerCase();
    const filtered = new Map<string, Array<{ id: string; slot: string; title?: string; order?: number }>>();

    componentSlots.value.forEach((slotComponents) => {
      const matchingComponents = slotComponents.filter(c => c.id.toLowerCase().includes(query));
      if (matchingComponents.length > 0) {
        filtered.set(slotComponents[0].slot, matchingComponents);
      }
    });

    slots = filtered;
  }

  // Convert Map to array of [slot, components] pairs for Vue template
  // Sort slots alphabetically and sort each slot's components by id for better readability
  return Array.from(slots.entries())
    .sort(([slotA], [slotB]) => slotA.localeCompare(slotB))
    .map(([slot, comps]) => [
      slot,
      [...comps].sort((a, b) => a.id.localeCompare(b.id))
    ] as [string, typeof comps]);
});

const totalComponentCount = computed(() => {
  let count = 0;
  componentSlots.value.forEach(slotComponents => {
    count += slotComponents.length;
  });
  return count;
});

const filteredComponentCount = computed(() => {
  let count = 0;
  componentsBySlot.value.forEach(([, slotComponents]) => {
    count += slotComponents.length;
  });
  return count;
});

// Get listeners for each emitter
const getListeners = (emitterName: string) => {
  try {
    return game.coreSystem.getListenersForEvent(emitterName as any);
  } catch (e) {
    return [];
  }
};

onMounted(() => {
  // Collect emitters and sort alphabetically
  emitters.value = Array.from(game.coreSystem.emitterConfig).sort();

  // Collect state keys and sort alphabetically
  stateKeys.value = Array.from(game.coreSystem.state.value.keys()).sort();

  // Collect actions and sort alphabetically
  actions.value = Array.from(game.logicSystem.actionRegistry.keys()).sort();

  // Collect conditions and sort alphabetically
  conditions.value = Array.from(game.logicSystem.conditionRegistry.keys()).sort();

  // Collect placeholders and sort alphabetically
  placeholders.value = Array.from(game.logicSystem.placeholderRegistry.keys()).sort();

  // Collect stat computers and sort alphabetically
  statComputers.value = Array.from(game.characterSystem.statComputersRegistry.keys()).sort();

  // Fetch component slots directly - already grouped and sorted by order
  const allSlots = game.coreSystem.getAllComponentSlots();
  componentSlots.value = new Map(allSlots);
});

const formatValue = (value: any): string => {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'number') return value.toString();
  if (typeof value === 'string') return `"${value}"`;
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'object') return 'Object';
  return String(value);
};
</script>

<template>
  <div class="debug-registry">
    <!-- Search Toolbar -->
    <div class="search-toolbar">
      <InputText v-model="searchQuery" class="search-input" />
      <span v-if="searchQuery" class="search-clear" @click="searchQuery = ''">✕</span>
    </div>

    <Accordion multiple>
      <!-- Emitters Section -->
      <AccordionPanel value="emitters">
        <AccordionHeader>Events ({{ filteredEmitters.length }}{{ searchQuery ? ' / ' + emitters.length : '' }})
        </AccordionHeader>
        <AccordionContent>
          <div class="registry-list">
            <div v-for="emitter in filteredEmitters" :key="emitter" class="registry-item emitter-item">
              <div class="emitter-header">
                <span class="item-name">{{ emitter }}</span>
              </div>
              <div v-if="getListeners(emitter).length > 0" class="listeners-list">
                <div class="listeners-label">Listeners ({{ getListeners(emitter).length }}):</div>
                <div v-for="(listener, index) in getListeners(emitter)" :key="index" class="listener-item">
                  <span class="listener-bullet">•</span>
                  <span v-if="listener.source" class="listener-source">{{ listener.source }}</span>
                  <span v-else class="listener-no-source">(source not tracked)</span>
                </div>
              </div>
            </div>
            <div v-if="filteredEmitters.length === 0" class="empty-message">
              {{ searchQuery ? 'No matching emitters found' : 'No emitters registered' }}
            </div>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <!-- States Section -->
      <AccordionPanel value="states">
        <AccordionHeader>States ({{ filteredStates.length }}{{ searchQuery ? ' / ' + states.length : '' }})
        </AccordionHeader>
        <AccordionContent>
          <div class="registry-list">
            <div v-for="state in filteredStates" :key="state.key" class="registry-item state-item">
              <div class="state-content">
                <span class="item-name">{{ state.key }}</span>
                <span class="item-value">{{ formatValue(state.value) }}</span>
              </div>
            </div>
            <div v-if="filteredStates.length === 0" class="empty-message">
              {{ searchQuery ? 'No matching states found' : 'No states registered' }}
            </div>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <!-- Actions Section -->
      <AccordionPanel value="actions">
        <AccordionHeader>Actions ({{ filteredActions.length }}{{ searchQuery ? ' / ' + actions.length : '' }})
        </AccordionHeader>
        <AccordionContent>
          <div class="registry-list">
            <div v-for="action in filteredActions" :key="action" class="registry-item">
              <span class="item-name">{{ action }}</span>
            </div>
            <div v-if="filteredActions.length === 0" class="empty-message">
              {{ searchQuery ? 'No matching actions found' : 'No actions registered' }}
            </div>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <!-- Conditions Section -->
      <AccordionPanel value="conditions">
        <AccordionHeader>Conditions ({{ filteredConditions.length }}{{ searchQuery ? ' / ' + conditions.length : '' }})
        </AccordionHeader>
        <AccordionContent>
          <div class="registry-list">
            <div v-for="condition in filteredConditions" :key="condition" class="registry-item">
              <span class="item-name">{{ condition }}</span>
            </div>
            <div v-if="filteredConditions.length === 0" class="empty-message">
              {{ searchQuery ? 'No matching conditions found' : 'No conditions registered' }}
            </div>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <!-- Placeholders Section -->
      <AccordionPanel value="placeholders">
        <AccordionHeader>Placeholders ({{ filteredPlaceholders.length }}{{ searchQuery ? ' / ' + placeholders.length :
          '' }})</AccordionHeader>
        <AccordionContent>
          <div class="registry-list">
            <div v-for="placeholder in filteredPlaceholders" :key="placeholder" class="registry-item">
              <span class="item-name">{{ placeholder }}</span>
            </div>
            <div v-if="filteredPlaceholders.length === 0" class="empty-message">
              {{ searchQuery ? 'No matching placeholders found' : 'No placeholders registered' }}
            </div>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <!-- Stat Computers Section -->
      <AccordionPanel value="statComputers">
        <AccordionHeader>Stat Computers ({{ filteredStatComputers.length }}{{ searchQuery ? ' / ' + statComputers.length :
          '' }})</AccordionHeader>
        <AccordionContent>
          <div class="registry-list">
            <div v-for="computer in filteredStatComputers" :key="computer" class="registry-item">
              <span class="item-name">{{ computer }}</span>
            </div>
            <div v-if="filteredStatComputers.length === 0" class="empty-message">
              {{ searchQuery ? 'No matching stat computers found' : 'No stat computers registered' }}
            </div>
          </div>
        </AccordionContent>
      </AccordionPanel>

      <!-- Components Section (grouped by slot) -->
      <AccordionPanel value="components">
        <AccordionHeader>Components ({{ filteredComponentCount }}{{ searchQuery ? ' / ' + totalComponentCount : '' }})
          - Grouped by Slot</AccordionHeader>
        <AccordionContent>
          <div v-for="[slot, comps] in componentsBySlot" :key="slot" class="slot-group">
            <h4 class="slot-title">{{ slot }} ({{ comps.length }})</h4>
            <div class="registry-list">
              <div v-for="comp in comps" :key="comp.id" class="registry-item component-item">
                <span class="item-name">{{ comp.id }}</span>
                <span v-if="comp.title" class="item-title">{{ comp.title }}</span>
                <span v-if="comp.order !== undefined" class="item-order">Order: {{ comp.order }}</span>
              </div>
            </div>
          </div>
          <div v-if="filteredComponentCount === 0" class="empty-message">
            {{ searchQuery ? 'No matching components found' : 'No components registered' }}
          </div>
        </AccordionContent>
      </AccordionPanel>
    </Accordion>
  </div>
</template>

<style scoped>
.debug-registry {
  padding: 1rem;
  overflow-y: auto;
}

.search-toolbar {
  position: relative;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
}

.search-input {
  width: 100%;
  padding: 0.5rem 2rem 0.5rem 0.75rem;
  font-size: 0.875rem;
  border: 1px solid #cbd5e0;
  border-radius: 0.375rem;
}

.search-input:focus {
  outline: none;
  border-color: #2b6cb0;
  box-shadow: 0 0 0 3px rgba(43, 108, 176, 0.1);
}

.search-clear {
  position: absolute;
  right: 0.75rem;
  cursor: pointer;
  color: #718096;
  font-size: 1.125rem;
  padding: 0.25rem;
  line-height: 1;
  user-select: none;
}

.search-clear:hover {
  color: #2d3748;
}

.slot-group {
  margin-bottom: 1.5rem;
}

.slot-title {
  color: #1a1a1a;
  font-size: 0.95rem;
  font-weight: 500;
  margin: 0 0 0.75rem 0;
  padding-left: 0.5rem;
  border-left: 3px solid #cbd5e0;
}

.registry-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.registry-item {
  background: #f7fafc;
  padding: 0.5rem 0.75rem;
  border-radius: 0.25rem;
  font-family: var(--font-family-mono);
  font-size: 0.875rem;
  color: #2d3748;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.registry-item:hover {
  background: #edf2f7;
}

/* Emitter item styling */
.emitter-item {
  display: block;
}

.emitter-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.listeners-list {
  margin-top: 0.75rem;
  padding-left: 1rem;
  border-left: 2px solid #cbd5e0;
}

.listeners-label {
  color: #4a5568;
  font-size: 0.8rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
}

.listener-item {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.25rem 0;
  font-size: 0.8rem;
}

.listener-bullet {
  color: #718096;
  flex-shrink: 0;
}

.listener-source {
  color: #2f855a;
  word-break: break-all;
}

.listener-no-source {
  color: #a0aec0;
  font-style: italic;
}

.item-name {
  color: #2b6cb0;
  font-weight: 500;
  flex-shrink: 0;
}

.state-item {
  display: block;
}

.state-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.state-item .item-name {
  font-size: 0.875rem;
}

.state-item .item-value {
  color: #2f855a;
  word-break: break-word;
  font-size: 0.8rem;
  padding-left: 0.5rem;
}

.component-item {
  flex-wrap: wrap;
}

.item-title {
  color: #c05621;
  font-style: italic;
  font-size: 0.8rem;
}

.item-order {
  color: #6b46c1;
  font-size: 0.75rem;
  margin-left: auto;
}

.empty-message {
  color: #718096;
  font-style: italic;
  padding: 1rem;
  text-align: center;
}

/* Scrollbar styling */
.debug-registry::-webkit-scrollbar {
  width: 8px;
}

.debug-registry::-webkit-scrollbar-track {
  background: #f7fafc;
  border-radius: 4px;
}

.debug-registry::-webkit-scrollbar-thumb {
  background: #cbd5e0;
  border-radius: 4px;
}

.debug-registry::-webkit-scrollbar-thumb:hover {
  background: #a0aec0;
}
</style>
