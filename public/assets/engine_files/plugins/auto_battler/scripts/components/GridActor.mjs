/// <reference path="../dtypes.d.ts" />

const { game, vue } = window.engine;
const { computed, defineComponent } = vue;
const { CharacterFace, ProgressBar } = window.engine.components;

// Health bar color from stat definition (constant)
const healthStatColor = (() => {
  const stat = game.getData("character_stats", true)?.get("health");
  return stat?.color ? `#${stat.color}` : '#c0392b';
})();

export const GridActor = defineComponent({
  components: { CharacterFace, ProgressBar },
  props: ['character', 'isActive', 'borderColor'],
  setup(/** @type {{ character: Character, isActive: boolean, borderColor: string }} */ props) {
    const health = computed(() => props.character.getResource('health'));
    const maxHealth = computed(() => props.character.getStat('health'));
    const isDead = computed(() => health.value <= 0);

    // Battle statuses (status.meta.is_battle). One brick per instance for multi_stack statuses.
    // Definition map is still useful for display fallbacks (name/image/polarity), just not for meta.
    const battleStatuses = computed(() => {
      if (!props.character) return [];
      const statusDefs = game.getData("character_statuses", true);
      const out = [];
      for (const s of props.character.getStatuses()) {
        if (s.isHidden) continue;
        if (!s.meta?.is_battle) continue;
        const def = statusDefs?.get(s.id);
        const polarity = s.polarity || def?.polarity || 'neutral';
        const image = s.image || def?.image;
        const name = s.name || def?.name || s.id;
        if (s.multiStack) {
          const instances = s.getInstances();
          for (let i = 0; i < instances.length; i++) {
            out.push({ key: s.id + '_' + i, id: s.id, name, image, stacks: instances[i].stacks, maxStacks: s.maxStacks, polarity });
          }
        } else {
          out.push({ key: s.id, id: s.id, name, image, stacks: s.currentStacks, maxStacks: s.maxStacks, polarity });
        }
      }
      return out;
    });

    return { health, maxHealth, healthStatColor, isDead, battleStatuses };
  },
  template: /*html*/`
    <div class="grid-actor" :class="{ active: isActive, dead: isDead }">
      <CharacterFace :character="character"
        :size="100" :showName="true" nameStyle="overlay" :borderRadius="8"
        :borderColor="borderColor"
        :static-face-force="true"
        />
      <div class="grid-actor-overlay">
        <div class="grid-actor-health">
          <ProgressBar :current="health" :max="maxHealth"
            :barColor="healthStatColor" bgColor="rgba(0,0,0,0.5)"
            width="100%" height="16px" :hideMax="true" />
        </div>
        <div v-if="battleStatuses.length > 0" class="grid-actor-tokens">
          <div v-for="s in battleStatuses" :key="s.key" class="grid-actor-token"
            :class="[s.polarity]" :title="s.name + ' x' + s.stacks">
            <img v-if="s.image" :src="s.image" class="token-icon" />
            <span v-if="s.maxStacks !== 1" class="token-stacks">{{ s.stacks }}</span>
          </div>
        </div>
      </div>
    </div>
  `
});
