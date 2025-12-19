<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { SettingsObject } from '../../../schemas/settingsSchema';
import { Ref } from 'vue';
import GfieldRenderer from './GfieldRenderer.vue'; // Import GfieldRenderer


const props = defineProps<{
  schema: SettingsObject[];
  values: Ref<Record<string, any>>;
}>();

// Reactive state
const componentName = ref('Gform');

// Methods (example)
// function someMethod() {
//   console.log('Method called');
// }

// Lifecycle hooks
onMounted(() => {
  //console.log(`${componentName.value} component mounted.`);
});
</script>

<template>
  <div class="gform">

    <div v-for="option in schema" :key="option.id" class="form-row">
      <div v-if="option.type === 'title'" class="form-title">
        {{ option.label }}
      </div>
      <GfieldRenderer v-else :option="option" v-model="values.value[option.id]" />
    </div>
  </div>
</template>

<style scoped>
.gform {
  /* Add your component-specific styles here */
  border: 1px solid #eee;
  padding: 1rem;
  margin: 1rem 0;
  border-radius: 4px;
}

.form-row {
  margin-bottom: 1rem;
}

.form-title {
  font-size: 1.25rem;
  font-weight: bold;
  margin-bottom: 0.75rem;
  color: #333;
  text-align: center;
}

.gform h1 {
  margin-top: 0;
  color: #42b983;
  /* Vue green */
}
</style>
