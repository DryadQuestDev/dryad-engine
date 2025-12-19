<script setup lang="ts">
import { Game } from '../../game/game';
import CustomComponentContainer from '../../game/views/CustomComponentContainer.vue';
import { Global } from '../../global/global';
import { ref, onMounted } from 'vue';
import { ManifestObject } from '../../schemas/manifestSchema';
import ManifestInfo from './ManifestInfo.vue';
import { checkManifestCompatibility } from '../../utility/version-checker';

const game = Game.getInstance();
const global = Global.getInstance();

const COMPONENT_ID = 'mod-picker';

// State
const availableMods = ref<ManifestObject[]>([]);
const selectedMods = ref<Set<string>>(new Set());
const expandedMod = ref<string | null>(null);
const isLoading = ref(false);

// Load available mods
onMounted(async () => {
  const gameId = game.coreSystem.gameId;
  if (!gameId) {
    console.error('No game loaded');
    return;
  }

  try {
    availableMods.value = await global.getModsList(gameId);

    // Pre-select currently active mods
    const currentModList = game.coreSystem.modList || [];
    currentModList.forEach(modId => {
      if (modId !== '_core') { // Don't include core in selection
        selectedMods.value.add(modId);
      }
    });
  } catch (error) {
    console.error('Failed to load mods:', error);
    global.addNotification('Failed to load mods');
  }
});

// Check if a mod is compatible with current engine version
function isModCompatible(mod: ManifestObject): boolean {
  const result = checkManifestCompatibility(
    global.engineVersion,
    mod.engine_version_min,
    global.getString.bind(global)
  );
  return result.isCompatible;
}

// Get warning message for a mod
function getModWarning(mod: ManifestObject): string | undefined {
  const result = checkManifestCompatibility(
    global.engineVersion,
    mod.engine_version_min,
    global.getString.bind(global)
  );
  return result.warningMessage;
}

function toggleMod(modId: string) {
  const mod = availableMods.value.find(m => m.id === modId);
  if (!mod) return;

  // Check if mod is compatible before allowing selection
  if (!isModCompatible(mod)) {
    global.addNotification(getModWarning(mod) || global.getString('version_incompatible_generic'));
    return;
  }

  if (selectedMods.value.has(modId)) {
    selectedMods.value.delete(modId);
  } else {
    selectedMods.value.add(modId);
  }
}

function isModSelected(modId: string): boolean {
  return selectedMods.value.has(modId);
}

function isModExpanded(modId: string): boolean {
  return expandedMod.value === modId;
}

function toggleModExpanded(modId: string) {
  expandedMod.value = expandedMod.value === modId ? null : modId;
}

async function applyModChanges() {
  if (!game.coreSystem.gameId) {
    global.addNotification('No game loaded');
    return;
  }

  isLoading.value = true;

  try {
    // Update the mod list in the game instance
    // Build new mod list: selected mods + _core (core must always be included)
    const newModList: string[] = [];

    // Add selected mods (sorted by their load_order)
    const selectedModsWithMeta = availableMods.value
      .filter(mod => selectedMods.value.has(mod.id || ''))
      .sort((a, b) => (a.load_order || 0) - (b.load_order || 0));

    for (const mod of selectedModsWithMeta) {
      if (mod.id) {
        newModList.push(mod.id);
      }
    }

    // Always add _core at the end (it should be last in load order)
    newModList.push('_core');

    // Update the game's modList
    game.coreSystem.modList = newModList;

    console.log('New mod list:', newModList);

    // Save current game state to temporary slot
    await game.saveGame('__load_temporary_save__');

    // Set up localStorage to reload the game after refresh
    localStorage.setItem('game_loading_slot', '__load_temporary_save__');
    localStorage.setItem('game_loading_game_id', game.coreSystem.gameId);

    // Reload the page to apply mod changes
    window.location.reload();
  } catch (error) {
    console.error('Failed to apply mod changes:', error);
    global.addNotification('Failed to apply mod changes');
    isLoading.value = false;
  }
}

</script>

<template>
  <div :id="COMPONENT_ID" class="mod-picker">
    <h2>Mod Manager</h2>

    <div class="warning-message">
      <strong>Warning:</strong> Please always have a backup save file before changing mods. Incompatible mods can cause
      unexpected game errors.
    </div>

    <div class="mods-list">
      <div v-if="availableMods.length === 0" class="no-mods">
        No mods available for this game.
      </div>
      <div v-else>
        <div v-for="mod in availableMods" :key="mod.id" class="mod-item"
          :class="{ 'expanded': isModExpanded(mod.id || ''), 'incompatible': !isModCompatible(mod) }">
          <div class="mod-header-row">
            <label class="mod-label" @click.stop>
              <input type="checkbox" :checked="isModSelected(mod.id || '')" @change="toggleMod(mod.id || '')"
                class="mod-checkbox" :disabled="!isModCompatible(mod)" />
              <div class="mod-basic-info">
                <div class="mod-name">
                  {{ mod.name }}
                  <span v-if="!isModCompatible(mod)" class="incompatible-badge">Incompatible</span>
                </div>
                <div class="mod-meta">
                  <span v-if="mod.author">by {{ mod.author }}</span>
                  <span v-if="mod.version">v{{ mod.version }}</span>
                </div>
              </div>
            </label>
            <button class="expand-button" @click="toggleModExpanded(mod.id || '')"
              :class="{ 'expanded': isModExpanded(mod.id || '') }"></button>
          </div>

          <!-- Version Warning -->
          <div v-if="!isModCompatible(mod)" class="mod-version-warning">
            <i class="pi pi-exclamation-triangle"></i>
            <span>{{ getModWarning(mod) }}</span>
          </div>

          <!-- Expanded Details -->
          <div v-if="isModExpanded(mod.id || '')" class="mod-details">
            <ManifestInfo :manifest="mod" :hide-header="true" />
          </div>
        </div>
      </div>
    </div>

    <div class="actions">
      <button @click="applyModChanges" :disabled="isLoading" class="apply-button">
        {{ isLoading ? 'Applying...' : 'Set Mods' }}
      </button>
    </div>

    <!-- Custom components registered to this container -->
    <CustomComponentContainer :slot="COMPONENT_ID" />
  </div>
</template>

<style scoped>
.mod-picker {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.mod-picker h2 {
  margin-bottom: 20px;
}

.warning-message {
  background-color: #fff3cd;
  border: 1px solid #ffc107;
  color: #856404;
  padding: 15px;
  margin-bottom: 20px;
  border-radius: 4px;
}

.warning-message strong {
  display: block;
  margin-bottom: 5px;
}

.mods-list {
  margin-bottom: 20px;
  /*max-height: 500px;*/
  overflow-y: auto;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 10px;
}

.no-mods {
  padding: 20px;
  text-align: center;
  color: #666;
}

.mod-item {
  padding: 10px;
  border-bottom: 1px solid #eee;
  transition: background-color 0.2s;
}

.mod-item:last-child {
  border-bottom: none;
}

.mod-item.expanded {
  background-color: #f8f9fa;
}

.mod-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.mod-label {
  display: flex;
  align-items: flex-start;
  cursor: pointer;
  gap: 10px;
  flex: 1;
}

.mod-checkbox {
  margin-top: 5px;
  cursor: pointer;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.mod-basic-info {
  flex: 1;
}

.mod-name {
  font-weight: bold;
  margin-bottom: 5px;
}

.mod-meta {
  font-size: 0.8em;
  color: #999;
  display: flex;
  gap: 15px;
}

.expand-button {
  background: none;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 14px;
  color: #666;
  transition: all 0.2s;
  position: relative;
  width: 32px;
  height: 32px;
}

.expand-button::before {
  content: '▶';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  transition: transform 0.2s;
}

.expand-button.expanded::before {
  content: '▼';
}

.expand-button:hover {
  background-color: #e9ecef;
  border-color: #adb5bd;
}

.expand-button.expanded {
  background-color: #007bff;
  color: white;
  border-color: #007bff;
}

.mod-details {
  margin-top: 15px;
  padding: 15px;
  background-color: white;
  border-radius: 4px;
  border: 1px solid #ddd;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.apply-button {
  padding: 10px 30px;
  font-size: 16px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.apply-button:hover:not(:disabled) {
  background-color: #0056b3;
}

.apply-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

/* Incompatible mod styling */
.mod-item.incompatible {
  opacity: 0.6;
  background-color: #fafafa;
}

.mod-item.incompatible .mod-name {
  color: #999;
}

.mod-checkbox:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.incompatible-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  background-color: #ffccbc;
  color: #d84315;
  font-size: 0.75em;
  border-radius: 3px;
  font-weight: 600;
}

.mod-version-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 10px;
  background-color: #fff4e5;
  border-left: 3px solid #ff9800;
  font-size: 0.85em;
  color: #e65100;
  line-height: 1.4;
}

.mod-version-warning i {
  flex-shrink: 0;
}
</style>
