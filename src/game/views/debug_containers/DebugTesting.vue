<script setup lang="ts">
import { Game } from '../../game';
import { ref } from 'vue';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';

const game = Game.getInstance();
const testStoreInput = ref<string>('');
const testStoreInputValue = ref<string>('');

function testStore() {
  game.createStore('testStore');
  game.getStore('testStore').set(testStoreInput.value, testStoreInputValue.value);
}

function test() {
  console.warn("testing...");
  let item = game.itemSystem.getInventory('_party_inventory')?.getFirstItemById('ancient_tome') || null;
  item?.properties['durability'].addCurrentValue(-20);
  console.warn(item);

  game.getProperty('lewds')?.addCurrentValue(1);
}
</script>

<template>
  <div class="debug-testing">



    <div class="mb-2">
      <label>Store Key:</label>
      <InputText v-model="testStoreInput" class="w-full md:w-56" />
    </div>
    <div class="mb-2">
      <label>Store Value:</label>
      <InputText v-model="testStoreInputValue" class="w-full md:w-56" />
    </div>
    <Button label="Test Store" @click="testStore" class="mb-2" />

    <div v-if="game.hasStore('testStore')">
      <h3>Test Store Contents:</h3>
      <div v-for="([key, value]) in game.getStore('testStore')" :key="key">
        <div>{{ key }}: {{ value }}</div>
      </div>
    </div>

    <hr class="my-3" />

    <!--<Button label="Run Test Function" @click="test" />-->
  </div>
</template>

<style scoped>
.debug-testing {
  padding: 1rem;
}

.mb-2 {
  margin-bottom: 0.5rem;
}

.my-3 {
  margin-top: 1rem;
  margin-bottom: 1rem;
}
</style>
