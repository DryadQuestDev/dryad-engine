<script setup lang="ts">
import { computed } from 'vue';
import { shouldShowEntityIds } from '../../../utils/idBadge';
import { Game } from '../../../game';
import { Global } from '../../../../global/global';
import StatusObjectDisplay from '../../progression/StatusObjectDisplay.vue';
import { isSkillVisible, isSkillDisabledByParams } from '../../progression/useSkillParams';
import { getShapePath, ShapeType } from '../../../../utility/shapes';

const showIds = computed(() => shouldShowEntityIds());

const props = defineProps<{
    treeId: string;
    slotId: string;
    characterId: string;
}>();

const game = Game.getInstance();
const global = Global.getInstance();

const character = computed(() => game.getCharacter(props.characterId));
const activeTree = computed(() => game.characterSystem.skillTreesMap.get(props.treeId));

// The skill placement object inside this tree (has price, parent_skills, max_upgrade_level, skill ref)
const skill = computed(() =>
    activeTree.value?.skills?.find((s: any) => s.id === props.slotId) ?? null
);

// Skill slot definition (shared, name/description/image/status)
const skillSlotData = computed(() => {
    const skillKey = skill.value?.skill;
    return skillKey ? game.characterSystem.skillSlotsMap.get(skillKey) : undefined;
});

function getLearnedSkillLevelBySlotId(slotId: string | undefined): number {
    if (!slotId) return 0;
    const learned = character.value?.learnedSkills.find(
        s => s.skillTreeId === props.treeId && s.id === slotId
    );
    return learned?.level || 0;
}

const currentLevel = computed(() => getLearnedSkillLevelBySlotId(props.slotId));
const maxLevel = computed(() => skill.value?.max_upgrade_level || 1);

function isSkillLearnable(s: any): boolean {
    if (!s) return false;
    if (isSkillDisabledByParams(s)) return false;
    if (!s.parent_skills || s.parent_skills.length === 0) return true;
    return s.parent_skills.some((parentSlotId: string) => {
        const parentSkill = activeTree.value?.skills?.find((p: any) => p.id === parentSlotId);
        if (!parentSkill) return false;
        if (!isSkillVisible(parentSkill)) return false;
        return getLearnedSkillLevelBySlotId(parentSlotId) >= 1;
    });
}

function canAffordSkill(s: any): boolean {
    if (!s?.price || Object.keys(s.price).length === 0) return true;
    const inv = activeTree.value?.is_private
        ? character.value?.getPrivateInventory()
        : character.value?.getPartyInventory();
    if (!inv) return false;
    return inv.canAffordPrice(s.price);
}

const canLearn = computed(() =>
    !!skill.value && isSkillLearnable(skill.value) && canAffordSkill(skill.value) && currentLevel.value < maxLevel.value
);

function canRefundSkill(slotId: string): boolean {
    if (!activeTree.value?.skills) return false;
    const childSkills = activeTree.value.skills.filter((s: any) => s.parent_skills?.includes(slotId));
    for (const child of childSkills) {
        const childLevel = getLearnedSkillLevelBySlotId(child.id);
        if (childLevel > 0) {
            const learnedParents = child.parent_skills?.filter((pid: string) => getLearnedSkillLevelBySlotId(pid) > 0) || [];
            if (learnedParents.length === 1) return false;
        }
    }
    return true;
}

const canRefund = computed(() => canRefundSkill(props.slotId));

// The card's icon mirrors the tree node: same shape, same clip, same accent-colored border.
const ICON_SIZE = 40;
const iconShape = computed((): ShapeType => (skillSlotData.value?.shape as ShapeType) || 'circle');
const iconClipId = computed(() => `skill-card-clip-${props.treeId}-${props.slotId}`);

function getSkillName(skillId: string | undefined): string {
    if (!skillId) return '';
    const data = game.characterSystem.skillSlotsMap.get(skillId);
    return data?.name || skillId;
}

const formattedPrice = computed(() => {
    const s = skill.value;
    if (!s?.price || Object.keys(s.price).length === 0) return [];
    const inv = activeTree.value?.is_private
        ? character.value?.getPrivateInventory()
        : character.value?.getPartyInventory();
    return Object.entries(s.price).map(([currencyId, amount]) => {
        const template = game.itemSystem.itemTemplatesMap.get(currencyId);
        const available = inv?.getItemQuantity(currencyId) || 0;
        return {
            id: currencyId,
            image: (template?.traits as any)?.image || '',
            price: amount,
            available,
            affordable: available >= (amount as number),
        };
    });
});

const formattedRefund = computed(() => {
    const refundFactor = activeTree.value?.refund_factor || 0;
    const s = skill.value;
    if (refundFactor === 0 || !s?.price || Object.keys(s.price).length === 0) return [];
    const lvl = currentLevel.value;
    if (lvl === 0) return [];
    return Object.entries(s.price).map(([currencyId, amount]) => {
        const template = game.itemSystem.itemTemplatesMap.get(currencyId);
        return {
            id: currencyId,
            image: (template?.traits as any)?.image || '',
            amount: Math.ceil((amount as number) * lvl * refundFactor),
        };
    });
});

function learn() {
    const s = skill.value;
    if (!s || !s.id || !canLearn.value || !character.value) return;
    const inv = activeTree.value?.is_private ? character.value.getPrivateInventory() : character.value.getPartyInventory();
    if (!inv) { global.addNotification('No inventory available'); return; }
    if (s.price && Object.keys(s.price).length > 0) {
        if (!inv.deductCurrency(s.price)) return;
    }
    character.value.learnSkill(props.treeId, s.id, 1);
    global.addNotification(`Learned ${getSkillName(s.skill)}!`);
}

function refund() {
    const s = skill.value;
    if (!s || !s.id || !canRefund.value || !character.value) return;
    character.value.unlearnSkill(props.treeId, s.id);
    global.addNotification(`Refunded ${getSkillName(s.skill)}!`);
}
</script>

<template>
    <div v-if="skill && skillSlotData" class="popup-inner skill-card"
        :class="{ learned: currentLevel > 0, maxed: currentLevel >= maxLevel }">
        <div class="popup-header">
            <svg v-if="skillSlotData.image" class="skill-icon" :width="ICON_SIZE + 2" :height="ICON_SIZE + 2"
                :viewBox="`-1 -1 ${ICON_SIZE + 2} ${ICON_SIZE + 2}`">
                <defs>
                    <clipPath :id="iconClipId">
                        <circle v-if="iconShape === 'circle'" :r="ICON_SIZE / 2" :cx="ICON_SIZE / 2"
                            :cy="ICON_SIZE / 2" />
                        <path v-else :d="getShapePath(iconShape, ICON_SIZE)" />
                    </clipPath>
                </defs>
                <image :href="skillSlotData.image" x="0" y="0" :width="ICON_SIZE" :height="ICON_SIZE"
                    preserveAspectRatio="xMidYMid slice" :clip-path="`url(#${iconClipId})`" />
                <circle v-if="iconShape === 'circle'" :r="ICON_SIZE / 2" :cx="ICON_SIZE / 2" :cy="ICON_SIZE / 2"
                    fill="none" stroke="var(--skill-accent)" stroke-width="2" />
                <path v-else :d="getShapePath(iconShape, ICON_SIZE)" fill="none" stroke="var(--skill-accent)"
                    stroke-width="2" />
            </svg>
            <span class="popup-title">{{ skillSlotData.name || skill.skill }}
                <span v-if="showIds" class="entity-id-badge">{{ slotId }}</span>
            </span>
        </div>

        <div v-if="skillSlotData.description"
            v-script="{ html: skillSlotData.description, context: { character } }"
            class="popup-description"></div>

        <div class="skill-level">
            <span>Level: {{ currentLevel }} / {{ maxLevel }}</span>
        </div>

        <div v-if="currentLevel < maxLevel && formattedPrice.length > 0" class="skill-currency">
            <div v-for="c in formattedPrice" :key="c.id" class="currency-item" :class="{ unaffordable: !c.affordable }">
                <img v-if="c.image" :src="c.image" class="currency-icon" />
                <span class="currency-price">{{ c.price }}</span>
                <span class="currency-separator">/</span>
                <span class="currency-available">{{ c.available }}</span>
            </div>
        </div>

        <button v-if="currentLevel < maxLevel"
            :disabled="!canLearn"
            :class="['learn-button', { disabled: !canLearn }]"
            @click="learn">
            {{ canLearn ? 'Learn' : (skill && isSkillLearnable(skill) ? 'Cannot Afford' : 'Locked') }}
        </button>

        <div v-if="formattedRefund.length > 0" class="skill-refund">
            <div v-for="c in formattedRefund" :key="c.id" class="refund-item">
                <img v-if="c.image" :src="c.image" class="currency-icon" />
                <span class="refund-amount">{{ c.amount }}</span>
            </div>
        </div>

        <button v-if="(activeTree?.refund_factor || 0) > 0 && currentLevel > 0"
            :disabled="!canRefund"
            :class="['refund-button', { disabled: !canRefund }]"
            @click="refund">
            {{ canRefund ? 'Refund' : 'Cannot Refund' }}
        </button>

        <StatusObjectDisplay v-if="skillSlotData.status" :data="skillSlotData.status"
            :multiplier="currentLevel || undefined"
            :isActive="currentLevel > 0" />
    </div>
    <div v-else class="popup-inner popup-error">
        Unknown skill: {{ treeId }}/{{ slotId }}
    </div>
</template>

<style scoped>
/* Same three states, and the same colors, as the node's SVG stroke in SkillSlot.vue — the card must
   read as the node you just clicked, so both take their color from this one variable. */
.skill-card {
    color: inherit;
    --skill-accent: #666666;
}

.skill-card.learned { --skill-accent: #4CAF50; }
.skill-card.maxed { --skill-accent: #FFC107; }

.skill-card.learned .popup-title,
.skill-card.learned .skill-level { color: var(--skill-accent); }

.skill-icon {
    flex: 0 0 auto;
}

.skill-level {
    color: #ccc;
    margin-bottom: 8px;
    font-weight: bold;
}

.skill-currency {
    margin-bottom: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.currency-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(66, 185, 131, 0.4);
    border-radius: 4px;
}

.currency-icon { width: 20px; height: 20px; object-fit: contain; }

.currency-price { font-size: 1em; font-weight: bold; color: #42b983; }
.currency-separator { font-size: 1em; color: #666; margin: 0 2px; }
.currency-available { font-size: 1em; font-weight: bold; color: #ccc; }

.currency-item.unaffordable { border-color: rgba(231, 76, 60, 0.45); }
.currency-item.unaffordable .currency-price,
.currency-item.unaffordable .currency-available { color: #e74c3c; }

.learn-button {
    width: 100%;
    padding: 10px;
    background-color: #42b983;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 1em;
    font-weight: bold;
    cursor: pointer;
    transition: background-color 0.2s ease;
}

.learn-button:hover:not(.disabled) { background-color: #35a372; }
.learn-button.disabled { background-color: #555; color: #888; cursor: not-allowed; }

.skill-refund {
    margin-top: 12px;
    margin-bottom: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.refund-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background-color: rgba(231, 76, 60, 0.1);
    border: 1px solid rgba(231, 76, 60, 0.3);
    border-radius: 4px;
}

.refund-amount { font-size: 1em; font-weight: bold; color: #e74c3c; }

.refund-button {
    width: 100%;
    padding: 10px;
    background-color: #e74c3c;
    color: #fff;
    border: none;
    border-radius: 4px;
    font-size: 1em;
    font-weight: bold;
    cursor: pointer;
    transition: background-color 0.2s ease;
    margin-top: 8px;
}

.refund-button:hover:not(.disabled) { background-color: #c0392b; }
.refund-button.disabled { background-color: #555; color: #888; cursor: not-allowed; }
</style>
