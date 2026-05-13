<script setup lang="ts">
import { computed } from 'vue';
import type { SpineStats } from '../../../game/utils/spineRenderer';
import { findAutoplayedAnimations } from '../../../game/utils/spineAnimationGroups';

const props = defineProps<{
  stats: SpineStats | null;
  /** Character attributes — used to mark autoplayed chips. Omit for assets. */
  characterAttributes?: Record<string, unknown>;
  /** Asset's currently selected animation — that chip gets a "default" tag. */
  defaultAnimation?: string | null;
  /** Asset's currently selected skins — those chips get a "default" tag. */
  defaultSkins?: string[];
  /** Hide the bones/slots/constraints row (use when shown elsewhere). */
  hideCounts?: boolean;
}>();

const autoplayed = computed<Map<string, string | null>>(() => {
  const map = new Map<string, string | null>();
  if (!props.stats || !props.characterAttributes) return map;
  for (const entry of findAutoplayedAnimations(props.stats.animations, props.characterAttributes)) {
    map.set(entry.name, entry.groupName);
  }
  return map;
});

const defaultSkinSet = computed(() => new Set(props.defaultSkins ?? []));

function autoplayTooltip(groupName: string | null): string {
  if (groupName === null) {
    return 'Base animation — plays automatically on track 0. Rename it to "group_X" with a matching attribute on the character to make it switchable at runtime.';
  }
  return `Group "${groupName}" has no attribute on this character — playing first suffix by default. Add a "${groupName}" attribute to control which one plays.`;
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
          :class="{ autoplayed: autoplayed.has(name), 'is-default': defaultAnimation === name }"
          v-tooltip.top="autoplayed.has(name) ? autoplayTooltip(autoplayed.get(name) ?? null) : (defaultAnimation === name ? 'Currently selected — change in the picker above.' : undefined)"
        >
          <span class="chip-name">{{ name }}</span>
          <span v-if="autoplayed.has(name)" class="chip-tag">autoplayed</span>
          <span v-else-if="defaultAnimation === name" class="chip-tag">default</span>
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
          :class="{ 'is-default': defaultSkinSet.has(name) }"
          v-tooltip.top="defaultSkinSet.has(name) ? 'Currently selected — change in the picker above.' : undefined"
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
}

.chip.autoplayed,
.chip.is-default {
  background-color: #fff8e6;
  border-color: #f0d27a;
  cursor: help;
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
