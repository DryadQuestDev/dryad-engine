import { EntityStatSchema } from "../schemas/entityStatSchema";
import { CharacterStatusSchema } from "../schemas/characterStatusSchema";
import { EntityAttributeSchema } from "../schemas/entityAttributeSchema";
import { CharacterSkinLayerSchema } from "../schemas/characterSkinLayerSchema";
import { PropertySchema } from "../schemas/propertySchema";
import { EntityTraitSchema } from "../schemas/entityTraitSchema";
import { CharacterTemplateSchema } from "../schemas/characterTemplateSchema";
import { DungeonConfigObject, DungeonConfigSchema } from "../schemas/dungeonConfigSchema";
import { DungeonEncounterSchema } from "../schemas/dungeonEncounterSchema";
import { DungeonRoomSchema } from "../schemas/dungeonRoomSchema";
import { SettingsSchema } from "../schemas/settingsSchema";
import { ManifestSchema } from "../schemas/manifestSchema";
import { Schema } from "../utility/schema";
import { DevEncountersDefaultSchema } from "../schemas/devEncountersDefaultSchema";
import { MusicSchema } from "../schemas/musicSchema";
import { SoundSchema } from "../schemas/soundSchema";
import { PluginSchema } from "../schemas/pluginShema";
import { ItemTemplateSchema } from "../schemas/itemTemplateSchema";
import { ItemSlotSchema } from "../schemas/itemSlotSchema";
import { ItemInventorySchema } from "../schemas/itemInventorySchema";
import { AssetSchema } from "../schemas/assetSchema";
import { DevSettingsSchema } from "../schemas/devSettings";
import { CharacterSceneSlotSchema } from "../schemas/characterSceneSlotSchema";
import { GallerySchema } from "../schemas/gallerySchema";
import { CustomChoiceSchema } from "../schemas/customChoiceSchema";
import { ItemRecipeSchema } from "../schemas/itemRecipeSchema";
import ExamplePopup from "./views/customPopups/ExamplePopup.vue";
import SkillTreeEditorPopup from "./views/customPopups/SkillTreeEditorPopup.vue";
import FacePickerPopup from "./views/customPopups/FacePickerPopup.vue";
import ItemSlotPickerPopup from "./views/customPopups/ItemSlotPickerPopup.vue";
import CharacterSceneSlotPopup from "./views/customPopups/CharacterSceneSlotPopup.vue";
import AssetPopup from "./views/customPopups/AssetPopup.vue";
import MaskEditorPopup from "./views/customPopups/MaskEditorPopup.vue";
import { Editor } from "./editor";
import { SkillSlotSchema } from "../schemas/skillSlotSchema";
import { SkillTreeSchema } from "../schemas/skillTreeSchema";
import { AbilityDefinitionSchema } from "../schemas/abilityDefinitionSchema";
import { AbilityTemplateSchema } from "../schemas/abilityTemplateSchema";
import { PoolDefinitionSchema } from "../schemas/poolDefinitionSchema";
import { PoolEntrySchema } from "../schemas/poolEntrySchema";

export type EditorTab = {
  id: string,
  name?: string,
  subtabs: {
    id: string,
    create?: 'game' | 'mod' | 'dungeon',
    file?: string,
    schema?: Schema,
    isArray?: boolean,
    title?: string,
    name?: string, // hardcoded tab title and form title (later: to forms add 's' to the end if it doesn't have 's' already at the end)
    requiresMod?: boolean,
    requiresDungeon?: boolean,
    showMap?: boolean,
    disableId?: boolean,
    loadSkinAttributes?: boolean,
    isPlugins?: boolean, // todo: implement, only for plugins tab
    specificDungeonTypes?: ('map' | 'screen' | 'text')[],
    ignoreDefaultValues?: boolean,
    customPopups?: string[],
  }[],
  disabled?: boolean, // if disabled when building ui by default
}

export const EDITOR_TABS: EditorTab[] = [
  {
    id: 'new',
    subtabs: [
      {
        id: 'new_game',
        create: 'game',
        schema: ManifestSchema,
      },
      {
        id: 'new_mod',
        create: 'mod',
        schema: ManifestSchema,
        ignoreDefaultValues: true,
      },
      {
        id: 'new_dungeon',
        create: 'dungeon',
        schema: DungeonConfigSchema,
      },
    ],
    disabled: true,
  },
  {
    id: 'general',
    subtabs: [
      {
        id: 'manifest',
        schema: ManifestSchema,
        file: 'manifest',
        title: 'manifest',
        requiresMod: true,
        disableId: true,
        ignoreDefaultValues: true,
      },
      {
        id: 'properties',
        schema: PropertySchema,
        file: 'properties',
        title: 'property',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'game_settings',
        schema: SettingsSchema,
        file: 'game_settings',
        title: 'game_settings',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'music',
        schema: MusicSchema,
        file: 'music',
        title: 'music',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'sounds',
        schema: SoundSchema,
        file: 'sounds',
        title: 'sounds',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'assets',
        schema: AssetSchema,
        file: 'assets',
        title: 'asset',
        isArray: true,
        requiresMod: true,
        customPopups: ['asset-editor'],
      },
      {
        id: 'galleries',
        schema: GallerySchema,
        file: 'galleries',
        title: 'gallery',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'custom_choices',
        schema: CustomChoiceSchema,
        file: 'custom_choices',
        title: 'custom_choice',
        isArray: true,
        requiresMod: true,
      },

      /*
      {
        id: 'dev_main',
        schema: DevMainSchema,
        file: 'dev_main',
        title: 'dev_main',
        isArray: true,
        requiresMod: true,
      }
      */
    ],
  },
  {
    id: 'dungeons',
    subtabs: [
      {
        id: 'config',
        schema: DungeonConfigSchema,
        file: '[dungeon]/config',
        title: 'config',
        requiresMod: true,
        requiresDungeon: true,
        disableId: true,
      },
      {
        id: 'rooms',
        schema: DungeonRoomSchema,
        file: '[dungeon]/rooms',
        title: 'room',
        isArray: true,
        requiresMod: true,
        requiresDungeon: true,
        showMap: true,
        specificDungeonTypes: ['map', 'text'],
      },
      {
        id: 'encounters',
        schema: DungeonEncounterSchema,
        file: '[dungeon]/encounters',
        title: 'encounter',
        isArray: true,
        requiresMod: true,
        requiresDungeon: true,
        showMap: true,
        specificDungeonTypes: ['map', 'screen'],
      },
    ],
  },
  {
    id: 'characters',
    subtabs: [
      {
        id: 'character_traits',
        schema: EntityTraitSchema,
        file: 'character_traits',
        title: 'character_trait',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'character_stats',
        schema: EntityStatSchema,
        file: 'character_stats',
        title: 'character_stat',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'character_attributes',
        schema: EntityAttributeSchema,
        file: 'character_attributes',
        title: 'character_attribute',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'character_skin_layers',
        schema: CharacterSkinLayerSchema,
        file: 'character_skin_layers',
        title: 'character_skin_layer',
        isArray: true,
        requiresMod: true,
        loadSkinAttributes: true,
        customPopups: ['mask-editor'],
      },
      {
        id: 'character_templates',
        schema: CharacterTemplateSchema,
        file: 'character_templates',
        title: 'character_template',
        isArray: true,
        requiresMod: true,
        customPopups: ['face-picker', 'item-slot-picker'],
      },
      {
        id: 'character_statuses',
        schema: CharacterStatusSchema,
        file: 'character_statuses',
        title: 'character_status',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'character_slot_templates',
        schema: CharacterSceneSlotSchema,
        file: 'character_slot_templates',
        title: 'character_slot_template',
        isArray: true,
        requiresMod: true,
        customPopups: ['character-scene-slot-editor'],
      },
      {
        id: 'skill_slots',
        schema: SkillSlotSchema,
        file: 'skill_slots',
        title: 'skill_slot',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'skill_trees',
        schema: SkillTreeSchema,
        file: 'skill_trees',
        title: 'skill_tree',
        isArray: true,
        requiresMod: true,
        customPopups: ['skill-tree-editor'],
      },
      {
        id: 'ability_definitions',
        schema: AbilityDefinitionSchema,
        file: 'ability_definitions',
        title: 'ability_definition',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'ability_templates',
        schema: AbilityTemplateSchema,
        file: 'ability_templates',
        title: 'ability_template',
        isArray: true,
        requiresMod: true,
      },
      /*
            {
              id: 'templates',
              schema: FighterSchema,
              file: 'fighters',
              title: 'fighter',
              isArray: true,
              requiresMod: true,
            },
      */
    ],
  },
  {
    id: 'items',
    subtabs: [
      {
        id: 'item_slots',
        schema: ItemSlotSchema,
        file: 'item_slots',
        title: 'item_slot',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'item_traits',
        schema: EntityTraitSchema,
        file: 'item_traits',
        title: 'item_trait',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'item_properties',
        schema: EntityStatSchema,
        file: 'item_properties',
        title: 'item_property',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'item_attributes',
        schema: EntityAttributeSchema,
        file: 'item_attributes',
        title: 'item_attribute',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'item_templates',
        schema: ItemTemplateSchema,
        file: 'item_templates',
        title: 'item_template',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'inventories',
        schema: ItemInventorySchema,
        file: 'item_inventories',
        title: 'item_inventory',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'item_recipes',
        schema: ItemRecipeSchema,
        file: 'item_recipes',
        title: 'item_recipe',
        isArray: true,
        requiresMod: true,
        // customPopups: ['example-popup'],
      },
      /*
      {
        id: 'generics',
        schema: GenericSchema,
      },
      */
    ],
  },
  {
    id: 'pools',
    subtabs: [
      {
        id: 'pool_definitions',
        schema: PoolDefinitionSchema,
        file: 'pool_definitions',
        title: 'pool_definition',
        isArray: true,
        requiresMod: true,
      },
      {
        id: 'pool_entries',
        schema: PoolEntrySchema,
        file: 'pool_entries',
        title: 'pool_entry',
        isArray: true,
        requiresMod: true,
      },
    ],
  },
  {
    id: 'dev',
    subtabs: [
      {
        id: 'dev_settings',
        schema: DevSettingsSchema,
        file: 'dev/dev_settings',
        title: 'dev_settings',
        isArray: false,
        requiresMod: true,
      },
      {
        id: 'plugins',
        schema: PluginSchema,
        // file: 'dev/plugins',
        title: 'plugin',
        isArray: true,
        requiresMod: true,
        isPlugins: true,
      },
      {
        id: 'encounters_default',
        schema: DevEncountersDefaultSchema,
        file: 'dev/encounters_default',
        title: 'encounter_default',
        isArray: true,
        requiresMod: true,
      },
    ],
  },
]

/**
 * Register all custom popup components
 * This function should be called after the Editor instance is created
 */
export function registerEditorCustomComponents(editor: Editor) {
  // Register example custom popup component
  editor.registerCustomComponent({
    id: 'example-popup',
    name: 'Example',
    component: ExamplePopup
  });

  // Register skill tree visual editor popup
  editor.registerCustomComponent({
    id: 'skill-tree-editor',
    name: 'Visual Editor',
    component: SkillTreeEditorPopup
  });

  // Register face picker popup for character templates
  editor.registerCustomComponent({
    id: 'face-picker',
    name: 'Face Picker',
    component: FacePickerPopup
  });

  // Register item slot picker popup for character templates
  editor.registerCustomComponent({
    id: 'item-slot-picker',
    name: 'Item Slots',
    component: ItemSlotPickerPopup
  });

  // Register character scene slot popup for visual editing
  editor.registerCustomComponent({
    id: 'character-scene-slot-editor',
    name: 'Visual Editor',
    component: CharacterSceneSlotPopup
  });

  // Register asset popup for visual editing
  editor.registerCustomComponent({
    id: 'asset-editor',
    name: 'Visual Editor',
    component: AssetPopup
  });

  // Register mask editor popup for skin layer mask bounds
  editor.registerCustomComponent({
    id: 'mask-editor',
    name: 'Mask Editor',
    component: MaskEditorPopup
  });
}