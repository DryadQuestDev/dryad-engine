/// <reference path="../dtypes.d.ts" />

const { game, vue, gsap } = window.engine;
const { computed, defineComponent, onMounted, reactive } = vue;

import { pendingReward, clearPending } from '../reward.mjs';

// Pure display over the pending reward (grants happen in reward.mjs on battle_defeated / via the
// game's own actions). Mounted twice:
//   - slot `rpg-battle-result` (battle victory overlay; registered only when rpg_battler exists);
//   - popup `reward_popup` — opened by the delayed `xp` scene action and scripted wins; closing
//     it clears the pending reward and advances the scene.
// Each character with recorded XP gets a row: portrait, animated XP bar that rolls over on each
// level (level chip pops, level-up sound), gained-XP count-up, and the before → after stat diff
// the level-up statuses produced. Names/colors come off the game's own character_stats defs —
// the plugin names no game stat. Sounds are config-chosen from the game's sounds
// (reward_sound_open / reward_sound_level_up); unset = silent.

const CharacterFace = window.engine.components.CharacterFace;
const ItemSlot = window.engine.components.ItemSlot;

function getConfig() {
  return game.getData('plugins_data/experience/config_experience');
}

function playSound(/** @type {string} */ configKey) {
  const soundId = getConfig()?.[configKey];
  if (soundId) game.playSounds(soundId);
}

// @ts-ignore - Vue overload resolution false positive in .mjs
export const RewardPanel = defineComponent({
  props: ['result'],
  components: { CharacterFace, ItemSlot },
  setup(/** @type {{ result?: string }} */ props) {
    const pending = pendingReward;
    const line = (/** @type {string} */ id, /** @type {any} */ params) => game.getLine(id, params);

    // Item rewards render as engine ItemSlot bricks — rarity border, quantity badge, and the
    // hover ItemCard popup all come from the slot. Each entry shows a display CLONE of the real
    // dropped instance (actual scaled stats) with the GRANTED quantity, not the stack total.
    const partyInventory = game.getInventory('_party_inventory');
    const slotItems = pending.value.items.map(entry => {
      const instance = partyInventory?.items.find(i => i.id === entry.id);
      if (!instance) return null;
      const clone = partyInventory.cloneItem(instance);
      clone.quantity = entry.quantity;
      return clone;
    }).filter(Boolean);

    const isDefeat = computed(() => props.result === 'defeat');
    const hasAny = computed(() => {
      const p = pending.value;
      return p.items.length > 0 || p.resources.length > 0 || p.characters.length > 0;
    });

    const statDefs = game.getData('character_stats', true);
    const statMeta = (/** @type {string} */ id) => {
      const def = statDefs?.get?.(id);
      return { name: def?.name || id, color: def?.color ? `#${def.color}` : '' };
    };
    const resourceLines = computed(() => pending.value.resources.map(r => ({ ...r, ...statMeta(r.id) })));

    const xpService = game.getService('xp');

    // Static per-row animation state — grants are complete before the panel mounts.
    const rows = pending.value.characters.map(c => reactive({
      ...c,
      character: game.getCharacter(c.id),
      statLines: c.stats.map(s => ({ ...s, ...statMeta(s.id) })),
      shownLevel: c.levelFrom,
      shownXp: 0,
      barPct: Math.min(100, 100 * c.xpFrom / Math.max(1, xpService.getThreshold(c.levelFrom))),
      leveled: false,
      statsVisible: false,
    }));

    onMounted(() => {
      playSound('reward_sound_open');
      const tl = gsap.timeline();
      rows.forEach((row, i) => {
        const start = 0.15 + i * 0.2;
        tl.to(row, { shownXp: row.gained, duration: 0.9, ease: 'power1.out', snap: { shownXp: 1 } }, start);

        let at = start;
        for (let lvl = row.levelFrom; lvl <= row.levelTo; lvl++) {
          const threshold = Math.max(1, xpService.getThreshold(lvl));
          const from = lvl === row.levelFrom ? row.xpFrom : 0;
          const to = lvl === row.levelTo ? row.xpTo : threshold;
          if (lvl > row.levelFrom) {
            tl.call(() => {
              row.shownLevel = lvl;
              row.leveled = true;
              row.statsVisible = row.statLines.length > 0;
              playSound('reward_sound_level_up');
            }, undefined, at);
            tl.set(row, { barPct: 0 }, at);
          }
          const duration = Math.max(0.3, 0.7 * (to - from) / threshold);
          tl.to(row, { barPct: 100 * to / threshold, duration, ease: 'power1.inOut' }, at);
          at += duration + (lvl < row.levelTo ? 0.15 : 0);
        }
      });
    });

    return { pending, line, hasAny, isDefeat, resourceLines, rows, slotItems };
  },
  template: /*html*/`
    <div v-if="!isDefeat && hasAny" class="reward-panel">
      <div v-if="pending.debug" class="reward-debug">
        <span>{{ pending.debug.battleId }}</span>
        <span>threat {{ pending.debug.base }} → {{ pending.debug.threat }} (lv {{ pending.debug.level }} ×{{ pending.debug.scale }})</span>
        <span>xp {{ pending.debug.threatXp }}</span>
        <span>equip {{ pending.debug.equipBudget }}</span>
        <span>income {{ pending.debug.incomeBudget }} (payout {{ pending.debug.currencyPayout }})</span>
      </div>
      <div class="reward-title">{{ line('reward_title') }}</div>

      <div v-if="rows.length" class="reward-chars">
        <div v-for="row in rows" :key="row.id" class="reward-char">
          <CharacterFace v-if="row.character" :character="row.character" :size="52" borderRadius="10px" />
          <div class="reward-char-main">
            <div class="reward-char-head">
              <span class="reward-char-name">{{ row.name }}</span>
              <span class="reward-char-level" :class="{ leveled: row.leveled }">
                {{ line('xp_label_level') }} {{ row.shownLevel }}
              </span>
              <span class="reward-char-gain">{{ line('reward_xp', { amount: Math.round(row.shownXp) }) }}</span>
            </div>
            <div class="reward-xpbar">
              <div class="reward-xpbar-fill" :style="{ width: row.barPct + '%' }"></div>
            </div>
            <div v-if="row.statLines.length" class="reward-stats" :class="{ revealed: row.statsVisible }">
              <div v-for="s in row.statLines" :key="s.id" class="reward-stat">
                <span class="reward-stat-name" :style="s.color ? { color: s.color } : {}">{{ s.name }}</span>
                <span class="reward-stat-before">{{ s.before }}</span>
                <span class="reward-stat-arrow">→</span>
                <span class="reward-stat-after">{{ s.after }}</span>
                <span class="reward-stat-delta">+{{ s.after - s.before }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="resourceLines.length" class="reward-lines">
        <div v-for="r in resourceLines" :key="r.id" class="reward-line" :style="r.color ? { color: r.color } : {}">
          +{{ r.amount }} {{ r.name }}
        </div>
      </div>

      <div v-if="slotItems.length" class="reward-items">
        <ItemSlot v-for="it in slotItems" :key="it.uid" :item="it" :disabled="true" />
      </div>
    </div>
    `,
});

// Popup wrapper — modal card over the dimmed backdrop; closing advances the paragraph.
// @ts-ignore - Vue overload resolution false positive in .mjs
const RewardPopup = defineComponent({
  setup() {
    function close() {
      game.closePopup('reward_popup');
      clearPending();
      game.nextScene();
    }
    const continueLabel = game.getLine('reward_continue');
    return { close, continueLabel };
  },
  template: /*html*/`
    <div class="reward-popup">
      <RewardPanel />
      <button class="reward-continue" @click="close">{{ continueLabel }}</button>
    </div>
    `,
  components: { RewardPanel },
});

// The battle overlay slot only exists when the battle plugin is installed.
if (game.hasPlugin('rpg_battler')) {
  game.addComponent({
    id: 'reward_battle_panel',
    slot: 'rpg-battle-result',
    component: RewardPanel,
  });
}

game.addComponent({
  id: 'reward_popup',
  slot: 'popup',
  component: RewardPopup,
});
