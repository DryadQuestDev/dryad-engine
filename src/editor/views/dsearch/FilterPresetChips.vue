<script setup lang="ts">
import { computed, ref } from 'vue';
import Chip from 'primevue/chip';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import { Global } from '../../../global/global';
import { describeSifter, type FilterPreset, type FilterPresetSession } from '../../filterPresets';
import { showConfirm } from '../../../services/dialogService';

// The owning filter form's session: its scope, its current sifter, and the chip state derived
// from them. Read through props.session so a different session handed in later is honored.
const props = defineProps<{ session: FilterPresetSession }>();

const global = Global.getInstance();

const saveDialogVisible = ref(false);
const presetName = ref('');
const saving = ref(false);

const trimmedName = computed(() => presetName.value.trim());
// The preset a save under the typed name would replace (own) or override (inherited from core)
const collision = computed(() => (trimmedName.value ? props.session.findByName(trimmedName.value) : undefined));
const saveLabel = computed(() => {
  if (!collision.value) return global.getString('filter_presets.save');
  return global.getString(props.session.isWritable(collision.value) ? 'filter_presets.overwrite' : 'filter_presets.override');
});
const collisionHint = computed(() => {
  if (!collision.value) return '';
  const key = props.session.isWritable(collision.value) ? 'filter_presets.overwrite_hint' : 'filter_presets.override_hint';
  return global.getString(key, { name: collision.value.name });
});
const currentSummary = computed(() => describeSifter(props.session.currentSifter.value));

function openSaveDialog() {
  presetName.value = '';
  saveDialogVisible.value = true;
}

async function confirmSave() {
  if (!trimmedName.value || saving.value) return;
  saving.value = true;
  try {
    const saved = await props.session.saveCurrent(trimmedName.value);
    if (saved) global.addNotificationId('filter_presets.saved', { name: saved.name });
    saveDialogVisible.value = false;
  } finally {
    saving.value = false;
  }
}

async function remove(preset: FilterPreset) {
  const confirmed = await showConfirm({
    message: global.getString('filter_presets.delete_confirm', { name: preset.name }),
    icon: 'pi pi-trash',
  });
  if (!confirmed) return;
  await props.session.remove(preset);
}

function tooltip(preset: FilterPreset): string {
  const summary = describeSifter(preset.sifter);
  if (props.session.isWritable(preset)) return summary;
  const inherited = global.getString('filter_presets.inherited');
  return summary ? `${inherited}\n${summary}` : inherited;
}
</script>

<template>
  <div v-if="session.hasChipRow.value" class="preset-chips">
    <!-- Click lives on a wrapper: Chip declares no click event, so vue-tsc rejects one on it -->
    <span v-for="preset in session.presets.value" :key="preset.id" class="preset-chip-wrap"
      v-tooltip.bottom="tooltip(preset)" @click="session.apply(preset)">
      <Chip class="preset-chip" :class="{
        'preset-chip--active': session.activePresetId.value === preset.id,
        'preset-chip--inherited': !session.isWritable(preset),
      }" :removable="session.isWritable(preset)">
        <i v-if="!session.isWritable(preset)" class="pi pi-lock preset-chip-lock"></i>
        <span class="preset-chip-label">{{ preset.name }}</span>
        <!-- Own remove icon: the built-in one hides the chip before a confirmation could be asked -->
        <template #removeicon>
          <i class="pi pi-times preset-chip-remove" role="button" :aria-label="global.getStringOr('delete', 'Delete')"
            @click.stop="remove(preset)"></i>
        </template>
      </Chip>
    </span>
    <Button v-if="session.canSaveCurrent.value" icon="pi pi-bookmark" :label="global.getString('filter_presets.save')"
      text size="small" class="preset-save-button" @click="openSaveDialog" />

    <Dialog v-model:visible="saveDialogVisible" modal :header="global.getString('filter_presets.save_header')"
      :style="{ width: '26rem' }">
      <div class="preset-save-body">
        <InputText v-model="presetName" :placeholder="global.getString('filter_presets.name_placeholder')" autofocus
          class="preset-save-input" @keyup.enter="confirmSave" />
        <small v-if="currentSummary" class="preset-save-summary">{{ currentSummary }}</small>
        <small v-if="collisionHint" class="preset-save-hint">{{ collisionHint }}</small>
      </div>
      <template #footer>
        <Button :label="global.getStringOr('cancel', 'Cancel')" text @click="saveDialogVisible = false" />
        <Button :label="saveLabel" :disabled="!trimmedName || saving" @click="confirmSave" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.preset-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.preset-chip-wrap {
  display: inline-flex;
  cursor: pointer;
  user-select: none;
}

.preset-chip--active {
  --p-chip-background: var(--editor-accent);
  --p-chip-color: var(--editor-accent-contrast);
  font-weight: 600;
}

.preset-chip--inherited {
  opacity: 0.85;
}

.preset-chip-lock {
  font-size: 0.75em;
  opacity: 0.7;
}

.preset-chip-label {
  white-space: nowrap;
}

.preset-chip-remove {
  cursor: pointer;
  font-size: 0.8em;
  opacity: 0.7;
}

.preset-chip-remove:hover {
  opacity: 1;
}

.preset-save-button {
  width: auto;
  white-space: nowrap;
}

.preset-save-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preset-save-input {
  width: 100%;
}

.preset-save-summary {
  color: var(--editor-text-muted);
  word-break: break-word;
}

.preset-save-hint {
  color: var(--editor-fg-warning);
}
</style>
