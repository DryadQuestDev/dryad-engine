/**
 * Character Image Loader Utility
 *
 * Loads character image layers based on skin_layers and attributes.
 * Reusable across editor popups (FacePickerPopup, ItemSlotPickerPopup, CharacterSceneSlotPopup).
 */

export interface CharacterTemplate {
  skin_layers?: string[];
  attributes?: Record<string, any>;
}

export interface SkinLayerData {
  id: string;
  images?: Record<string, string>;
  attributes?: string[];
  z_index?: number;
}

export interface ImageLayer {
  path: string;
  zIndex: number;
}

/**
 * Load character images from skin layers data
 *
 * @param character - Character template with skin_layers and attributes
 * @param skinLayersData - Array of skin layer definitions
 * @returns Array of image paths sorted by z-index
 */
export function loadCharacterImages(
  character: CharacterTemplate,
  skinLayersData: SkinLayerData[]
): string[] {
  const skinLayerIds = character?.skin_layers || [];
  if (!Array.isArray(skinLayerIds) || skinLayerIds.length === 0) return [];
  if (skinLayersData.length === 0) return [];

  const attributes = character?.attributes || {};
  const layersWithZIndex: ImageLayer[] = [];

  for (const layerId of skinLayerIds) {
    const skinLayer = skinLayersData.find((layer) => layer.id === layerId);
    if (!skinLayer || !skinLayer.images) continue;

    // Build the image key from the layer's attributes
    const attributeValues: string[] = [layerId];

    if (skinLayer.attributes && Array.isArray(skinLayer.attributes)) {
      for (const attrName of skinLayer.attributes) {
        const attrValue = attributes[attrName];
        if (attrValue) {
          attributeValues.push(attrValue);
        }
      }
    }

    const imageKey = attributeValues.join('_');
    const imagePath = skinLayer.images[imageKey];

    if (imagePath) {
      layersWithZIndex.push({
        path: imagePath,
        zIndex: skinLayer.z_index ?? 0
      });
    }
  }

  // Sort by z-index
  layersWithZIndex.sort((a, b) => a.zIndex - b.zIndex);

  return layersWithZIndex.map(layer => layer.path);
}

/**
 * Load character images with full layer information (includes z-index)
 * Use this when you need z-index information for rendering
 */
export function loadCharacterImageLayers(
  character: CharacterTemplate,
  skinLayersData: SkinLayerData[]
): ImageLayer[] {
  const skinLayerIds = character?.skin_layers || [];
  if (!Array.isArray(skinLayerIds) || skinLayerIds.length === 0) return [];
  if (skinLayersData.length === 0) return [];

  const attributes = character?.attributes || {};
  const layersWithZIndex: ImageLayer[] = [];

  for (const layerId of skinLayerIds) {
    const skinLayer = skinLayersData.find((layer) => layer.id === layerId);
    if (!skinLayer || !skinLayer.images) continue;

    // Build the image key from the layer's attributes
    const attributeValues: string[] = [layerId];

    if (skinLayer.attributes && Array.isArray(skinLayer.attributes)) {
      for (const attrName of skinLayer.attributes) {
        const attrValue = attributes[attrName];
        if (attrValue) {
          attributeValues.push(attrValue);
        }
      }
    }

    const imageKey = attributeValues.join('_');
    const imagePath = skinLayer.images[imageKey];

    if (imagePath) {
      layersWithZIndex.push({
        path: imagePath,
        zIndex: skinLayer.z_index ?? 0
      });
    }
  }

  // Sort by z-index
  return layersWithZIndex.sort((a, b) => a.zIndex - b.zIndex);
}
