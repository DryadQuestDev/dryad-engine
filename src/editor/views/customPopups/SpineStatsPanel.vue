<script setup lang="ts">
import { computed } from 'vue';
import type { SpineStats } from '../../../game/utils/spineRenderer';

const props = defineProps<{
  stats: SpineStats | null;
  /** Asset's currently selected animation — that chip gets a "default" tag. */
  defaultAnimation?: string | null;
  /** Asset's currently selected skins — those chips get a "default" tag. */
  defaultSkins?: string[];
  /** Hide the bones/slots/constraints row (use when shown elsewhere). */
  hideCounts?: boolean;
  /** Animations currently driven by the character's skin layers + attributes (green). */
  activeAnimations?: string[];
  /** Animations force-played via chip click (yellow, wins over green). */
  forcedAnimations?: string[];
  /** Skins currently driven by the character's skin layers + attributes (green). */
  activeSkins?: string[];
  /** Skins force-applied via chip click (yellow, wins over green). */
  forcedSkins?: string[];
  /** Makes chips clickable, emitting toggle-animation / toggle-skin. */
  interactive?: boolean;
}>();

const emit = defineEmits<{
  'toggle-animation': [name: string];
  'toggle-skin': [name: string];
}>();

const defaultSkinSet = computed(() => new Set(props.defaultSkins ?? []));
const activeAnimationSet = computed(() => new Set(props.activeAnimations ?? []));
const forcedAnimationSet = computed(() => new Set(props.forcedAnimations ?? []));
const activeSkinSet = computed(() => new Set(props.activeSkins ?? []));
const forcedSkinSet = computed(() => new Set(props.forcedSkins ?? []));

function chipClass(name: string, forced: Set<string>, active: Set<string>, isDefault: boolean) {
  return {
    'is-forced': forced.has(name),
    'is-active': !forced.has(name) && active.has(name),
    'is-default': isDefault,
    clickable: props.interactive,
  };
}

function chipTooltip(name: string, forced: Set<string>, active: Set<string>, isDefault: boolean): string | undefined {
  if (forced.has(name)) return 'Forced – click to release.';
  if (active.has(name)) {
    return props.interactive
      ? 'Active via skin layers/attributes – click to force it on.'
      : 'Active via skin layers/attributes.';
  }
  if (isDefault) return 'Currently selected — change in the picker above.';
  if (props.interactive) return 'Click to force it on.';
  return undefined;
}
</script>

<template>
  <div v-if="stats" class="spine-stats-panel">
    <section v-if="stats.animations.length > 0" class="section">
      <span class="stat-pill">
        <span class="stat-label">Animations</span><span class="stat-value">{{ stats.animations.length }}</span>
      </span>
      <div class="chip-list">
        <span
          v-for="name in stats.animations"
          :key="`a-${name}`"
          class="chip"
          :class="chipClass(name, forcedAnimationSet, activeAnimationSet, defaultAnimation === name)"
          v-tooltip.top="chipTooltip(name, forcedAnimationSet, activeAnimationSet, defaultAnimation === name)"
          @click="interactive && emit('toggle-animation', name)"
        >
          <span class="chip-name">{{ name }}</span>
          <span v-if="defaultAnimation === name" class="chip-tag">default</span>
        </span>
      </div>
    </section>

    <section v-if="stats.skins.length > 0" class="section">
      <span class="stat-pill">
        <span class="stat-label">Skins</span><span class="stat-value">{{ stats.skins.length }}</span>
      </span>
      <div class="chip-list">
        <span
          v-for="name in stats.skins"
          :key="`s-${name}`"
          class="chip"
          :class="chipClass(name, forcedSkinSet, activeSkinSet, defaultSkinSet.has(name))"
          v-tooltip.top="chipTooltip(name, forcedSkinSet, activeSkinSet, defaultSkinSet.has(name))"
          @click="interactive && emit('toggle-skin', name)"
        >
          <span class="chip-name">{{ name }}</span>
          <span v-if="defaultSkinSet.has(name)" class="chip-tag">default</span>
        </span>
      </div>
    </section>

    <div v-if="!hideCounts" class="other-stats">
      <span class="stat-pill"><span class="stat-label">Bones</span><span class="stat-value">{{ stats.bones }}</span></span>
      <span class="stat-pill"><span class="stat-label">Slots</span><span class="stat-value">{{ stats.slots }}</span></span>
      <span v-if="stats.ikConstraints > 0" class="stat-pill"><span class="stat-label">IK</span><span class="stat-value">{{ stats.ikConstraints }}</span></span>
      <span v-if="stats.transformConstraints > 0" class="stat-pill"><span class="stat-label">Transform</span><span class="stat-value">{{ stats.transformConstraints }}</span></span>
      <span v-if="stats.pathConstraints > 0" class="stat-pill"><span class="stat-label">Path</span><span class="stat-value">{{ stats.pathConstraints }}</span></span>
    </div>
  </div>
</template>

<style scoped>
.spine-stats-panel {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.6rem 0.75rem;
  background-color: #f5f5f5;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.other-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.stat-pill {
  display: inline-flex;
  align-self: flex-start;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.55rem;
  background-color: #fff;
  border: 1px solid #ddd;
  border-radius: 999px;
  font-size: 0.8rem;
  line-height: 1;
}

.stat-label {
  color: #666;
}

.stat-value {
  font-weight: 600;
  color: #333;
}

.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  padding: 0.4rem;
  background-color: #fff;
  border: 1px solid #e3e3e3;
  border-radius: 4px;
  max-height: 8rem;
  overflow-y: auto;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.15rem 0.5rem;
  background-color: #f0f0f0;
  border: 1px solid #ddd;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem;
  color: #333;
  user-select: none;
}

.chip.is-default {
  background-color: #fff8e6;
  border-color: #f0d27a;
  cursor: help;
}

/* Layer-driven (attributes/skin layers) — green */
.chip.is-active {
  background-color: #e8f5e9;
  border-color: #81c784;
  color: #1b5e20;
}

/* Force-toggled by the dev — yellow, wins over green and default styling */
.chip.is-forced {
  background-color: #fff3c4;
  border-color: #e0b000;
  color: #5a4500;
}

.chip.clickable {
  cursor: pointer;
}

.chip.clickable:hover {
  border-color: #999;
}

.chip.is-forced.clickable:hover {
  border-color: #a88400;
}

.chip-tag {
  padding: 0 0.3rem;
  background-color: #f0d27a;
  border-radius: 2px;
  font-family: inherit;
  font-size: 0.65rem;
  font-weight: 600;
  color: #5a4500;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  line-height: 1.2;
}
</style>
