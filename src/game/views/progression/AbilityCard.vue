<script setup lang="ts">
import { computed } from 'vue';
import { Game } from '../../game';
import { Global } from '../../../global/global';
import CustomComponentContainer from '../CustomComponentContainer.vue';

const game = Game.getInstance();
const global = Global.getInstance();

const props = defineProps<{
  abilityId: string;
  characterId?: string;
  showDelta?: boolean;
  improvementData?: { meta: Record<string, any>, effects: Record<string, Record<string, any>> };
  isGranted?: boolean;
  isInactive?: boolean;
}>();

const lineContext = computed(() => {
  if (!props.characterId) return undefined;
  const char = game.getCharacter(props.characterId);
  return char ? { character: char } : undefined;
});

// Usable check — delegated to whatever gameplay system registered a checker (e.g. the battle plugin).
// Greys the card when a system reports the ability is currently unusable for this character.
// No characterId (no owner context) or no checker registered → treated as usable.
const usable = computed(() => {
  if (!props.characterId) return true;
  return game.isAbilityUsable(props.characterId, props.abilityId);
});

// Callers (e.g. StatusObjectDisplay's inactive improvements) drive the inactive state via the
// prop. Status-gated abilities themselves never reach a card — meta.require_status filters them
// out of the character's abilities entirely.
const isEffectivelyInactive = computed(() => props.isInactive ?? false);

// Get ability meta (name, icon, description)
const abilityMeta = computed((): Record<string, any> | undefined => {
  if (props.characterId) {
    const character = game.getCharacter(props.characterId);
    const ability = character?.getAbility(props.abilityId);
    if (ability) return ability.meta;
  }
  // Fall back to base template meta
  const template = game.characterSystem.abilityTemplatesMap.get(props.abilityId);
  return template?.meta;
});

const description = computed(() => {
  const delta = deltaData.value;
  if (delta) {
    // Overlay "base➜merged" strings onto base effects for inline display
    const displayEffects: Record<string, Record<string, any>> = {};
    for (const effectId in delta.baseData.effects) {
      displayEffects[effectId] = { ...delta.baseData.effects[effectId] };
      const mods = delta.modifiedEffects[effectId];
      if (mods) {
        for (const key in mods) displayEffects[effectId][key] = mods[key];
      }
    }
    return game.buildAbilityEffectsDescription({ effects: displayEffects }, props.characterId) as { name?: string, lines: string[] }[];
  }
  return game.buildAbilityEffectsDescription(props.abilityId, props.characterId) as { name?: string, lines: string[] }[];
});

const metaDescription = computed(() => {
  const delta = deltaData.value;
  if (delta && Object.keys(delta.metaDiff).length > 0) {
    const displayMeta = { ...delta.baseData.meta };
    for (const key in delta.metaDiff) displayMeta[key] = delta.metaDiff[key];
    return game.buildAbilityMetaDescription({ meta: displayMeta }, props.characterId);
  }
  return game.buildAbilityMetaDescription(props.abilityId, props.characterId);
});

// Check if ability has costs
const hasCosts = computed(() => {
  return abilityMeta.value?.costs && Object.keys(abilityMeta.value.costs).length > 0;
});

// Shared helpers for improvements/delta computation
type DeltaResult = { newEffects: Record<string, Record<string, any>>, modifiedEffects: Record<string, Record<string, any>>, metaDiff: Record<string, any>, baseData: { meta: Record<string, any>, effects: Record<string, Record<string, any>> } };

function getBaseTemplate(): { baseMeta: Record<string, any>, baseEffects: Record<string, Record<string, any>> } | null {
  const template = game.characterSystem.abilityTemplatesMap.get(props.abilityId);
  if (!template) return null;
  const baseEffects: Record<string, Record<string, any>> = {};
  if (Array.isArray(template.effects)) {
    for (const e of template.effects) {
      const key = e.id || 'undefined';
      baseEffects[key] = { ...(e.aspects || {}) };
      if (e.name) baseEffects[key].__name = e.name;
    }
  } else if (template.effects) {
    const effs = template.effects as any;
    for (const id in effs) baseEffects[id] = { ...effs[id] };
  }
  return { baseMeta: (template.meta || {}) as Record<string, any>, baseEffects };
}

// Structured delta marker for numeric aspects so renderers (e.g. powerScaledRenderer)
// can keep the merged value and still scale off it. resolveAspectValue's fallback path
// renders this object as `base➜merged` for aspects without a renderer.
const deltaNum = (base: number, merged: number) => ({ _base: base, _merged: merged });

// Resolve a raw value through locale (e.g. "physical" ➜ "Physical")
const resolveLocale = (val: any): string => {
  const s = String(val);
  return game.getLine(s) || s;
};

// Diff merged ability vs base — values are final merged (e.g. damage=120 vs base damage=100)
function diffEffectsMerged(sourceEffects: Record<string, Record<string, any>>, baseEffects: Record<string, Record<string, any>>) {
  const newEffects: Record<string, Record<string, any>> = {};
  const modifiedEffects: Record<string, Record<string, any>> = {};
  for (const effectId in sourceEffects) {
    const aspects = sourceEffects[effectId];
    const baseAspects = baseEffects[effectId];
    if (!baseAspects) {
      newEffects[effectId] = { ...aspects };
    } else {
      const diff: Record<string, any> = {};
      for (const key in aspects) {
        if (key.startsWith('__')) continue;
        const sv = aspects[key];
        const bv = baseAspects[key];
        if (typeof sv === 'number' && typeof bv === 'number') {
          if (sv !== bv) diff[key] = deltaNum(bv, sv);
        } else if (typeof sv === 'number' && bv === undefined) {
          diff[key] = deltaNum(0, sv);
        } else if (JSON.stringify(sv) !== JSON.stringify(bv)) {
          if (typeof sv === 'string' && typeof bv === 'string') {
            diff[key] = `${resolveLocale(bv)}➜${resolveLocale(sv)}`;
          } else {
            diff[key] = sv;
          }
        }
      }
      if (Object.keys(diff).length > 0) {
        if (baseAspects.__name) diff.__name = baseAspects.__name;
        modifiedEffects[effectId] = diff;
      }
    }
  }
  return { newEffects, modifiedEffects };
}

// Diff raw modifier data vs base — values are deltas (e.g. damage=+20)
function diffEffectsRaw(sourceEffects: Record<string, Record<string, any>>, baseEffects: Record<string, Record<string, any>>) {
  const newEffects: Record<string, Record<string, any>> = {};
  const modifiedEffects: Record<string, Record<string, any>> = {};
  for (const effectId in sourceEffects) {
    const aspects = sourceEffects[effectId];
    const baseAspects = baseEffects[effectId];
    if (!baseAspects) {
      newEffects[effectId] = { ...aspects };
    } else {
      const diff: Record<string, any> = {};
      for (const key in aspects) {
        if (key.startsWith('__')) continue;
        const sv = aspects[key];
        if (typeof sv === 'number') {
          const bv = baseAspects[key] || 0;
          diff[key] = deltaNum(bv, bv + sv);
        } else if (typeof sv === 'string') {
          const bv = baseAspects[key];
          if (typeof bv === 'string') {
            diff[key] = `${resolveLocale(bv)}➜${resolveLocale(sv)}`;
          } else {
            diff[key] = sv;
          }
        } else {
          diff[key] = sv;
        }
      }
      if (Object.keys(diff).length > 0) {
        if (baseAspects.__name) diff.__name = baseAspects.__name;
        modifiedEffects[effectId] = diff;
      }
    }
  }
  return { newEffects, modifiedEffects };
}

function diffMetaMerged(sourceMeta: Record<string, any>, baseMeta: Record<string, any>) {
  const metaDiff: Record<string, any> = {};
  for (const key in sourceMeta) {
    if (key.startsWith('__')) continue;
    const sv = sourceMeta[key];
    const bv = baseMeta[key];
    if (typeof sv === 'number' && typeof bv === 'number') {
      if (sv !== bv) metaDiff[key] = deltaNum(bv, sv);
    } else if (typeof sv === 'number' && bv === undefined) {
      metaDiff[key] = deltaNum(0, sv);
    } else if (bv !== undefined && JSON.stringify(sv) !== JSON.stringify(bv)) {
      if (typeof sv === 'string' && typeof bv === 'string') {
        metaDiff[key] = `${resolveLocale(bv)}➜${resolveLocale(sv)}`;
      } else {
        metaDiff[key] = sv;
      }
    }
  }
  return metaDiff;
}

function diffMetaRaw(sourceMeta: Record<string, any>, baseMeta: Record<string, any>) {
  const metaDiff: Record<string, any> = {};
  for (const key in sourceMeta) {
    if (key.startsWith('__')) continue;
    const sv = sourceMeta[key];
    if (typeof sv === 'number') {
      const bv = baseMeta[key] || 0;
      metaDiff[key] = deltaNum(bv, bv + sv);
    } else if (typeof sv === 'string') {
      const bv = baseMeta[key];
      if (typeof bv === 'string') {
        metaDiff[key] = `${resolveLocale(bv)}➜${resolveLocale(sv)}`;
      } else {
        metaDiff[key] = sv;
      }
    } else {
      metaDiff[key] = sv;
    }
  }
  return metaDiff;
}

const deltaData = computed((): DeltaResult | null => {
  const base = getBaseTemplate();
  if (!base) return null;
  const { baseMeta, baseEffects } = base;
  const baseData = { meta: baseMeta, effects: baseEffects };

  // Source 1: auto-compute from character's merged ability (ability viewer)
  if (props.showDelta && props.characterId) {
    const character = game.getCharacter(props.characterId);
    const merged = character?.getAbility(props.abilityId);
    if (!merged) return null;

    const { newEffects, modifiedEffects } = diffEffectsMerged(merged.effects, baseEffects);
    const metaDiff = diffMetaMerged(merged.meta, baseMeta);

    const hasChanges = Object.keys(newEffects).length > 0 || Object.keys(modifiedEffects).length > 0 || Object.keys(metaDiff).length > 0;
    return hasChanges ? { newEffects, modifiedEffects, metaDiff, baseData } : null;
  }

  // Source 2: externally provided modifier data (status popup)
  if (props.improvementData) {
    const { newEffects, modifiedEffects } = diffEffectsRaw(props.improvementData.effects || {}, baseEffects);
    const metaDiff = diffMetaRaw(props.improvementData.meta || {}, baseMeta);

    const hasChanges = Object.keys(newEffects).length > 0 || Object.keys(modifiedEffects).length > 0 || Object.keys(metaDiff).length > 0;
    return hasChanges ? { newEffects, modifiedEffects, metaDiff, baseData } : null;
  }

  return null;
});

const deltaNewDesc = computed(() => {
  if (!deltaData.value || !Object.keys(deltaData.value.newEffects).length) return [];
  return game.buildAbilityEffectsDescription(
    { effects: deltaData.value.newEffects }, props.characterId
  ) as { name?: string, lines: string[] }[];
});

// Helper to get stat display name
function getStatName(statId: string): string {
  return game.characterSystem.statsMap.get(statId)?.name || statId;
}

// Helper to get stat color (PrimeVue doesn't store #, so we add it)
function getStatColor(statId: string): string | undefined {
  const color = game.characterSystem.statsMap.get(statId)?.color;
  return color ? `#${color}` : undefined;
}

function getStatIcon(statId: string): string | undefined {
  return game.characterSystem.statsMap.get(statId)?.icon;
}
</script>

<template>
  <div v-if="!abilityMeta" class="ability-card ability-error">
    Ability "{{ abilityId }}" not found
  </div>

  <div v-else class="ability-card" :class="{ unusable: !usable }">
    <div class="card-header">
      <img v-if="abilityMeta.icon" :src="abilityMeta.icon" class="ability-icon"
        @error="(e) => (e.target as HTMLImageElement).style.display = 'none'" />
      <h3 class="ability-name">{{ abilityMeta.name || abilityId }}</h3>
      <div v-if="isGranted || improvementData || isEffectivelyInactive" class="ability-labels">
        <span v-if="isGranted" class="ability-label granted">{{ global.getString('ability_tag.granted') }}</span>
        <span v-if="improvementData" class="ability-label modified">{{ global.getString('ability_tag.modified')
          }}</span>
        <span v-if="isEffectivelyInactive" class="ability-label inactive">{{ global.getString('ability_tag.inactive')
        }}</span>
      </div>
      <CustomComponentContainer slot="ability-card-header" :context="{ abilityId, characterId }" />
    </div>

    <!-- Ability Meta Info (Cooldown & Costs) -->
    <div class="ability-meta" v-if="abilityMeta.cooldown || hasCosts">
      <span v-if="abilityMeta.cooldown" class="meta-item cooldown">
        {{ abilityMeta.cooldown }} {{ abilityMeta.cooldown === 1 ? 'turn' : 'turns' }}
      </span>
      <span v-for="(amount, statId) in abilityMeta.costs" :key="statId" class="meta-item cost"
        :style="getStatColor(String(statId)) ? { color: getStatColor(String(statId)) } : {}">
        {{ amount }}
        <img v-if="getStatIcon(String(statId))" :src="getStatIcon(String(statId))" class="cost-icon" />
        <template v-else>{{ getStatName(String(statId)) }}</template>
      </span>
      <CustomComponentContainer slot="ability-card-meta" :context="{ abilityId, characterId }" />
    </div>

    <div class="card-body">
      <div v-if="abilityMeta.description"
        v-script="{ html: abilityMeta.description, context: lineContext }"
        class="ability-description"></div>

      <div class="ability-details"
        v-if="metaDescription.length > 0 || description.length > 0 || deltaNewDesc.length > 0">
        <div v-for="(line, i) in metaDescription" :key="'m' + i" class="meta-desc-line"
          v-script="{ html: line, resolver: false, context: lineContext }"></div>
        <div v-for="(effect, i) in description" :key="'e' + i" class="effect-item">
          <div v-if="effect.name" class="effect-name">{{ effect.name }}</div>
          <div v-for="(line, j) in effect.lines" :key="j" class="effect-line"
            v-script="{ html: line, resolver: false, context: lineContext }">
          </div>
        </div>
        <div v-for="(effect, i) in deltaNewDesc" :key="'dn' + i" class="effect-item new-effect">
          <div v-if="effect.name" class="effect-name">{{ effect.name }}</div>
          <div v-for="(line, j) in effect.lines" :key="j" class="effect-line"
            v-script="{ html: line, resolver: false, context: lineContext }">
          </div>
        </div>
      </div>
    </div>

    <CustomComponentContainer slot="ability-card-footer" :context="{ abilityId, characterId }" />
  </div>
</template>

<style scoped>
.ability-card {
  background: rgba(26, 26, 26, 0.95);
  border: 2px solid #444;
  border-radius: 8px;
  padding: 12px;
  max-width: 400px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  color: #fff;
}

/* Unusable (a registered gameplay system reports the ability can't be used now) — greyed, mirrors
   the in-battle ability panel's disabled state. */
.ability-card.unusable {
  opacity: 0.6;
  border-color: rgba(255, 255, 255, 0.08);
}

.ability-card.unusable .ability-icon {
  filter: grayscale(1) brightness(0.5);
}

.ability-card.unusable .ability-name {
  color: rgba(255, 255, 255, 0.4);
}

.ability-error {
  border-color: #c62828;
  color: #ef9a9a;
  text-align: center;
  padding: 8px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid #555;
  padding-bottom: 8px;
  margin-bottom: 8px;
}

.ability-icon {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #555;
  flex-shrink: 0;
}

.ability-name {
  margin: 0;
  font-size: 1.15em;
  font-weight: bold;
  color: #42b983;
}

.ability-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 0.9em;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}

.cooldown {
  color: #f0c674;
}

.cooldown::before {
  content: '';
  width: 14px;
  height: 14px;
  background: url('/assets/engine_assets/icons/cooldown.svg') center/contain no-repeat;
  filter: brightness(0) invert(1) opacity(0.8);
  flex-shrink: 0;
}

.cost {
  color: #81a2be;
}

.cost-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  vertical-align: -2px;
}

.card-body {
  font-size: 1em;
}

.ability-description {
  color: #ccc;
  line-height: 1.4;
  margin-bottom: 8px;
}

.ability-details {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  padding: 8px;
}

.meta-desc-line {
  padding: 6px 8px;
  border-left: 3px solid #42b983;
  margin-bottom: 6px;
  color: #ddd;
  font-size: 0.9em;
  line-height: 1.4;
}

.effect-item {
  padding: 6px 8px;
  border-left: 3px solid #e1ff00;
  margin-bottom: 6px;
}

.ability-details> :last-child {
  margin-bottom: 0;
}

.effect-name {
  font-weight: 600;
  color: #e1ff00;
  margin-bottom: 4px;
  font-size: 0.9em;
}

.effect-line {
  color: #ddd;
  font-size: 0.9em;
  line-height: 1.4;
}

/* New effects (from delta) — gold variant of .effect-item */
.effect-item.new-effect {
  border-left-color: #f0c674;
}

.effect-item.new-effect .effect-name {
  color: #f0c674;
}

/* Label badges in header */
.ability-labels {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-left: auto;
  align-items: flex-end;
}

.ability-label {
  font-size: 0.8em;
  font-weight: 600;
  border-radius: 8px;
  padding: 1px 8px;
}

.ability-label.granted {
  color: #42b983;
  background: rgba(66, 185, 131, 0.15);
  border: 1px solid rgba(66, 185, 131, 0.3);
}

.ability-label.modified {
  color: #f0c674;
  background: rgba(240, 198, 116, 0.15);
  border: 1px solid rgba(240, 198, 116, 0.3);
}

.ability-label.inactive {
  color: #888;
  background: rgba(136, 136, 136, 0.15);
  border: 1px solid rgba(136, 136, 136, 0.3);
}
</style>
