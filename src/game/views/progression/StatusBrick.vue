<script setup lang="ts">
import { computed, markRaw } from 'vue';
import { Game } from '../../game';
import { Status } from '../../core/character/status';
import StatusCard from '../popups/cards/StatusCard.vue';
import { popover as vPopover } from '../../directives/popoverDirective';

// A single status "brick" — icon/name + polarity border, with the StatusCard on hover.
// `status` may be a status template id (string), a status def object, or an applied
// Status instance. Pass `characterId` (+ `statusInstanceIndex` for multi-stack) to show
// live stack/duration badges and resolve computed stats in the hover card.
const props = defineProps<{
  status: string | Status | Record<string, any>;
  characterId?: string;
  statusInstanceIndex?: number;
  /** When true, clicking the brick does nothing to the hover card (no pin) — use when the click is handled for selection. */
  disableClick?: boolean;
}>();

const game = Game.getInstance();

// markRaw'd so the v-popover binding doesn't re-wrap the component as reactive each render.
const StatusCardComp = markRaw(StatusCard);

const statusId = computed((): string =>
  typeof props.status === 'string' ? props.status : (props.status as any)?.id
);

// The registered def — fallback source for name/image/polarity when a bare id is passed.
const statusDef = computed(() => {
  const map = game.getData('character_statuses', true) as Map<string, any> | undefined;
  return map?.get(statusId.value);
});

// When a status object is passed, prefer its own fields; otherwise fall back to the def.
const source = computed((): Record<string, any> | undefined =>
  typeof props.status === 'string' ? statusDef.value : (props.status as any)
);

const character = computed(() =>
  props.characterId ? game.getCharacter(props.characterId) : undefined
);

// Applied instance, if the character actually carries the status — drives live badges.
const liveInstance = computed((): Status | undefined =>
  character.value?.getStatus(statusId.value)
);

const name = computed((): string =>
  source.value?.name || statusDef.value?.name || statusId.value
);

const image = computed((): string | undefined =>
  source.value?.image || statusDef.value?.image
);

const polarity = computed((): string =>
  source.value?.polarity || statusDef.value?.polarity || 'positive'
);

const stacks = computed((): number => {
  const live = liveInstance.value;
  if (!live) return 1;
  const idx = props.statusInstanceIndex;
  if (idx !== undefined && live.multiStack) {
    return live.getInstances()[idx]?.stacks ?? live.currentStacks;
  }
  return live.currentStacks;
});

const duration = computed((): number => {
  const live = liveInstance.value;
  if (!live) return 0;
  const idx = props.statusInstanceIndex;
  if (idx !== undefined && live.multiStack) {
    return live.getInstances()[idx]?.duration ?? live.duration;
  }
  return live.duration;
});

const isStackable = computed((): boolean => !!liveInstance.value?.isStackable());
</script>

<template>
  <div class="status-brick"
    :class="{
      'has-image': image,
      'polarity-positive': polarity === 'positive',
      'polarity-negative': polarity === 'negative',
      'polarity-neutral': polarity === 'neutral'
    }"
    v-popover="{ component: StatusCardComp, props: { statusId, characterId, statusInstanceIndex }, placement: 'left-start', disableClick }">
    <img v-if="image" :src="image" :alt="name" class="status-image" />
    <span v-else class="status-name">{{ name }}</span>
    <span v-if="isStackable && stacks > 1" class="stack-count">
      x{{ stacks }}
    </span>
    <span v-if="duration > 0" class="duration-count">
      {{ Math.ceil(duration) }}
    </span>
  </div>
</template>

<style scoped>
.status-brick {
  position: relative;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid #42b983;
  border-radius: 4px;
  padding: 0.4rem;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 50px;
}

.status-brick:hover {
  background: rgba(66, 185, 131, 0.15);
  border-color: #52c593;
}

.status-brick.polarity-negative {
  border-color: #e74c3c;
}

.status-brick.polarity-negative:hover {
  background: rgba(231, 76, 60, 0.15);
  border-color: #ef5f50;
}

.status-brick.polarity-neutral {
  border-color: #888;
}

.status-brick.polarity-neutral:hover {
  background: rgba(136, 136, 136, 0.15);
  border-color: #aaa;
}

.status-brick.has-image {
  padding: 1px;
  background: transparent;
}

.status-brick.has-image:hover {
  background: transparent;
}

.status-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  will-change: transform;
}

.status-name {
  font-size: 0.8rem;
  color: #ccc;
  padding: 0.2rem 0.4rem;
  white-space: nowrap;
}

.stack-count {
  position: absolute;
  bottom: -4px;
  right: -4px;
  background: #1a1a1a;
  border: 1px solid #ffd700;
  border-radius: 8px;
  padding: 0 4px;
  font-size: 0.7rem;
  font-weight: bold;
  color: #ffd700;
  line-height: 1.2;
}

.duration-count {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #1a1a1a;
  border: 1px solid #999;
  border-radius: 8px;
  padding: 0 4px;
  font-size: 0.65rem;
  color: #999;
  line-height: 1.2;
}
</style>
