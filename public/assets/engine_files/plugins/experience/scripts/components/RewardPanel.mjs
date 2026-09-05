/// <reference path="../dtypes.d.ts" />

const { game, vue, gsap } = window.engine;
const { computed, defineComponent, onMounted, reactive } = vue;

import { pendingReward, clearPending, getMc } from '../reward.mjs';

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
const ProgressBar = window.engine.components.ProgressBar;
const CustomComponentContainer = window.engine.components.CustomComponentContainer;

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
  components: { CharacterFace, ItemSlot, ProgressBar, CustomComponentContainer },
  setup(/** @type {{ result?: string }} */ props) {
    const pending = pendingReward;
    const line = (/** @type {string} */ id, /** @type {any} */ params) => game.getLine(id, params);

    // Item rewards render as engine ItemSlot bricks — rarity border, quantity badge, and the
    // hover ItemCard popup all come from the slot. Each entry shows a display CLONE of the real
    // dropped instance (actual scaled stats) with the GRANTED quantity, not the stack total.
    //
    // Under each brick sits a trash toggle. The loot is already in the party bag by the time the
    // panel builds, so the toggle can't refuse the pickup — it marks the line and clearPending
    // takes it back out on continue. Whether the toggle renders is the same pair of questions the
    // item card's Drop choice asks — the engine's own rule (isDroppable: quest items) plus the
    // game's `item_drop_render` veto — so protected kinds can't be thrown away here either.
    const partyInventory = game.getInventory('_party_inventory');
    const carrier = getMc();
    const lootRows = pending.value.items.map(entry => {
      const instance = partyInventory?.items.find(i => i.id === entry.id);
      if (!instance) return null;
      const clone = partyInventory.cloneItem(instance);
      clone.quantity = entry.quantity;
      return { entry, item: clone, canTrash: clone.isDroppable() && game.trigger('item_drop_render', clone, carrier) };
    }).filter(Boolean);

    const trashCount = computed(() => lootRows.filter(row => row.entry.trashed).length);
    function toggleTrash(/** @type {any} */ row) {
      row.entry.trashed = !row.entry.trashed;
    }

    const isDefeat = computed(() => props.result === 'defeat');
    const hasAny = computed(() => {
      const p = pending.value;
      return p.items.length > 0 || p.resources.length > 0 || p.characters.length > 0;
    });

    const statDefs = game.getData('character_stats', true);
    const statMeta = (/** @type {string} */ id) => {
      const def = statDefs?.get?.(id);
      return { name: def?.name || id, color: def?.color ? `#${def.color}` : '', isResource: !!def?.is_resource };
    };

    // A stat the party leader actually carries as a resource (pheromones, and anything like it)
    // reads as a bar filling toward its cap, not a bare number — the grant already happened, so
    // the bar starts at the pre-grant value and animates up to the real one. Everything else
    // (currencies, plain counters) keeps the one-line form.
    const resourceRows = pending.value.resources.map(r => {
      const meta = statMeta(r.id);
      const owner = r.characterId ? game.getCharacter(r.characterId) : null;
      const max = meta.isResource ? (owner?.getStat(r.id) || 0) : 0;
      const after = meta.isResource ? (owner?.getResource(r.id) || 0) : 0;
      const before = Math.max(0, after - r.amount);
      return reactive({
        ...r, ...meta, max, after, before,
        shown: before,
        barPct: max > 0 ? Math.min(100, 100 * before / max) : 0,
      });
    });

    // A resource belongs to the character who gained it, so it renders inside that character's
    // block next to their level-up and stat diffs. Anything without a recipient, or that is not
    // a resource at all (currencies), stays a loose line under the block list.
    const resourcesByCharacter = new Map();
    for (const r of resourceRows) {
      if (r.max <= 0 || !r.characterId) continue;
      if (!resourcesByCharacter.has(r.characterId)) resourcesByCharacter.set(r.characterId, []);
      resourcesByCharacter.get(r.characterId).push(r);
    }
    const looseLines = resourceRows.filter(r => r.max <= 0 || !r.characterId);

    const xpService = game.getService('xp');

    // Static per-row animation state — grants are complete before the panel mounts.
    const rows = pending.value.characters.map(c => {
      const character = game.getCharacter(c.id);
      const privateInv = character?.getPrivateInventory();
      // Level-up reward items land in the character's PRIVATE inventory — clone each as a display
      // brick showing the GRANTED quantity (not the running stack total), same as the party loot row.
      const items = (c.items || []).map(entry => {
        const instance = privateInv?.items.find(i => i.id === entry.id);
        if (!instance || !privateInv) return null;
        const clone = privateInv.cloneItem(instance);
        clone.quantity = entry.quantity;
        return clone;
      }).filter(Boolean);
      return reactive({
        ...c,
        character,
        items,
        hasXp: true,
        resources: resourcesByCharacter.get(c.id) || [],
        statLines: c.stats.map(s => ({ ...s, ...statMeta(s.id) })),
        shownLevel: c.levelFrom,
        shownXp: 0,
        barPct: Math.min(100, 100 * c.xpFrom / Math.max(1, xpService.getThreshold(c.levelFrom))),
        leveled: false,
        statsVisible: false,
      });
    });

    for (const [id, resources] of resourcesByCharacter) {
      if (rows.some(r => r.id === id)) continue;
      const character = game.getCharacter(id);
      rows.push(reactive({
        id, character, resources,
        name: character?.getName() || id,
        items: [], statLines: [], hasXp: false,
      }));
    }

    onMounted(() => {
      playSound('reward_sound_open');
      const tl = gsap.timeline();
      resourceRows.forEach((row, i) => {
        if (row.max <= 0) return;
        const at = 0.15 + i * 0.12;
        tl.to(row, { shown: row.after, duration: 0.9, ease: 'power1.out', snap: { shown: 1 } }, at);
        tl.to(row, { barPct: Math.min(100, 100 * row.after / row.max), duration: 0.9, ease: 'power1.inOut' }, at);
      });
      rows.forEach((row, i) => {
        if (!row.hasXp) return;
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

    return { pending, line, hasAny, isDefeat, looseLines, rows, lootRows, trashCount, toggleTrash };
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
              <template v-if="row.hasXp">
                <span class="reward-char-level" :class="{ leveled: row.leveled }">
                  {{ line('xp_label_level') }} {{ row.shownLevel }}
                </span>
                <span class="reward-char-gain">{{ line('reward_xp', { amount: Math.round(row.shownXp) }) }}</span>
              </template>
            </div>
            <div v-if="row.hasXp" class="reward-xpbar">
              <div class="reward-xpbar-fill" :style="{ width: row.barPct + '%' }"></div>
            </div>
            <div v-for="r in row.resources" :key="r.id" class="reward-resource">
              <ProgressBar :current="r.shown" :max="r.max" :label="r.name"
                           :barColor="r.color || undefined" width="100%" />
              <span class="reward-resource-gain" :style="r.color ? { color: r.color } : {}">+{{ r.amount }}</span>
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
            <div v-if="row.items.length" class="reward-char-items">
              <ItemSlot v-for="it in row.items" :key="it.uid" :item="it" :disabled="true" />
            </div>
          </div>
        </div>
      </div>

      <div v-if="looseLines.length" class="reward-lines">
        <div v-for="r in looseLines" :key="r.id" class="reward-line" :style="r.color ? { color: r.color } : {}">
          +{{ r.amount }} {{ r.name }}
        </div>
      </div>

      <div v-if="lootRows.length" class="reward-items">
        <div v-for="row in lootRows" :key="row.item.uid" class="reward-item"
             :class="{ 'is-trashed': row.entry.trashed }">
          <ItemSlot :item="row.item" :disabled="true" />
          <button v-if="row.canTrash" type="button" class="reward-trash"
                  :class="{ active: row.entry.trashed }"
                  :title="row.entry.trashed ? line('reward_trash_undo') : line('reward_trash')"
                  @click="toggleTrash(row)">
            <i class="pi" :class="row.entry.trashed ? 'pi-replay' : 'pi-trash'"></i>
          </button>
        </div>
      </div>
      <div v-if="trashCount" class="reward-trash-note">{{ line('reward_trash_note', { count: trashCount }) }}</div>
    </div>
    <CustomComponentContainer v-if="!isDefeat" :slot="'reward-panel-bottom'" :context="{ result }" />
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
