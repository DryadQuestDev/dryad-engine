<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { SettingsObject } from '../../../schemas/settingsSchema';
import { Ref } from 'vue';
import GfieldRenderer from './GfieldRenderer.vue'; // Import GfieldRenderer
import { Global } from '../../global';

const global = Global.getInstance();


const props = defineProps<{
  schema: SettingsObject[];
  values: Ref<Record<string, any>>;
  /** Route writes through this instead of assigning into `values` — for a store whose setter has
   *  side effects (game settings fire game_setting_change through game.setGameSetting). */
  setter?: (key: string, value: any) => void;
}>();

function write(key: string, value: any) {
  if (props.setter) props.setter(key, value);
  else props.values.value[key] = value;
}

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
      <!-- Engine settings carry locale keys as labels; a game or plugin schema that carries a
           literal falls through getStringOr and keeps it. -->
      <div v-if="option.type === 'title'" class="form-title">
        {{ global.getStringOr(option.label || '', option.label || '') }}
      </div>
      <GfieldRenderer v-else :option="option" :model-value="values.value[option.id]"
        @update:model-value="write(option.id, $event)" />
    </div>
  </div>
</template>

<style scoped>
.gform {
  /* Shared label column width for every GfieldRenderer row in this form. */
  --gfield-label-width: 130px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 1rem;
  margin: 1rem 0;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.form-row {
  margin-bottom: 1rem;
}

.form-title {
  font-family: var(--font-family-serif);
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.75rem;
  color: #fff;
  text-align: center;
  letter-spacing: 0.02em;
}

.gform h1 {
  margin-top: 0;
  color: var(--glass-tint, #42b983);
}
</style>
