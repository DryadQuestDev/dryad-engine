<script setup lang="ts">
import { computed } from 'vue';
import { ManifestObject } from '../../../schemas/manifestSchema';
import { checkManifestCompatibility } from '../../../utility/version-checker';
import { Global } from '../../global';

const props = defineProps<{
  mods: ManifestObject[];
  activeMods: ManifestObject[];
  selectedMod: ManifestObject | null;
}>();

const emit = defineEmits<{
  (e: 'toggle-mod', mod: ManifestObject): void;
  (e: 'select-mod', mod: ManifestObject): void;
}>();

const global = Global.getInstance();

const hasMods = computed(() => props.mods.length > 0);

function isModActive(mod: ManifestObject): boolean {
  return props.activeMods.some(m => m.id === mod.id);
}

function isModSelected(mod: ManifestObject): boolean {
  return props.selectedMod?.id === mod.id;
}

function isModCompatible(mod: ManifestObject): boolean {
  return checkManifestCompatibility(
    global.engineVersion,
    mod.engine_version_min,
    global.getString.bind(global)
  ).isCompatible;
}

function getModWarning(mod: ManifestObject): string | undefined {
  return checkManifestCompatibility(
    global.engineVersion,
    mod.engine_version_min,
    global.getString.bind(global)
  ).warningMessage;
}

function toggleMod(mod: ManifestObject) {
  if (!isModCompatible(mod)) {
    global.addNotification(getModWarning(mod) || global.getString('version_incompatible_generic'));
    return;
  }
  emit('toggle-mod', mod);
}

function selectMod(mod: ManifestObject) {
  emit('select-mod', mod);
}
</script>

<template>
  <div v-if="hasMods" class="mods-strip">
    <span class="mods-strip-label">Available Mods</span>
    <div v-for="mod in mods" :key="mod.id || mod.uid" class="mods-strip-chip" :class="{
      active: isModActive(mod),
      selected: isModSelected(mod),
      disabled: !isModCompatible(mod)
    }">
      <button type="button" class="mods-strip-check" :class="{ on: isModActive(mod) }" :disabled="!isModCompatible(mod)"
        :title="isModActive(mod) ? 'Deactivate' : 'Activate'" :aria-pressed="isModActive(mod)" @click="toggleMod(mod)">
        <i v-if="isModActive(mod)" class="pi pi-check"></i>
      </button>
      <button type="button" class="mods-strip-name" :title="!isModCompatible(mod) ? getModWarning(mod) : mod.name"
        @click="selectMod(mod)">
        {{ mod.name }}
        <span v-if="!isModCompatible(mod)" class="mods-strip-warn">!</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.mods-strip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.mods-strip-label {
  font-size: 11px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(216, 221, 228, 0.5);
  margin-right: 4px;
}

.mods-strip-chip {
  display: inline-flex;
  align-items: stretch;
  background: var(--glass-bg);
  border: var(--glass-border);
  border-radius: 999px;
  overflow: hidden;
  backdrop-filter: var(--glass-blur);
  -webkit-backdrop-filter: var(--glass-blur);
  transition: border-color 0.15s ease, background 0.15s ease;
}

.mods-strip-chip.selected {
  border-color: var(--glass-tint);
}

.mods-strip-chip.disabled {
  opacity: 0.55;
}

.mods-strip-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  padding: 0;
  font-family: inherit;
  color: rgba(216, 221, 228, 0.6);
  background: rgba(0, 0, 0, 0.18);
  border: none;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  font-size: 11px;
}


.mods-strip-check:disabled {
  cursor: not-allowed;
}

.mods-strip-check.on {
  color: #0b0d10;
  background: var(--glass-tint);
  border-right-color: transparent;
}

.mods-strip-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  max-width: 220px;
  font-family: inherit;
  font-size: 12px;
  color: rgba(216, 221, 228, 0.85);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mods-strip-name:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.06);
}

.mods-strip-chip.selected .mods-strip-name {
  color: #fff;
}

.mods-strip-warn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-weight: bold;
  color: #fff;
  background: #c0392b;
  border-radius: 50%;
  font-size: 10px;
  flex-shrink: 0;
}

@supports not (backdrop-filter: blur(1px)) {
  .mods-strip-chip {
    background: rgba(20, 24, 29, 0.92);
  }
}

@media (pointer: coarse), (max-width: 600px) {
  .mods-strip {
    gap: 10px;
  }
  .mods-strip-label {
    font-size: 13px;
  }
  .mods-strip-check {
    width: 40px;
    font-size: 14px;
  }
  .mods-strip-name {
    padding: 12px 16px;
    font-size: 14px;
    max-width: none;
  }
  .mods-strip-warn {
    width: 20px;
    height: 20px;
    font-size: 12px;
  }
}
</style>
