<script setup lang="ts">
import { Game } from '../../../game';
import Ability from './Ability.vue';

const game = Game.getInstance();
</script>

<template>
    <div class="battle-container">
        <h1>Battle - Ability System Test</h1>

        <div class="character-list">
            <div class="character-item" v-for="character of game.characterSystem.party.value" :key="character.id">
                <div class="character-header">
                    <div class="character-name">{{ character.getName() }}</div>
                    <div class="character-stats">
                        <div>HP: {{ character.getResource('health') }} / {{ character.getStat('health') }}</div>
                    </div>
                </div>

                <div class="abilities-section">
                    <h3>Abilities ({{ character.abilities.size }})</h3>

                    <div v-if="character.abilities.size === 0" class="no-abilities">
                        No abilities available. Add abilities via character status effects.
                    </div>

                    <div v-else class="abilities-list">
                        <Ability v-for="abilityId in character.abilities" :key="abilityId" :ability-id="abilityId"
                            :ability-data="character.getAbility(abilityId)" :character-name="character.getName()" />
                    </div>
                </div>

                <div class="debug-section">
                    <details>
                        <summary>Debug Info</summary>
                        <div class="debug-content">
                            <h4>Raw Abilities Set:</h4>
                            <pre>{{ Array.from(character.abilities) }}</pre>

                            <h4>Ability Modifiers:</h4>
                            <pre>{{ JSON.stringify(character.abilityModifiers, null, 2) }}</pre>

                            <h4>Final Abilities (Merged):</h4>
                            <pre>{{ JSON.stringify(character.getAbilities(), null, 2) }}</pre>
                        </div>
                    </details>
                </div>
            </div>
        </div>

        <div class="instructions">
            <h3>Instructions:</h3>
            <ul>
                <li>Add abilities to characters via status effects with the <code>abilities</code> field</li>
                <li>Modify abilities via status effects with the <code>ability_modifiers</code> field</li>
                <li>Click "Use Ability" to see console output of what each aspect does</li>
                <li>Check the Debug Info section to see raw data and merging</li>
            </ul>
        </div>
    </div>
</template>

<style scoped>
.battle-container {
    width: 100%;
    height: 100%;
    background-color: #f9f9f9;
    padding: 20px 20px 20px 220px;
    overflow-y: auto;
}

h1 {
    color: #333;
    margin-bottom: 20px;
}

.character-list {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.character-item {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 20px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.character-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 2px solid #eee;
}

.character-name {
    font-size: 24px;
    font-weight: bold;
    color: #333;
}

.character-stats {
    display: flex;
    gap: 16px;
    font-size: 14px;
    color: #666;
}

.abilities-section {
    margin-bottom: 16px;
}

.abilities-section h3 {
    font-size: 18px;
    color: #555;
    margin-bottom: 12px;
}

.no-abilities {
    padding: 20px;
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 4px;
    color: #856404;
    text-align: center;
}

.abilities-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.debug-section {
    margin-top: 16px;
}

.debug-section summary {
    cursor: pointer;
    padding: 8px;
    background: #f5f5f5;
    border-radius: 4px;
    font-weight: bold;
    color: #666;
    user-select: none;
}

.debug-section summary:hover {
    background: #e0e0e0;
}

.debug-content {
    margin-top: 8px;
    padding: 12px;
    background: #fafafa;
    border: 1px solid #ddd;
    border-radius: 4px;
}

.debug-content h4 {
    font-size: 14px;
    color: #666;
    margin: 12px 0 8px 0;
}

.debug-content h4:first-child {
    margin-top: 0;
}

.debug-content pre {
    background: #fff;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px;
    overflow-x: auto;
    font-size: 12px;
    line-height: 1.4;
}

.instructions {
    margin-top: 32px;
    padding: 20px;
    background: #e3f2fd;
    border: 1px solid #2196F3;
    border-radius: 8px;
}

.instructions h3 {
    margin-top: 0;
    color: #1976D2;
}

.instructions ul {
    margin: 0;
    padding-left: 20px;
}

.instructions li {
    margin-bottom: 8px;
    line-height: 1.6;
}

.instructions code {
    background: #fff;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 13px;
    color: #d32f2f;
}
</style>