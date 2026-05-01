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
    const loadedMods = await global.getModsList(gameId);
    availableMods.value = loadedMods.filter(m => global.isNsfwAllowed(m));

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
    <CustomComponentContainer :slot="COMPONENT_ID" :context="{ availableMods, selectedMods }" />
  </div>
</template>

<style scoped>
.mod-picker {
  padding: 4px;
  max-width: 800px;
  margin: 0 auto;
  color: rgba(216, 221, 228, 0.92);
}

.mod-picker h2 {
  margin: 0 0 16px;
  font-family: var(--font-family-serif);
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0.02em;
}

.warning-message {
  padding: 12px 14px;
  margin-bottom: 16px;
  font-size: 13px;
  line-height: 1.5;
  color: #ffd6a8;
  background: rgba(180, 110, 0, 0.18);
  border: 1px solid rgba(255, 180, 60, 0.45);
  border-radius: 10px;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
}

.warning-message strong {
  display: block;
  margin-bottom: 4px;
  color: #fff;
  font-weight: 600;
}

.mods-list {
  margin-bottom: 16px;
  overflow-y: auto;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.no-mods {
  padding: 24px;
  text-align: center;
  font-style: italic;
  color: rgba(216, 221, 228, 0.5);
}

.mod-item {
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.mod-item:hover {
  background: rgba(255, 255, 255, 0.07);
}

.mod-item.expanded {
  background: rgba(255, 255, 255, 0.08);
  border-color: var(--glass-tint);
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
  min-width: 0;
}

.mod-checkbox {
  margin-top: 3px;
  cursor: pointer;
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  accent-color: var(--glass-tint);
}

.mod-basic-info {
  flex: 1;
  min-width: 0;
}

.mod-name {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
  color: rgba(216, 221, 228, 0.95);
}

.mod-meta {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: rgba(216, 221, 228, 0.5);
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.expand-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  font-size: 12px;
  color: rgba(216, 221, 228, 0.7);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  position: relative;
  flex-shrink: 0;
}

.expand-button::before {
  content: '▶';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  transition: transform 0.2s;
  font-size: 9px;
}

.expand-button.expanded::before {
  content: '▼';
}

.expand-button:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.expand-button.expanded {
  background: var(--glass-tint);
  color: #0b0d10;
  border-color: var(--glass-tint);
}

.mod-details {
  margin-top: 12px;
  padding: 12px 14px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 10px;
}

.apply-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 28px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: #0b0d10;
  background: var(--glass-tint);
  border: 1px solid var(--glass-tint);
  border-radius: 12px;
  cursor: pointer;
  box-shadow: var(--glass-shadow);
  transition: transform 0.12s ease, filter 0.15s ease;
}

.apply-button:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.1);
}

.apply-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.mod-item.incompatible {
  opacity: 0.55;
}

.mod-item.incompatible .mod-name {
  color: rgba(216, 221, 228, 0.55);
}

.mod-checkbox:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.incompatible-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  background: rgba(192, 57, 43, 0.25);
  color: #ff8a80;
  border: 1px solid rgba(192, 57, 43, 0.5);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border-radius: 999px;
}

.mod-version-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 10px 12px;
  background: rgba(180, 80, 0, 0.18);
  border: 1px solid rgba(255, 160, 80, 0.4);
  border-radius: 8px;
  font-size: 12px;
  color: #ffd6a8;
  line-height: 1.4;
}

.mod-version-warning i {
  flex-shrink: 0;
  color: #ffb74d;
}
</style>
