<script setup lang="ts">
import { ref, watch } from 'vue';
import Quill, { Parchment } from 'quill';
import Editor from 'primevue/editor';
import Textarea from 'primevue/textarea';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import FileInput from './FileInput.vue';
import { preserveScroll } from './preserveScrollDirective';

const ImageBlot = Quill.import('formats/image') as any;
class CustomImage extends ImageBlot {
  static sanitize(url: string) {
    return url;
  }
}
Quill.register(CustomImage, true);

const BlockEmbed = Quill.import('blots/block/embed') as any;
class CustomVideo extends BlockEmbed {
  static blotName = 'video';
  static tagName = 'video';
  static create(url: string) {
    const node = super.create();
    node.setAttribute('controls', '');
    node.setAttribute('src', url);
    return node;
  }
  static value(node: HTMLElement) {
    return node.getAttribute('src');
  }
}
Quill.register(CustomVideo, true);

// Quill drops any attribute that isn't a registered format when it round-trips
// HTML through its Delta model, which silently strips class="..." from authored
// markup. Registering class as a block attributor makes it survive the trip.
// ql-* classes are excluded — those belong to Quill's own formats (ql-align-*)
// and capturing them here would double-apply them.
class PreserveClassAttributor extends Parchment.Attributor {
  add(node: HTMLElement, value: string): boolean {
    if (!value) return false;
    value.split(/\s+/).forEach(c => c && node.classList.add(c));
    return true;
  }
  remove(node: HTMLElement): void {
    [...node.classList].filter(c => !c.startsWith('ql-')).forEach(c => node.classList.remove(c));
    if (!node.classList.length) node.removeAttribute('class');
  }
  value(node: HTMLElement): string {
    return [...node.classList].filter(c => !c.startsWith('ql-')).join(' ');
  }
}

Quill.register(new PreserveClassAttributor('block-class', 'class', { scope: Parchment.Scope.BLOCK }), true);

interface Props {
  modelValue: string | null | undefined;
  label?: string;
  tooltip?: string;
  fieldId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
  tooltip: '',
  fieldId: '',
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | null): void;
}>();

const vPreserveScroll = preserveScroll;

const internalValue = ref<string | undefined>(props.modelValue ?? undefined);
const isHtmlMode = ref(false);
const htmlContent = ref('');

watch(() => props.modelValue, (newVal) => {
  const next = newVal ?? undefined;
  if (next !== internalValue.value) {
    internalValue.value = next;
    if (isHtmlMode.value) {
      htmlContent.value = next ?? '';
    }
  }
});

function cleanHtmlContent(html: string): string {
  if (!html) return html;
  return html
    .replace(/(&nbsp;){2,}/g, ' ')
    .replace(/(\w)&nbsp;(\w)/g, '$1 $2');
}

watch(internalValue, (newVal) => {
  const cleaned = typeof newVal === 'string' ? cleanHtmlContent(newVal) : null;
  const current = props.modelValue ?? null;
  if (cleaned !== current) {
    emit('update:modelValue', cleaned);
  }
});

watch(htmlContent, (newHtml) => {
  if (isHtmlMode.value) {
    internalValue.value = newHtml;
  }
});

function toggleHtmlMode() {
  if (isHtmlMode.value) {
    internalValue.value = htmlContent.value;
    isHtmlMode.value = false;
  } else {
    htmlContent.value = internalValue.value || '';
    isHtmlMode.value = true;
  }
}

const editorModules = {
  toolbar: [
    [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote'],
    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
    [{ 'indent': '-1' }, { 'indent': '+1' }],
    [{ 'align': [] }],
    [{ 'color': [] }],
    ['clean'],
    ['link', 'image', 'video']
  ]
};

const assetDialog = ref({
  visible: false,
  fileType: 'image' as 'image' | 'video',
  selectedPath: null as string | null,
  urlValue: '',
  resolve: null as ((value: string | null) => void) | null,
});

function openAssetPicker(fileType: 'image' | 'video'): Promise<string | null> {
  return new Promise(resolve => {
    assetDialog.value = { visible: true, fileType, selectedPath: null, urlValue: '', resolve };
  });
}

function submitAssetPicker(value: string | null) {
  assetDialog.value.resolve?.(value);
  assetDialog.value.visible = false;
  assetDialog.value.resolve = null;
}

function onEditorInit({ instance }: { instance: any }) {
  const toolbar = instance.getModule('toolbar');
  const insert = (format: 'image' | 'video') => async () => {
    const range = instance.getSelection(true);
    const value = await openAssetPicker(format);
    if (value) {
      instance.insertEmbed(range ? range.index : 0, format, value, 'user');
    }
  };
  toolbar.addHandler('image', insert('image'));
  toolbar.addHandler('video', insert('video'));

  setTimeout(() => instance.getModule('history').clear(), 0);
}
</script>

<template>
  <div class="html-area-input">
    <div class="flex items-center justify-between mb-2">
      <label :for="fieldId" class="block">{{ label }}</label>
      <Button :icon="isHtmlMode ? 'pi pi-eye' : 'pi pi-code'" :label="isHtmlMode ? 'Visual' : 'HTML'"
        @click="toggleHtmlMode" size="small" severity="secondary" outlined
        v-tooltip.top="isHtmlMode ? 'Switch to Visual Editor' : 'View HTML Source'" />
    </div>

    <div class="htmlarea-resizable">
      <Editor v-if="!isHtmlMode" v-model="internalValue" :modules="editorModules" @load="onEditorInit"
        v-tooltip.left="tooltip" class="w-full htmlarea-editor" />

      <Textarea v-else v-model="htmlContent" v-tooltip.left="tooltip" class="w-full html-source-editor"
        :style="{ fontFamily: 'var(--font-family-mono)', fontSize: '0.875rem' }" v-preserve-scroll />
    </div>

    <Dialog v-model:visible="assetDialog.visible"
      :header="assetDialog.fileType === 'video' ? 'Insert Video' : 'Insert Image'" :modal="true" :closable="false"
      :style="{ width: '560px' }">
      <div class="asset-picker-body">
        <FileInput :model-value="assetDialog.selectedPath" :file-type="assetDialog.fileType"
          label="Search project assets" field-id="asset-picker-search"
          @update:model-value="v => assetDialog.selectedPath = typeof v === 'string' ? v : null" />
        <div class="asset-picker-divider">or paste a URL</div>
        <InputText v-model="assetDialog.urlValue" class="w-full"
          :placeholder="assetDialog.fileType === 'video' ? 'https://...mp4' : 'https://...jpg'"
          @keydown.enter="submitAssetPicker(assetDialog.urlValue || assetDialog.selectedPath)" />
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="submitAssetPicker(null)" />
        <Button label="Insert" :disabled="!assetDialog.selectedPath && !assetDialog.urlValue"
          @click="submitAssetPicker(assetDialog.urlValue || assetDialog.selectedPath)" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.html-area-input {
  width: 100%;
}

.htmlarea-resizable {
  width: 100%;
  height: 240px;
  resize: vertical;
  overflow: hidden;
  min-height: 150px;
  max-height: 1200px;
}

.htmlarea-resizable :deep(.p-editor-container),
.htmlarea-resizable .htmlarea-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.htmlarea-resizable :deep(.ql-container) {
  flex: 1;
  min-height: 0;
}

.htmlarea-resizable .html-source-editor {
  height: 100%;
  resize: none;
}

.html-source-editor {
  background-color: var(--p-surface-100);
  border: 1px solid var(--p-surface-300);
  border-radius: var(--p-border-radius);
  padding: 0.75rem;
}

.html-source-editor:focus {
  border-color: var(--p-primary-color);
  box-shadow: 0 0 0 0.2rem var(--p-primary-100);
}

.asset-picker-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 0.5rem;
}

.asset-picker-divider {
  text-align: center;
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
}

.flex {
  display: flex;
}

.items-center {
  align-items: center;
}

.justify-between {
  justify-content: space-between;
}

.block {
  display: block;
}

.mb-2 {
  margin-bottom: 0.5rem;
}

.w-full {
  width: 100%;
}
</style>

<style>
.p-autocomplete-overlay {
  z-index: 11000 !important;
}
</style>
