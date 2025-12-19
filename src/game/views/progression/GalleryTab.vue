<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Game } from '../../game';
import type { GalleryObject } from '../../../schemas/gallerySchema';
import type { AssetObject } from '../../../schemas/assetSchema';
import type { CharacterTemplateObject } from '../../../schemas/characterTemplateSchema';
import type { DiscoveredCharacter } from '../../core/character/discoveredCharacter';
import type { DiscoveredAsset } from '../../core/asset/discoveredAsset';
import BackgroundAsset from '../BackgroundAsset.vue';
import CharacterDoll from './CharacterDoll.vue';
import GalleryScenesTab from './GalleryScenesTab.vue';
import Select from 'primevue/select';
import MultiSelect from 'primevue/multiselect';
import FloatLabel from 'primevue/floatlabel';
import Button from 'primevue/button';

const game = Game.getInstance();

// Local component state (not serialized)
const selectedTabType = computed(() => game.coreSystem.getState<'characters' | 'assets' | 'scenes'>('gallery_tab'));
const selectedGalleryId = ref<string | null>(null);
const selectedItemId = ref<string | null>(null);
const descriptionMinimized = ref(false);
const expandedGalleries = ref<Set<string>>(new Set());
const isFullscreen = ref(false);

// Character tweaks state: Map<templateId, { attributes: Map<key, value>, skinLayers: Set<layerId>, skinLayerStyles: Map<layerId, string[]> }>
const characterTweaks = ref<Map<string, { attributes: Map<string, string>, skinLayers: Set<string>, skinLayerStyles: Map<string, string[]> }>>(new Map());

// Asset tweaks state: Map<assetId, { animation: string | null, skins: string[] }>
const assetTweaks = ref<Map<string, { animation: string | null, skins: string[] }>>(new Map());

// Function: Filter galleries by selected type and only show galleries with items
const getFilteredGalleries = () => {
  const galleries: GalleryObject[] = [];
  for (const gallery of game.coreSystem.galleriesMap.values()) {
    if (gallery.type === selectedTabType.value) {
      const items = getGalleryItems(gallery.id);
      if (items.length > 0) {
        galleries.push(gallery);
      }
    }
  }
  return galleries;
};

// Function: Get items for a specific gallery
const getGalleryItems = (galleryId: string) => {
  const items: Array<{ id: string; name: string; description: string; isDiscovered: boolean }> = [];

  if (selectedTabType.value === 'characters') {
    for (const template of game.characterSystem.templatesMap.values()) {
      if (template.gallery?.gallery_id === galleryId) {
        const isDiscovered = game.coreSystem.discoveredCharacters.has(template.id);
        items.push({
          id: template.id,
          name: isDiscovered ? (template.gallery?.entity_name || template.id) : '???',
          description: isDiscovered ? (template.gallery?.entity_description || '') : '',
          isDiscovered
        });
      }
    }
  } else {
    for (const asset of game.dungeonSystem.assetsMap.values()) {
      if (asset.gallery?.gallery_id === galleryId) {
        const isDiscovered = game.coreSystem.discoveredAssets.has(asset.id);
        items.push({
          id: asset.id,
          name: isDiscovered ? (asset.gallery?.entity_name || asset.id) : '???',
          description: isDiscovered ? (asset.gallery?.entity_description || '') : '',
          isDiscovered
        });
      }
    }
  }

  // Sort items by name (case-insensitive)
  items.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  return items;
};

// Computed: Selected item details (keep reactive - depends on reactive selectedItemId/selectedTabType)
const selectedItem = computed(() => {
  if (!selectedItemId.value) return null;

  if (selectedTabType.value === 'characters') {
    const template = game.characterSystem.templatesMap.get(selectedItemId.value);
    if (!template) return null;

    const isDiscovered = game.coreSystem.discoveredCharacters.has(template.id);
    return {
      type: 'character' as const,
      id: template.id,
      name: isDiscovered ? (template.gallery?.entity_name || template.id) : '???',
      description: isDiscovered ? (template.gallery?.entity_description || '') : '',
      isDiscovered,
      data: template
    };
  } else {
    const asset = game.dungeonSystem.assetsMap.get(selectedItemId.value);
    if (!asset) return null;

    const isDiscovered = game.coreSystem.discoveredAssets.has(asset.id);
    return {
      type: 'asset' as const,
      id: asset.id,
      name: isDiscovered ? (asset.gallery?.entity_name || asset.id) : '???',
      description: isDiscovered ? (asset.gallery?.entity_description || '') : '',
      isDiscovered,
      data: asset
    };
  }
});

// Computed: Discovered character data for tweaks (keep reactive - depends on reactive selectedItemId/selectedTabType)
const discoveredCharacterData = computed((): DiscoveredCharacter | null => {
  if (selectedTabType.value !== 'characters' || !selectedItemId.value) return null;
  return game.coreSystem.discoveredCharacters.get(selectedItemId.value) || null;
});

// Computed: Discovered asset data for tweaks
const discoveredAssetData = computed((): DiscoveredAsset | null => {
  if (selectedTabType.value !== 'assets' || !selectedItemId.value) return null;
  return game.coreSystem.discoveredAssets.get(selectedItemId.value) || null;
});

// Initialize tweaks when a character is selected
const initializeCharacterTweaks = (templateId: string) => {
  if (characterTweaks.value.has(templateId)) return;

  const template = game.characterSystem.templatesMap.get(templateId);
  if (!template) return;

  const defaultAttributes = new Map<string, string>();
  const defaultSkinLayers = new Set<string>();

  // Set default attributes from template
  if (template.attributes) {
    for (const [key, value] of Object.entries(template.attributes)) {
      defaultAttributes.set(key, String(value));
    }
  }

  // Set default skin layers from template
  if (template.skin_layers && Array.isArray(template.skin_layers)) {
    for (const layer of template.skin_layers) {
      defaultSkinLayers.add(String(layer));
    }
  }

  // Initialize skin layer styles map
  const defaultSkinLayerStyles = new Map<string, string[]>();

  // Set default skin layer styles from template's skin layers
  for (const layerId of defaultSkinLayers) {
    const skinLayerSchema = game.characterSystem.skinLayersMap.get(layerId);
    if (skinLayerSchema?.styles && Array.isArray(skinLayerSchema.styles) && skinLayerSchema.styles.length > 0) {
      defaultSkinLayerStyles.set(layerId, [...skinLayerSchema.styles]);
    }
  }

  // Process default items in item slots
  if (template.item_slots && Array.isArray(template.item_slots)) {
    for (const slot of template.item_slots) {
      if (slot.item_default) {
        // Fetch the item template
        const itemTemplate = game.itemSystem.itemTemplatesMap.get(slot.item_default);
        if (itemTemplate && itemTemplate.status) {
          // Apply item's attributes
          if (itemTemplate.status.attributes) {
            for (const [key, value] of Object.entries(itemTemplate.status.attributes)) {
              defaultAttributes.set(key, String(value));
            }
          }

          // Apply item's skin layers
          if (itemTemplate.status.skin_layers && Array.isArray(itemTemplate.status.skin_layers)) {
            for (const layer of itemTemplate.status.skin_layers) {
              defaultSkinLayers.add(String(layer));
              // Initialize styles for new skin layers from items
              if (!defaultSkinLayerStyles.has(String(layer))) {
                const skinLayerSchema = game.characterSystem.skinLayersMap.get(String(layer));
                if (skinLayerSchema?.styles && Array.isArray(skinLayerSchema.styles) && skinLayerSchema.styles.length > 0) {
                  defaultSkinLayerStyles.set(String(layer), [...skinLayerSchema.styles]);
                }
              }
            }
          }
        }
      }
    }
  }

  characterTweaks.value.set(templateId, {
    attributes: defaultAttributes,
    skinLayers: defaultSkinLayers,
    skinLayerStyles: defaultSkinLayerStyles
  });
};

// Computed: Current character tweaks for selected character (keep reactive - depends on reactive ref)
const currentCharacterTweaks = computed(() => {
  if (!selectedItemId.value) return null;
  return characterTweaks.value.get(selectedItemId.value) || null;
});

// Initialize tweaks when an asset is selected
const initializeAssetTweaks = (assetId: string) => {
  if (assetTweaks.value.has(assetId)) return;

  const asset = game.dungeonSystem.assetsMap.get(assetId);
  if (!asset) return;

  // Set defaults from asset template
  const defaultAnimation = asset.animation != null ? String(asset.animation) : null;
  const defaultSkins = asset.skins ? [...asset.skins] : [];

  assetTweaks.value.set(assetId, {
    animation: defaultAnimation,
    skins: defaultSkins
  });
};

// Computed: Current asset tweaks for selected asset
const currentAssetTweaks = computed(() => {
  if (!selectedItemId.value) return null;
  return assetTweaks.value.get(selectedItemId.value) || null;
});

// Function: Get animation options for asset dropdown
const getAnimationOptions = () => {
  if (!discoveredAssetData.value) return [];

  return Array.from(discoveredAssetData.value.animations)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(anim => ({
      label: anim,
      value: anim
    }));
};

// Function: Get skin options for asset multiselect
const getSkinOptions = () => {
  if (!discoveredAssetData.value) return [];

  return Array.from(discoveredAssetData.value.skins)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map(skin => ({
      label: skin,
      value: skin
    }));
};

// Function: Get attribute options for dropdowns
const getAttributeOptions = () => {
  if (!discoveredCharacterData.value) return new Map();

  const options = new Map<string, Array<{ label: string; value: string }>>();

  // Sort attribute keys alphabetically
  const sortedKeys = Array.from(discoveredCharacterData.value.attributes.keys()).sort();

  for (const attrKey of sortedKeys) {
    const attrValuesSet = discoveredCharacterData.value.attributes.get(attrKey);
    if (!attrValuesSet) continue;

    const optionArray = Array.from(attrValuesSet)
      .sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }))
      .map(value => ({
        label: String(value),
        value: String(value)
      }));
    options.set(attrKey, optionArray);
  }

  return options;
};

// Function: Get skin layer options for multiselect
const getSkinLayerOptions = () => {
  if (!discoveredCharacterData.value) return [];

  return Array.from(discoveredCharacterData.value.skinLayers)
    .sort((a, b) => String(a).localeCompare(String(b), undefined, { sensitivity: 'base' }))
    .map(layerId => ({
      label: String(layerId),
      value: String(layerId)
    }));
};

// Function: Get skin layer style options for a specific layer
const getSkinLayerStyleOptions = (layerId: string) => {
  if (!discoveredCharacterData.value) return [];

  const stylesSet = discoveredCharacterData.value.skinLayerStyles.get(layerId);
  if (!stylesSet) return [];

  // Convert Set of individual CSS classes to array of options
  const options: Array<{ label: string; value: string }> = [];
  for (const styleClass of stylesSet) {
    options.push({ label: styleClass, value: styleClass });
  }

  // Sort options by label
  options.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));

  return options;
};

// Computed: Preview character for undiscovered
const previewCharacterUndiscovered = computed(() => {
  if (selectedTabType.value !== 'characters' || !selectedItemId.value) return null;
  return game.characterSystem.createCharacterFromTemplate('_gallery_preview_undiscovered', selectedItemId.value, true);
});

// Computed: Preview character for discovered with tweaks
const previewCharacterDiscovered = computed(() => {
  if (selectedTabType.value !== 'characters' || !selectedItemId.value) return null;
  if (!selectedItem.value?.data || !currentCharacterTweaks.value) return null;

  const char = game.characterSystem.createCharacter('_gallery_preview_discovered', selectedItem.value.data, true);

  // Apply tweaks
  for (const [key, value] of currentCharacterTweaks.value.attributes.entries()) {
    char.attributes[key] = value;
  }
  char.skinLayers = new Set(currentCharacterTweaks.value.skinLayers);
  char.skinLayerStyles = new Map(currentCharacterTweaks.value.skinLayerStyles);

  return char;
});

// Computed: Preview asset for discovered with tweaks
const previewAssetDiscovered = computed((): AssetObject | null => {
  if (selectedTabType.value !== 'assets' || !selectedItemId.value) return null;
  if (!selectedItem.value?.data || !currentAssetTweaks.value) return null;

  const asset = selectedItem.value.data as AssetObject;

  // Apply tweaks - create a new object with tweaked values
  return {
    ...asset,
    animation: currentAssetTweaks.value.animation ?? asset.animation,
    skins: currentAssetTweaks.value.skins.length > 0 ? currentAssetTweaks.value.skins : asset.skins
  };
});

// Methods
const selectTab = (type: 'characters' | 'assets' | 'scenes') => {
  game.coreSystem.setState('gallery_tab', type);

  // For scenes tab, don't need to handle gallery/item selection
  if (type === 'scenes') {
    selectedGalleryId.value = null;
    selectedItemId.value = null;
    return;
  }

  selectedGalleryId.value = null;
  selectedItemId.value = null;

  // Auto-open first gallery and select first item when switching tabs
  const galleries = getFilteredGalleries();
  if (galleries.length > 0) {
    const firstGallery = galleries[0];
    expandedGalleries.value.clear();
    expandedGalleries.value.add(firstGallery.id);

    // Select first item in first gallery
    const items = getGalleryItems(firstGallery.id);
    if (items.length > 0) {
      selectItem(items[0].id);
    }
  }
};

const selectItem = (itemId: string) => {
  selectedItemId.value = itemId;

  // Initialize tweaks based on item type
  if (selectedTabType.value === 'characters') {
    initializeCharacterTweaks(itemId);
  } else if (selectedTabType.value === 'assets') {
    initializeAssetTweaks(itemId);
  }
};

const updateAttributeValue = (attrKey: string, value: string) => {
  if (!currentCharacterTweaks.value) return;
  currentCharacterTweaks.value.attributes.set(attrKey, value);
};

const updateSkinLayers = (layers: string[]) => {
  if (!currentCharacterTweaks.value) return;
  currentCharacterTweaks.value.skinLayers = new Set(layers);

  // Initialize styles for newly added layers
  for (const layerId of layers) {
    if (!currentCharacterTweaks.value.skinLayerStyles.has(layerId)) {
      const skinLayerSchema = game.characterSystem.skinLayersMap.get(layerId);
      if (skinLayerSchema?.styles && Array.isArray(skinLayerSchema.styles) && skinLayerSchema.styles.length > 0) {
        currentCharacterTweaks.value.skinLayerStyles.set(layerId, [...skinLayerSchema.styles]);
      }
    }
  }

  // Remove styles for removed layers
  const layersSet = new Set(layers);
  for (const layerId of currentCharacterTweaks.value.skinLayerStyles.keys()) {
    if (!layersSet.has(layerId)) {
      currentCharacterTweaks.value.skinLayerStyles.delete(layerId);
    }
  }
};

const updateSkinLayerStyle = (layerId: string, selectedClasses: string[]) => {
  if (!currentCharacterTweaks.value) return;
  currentCharacterTweaks.value.skinLayerStyles.set(layerId, selectedClasses);
};

const updateAssetAnimation = (animation: string | null) => {
  if (!currentAssetTweaks.value) return;
  currentAssetTweaks.value.animation = animation;
};

const updateAssetSkins = (skins: string[]) => {
  if (!currentAssetTweaks.value) return;
  currentAssetTweaks.value.skins = skins;
};

const toggleGallery = (galleryId: string) => {
  if (expandedGalleries.value.has(galleryId)) {
    expandedGalleries.value.delete(galleryId);
  } else {
    expandedGalleries.value.add(galleryId);

    // Auto-select first item when opening a gallery
    const items = getGalleryItems(galleryId);
    if (items.length > 0 && !selectedItemId.value) {
      selectItem(items[0].id);
    }
  }
};

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value;
};

// Initialize gallery on mount
onMounted(() => {
  const galleries = getFilteredGalleries();
  if (galleries.length > 0) {
    const firstGallery = galleries[0];
    expandedGalleries.value.add(firstGallery.id);

    // Select first item in first gallery
    const items = getGalleryItems(firstGallery.id);
    if (items.length > 0) {
      selectItem(items[0].id);
    }
  }
});
</script>

<template>
  <div class="gallery-container">
    <!-- Left Column: Gallery List -->
    <div class="gallery-list-column">
      <!-- Top Tabs -->
      <div class="gallery-type-tabs">
        <div class="gallery-type-tab" :class="{ 'active': selectedTabType === 'characters' }"
          @click="selectTab('characters')">
          Characters
        </div>
        <div class="gallery-type-tab" :class="{ 'active': selectedTabType === 'assets' }" @click="selectTab('assets')">
          Assets
        </div>
        <div class="gallery-type-tab" :class="{ 'active': selectedTabType === 'scenes' }" @click="selectTab('scenes')">
          Scenes
        </div>
      </div>

      <!-- Scenes Tab Content -->
      <GalleryScenesTab v-if="selectedTabType === 'scenes'" class="scenes-tab-content" />

      <!-- Gallery List (for characters and assets tabs) -->
      <div v-else class="gallery-list-content">
        <div v-if="getFilteredGalleries().length === 0" class="empty-state">
          No {{ selectedTabType }} galleries found
        </div>

        <div v-else class="custom-accordion">
          <div v-for="gallery in getFilteredGalleries()" :key="gallery.id" class="accordion-panel">
            <div class="accordion-header" :class="{ 'expanded': expandedGalleries.has(gallery.id) }"
              @click="toggleGallery(gallery.id)">
              <span class="accordion-title">{{ gallery.name || gallery.id }}</span>
              <span class="accordion-icon">{{ expandedGalleries.has(gallery.id) ? '▼' : '►' }}</span>
            </div>
            <div v-if="expandedGalleries.has(gallery.id)" class="accordion-content">
              <div class="gallery-items-list">
                <template v-for="item in getGalleryItems(gallery.id)" :key="item.id">
                  <div class="gallery-item" :class="{
                    'selected': selectedItemId === item.id,
                    'undiscovered': !item.isDiscovered
                  }" @click="selectItem(item.id)">
                    {{ item.name }}
                  </div>

                  <!-- Character Tweaks Panel - appears right under selected item -->
                  <div
                    v-if="selectedItemId === item.id && selectedItem && selectedItem.type === 'character' && selectedItem.isDiscovered && discoveredCharacterData"
                    class="tweaks-panel-inline">
                    <div class="tweaks-divider"></div>

                    <!-- Attributes Section -->
                    <div v-if="getAttributeOptions().size > 0" class="tweaks-section">
                      <div class="tweaks-section-header">Attributes</div>
                      <div class="tweaks-attributes-grid">
                        <div v-for="[attrKey, options] in getAttributeOptions().entries()" :key="attrKey"
                          class="tweak-field">
                          <FloatLabel variant="on">
                            <Select :model-value="currentCharacterTweaks?.attributes.get(attrKey)"
                              @update:model-value="updateAttributeValue(attrKey, $event)" :options="options"
                              optionLabel="label" optionValue="value" class="w-full"
                              :pt="{ overlay: { class: 'dark-mode-dropdown' } }" />
                            <label>{{ attrKey }}</label>
                          </FloatLabel>
                        </div>
                      </div>
                    </div>

                    <!-- Styles Section -->
                    <div v-if="currentCharacterTweaks && currentCharacterTweaks.skinLayerStyles.size > 0"
                      class="tweaks-section">
                      <div class="tweaks-section-header">Styles</div>
                      <div class="tweaks-styles-grid">
                        <template v-for="layerId in Array.from(currentCharacterTweaks.skinLayers)" :key="layerId">
                          <div v-if="getSkinLayerStyleOptions(layerId).length > 0" class="tweak-field">
                            <FloatLabel variant="on">
                              <MultiSelect :model-value="currentCharacterTweaks.skinLayerStyles.get(layerId) || []"
                                @update:model-value="updateSkinLayerStyle(layerId, $event)"
                                :options="getSkinLayerStyleOptions(layerId)" optionLabel="label" optionValue="value"
                                class="w-full" :pt="{ overlay: { class: 'dark-mode-dropdown' } }" />
                              <label>{{ layerId }}</label>
                            </FloatLabel>
                          </div>
                        </template>
                      </div>
                    </div>

                    <!-- Skin Layers Section -->
                    <div v-if="getSkinLayerOptions().length > 0" class="tweaks-section">
                      <div class="tweaks-section-header">Skin Layers</div>
                      <div class="tweak-field tweak-field-full">
                        <FloatLabel variant="on">
                          <MultiSelect
                            :model-value="currentCharacterTweaks ? Array.from(currentCharacterTweaks.skinLayers) : []"
                            @update:model-value="updateSkinLayers($event)" :options="getSkinLayerOptions()"
                            optionLabel="label" optionValue="value" display="chip" class="w-full"
                            :pt="{ overlay: { class: 'dark-mode-dropdown' } }" />
                          <label>Skin Layers</label>
                        </FloatLabel>
                      </div>
                    </div>


                  </div>

                  <!-- Asset Tweaks Panel - appears right under selected spine asset item -->
                  <div
                    v-if="selectedItemId === item.id && selectedItem && selectedItem.type === 'asset' && selectedItem.isDiscovered && discoveredAssetData && selectedItem.data?.file_spine_skeleton"
                    class="tweaks-panel-inline">
                    <div class="tweaks-divider"></div>

                    <!-- Animation Section -->
                    <div v-if="getAnimationOptions().length > 0" class="tweaks-section">
                      <div class="tweaks-section-header">Animation</div>
                      <div class="tweak-field tweak-field-full">
                        <FloatLabel variant="on">
                          <Select :model-value="currentAssetTweaks?.animation"
                            @update:model-value="updateAssetAnimation($event)" :options="getAnimationOptions()"
                            optionLabel="label" optionValue="value" class="w-full"
                            :pt="{ overlay: { class: 'dark-mode-dropdown' } }" />
                          <label>Animation</label>
                        </FloatLabel>
                      </div>
                    </div>

                    <!-- Skins Section -->
                    <div v-if="getSkinOptions().length > 0" class="tweaks-section">
                      <div class="tweaks-section-header">Skins</div>
                      <div class="tweak-field tweak-field-full">
                        <FloatLabel variant="on">
                          <MultiSelect :model-value="currentAssetTweaks?.skins || []"
                            @update:model-value="updateAssetSkins($event)" :options="getSkinOptions()"
                            optionLabel="label" optionValue="value" display="chip" class="w-full"
                            :pt="{ overlay: { class: 'dark-mode-dropdown' } }" />
                          <label>Skins</label>
                        </FloatLabel>
                      </div>
                    </div>

                  </div>
                </template>

                <div v-if="getGalleryItems(gallery.id).length === 0" class="empty-state-small">
                  No items in this gallery
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Column: Preview Area (hidden for scenes tab) -->
    <div v-if="selectedTabType !== 'scenes'" class="gallery-preview-column">
      <div v-if="!selectedItem" class="empty-preview">
        Select an item from the gallery to preview
      </div>

      <template v-else>
        <!-- Description Overlay -->
        <div v-if="selectedItem.isDiscovered && selectedItem.description" class="description-overlay"
          :class="{ 'minimized': descriptionMinimized }">
          <div class="description-header">
            <span v-if="!descriptionMinimized">{{ selectedItem.name }}</span>
            <Button :icon="descriptionMinimized ? 'pi pi-window-maximize' : 'pi pi-window-minimize'" text rounded
              size="small" @click="descriptionMinimized = !descriptionMinimized" />
          </div>
          <div v-if="!descriptionMinimized" class="description-content" v-html="selectedItem.description"></div>
        </div>

        <!-- Preview Area -->
        <div class="preview-area">
          <!-- Character Preview -->
          <template v-if="selectedItem.type === 'character'">
            <div v-if="!selectedItem.isDiscovered" class="undiscovered-character" @click="toggleFullscreen">
              <CharacterDoll v-if="previewCharacterUndiscovered" :character="previewCharacterUndiscovered"
                :natural-size="true" :direct-render="true" />
            </div>
            <div v-else class="discovered-character" @click="toggleFullscreen">
              <CharacterDoll v-if="previewCharacterDiscovered" :character="previewCharacterDiscovered"
                :natural-size="true" :direct-render="true" />
            </div>
          </template>

          <!-- Asset Preview -->
          <template v-else-if="selectedItem.type === 'asset'">
            <div v-if="!selectedItem.isDiscovered" class="undiscovered-asset">
              <p>This asset has not been discovered yet</p>
            </div>
            <div v-else class="discovered-asset" @click="toggleFullscreen">
              <BackgroundAsset v-if="previewAssetDiscovered" :asset="previewAssetDiscovered" />
            </div>
          </template>
        </div>
      </template>

      <!-- Fullscreen Overlay -->
      <div v-if="isFullscreen && selectedItem" class="fullscreen-overlay" @click="toggleFullscreen">
        <template v-if="selectedItem.type === 'character'">
          <div v-if="!selectedItem.isDiscovered" class="fullscreen-character undiscovered">
            <CharacterDoll v-if="previewCharacterUndiscovered" :character="previewCharacterUndiscovered"
              :natural-size="true" :direct-render="true" />
          </div>
          <div v-else class="fullscreen-character">
            <CharacterDoll v-if="previewCharacterDiscovered" :character="previewCharacterDiscovered"
              :natural-size="true" :direct-render="true" />
          </div>
        </template>
        <template v-else-if="selectedItem.type === 'asset'">
          <div class="fullscreen-asset">
            <BackgroundAsset v-if="previewAssetDiscovered" :asset="previewAssetDiscovered" />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>


<style scoped>
/* Main Layout */
.gallery-container {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 20px;
  height: 100%;
  overflow: hidden;
  padding: 20px;
}

/* When only left column is visible (scenes tab), make it full width */
.gallery-container:has(.scenes-tab-content) {
  grid-template-columns: 1fr;
}

.scenes-tab-content {
  flex: 1;
  overflow: hidden;
}

/* Left Column */
.gallery-list-column {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow: hidden;
}

.gallery-type-tabs {
  display: flex;
  gap: 5px;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 5px;
  width: 300px;
  flex-shrink: 0;
}

.gallery-type-tab {
  flex: 1;
  padding: 10px;
  text-align: center;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.3s;
  font-weight: 500;
  background: rgba(0, 0, 0, 0.4);
  color: white;
  border: 1px solid transparent;
}

.gallery-type-tab:hover {
  background: rgba(0, 0, 0, 0.6);
  border-color: rgba(255, 255, 255, 0.2);
}

.gallery-type-tab.active {
  background: rgba(0, 0, 0, 0.7);
  border-color: rgba(255, 255, 255, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
}

.gallery-list-content {
  flex: 1;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border-radius: 8px;
  padding: 10px;
}

/* Custom Accordion */
.custom-accordion {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.accordion-header {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding: 0.75rem 1rem;
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  justify-content: space-between;
  align-items: center;
  user-select: none;
}

.accordion-header:hover {
  background: rgba(0, 0, 0, 0.5);
  border-color: rgba(255, 255, 255, 0.2);
}

.accordion-header.expanded {
  background: rgba(0, 0, 0, 0.6);
  border-color: rgba(255, 255, 255, 0.2);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.accordion-title {
  flex: 1;
}

.accordion-icon {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.8em;
  transition: color 0.3s ease;
}

.accordion-header:hover .accordion-icon,
.accordion-header.expanded .accordion-icon {
  color: white;
}

.accordion-content {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-top: none;
  border-radius: 0 0 6px 6px;
  padding: 0.75rem;
  color: white;
}

/* Gallery Items */
.gallery-items-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.gallery-item {
  padding: 8px 12px;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
  background: rgba(255, 255, 255, 0.05);
}

.gallery-item:hover {
  background: rgba(255, 255, 255, 0.15);
}

.gallery-item.selected {
  background: rgba(255, 255, 255, 0.25);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.gallery-item.undiscovered {
  font-style: italic;
  opacity: 0.6;
}

/* Tweaks Panel - Inline under selected item */
.tweaks-panel-inline {
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 12px;
  margin-top: 8px;
  margin-bottom: 8px;
}

.tweaks-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.2);
  margin-bottom: 12px;
}

.tweaks-section {
  margin-bottom: 16px;
}

.tweaks-section:last-child {
  margin-bottom: 0;
}

.tweaks-section-header {
  font-size: 0.85em;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.tweaks-attributes-grid {
  display: flex;
  flex-wrap: wrap;
  /*gap: 12px;*/
  margin-bottom: 12px;
}

.tweaks-attributes-grid:last-child {
  margin-bottom: 0;
}

.tweaks-styles-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.tweak-field {
  flex: 1 1 auto;

  /*min-width: 140px;*/
}

.tweak-field-full {
  flex: 1 1 100%;
  margin-bottom: 0;
}

/* PrimeVue Components - FloatLabel */
:deep(.p-floatlabel label) {
  color: rgba(255, 255, 255, 0.7) !important;
  background: transparent !important;
}

:deep(.p-floatlabel:has(.p-focus) label),
:deep(.p-floatlabel:has(.p-inputwrapper-filled) label) {
  color: rgba(255, 255, 255, 0.95) !important;
  background: rgba(0, 0, 0, 0.6) !important;
  padding: 0 4px !important;
}

/* PrimeVue Components - Select & MultiSelect */
.tweak-field :deep(.p-select),
.tweak-field :deep(.p-multiselect) {
  background: rgba(0, 0, 0, 0.6) !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
  border-radius: 6px !important;
  color: white !important;
  transition: all 0.3s ease !important;
  min-width: 109px;
}

.tweak-field :deep(.p-select:hover),
.tweak-field :deep(.p-multiselect:hover) {
  background: rgba(0, 0, 0, 0.7) !important;
  border-color: rgba(255, 255, 255, 0.3) !important;
}

.tweak-field :deep(.p-select.p-focus),
.tweak-field :deep(.p-multiselect.p-focus) {
  background: rgba(0, 0, 0, 0.7) !important;
  border-color: rgba(255, 255, 255, 0.4) !important;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1) !important;
}

.tweak-field :deep(.p-select .p-select-label),
.tweak-field :deep(.p-multiselect .p-multiselect-label) {
  color: white !important;
}

.tweak-field :deep(.p-select .p-select-dropdown),
.tweak-field :deep(.p-multiselect .p-multiselect-dropdown) {
  color: rgba(255, 255, 255, 0.8) !important;
}

.tweak-field :deep(.p-select .p-select-dropdown:hover),
.tweak-field :deep(.p-multiselect .p-multiselect-dropdown:hover) {
  color: white !important;
}

/* MultiSelect Chips */
.tweak-field :deep(.p-multiselect .p-chip) {
  background: rgba(255, 255, 255, 0.2) !important;
  color: white !important;
  border-radius: 4px !important;
  padding: 2px 8px !important;
}

.tweak-field :deep(.p-multiselect .p-chip .p-chip-remove-icon) {
  color: rgba(255, 255, 255, 0.8) !important;
}

.tweak-field :deep(.p-multiselect .p-chip .p-chip-remove-icon:hover) {
  color: white !important;
}

/* Dropdown Panel Styling (Global - panels are rendered outside component) */
:deep(.p-select-overlay),
:deep(.p-multiselect-overlay) {
  background: rgba(0, 0, 0, 0.95) !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
  border-radius: 6px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5) !important;
}

:deep(.p-select-overlay .p-select-option),
:deep(.p-multiselect-overlay .p-multiselect-option) {
  color: white !important;
  background: transparent !important;
  padding: 8px 12px !important;
  transition: background 0.2s ease !important;
}

:deep(.p-select-overlay .p-select-option:hover),
:deep(.p-multiselect-overlay .p-multiselect-option:hover) {
  background: rgba(255, 255, 255, 0.1) !important;
}

:deep(.p-select-overlay .p-select-option.p-focus),
:deep(.p-multiselect-overlay .p-multiselect-option.p-focus) {
  background: rgba(255, 255, 255, 0.15) !important;
}

:deep(.p-select-overlay .p-select-option.p-selected),
:deep(.p-multiselect-overlay .p-multiselect-option.p-selected) {
  background: rgba(255, 255, 255, 0.2) !important;
}

:deep(.p-multiselect-overlay .p-multiselect-option .p-checkbox) {
  border-color: rgba(255, 255, 255, 0.3) !important;
}

:deep(.p-multiselect-overlay .p-multiselect-option .p-checkbox.p-checked) {
  background: rgba(255, 255, 255, 0.3) !important;
  border-color: rgba(255, 255, 255, 0.5) !important;
}

/* Right Column - Preview */
.gallery-preview-column {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.empty-preview {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
}

.description-overlay {
  position: absolute;
  top: 10px;
  left: 10px;
  max-width: 400px;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(20px);
  border-radius: 8px;
  padding: 15px;
  z-index: 10;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  transition: all 0.3s;
}

.description-overlay.minimized {
  max-width: 250px;
}

.description-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-weight: 600;
  font-size: 1.1em;
}

.description-content {
  max-height: 300px;
  overflow-y: auto;
  line-height: 1.5;
}

.preview-area {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  border-radius: 8px;
  overflow: hidden;
  position: relative;
}

.undiscovered-character {
  filter: brightness(0);
  width: 100%;
  height: calc(100% - 20px);
  overflow: auto;
  display: flex;
  justify-content: safe left;
  align-items: start;
  cursor: pointer;
}

.discovered-character,
.discovered-asset {
  width: 100%;
  height: calc(100% - 20px);
  overflow: auto;
  display: flex;
  justify-content: safe left;
  align-items: start;
  cursor: pointer;
}

.undiscovered-asset {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: left;
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
}

/* Empty States */
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
}

.empty-state-small {
  text-align: center;
  padding: 20px 10px;
  color: rgba(255, 255, 255, 0.5);
  font-style: italic;
  font-size: 0.9em;
}

/* Scrollbar Styling */
.gallery-list-content::-webkit-scrollbar,
.description-content::-webkit-scrollbar,
.undiscovered-character::-webkit-scrollbar,
.discovered-character::-webkit-scrollbar,
.discovered-asset::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.gallery-list-content::-webkit-scrollbar-track,
.description-content::-webkit-scrollbar-track,
.undiscovered-character::-webkit-scrollbar-track,
.discovered-character::-webkit-scrollbar-track,
.discovered-asset::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.gallery-list-content::-webkit-scrollbar-thumb,
.description-content::-webkit-scrollbar-thumb,
.undiscovered-character::-webkit-scrollbar-thumb,
.discovered-character::-webkit-scrollbar-thumb,
.discovered-asset::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.gallery-list-content::-webkit-scrollbar-thumb:hover,
.description-content::-webkit-scrollbar-thumb:hover,
.undiscovered-character::-webkit-scrollbar-thumb:hover,
.discovered-character::-webkit-scrollbar-thumb:hover,
.discovered-asset::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Fullscreen Overlay */
.fullscreen-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-image: url('/assets/engine_assets/textures/green_cup.png');
  background-size: 256px 256px;
  background-repeat: repeat;
  z-index: 9999;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  overflow: auto;
}

.fullscreen-character,
.fullscreen-asset {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: auto;
}

.fullscreen-character.undiscovered {
  filter: brightness(0);
}

/* Fullscreen scrollbar styling */
.fullscreen-character::-webkit-scrollbar,
.fullscreen-asset::-webkit-scrollbar {
  width: 12px;
  height: 12px;
}

.fullscreen-character::-webkit-scrollbar-track,
.fullscreen-asset::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
}

.fullscreen-character::-webkit-scrollbar-thumb,
.fullscreen-asset::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 6px;
}

.fullscreen-character::-webkit-scrollbar-thumb:hover,
.fullscreen-asset::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}
</style>
