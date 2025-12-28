<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useSortable } from '@vueuse/integrations/useSortable';
import { Editor } from '../../editor';
import { Global } from '../../../global/global';
import { isImage, isVideo } from '../../../utility/functions';
import AutoComplete from 'primevue/autocomplete';
import Button from 'primevue/button';
import FloatLabel from 'primevue/floatlabel';
import WebPSettingsHeader from './WebPSettingsHeader.vue';
import type { Subscription } from 'rxjs';

// Get singleton instances
const editor = Editor.getInstance();
const global = Global.getInstance();

// Props
interface Props {
  modelValue: string | string[] | null | undefined;
  fileType: 'image' | 'video' | 'asset' | 'atlas' | 'json' | 'spine_skeleton' | 'audio' | 'css' | 'js';
  label?: string;
  tooltip?: string;
  multiple?: boolean;
  fieldId?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
  tooltip: '',
  multiple: false,
  fieldId: '',
  disabled: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | string[] | null | undefined): void;
}>();

// --- Internal State ---
const internalValue = ref<string | null>(null);
const localFileArray = ref<(string | null)[]>([]);
const fileSuggestions = ref<string[]>([]);
const fileResultsSubscription = ref<Subscription | null>(null);

// Video thumbnail cache
const videoThumbnails = ref<Map<string, string>>(new Map());

// File sizes cache for dropdown display
const fileSizes = ref<Map<string, string>>(new Map());

// WebP Conversion State
const isConverting = ref(false);
const conversionError = ref<string | null>(null);
const convertedFiles = ref<Set<string>>(new Set());

// File array container ref for sortable
const fileListContainer = ref<HTMLElement | null>(null);

// --- Computed ---
const showPreview = computed(() => {
  return props.fileType === 'image' || props.fileType === 'asset' || props.fileType === 'video';
});

const showWebPHeader = computed(() => {
  return (props.fileType === 'image' || props.fileType === 'asset') &&
         global.storageService.getName() === 'electron';
});

// --- Sync Props to Internal State ---

// Single file mode
watch(() => props.modelValue, (newVal) => {
  if (!props.multiple) {
    internalValue.value = typeof newVal === 'string' ? newVal : null;
  }
}, { immediate: true });

// File array mode
watch(() => props.modelValue, (newVal) => {
  if (props.multiple) {
    if (Array.isArray(newVal)) {
      const stringsOnly = newVal.filter(v => typeof v === 'string');
      const needsNullField = stringsOnly.length === 0 || stringsOnly[stringsOnly.length - 1] !== null;
      const newState: (string | null)[] = needsNullField ? [...stringsOnly, null] : [...stringsOnly];
      if (JSON.stringify(newState) !== JSON.stringify(localFileArray.value)) {
        localFileArray.value = newState;
      }
    } else {
      if (localFileArray.value.length === 0 || localFileArray.value[0] !== null) {
        localFileArray.value = [null];
      }
    }
  }
}, { immediate: true, deep: true });

// --- File Search ---
const lastSearchQuery = ref('');

function handleFileSearch(event: { query: string }) {
  if (editor) {
    lastSearchQuery.value = event.query;
    editor.searchFiles(event.query, props.fileType);
  } else {
    console.error("Editor instance not available for file search.");
  }
}

function clearCache(event: Event) {
  event.preventDefault();
  event.stopPropagation();
  editor.clearFileCache();
  // Re-trigger search with the last query to refresh results
  if (lastSearchQuery.value) {
    editor.searchFiles(lastSearchQuery.value, props.fileType);
  }
}

// Subscribe to file results
onMounted(() => {
  if (editor && editor.filteredFileResults$) {
    fileResultsSubscription.value = editor.filteredFileResults$.subscribe(results => {
      fileSuggestions.value = results;
    });
  }
});

onUnmounted(() => {
  if (fileResultsSubscription.value) {
    fileResultsSubscription.value.unsubscribe();
  }
  videoThumbnails.value.clear();
});

// Make dropdown panel scrollable
watch(fileSuggestions, (newSuggestions) => {
  if (newSuggestions.length > 0) {
    nextTick(() => {
      const panelElement = document.querySelector('.p-autocomplete-overlay');
      if (panelElement instanceof HTMLElement) {
        panelElement.style.overflow = 'auto';
      }
    });
  }
});

// --- Video Thumbnail Generation ---
async function generateVideoThumbnail(videoPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;

    let hasResolved = false;
    let errorCount = 0;

    video.onloadeddata = () => {
      if (hasResolved) return;
      video.currentTime = 0.1;
    };

    video.onseeked = () => {
      if (hasResolved) return;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 320;
        canvas.height = video.videoHeight || 240;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          hasResolved = true;
          resolve(dataUrl);
        } else {
          if (!hasResolved) {
            hasResolved = true;
            reject(new Error('Could not get canvas context'));
          }
        }
      } catch (error) {
        if (!hasResolved) {
          console.error('Error generating video thumbnail:', error);
          hasResolved = true;
          reject(error);
        }
      } finally {
        video.pause();
        video.src = '';
        video.load();
      }
    };

    video.onerror = (e) => {
      errorCount++;
      if (!hasResolved && errorCount === 1) {
        console.warn('Error loading video for thumbnail (may be recoverable):', videoPath, e);
        setTimeout(() => {
          if (!hasResolved) {
            hasResolved = true;
            reject(new Error('Failed to load video'));
          }
        }, 500);
      }
    };

    setTimeout(() => {
      if (!hasResolved) {
        hasResolved = true;
        reject(new Error('Video thumbnail generation timeout'));
      }
    }, 5000);

    video.src = videoPath;
    video.load();
  });
}

async function getOrGenerateThumbnail(videoPath: string): Promise<string> {
  if (videoThumbnails.value.has(videoPath)) {
    return videoThumbnails.value.get(videoPath)!;
  }

  try {
    const thumbnail = await generateVideoThumbnail(videoPath);
    videoThumbnails.value.set(videoPath, thumbnail);
    return thumbnail;
  } catch (error) {
    console.error('Failed to generate thumbnail for:', videoPath, error);
    return '';
  }
}

// --- File Size ---
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

async function fetchFileSize(filePath: string): Promise<void> {
  if (global.storageService.getName() !== 'electron') {
    return;
  }

  try {
    const sizeInBytes = await global.getFileSize(filePath);
    fileSizes.value.set(filePath, formatBytes(sizeInBytes));
  } catch (error) {
    console.error(`Failed to get size for ${filePath}:`, error);
    fileSizes.value.set(filePath, '');
  }
}

// Fetch file sizes and thumbnails for suggestions
watch(fileSuggestions, async (newSuggestions) => {
  // Fetch file sizes for all suggestions
  for (const suggestion of newSuggestions) {
    if (!fileSizes.value.has(suggestion)) {
      fetchFileSize(suggestion).catch(err => {
        console.warn('Failed to fetch file size for suggestion:', suggestion, err);
      });
    }
  }

  // Generate video thumbnails if needed
  if (props.fileType === 'asset' || props.fileType === 'video') {
    for (const suggestion of newSuggestions) {
      if (isVideo(suggestion) && !videoThumbnails.value.has(suggestion)) {
        getOrGenerateThumbnail(suggestion).catch(err => {
          console.warn('Failed to generate thumbnail for suggestion:', suggestion, err);
        });
      }
    }
  }
}, { deep: true });

// --- WebP Conversion ---
async function convertFileToWebP(filePath: string): Promise<string | null> {
  isConverting.value = true;
  conversionError.value = null;

  try {
    const result = await editor.convertPngToWebP(filePath);
    const savings = result.originalSize - result.newSize;
    const savingsPercent = Math.round((savings / result.originalSize) * 100);

    if (editor.webpBackupOriginal.value) {
      try {
        const backupResult = await editor.backupFile(filePath);
        global.addNotification(
          global.getString('webp_conversion_success_backup', {
            savings: formatBytes(savings),
            percent: savingsPercent,
            path: backupResult.backupPath
          })
        );
      } catch (backupError) {
        console.error('Failed to backup original file:', backupError);
        global.addNotification(global.getString('webp_backup_failed'));
        global.addNotification(
          global.getString('webp_conversion_success', {
            savings: formatBytes(savings),
            percent: savingsPercent
          })
        );
      }
    } else {
      global.addNotification(
        global.getString('webp_conversion_success_no_backup', {
          savings: formatBytes(savings),
          percent: savingsPercent
        })
      );
    }

    // Update file suggestions cache
    const originalIndex = fileSuggestions.value.indexOf(filePath);
    if (originalIndex !== -1) {
      fileSuggestions.value.splice(originalIndex, 1, result.webpPath);
    }

    // Update file cache
    editor.updateFileCacheEntry(filePath, result.webpPath);

    // Update file sizes
    fileSizes.value.delete(filePath);
    fetchFileSize(result.webpPath).catch(err => {
      console.warn('Failed to fetch size for new WebP file:', err);
    });

    return result.webpPath;

  } catch (error) {
    console.error('WebP conversion failed:', error);
    global.addNotification(
      global.getString('webp_conversion_failed', {
        file: filePath
      })
    );
    conversionError.value = error instanceof Error ? error.message : 'Unknown error';
    return null;
  } finally {
    isConverting.value = false;
  }
}

// --- Single File Mode ---

// Emit changes for single file
watch(internalValue, (newValue) => {
  if (!props.multiple && newValue !== props.modelValue) {
    emit('update:modelValue', newValue);
  }
});

// WebP auto-conversion for single file
// Only convert when value matches a file from suggestions (user selected it, not just typed)
watch(internalValue, async (newPath, oldPath) => {
  if (props.multiple ||
      global.storageService.getName() !== 'electron' ||
      !newPath ||
      typeof newPath !== 'string' ||
      !/\.(png|jpe?g)$/i.test(newPath) ||
      !editor.webpAutoConvert.value ||
      newPath === oldPath ||
      newPath.startsWith('assets/engine_assets') ||
      !fileSuggestions.value.includes(newPath)) { // Only convert if it's a valid file from suggestions
    return;
  }

  const webpPath = await convertFileToWebP(newPath);
  if (webpPath) {
    internalValue.value = webpPath;
  }
}, { flush: 'post' });

// Generate thumbnail for selected video (single)
watch(internalValue, async (newValue) => {
  if (!props.multiple && typeof newValue === 'string' && isVideo(newValue)) {
    if (!videoThumbnails.value.has(newValue)) {
      await getOrGenerateThumbnail(newValue);
    }
  }
}, { immediate: true });

// --- File Array Mode ---

// Watch local file array state for changes
watch(localFileArray, (newList) => {
  if (!props.multiple) return;

  // Auto-add new null field if the last one is filled
  if (newList.length > 0 && newList[newList.length - 1] !== null) {
    localFileArray.value.push(null);
  }
  // Remove duplicate null field at the end
  else if (newList.length > 1 && newList[newList.length - 1] === null && newList[newList.length - 2] === null) {
    localFileArray.value.pop();
    return;
  }

  // Emit changes without trailing null, filter out any nulls
  const listToEmit = [...localFileArray.value];
  const listWithoutTrailingNull = listToEmit.length > 0 && listToEmit[listToEmit.length - 1] === null
    ? listToEmit.slice(0, -1)
    : listToEmit;
  // Filter out any remaining nulls and cast to string[]
  const cleanList = listWithoutTrailingNull.filter((item): item is string => item !== null);

  const currentPropValue = Array.isArray(props.modelValue) ? props.modelValue : [];
  if (JSON.stringify(cleanList) !== JSON.stringify(currentPropValue)) {
    emit('update:modelValue', cleanList.length > 0 ? cleanList : null);
  }
}, { deep: true });

// Setup sorting for files
useSortable(fileListContainer, localFileArray, {
  handle: '.drag-handle',
  animation: 150,
  filter: '.non-draggable-empty',
  preventOnFilter: false,
});

function deleteFileItem(index: number) {
  if (localFileArray.value.length === 1 && localFileArray.value[0] === null) return;
  localFileArray.value.splice(index, 1);
  if (localFileArray.value.length === 0) {
    localFileArray.value.push(null);
  }
}

// WebP auto-conversion for file array
watch(localFileArray, async (newArray) => {
  if (!props.multiple ||
      global.storageService.getName() !== 'electron' ||
      !editor.webpAutoConvert.value) {
    return;
  }

  for (let i = 0; i < newArray.length; i++) {
    const filePath = newArray[i];

    if (!filePath ||
        typeof filePath !== 'string' ||
        !/\.(png|jpe?g)$/i.test(filePath) ||
        convertedFiles.value.has(filePath) ||
        filePath.startsWith('assets/engine_assets') ||
        !fileSuggestions.value.includes(filePath)) {
      continue;
    }

    convertedFiles.value.add(filePath);
    const webpPath = await convertFileToWebP(filePath);

    if (webpPath) {
      localFileArray.value[i] = webpPath;
      convertedFiles.value.add(webpPath);
    } else {
      convertedFiles.value.delete(filePath);
    }
  }
}, { deep: true, flush: 'post' });

// Generate thumbnails for video files in file arrays
watch(localFileArray, async (newArray) => {
  if (!props.multiple) return;

  for (const item of newArray) {
    if (item && typeof item === 'string' && isVideo(item)) {
      if (!videoThumbnails.value.has(item)) {
        await getOrGenerateThumbnail(item);
      }
    }
  }
}, { deep: true, immediate: true });
</script>

<template>
  <!-- Single File Mode -->
  <div v-if="!multiple" class="file-input file-input--single">
    <!-- Layout for Image, Asset, or Video -->
    <div v-if="showPreview" class="input-wrapper flex items-center gap-2">
      <div class="inline-preview-wrapper flex-shrink-0">
        <img v-if="internalValue && isImage(internalValue)"
             :src="internalValue"
             :alt="`Preview of ${internalValue}`"
             class="inline-preview-image" />
        <img v-else-if="internalValue && isVideo(internalValue) && videoThumbnails.get(internalValue)"
             :src="videoThumbnails.get(internalValue)"
             :alt="`Video thumbnail of ${internalValue}`"
             class="inline-preview-image" />
      </div>

      <div class="flex-grow file-input-container">
        <FloatLabel variant="on" class="p-float-label-variant-on w-full">
          <AutoComplete
            v-model="internalValue"
            :suggestions="fileSuggestions"
            @complete="handleFileSearch"
            forceSelection
            :delay="50"
            :inputId="fieldId"
            v-tooltip.left="tooltip"
            class="w-full"
            :loading="isConverting"
            :disabled="isConverting || disabled"
            :autoOptionFocus="false">

            <template #header>
              <div class="dropdown-header" @mousedown.stop @click.stop @wheel.stop>
                <Button icon="pi pi-refresh" label="Clear Cache" size="small" severity="secondary" text @mousedown.prevent @click="clearCache($event)" class="dropdown-clear-cache-btn" />
                <WebPSettingsHeader v-if="showWebPHeader" />
              </div>
            </template>

            <template #option="slotProps">
              <div class="flex items-center gap-2 suggestion-item">
                <img v-if="isImage(slotProps.option)"
                     :src="slotProps.option"
                     class="suggestion-image"
                     @error="($event.target as HTMLImageElement).style.display = 'none'" />
                <img v-else-if="isVideo(slotProps.option) && videoThumbnails.get(slotProps.option)"
                     :src="videoThumbnails.get(slotProps.option)"
                     class="suggestion-image"
                     @error="($event.target as HTMLImageElement).style.display = 'none'" />

                <div class="flex-grow">
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex-grow">
                      <span>{{ slotProps.option }}</span>
                      <span v-if="global.storageService.getName() === 'electron' && editor.webpAutoConvert.value && /\.(png|jpe?g)$/i.test(slotProps.option) && !slotProps.option.startsWith('assets/engine_assets')"
                            class="conversion-indicator">
                        → .webp
                      </span>
                      <span v-if="global.storageService.getName() === 'electron' && slotProps.option.endsWith('.webp')"
                            class="optimized-badge">
                        ✓ Optimized
                      </span>
                    </div>
                    <span v-if="fileSizes.get(slotProps.option)" class="file-size-badge">
                      {{ fileSizes.get(slotProps.option) }}
                    </span>
                  </div>
                </div>
              </div>
            </template>

            <template #empty>
              <div class="empty-message">
                <span v-if="editor.isSearchingFiles.value">Searching...</span>
                <span v-else>No matching files found.</span>
              </div>
            </template>
          </AutoComplete>
          <label :for="fieldId">{{ label }}</label>
        </FloatLabel>

        <div v-if="isConverting" class="conversion-loading-overlay">
          <i class="pi pi-spin pi-spinner"></i>
          <span>Converting to WebP...</span>
        </div>
      </div>
    </div>

    <!-- Layout for Other File Types -->
    <FloatLabel v-else variant="on" class="p-float-label-variant-on w-full input-wrapper">
      <AutoComplete
        v-model="internalValue"
        :suggestions="fileSuggestions"
        @complete="handleFileSearch"
        forceSelection
        :delay="50"
        :inputId="fieldId"
        v-tooltip.left="tooltip"
        class="w-full"
        :disabled="disabled">
        <template #header>
          <div class="dropdown-header" @mousedown.stop @click.stop @wheel.stop>
            <Button icon="pi pi-refresh" label="Clear Cache" size="small" severity="secondary" text @mousedown.prevent @click="clearCache($event)" class="dropdown-clear-cache-btn" />
          </div>
        </template>

        <template #option="slotProps">
          <span>{{ slotProps.option }}</span>
        </template>

        <template #empty>
          <div class="empty-message">
            <span v-if="editor.isSearchingFiles.value">Searching...</span>
            <span v-else>No matching files found.</span>
          </div>
        </template>
      </AutoComplete>
      <label :for="fieldId">{{ label }}</label>
    </FloatLabel>
  </div>

  <!-- File Array Mode -->
  <div v-else class="file-input file-input--multiple">
    <div class="input-wrapper">
      <label class="block font-medium mb-2">{{ label }}</label>

      <div v-tooltip.left="tooltip" ref="fileListContainer" class="space-y-2">
        <div v-for="(item, index) in localFileArray"
             :key="index"
             class="flex items-center gap-2 file-array-item"
             :class="{ 'non-draggable-empty': index === localFileArray.length - 1 && item === null }">
          <Button icon="pi pi-bars" text rounded class="drag-handle cursor-move p-button-sm" aria-label="Drag to reorder" />

          <!-- Inline Preview for Image, Asset, or Video -->
          <img v-if="showPreview && item && isImage(item)"
               :src="item"
               class="file-array-preview"
               alt="Preview"
               @error="($event.target as HTMLImageElement).style.display = 'none'" />
          <img v-else-if="(fileType === 'asset' || fileType === 'video') && item && isVideo(item) && videoThumbnails.get(item)"
               :src="videoThumbnails.get(item)"
               class="file-array-preview"
               alt="Video Preview"
               @error="($event.target as HTMLImageElement).style.display = 'none'" />

          <AutoComplete
            v-model="localFileArray[index]"
            :suggestions="fileSuggestions"
            @complete="handleFileSearch"
            forceSelection
            :delay="50"
            class="flex-grow"
            :inputClass="'w-full'"
            :loading="isConverting"
            :disabled="isConverting || disabled"
            :autoOptionFocus="false">

            <template #header>
              <div class="dropdown-header" @mousedown.stop @click.stop @wheel.stop>
                <Button icon="pi pi-refresh" label="Clear Cache" size="small" severity="secondary" text @mousedown.prevent @click="clearCache($event)" class="dropdown-clear-cache-btn" />
                <WebPSettingsHeader v-if="showWebPHeader" />
              </div>
            </template>

            <template #option="slotProps">
              <div class="flex items-center gap-2 suggestion-item">
                <img v-if="isImage(slotProps.option)"
                     :src="slotProps.option"
                     class="suggestion-image"
                     @error="($event.target as HTMLImageElement).style.display = 'none'" />
                <img v-else-if="isVideo(slotProps.option) && videoThumbnails.get(slotProps.option)"
                     :src="videoThumbnails.get(slotProps.option)"
                     class="suggestion-image"
                     @error="($event.target as HTMLImageElement).style.display = 'none'" />

                <div class="flex-grow">
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex-grow">
                      <span>{{ slotProps.option }}</span>
                      <span v-if="global.storageService.getName() === 'electron' && editor.webpAutoConvert.value && /\.(png|jpe?g)$/i.test(slotProps.option) && !slotProps.option.startsWith('assets/engine_assets')"
                            class="conversion-indicator">
                        → .webp
                      </span>
                      <span v-if="global.storageService.getName() === 'electron' && slotProps.option.endsWith('.webp')"
                            class="optimized-badge">
                        ✓ Optimized
                      </span>
                    </div>
                    <span v-if="fileSizes.get(slotProps.option)" class="file-size-badge">
                      {{ fileSizes.get(slotProps.option) }}
                    </span>
                  </div>
                </div>
              </div>
            </template>

            <template #empty>
              <div class="empty-message">
                <span v-if="editor.isSearchingFiles.value">Searching...</span>
                <span v-else>No matching files found.</span>
              </div>
            </template>
          </AutoComplete>

          <Button icon="pi pi-trash" severity="danger" class="p-button-sm" aria-label="Remove Item"
                  @click="deleteFileItem(index)"
                  :disabled="localFileArray.length === 1 && localFileArray[0] === null" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-input {
  width: 100%;
}

.input-wrapper {
  flex: 2;
  min-width: 0;
}

.w-full {
  width: 100%;
}

.flex {
  display: flex;
}

.items-center {
  align-items: center;
}

.gap-2 {
  gap: 0.5rem;
}

.block {
  display: block;
}

.mb-2 {
  margin-bottom: 0.5rem;
}

.font-medium {
  font-weight: 500;
}

.flex-grow {
  flex-grow: 1;
}

.flex-shrink-0 {
  flex-shrink: 0;
}

.cursor-move {
  cursor: move;
}

.justify-between {
  justify-content: space-between;
}

.space-y-2 > :not([hidden]) ~ :not([hidden]) {
  --tw-space-y-reverse: 0;
  margin-top: calc(0.5rem * calc(1 - var(--tw-space-y-reverse)));
  margin-bottom: calc(0.5rem * var(--tw-space-y-reverse));
}

/* Inline preview (single file) */
.inline-preview-wrapper {
  width: 150px;
  height: 150px;
  border: 1px dashed var(--p-surface-300);
  border-radius: var(--p-border-radius);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--p-surface-50);
  overflow: hidden;
}

.inline-preview-image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

/* Suggestion items */
.suggestion-item {
  padding: 0.25rem 0;
}

.suggestion-image {
  width: 32px;
  height: 32px;
  object-fit: cover;
  border-radius: 4px;
  vertical-align: middle;
}

/* File array styles */
.file-array-item .p-button-sm {
  height: 2rem;
  width: 2rem;
  flex-shrink: 0;
}

.file-array-item .p-autocomplete {
  flex-grow: 1;
}

.file-array-preview {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid var(--p-surface-300);
  flex-shrink: 0;
}

/* WebP conversion styles */
.file-input-container {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.conversion-indicator {
  color: var(--p-primary-600);
  font-size: 0.85rem;
  margin-left: 0.5rem;
}

.optimized-badge {
  color: var(--p-green-600);
  font-size: 0.85rem;
  margin-left: 0.5rem;
  font-weight: 500;
}

.file-size-badge {
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
  padding: 0.125rem 0.375rem;
  background-color: var(--p-surface-100);
  border-radius: 0.25rem;
  white-space: nowrap;
  margin-left: auto;
}

.conversion-loading-overlay {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  margin-top: 0.5rem;
  background-color: var(--p-primary-50);
  color: var(--p-primary-700);
  border-radius: var(--p-border-radius);
  font-size: 0.9rem;
}

.conversion-loading-overlay .pi-spinner {
  font-size: 1.2rem;
}

/* AutoComplete overlay styles */
:deep(.p-autocomplete-overlay) {
  pointer-events: auto;
  outline: none;
}

:deep(.p-autocomplete-header) {
  position: sticky;
  top: 0;
  z-index: 1;
  background-color: white;
}

.dropdown-header {
  padding: 0.5rem;
  border-bottom: 1px solid var(--p-surface-200);
  background-color: var(--p-surface-50);
}

.dropdown-clear-cache-btn {
  font-size: 0.8rem;
  margin-bottom: 0.25rem;
}

.empty-message {
  padding: 0.5rem 1rem;
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
}

:deep(.p-autocomplete-list) {
  overflow-y: auto;
  max-height: 300px;
}

:deep(.p-autocomplete-overlay .p-autocomplete-list-container) {
  overflow-y: auto;
}

.p-float-label-variant-on > label {
  background: var(--p-surface-ground);
  padding: 0 0.25rem;
}
</style>
