import { StorageService } from '../services/storage.interface';
import { ElectronStorageService } from '../services/electron-storage.service';
import { LocalhostStorageService } from '../services/localhost-storage.service';
import { mergeById, Identifiable, mergeObjectArraySequentially } from '../functions/mergeById';
import { Game } from '../game/game';
import { ManifestObject } from '../schemas/manifestSchema';
import { PropertyObject } from '../schemas/propertySchema';
// import { Stat } from '../game/Stat';
import { load } from '../utility/save-system';
import { IndexedDbSaveService } from '../services/indexeddb-save.service';

import { Property } from '../game/property';
import { Ref, ref, watch } from 'vue';
import { useLocalStorage, useStorage } from '@vueuse/core';
import { SettingsObject } from '../schemas/settingsSchema';
import { MenuOptions } from './menuOptions';
import Editor from 'primevue/editor';

import { Editor as EngineEditor } from '../editor/editor';
import { DungeonData } from '../game/core/dungeon/dungeonData';
import { DungeonLine } from '../game/types';
import { DebugSettings } from '../game/data/debugSettings';
import { Character } from '../game/core/character/character';
import { PluginObject } from '../schemas/pluginShema';
import { updateGamePlayOrder } from '../utility/game-order-tracker';
import { gameLogger } from '../game/utils/logger';
import { showConfirm, showAlert } from '../services/dialogService';

// expose imports
import * as Vue from 'vue';
import * as PrimeVue from 'primevue';
import * as VueUse from '@vueuse/core';
import * as FloatingUi from '@floating-ui/vue';
import gsap from 'gsap';
import fastCopy from 'fast-copy';
import { PARTY_INVENTORY_ID } from '../game/systems/itemSystem';
import { DungeonRoomObject } from '../schemas/dungeonRoomSchema';
import { DungeonEncounterObject } from '../schemas/dungeonEncounterSchema';

// Reusable components for external scripts
import CharacterFace from '../game/views/CharacterFace.vue';
import CharacterDoll from '../game/views/progression/CharacterDoll.vue';
import BackgroundAsset from '../game/views/BackgroundAsset.vue';
import CustomComponentContainer from '../game/views/CustomComponentContainer.vue';

// Define the notification item structure
interface NotificationItem {
  id: number; // Use a number for simplicity, could be string/UUID
  message: string;
}

export type EngineState = 'main_menu' | 'game' | 'editor';

const GAME_SCRIPT_ATTRIBUTE = 'data-game-script'; // Attribute to identify game scripts
const GAME_CSS_ATTRIBUTE = 'data-game-css'; // Attribute to identify game CSS links

// Item slot size as a percentage of container height (used in both game and editor)
export const ITEM_SLOT_SIZE_PERCENT = 0.08; // 8%

// Arrowhead size for skill tree arrows (used in both game and editor)
export const ARROWHEAD_SIZE = 4;

export class Global {
  public engineState: Vue.Ref<EngineState> = Vue.ref('main_menu');
  private constructor() {
    // Determine environment and instantiate the appropriate storage service directly
    if (window.electron) {
      this.storageService = new ElectronStorageService();
    } else {
      this.storageService = new LocalhostStorageService();
    }
    // this.game = Game.getInstance(); // Removed direct instantiation
    // Directly assign engine version from Vite env variable
    this.engineVersion = import.meta.env.VITE_APP_VERSION || '0.0.0';

  }

  public static getInstance(): Global {
    if (!Global.instance) {
      Global.instance = new Global();
    }
    return Global.instance;
  }

  public userSettings!: Ref<Record<string, any>>;

  public isDocsOpen = ref(false);

  public engineVersion: string = "0.0.0"; // Initialized in constructor now

  private static instance: Global;
  public storageService!: StorageService; // Added definite assignment assertion
  // private game: Game; // Original private property
  get game(): Game { // Changed to a getter
    return Game.getInstance();
  }
  test: string = "global test";


  public localeMap: Map<string, string> = new Map<string, string>();

  private defaultLanguage: string = 'en';
  public selectedLanguage: string = 'en';

  public isMenuOpen = ref(false);
  public toggleMenu() {
    this.isMenuOpen.value = !this.isMenuOpen.value;
  }

  public toggleDocs() {
    this.isDocsOpen.value = !this.isDocsOpen.value;
  }

  public async init() {
    await this.initLanguages();
    this.initUserSettings();
  }

  public async toMainMenu() {
    let confirmDialog = "";
    if (this.engineState.value === 'game') {
      confirmDialog = "Are you sure you want to return to the main menu? All unsaved progress will be lost.";
    } else if (this.engineState.value === 'editor' && EngineEditor.getInstance().hasUnsavedChanges.value) {
      confirmDialog = "Are you sure you want to return to the main menu? All unsaved changes will be lost.";
    }


    if (confirmDialog) {
      const confirmed = await showConfirm({
        message: confirmDialog,
        header: 'Return to Main Menu'
      });
      if (confirmed) {
        // Clear dev mode state when returning to main menu
        localStorage.removeItem('devMode');
        localStorage.removeItem('dev_mode_selected_game');
        localStorage.removeItem('dev_mode_selected_mod');
        window.location.reload();
      }
    } else {
      // Clear dev mode state when returning to main menu
      localStorage.removeItem('devMode');
      localStorage.removeItem('dev_mode_selected_game');
      localStorage.removeItem('dev_mode_selected_mod');
      window.location.reload();
    }
  }

  public optionsToObject(settings: SettingsObject[]) {
    let object: any = {};
    for (let setting of settings) {
      if (setting.type === 'title') {
        continue;
      }
      if (setting.type === 'boolean') {
        const valueStr = String(setting.default_value).toLowerCase();
        object[setting.id] = !(valueStr === "false" || valueStr === "0" || valueStr === "");
      } else {
        object[setting.id] = setting.default_value;
      }
    }
    return object;
  }

  private initUserSettings() {
    let defaultObject = this.optionsToObject(MenuOptions);
    // Debug: console.log("MenuOptions object", defaultObject);

    // Get existing settings from localStorage
    const existingSettings = JSON.parse(localStorage.getItem('user-settings') || '{}');

    // Merge: existing values take precedence, but add any missing default values
    const mergedSettings = { ...defaultObject, ...existingSettings };

    // Update localStorage with merged settings
    localStorage.setItem('user-settings', JSON.stringify(mergedSettings));

    this.userSettings = useStorage('user-settings', mergedSettings);
  }

  private async initLanguages() {
    try {
      const localeDataEn = await this.readJson(`engine_files/locales/${this.defaultLanguage}.json`) as Record<string, string>;

      let localeData: Record<string, string> = { ...localeDataEn };

      if (this.selectedLanguage !== this.defaultLanguage) {
        const localeDataSelected = await this.readJson(`engine_files/locales/${this.selectedLanguage}.json`) as Record<string, string>;
        // Merge selected language over default (selected language translations take precedence)
        localeData = { ...localeDataEn, ...localeDataSelected };
      }

      this.localeMap = new Map<string, string>();
      // Populate the map from key-value object
      for (const [key, value] of Object.entries(localeData)) {
        this.localeMap.set(key, value || '');
      }

      // Debug: console.log('Loaded locale data:', this.localeMap);
    } catch (error) {
      gameLogger.error('Error loading locale data', error);
    }
  }

  // Add a helper method for easy lookup
  public getString(id: string | undefined, params: Record<string, string | number> = {}): string {
    let string = this.localeMap.get(id || '') || `[${id}]`; // Return ID as fallback if not found
    for (const [key, value] of Object.entries(params)) {
      string = string.replace(`|${key}|`, String(value));
    }
    return string;
  }


  private notificationCounter = 0; // Counter for unique IDs
  public notifications: Ref<NotificationItem[]> = ref([]);

  public addNotification(message: string) {
    const newNotification: NotificationItem = {
      id: Date.now() + this.notificationCounter++, // Simple unique ID
      message: message,
    };
    const updatedNotifications = [...this.notifications.value, newNotification];
    this.notifications.value = updatedNotifications;

    setTimeout(() => {
      // Find and remove by ID
      const filteredNotifications = this.notifications.value.filter(n => n.id !== newNotification.id);
      this.notifications.value = filteredNotifications;
    }, 4000);
  }

  public addNotificationId(id: string, params: Record<string, string | number> = {}) {
    this.addNotification(this.getString(id, params));
  }



  // Use new instance
  public indexedDbSaveService = new IndexedDbSaveService();

  async loadGame(gameId: string, saveName: string): Promise<Game | null> {
    //try {
    const data = await this.indexedDbSaveService.load(gameId, saveName);

    // Check if save exists
    if (!data) {
      gameLogger.error(`Save "${saveName}" not found for game "${gameId}"`);
      this.addNotification(`Save file not found: ${saveName}`);
      return null;
    }
    this.game.isNewGame = false;

    // load manifests
    let gameManifest = await this.readJson(`games_files/${gameId}/_core/manifest.json`) as ManifestObject;
    // Debug: console.warn(gameManifest);
    let modsManifests: ManifestObject[] = [];

    // Support both old saves (data.modList) and new saves (data.coreSystem.modList)
    let modList = data.coreSystem?.modList || data.modList || [];

    // Check if in dev mode and if a dev mod is selected
    const isDevMode = localStorage.getItem('devMode') === 'true';
    const devModId = localStorage.getItem('dev_mode_selected_mod');

    // If in dev mode with a selected mod, ensure it's in the mod list
    if (isDevMode && devModId && devModId !== '_core' && !modList.includes(devModId)) {
      modList = [...modList, devModId];
      // Update the save data's modList BEFORE loading it
      // This is critical - the save data will be loaded into game.coreSystem later
      if (data.coreSystem) {
        data.coreSystem.modList = modList;
      }
    }

    for (let modId of modList) {

      // If modId is the game ID itself, treat it as _core
      const actualModId = (modId === gameId) ? '_core' : modId;

      let modManifest = await this.readJson(`games_files/${gameId}/${actualModId}/manifest.json`) as ManifestObject;
      if (modId === "_core" || modId === gameId) {
        modManifest = { ...modManifest, id: "_core" };
      } else {
        // Ensure non-core mods have their id set correctly
        modManifest = { ...modManifest, id: actualModId };
      }
      modsManifests.push(modManifest);

    }


    let { mergedManifest } = await this.initGame(gameManifest, modsManifests);
    gameLogger.info("Game initialized, loading save data...");
    load(this.game, data);

    // Clean up any slots marked for removal (from exit animations that were in progress during save)
    if (this.game.dungeonSystem?.sceneSlots?.value) {
      this.game.dungeonSystem.sceneSlots.value = this.game.dungeonSystem.sceneSlots.value.filter(
        (slot: any) => !slot.isRemoving
      );
    }

    // Clean up any assets marked for removal (from exit animations that were in progress during save)
    if (this.game.dungeonSystem?.assets?.value) {
      this.game.dungeonSystem.assets.value = this.game.dungeonSystem.assets.value.filter(
        (asset: any) => !asset.isRemoving
      );
    }

    // Create any missing auto_create entities (for game updates that add new characters/inventories)
    this.createDefaultEntities();

    // Fetch Played Time
    // Reset playtime *after* core data is loaded, using playTime from saveMeta
    if (data.saveMeta && typeof data.saveMeta.playTime === 'number') {
      this.game.coreSystem.resetPlayTimeOnLoad(data.saveMeta.playTime);
      // Debug: console.log(`Savelist: Playtime reset to ${data.saveMeta.playTime} seconds.`);
    } else {
      // Fallback if saveMeta or playTime is missing (e.g., older save or error)
      this.game.coreSystem.resetPlayTimeOnLoad(0);
      gameLogger.warn("Could not find valid playTime in saveMeta - resetting to 0");
    }

    await this.initGameAfter(mergedManifest);
    this.game.coreSystem.loadGame(this.game, saveName);

    // Track that this game was played
    updateGamePlayOrder(gameId);
    this.initGameAfterScriptsLoaded();
    gameLogger.success(`Loaded game "${gameId}" from save "${saveName}"`);
    this.game.coreSystem.stateLoading.value = false;
    this.game.coreSystem.trigger("game_initiated");
    return this.game;
    // end fetch played time

    /* } catch (error) {
    console.error(`Failed to load game ${gameId} from save ${saveName}:`, error);
    alert("error_load_generic");
    // reload page
    window.location.reload();
    return null;
     }*/
  }

  async createNewGame(gameManifest: ManifestObject, modList: ManifestObject[]): Promise<void> {

    // Check if in dev mode and if a dev mod is selected
    const isDevMode = localStorage.getItem('devMode') === 'true';
    const devModId = localStorage.getItem('dev_mode_selected_mod');
    const gameId = gameManifest.id || '';

    // If in dev mode with a selected mod, ensure it's in the mod list
    // Skip if devModId is '_core' or the gameId itself (which represents _core)
    if (isDevMode && devModId && devModId !== '_core' && devModId !== gameId) {
      // Check if the mod is not already in the list
      const modExists = modList.some(mod => mod.id === devModId);
      if (!modExists) {
        // Load the dev mod manifest and add it
        try {
          let devModManifest = await this.readJson(`games_files/${gameId}/${devModId}/manifest.json`) as ManifestObject;
          devModManifest = { ...devModManifest, id: devModId }; // Ensure the id is set
          modList.push(devModManifest);
        } catch (error) {
          console.error(`Failed to load dev mod manifest for ${devModId}:`, error);
        }
      }
    }

    let coreManifest = { ...gameManifest };
    coreManifest.id = "_core";
    modList.push(coreManifest);
    modList = modList.sort((a, b) => (a.load_order || 0) - (b.load_order || 0));

    let { mergedManifest } = await this.initGame(gameManifest, modList);

    // Create auto_create entities for new game
    this.createDefaultEntities();

    await this.initGameAfter(mergedManifest);
    this.game.coreSystem.initNewGameState(this.game);

    // Track that this game was played
    updateGamePlayOrder(gameManifest.id || '');
    this.game.coreSystem.stateLoading.value = false;
    this.game.coreSystem.trigger("game_initiated");
  }

  private async initGame(gameManifest: ManifestObject, modList: ManifestObject[]): Promise<{ mergedManifest: ManifestObject | null }> {
    let gameId = gameManifest.id || "";
    this.game.coreSystem.gameId = gameId;
    this.game.coreSystem.modList = modList.sort((a, b) => (a.load_order || 0) - (b.load_order || 0)).map(mod => mod.id);
    const game = this.game;
    game.coreSystem.init();

    // Remove existing game scripts and styles
    this.removeGameScripts();
    this.removeGameCss();

    // merge manifests
    let mergedManifest = mergeObjectArraySequentially<ManifestObject>(modList);

    // load manisfest
    game.coreSystem.gameManifest = gameManifest;
    game.coreSystem.mergedManifest = mergedManifest!;
    game.coreSystem.modsManifests = modList;
    let modsIds = modList.map(mod => mod.id);

    // load plugin data first
    await this.loadPluginData(game, mergedManifest, modList);


    // init empty dungeon data and dungeon lines
    let dungeonsList = await this.storageService.getDungeonsList(gameId, modsIds);
    for (let dungeon of dungeonsList) {
      let newDungeonData = new DungeonData();
      game.dungeonSystem.dungeonDatas.value.set(dungeon, newDungeonData);
      let dungeonLines = await this.loadAndMergeArrayFile<DungeonLine>(gameId, `dungeons/${dungeon}/content_parsed`, modsIds);
      let dungeonRooms = await this.loadAndMergeArrayFile<DungeonRoomObject>(gameId, `dungeons/${dungeon}/rooms`, modsIds);
      let dungeonEncounters = await this.loadAndMergeArrayFile<DungeonEncounterObject>(gameId, `dungeons/${dungeon}/encounters`, modsIds);
      let dungeonLinesMap = new Map<string, DungeonLine>();
      let dungeonRoomsMap = new Map<string, DungeonRoomObject>();
      let dungeonEncountersMap = new Map<string, DungeonEncounterObject>();
      for (let line of dungeonLines) {
        dungeonLinesMap.set(line.id, line);
      }
      for (let room of dungeonRooms) {
        dungeonRoomsMap.set(room.id, room);
      }
      for (let encounter of dungeonEncounters) {
        dungeonEncountersMap.set(encounter.id, encounter);
      }
      game.dungeonSystem.dungeonLines.set(dungeon, dungeonLinesMap);
      game.dungeonSystem.dungeonRooms.set(dungeon, dungeonRoomsMap);
      game.dungeonSystem.dungeonEncounters.set(dungeon, dungeonEncountersMap);
      // Register the complete dungeon lines Map in dataRegistry
      game.coreSystem.dataRegistry.set(`dungeons/${dungeon}/content_parsed`, dungeonLinesMap);
      game.coreSystem.dataRegistry.set(`dungeons/${dungeon}/rooms`, dungeonRoomsMap);
      game.coreSystem.dataRegistry.set(`dungeons/${dungeon}/encounters`, dungeonEncountersMap);
    }
    // load character slot templates
    game.dungeonSystem.characterSlotTemplates = await this.fetchMapValues(gameId, `character_slot_templates`, modsIds);

    // load object maps for gallery system
    game.coreSystem.galleriesMap = await this.fetchMapValues(gameId, `galleries`, modsIds);


    // load object maps for custom choices
    game.logicSystem.customChoiceMap = await this.fetchMapValues(gameId, `custom_choices`, modsIds);

    // load object maps for character system
    game.characterSystem.statsMap = await this.fetchMapValues(gameId, `character_stats`, modsIds, 'order');
    game.characterSystem.statsVisibleMap = new Map(Array.from(game.characterSystem.statsMap.entries()).filter(([_, stat]) => !stat.is_hidden));
    game.characterSystem.attributesMap = await this.fetchMapValues(gameId, `character_attributes`, modsIds);
    game.characterSystem.skinLayersMap = await this.fetchMapValues(gameId, `character_skin_layers`, modsIds);
    game.characterSystem.traitsMap = await this.fetchMapValues(gameId, `character_traits`, modsIds, 'order');
    game.characterSystem.templatesMap = await this.fetchMapValues(gameId, `character_templates`, modsIds);
    game.characterSystem.statusesMap = await this.fetchMapValues(gameId, `character_statuses`, modsIds);
    game.characterSystem.skillSlotsMap = await this.fetchMapValues(gameId, `skill_slots`, modsIds);
    game.characterSystem.skillTreesMap = await this.fetchMapValues(gameId, `skill_trees`, modsIds);
    game.characterSystem.abilityDefinitionsMap = await this.fetchMapValues(gameId, `ability_definitions`, modsIds);
    game.characterSystem.abilityTemplatesMap = await this.fetchMapValues(gameId, `ability_templates`, modsIds);

    // load object maps for item system
    game.itemSystem.itemTemplatesMap = await this.fetchMapValues(gameId, `item_templates`, modsIds);
    game.itemSystem.inventoryTemplatesMap = await this.fetchMapValues(gameId, `item_inventories`, modsIds);
    game.itemSystem.itemTraitsMap = await this.fetchMapValues(gameId, `item_traits`, modsIds);
    game.itemSystem.itemAttributesMap = await this.fetchMapValues(gameId, `item_attributes`, modsIds);
    game.itemSystem.itemPropertiesMap = await this.fetchMapValues(gameId, `item_properties`, modsIds);
    game.itemSystem.itemSlotsMap = await this.fetchMapValues(gameId, `item_slots`, modsIds);
    game.itemSystem.itemRecipesMap = await this.fetchMapValues(gameId, `item_recipes`, modsIds);

    // load object maps for asset system
    game.dungeonSystem.assetsMap = await this.fetchMapValues(gameId, `assets`, modsIds);


    // load global variables
    let globalStats: PropertyObject[] = await this.loadAndMergeArrayFile<PropertyObject>(gameId, `properties`, modsIds);
    for (let stat of globalStats) {
      let statInstance = new Property();
      statInstance.init(stat);
      game.coreSystem.properties.value.set(statInstance.id, statInstance);
    }

    // load game settings
    let gameSettings: SettingsObject[] = await this.loadAndMergeArrayFile<SettingsObject>(gameId, `game_settings`, modsIds);

    game.coreSystem.gameSettingsSchema = gameSettings;
    game.coreSystem.settings.value = this.optionsToObject(gameSettings);

    // load object maps for music and sounds
    game.coreSystem.musicMap = await this.fetchMapValues(gameId, `music`, modsIds);
    game.coreSystem.soundsMap = await this.fetchMapValues(gameId, `sounds`, modsIds);


    // set debug settings
    game.coreSystem.debugSettings.value = this.optionsToObject(DebugSettings);
    let debugStorage = JSON.parse(localStorage.getItem('debug-settings') || '{}');
    if (debugStorage[gameId]) {
      for (let key in debugStorage[gameId]) {
        game.coreSystem.debugSettings.value[key as keyof typeof game.coreSystem.debugSettings.value] = debugStorage[gameId][key];
      }
    }

    // ============================================
    // Manual registration for dataRegistry
    // ============================================

    // Register properties (loaded as array, converted to Map with Property instances)
    game.coreSystem.dataRegistry.set('properties', game.coreSystem.properties.value);

    // Register statsVisibleMap (derived from statsMap)
    game.coreSystem.dataRegistry.set('character_stats_visible', game.characterSystem.statsVisibleMap);

    // Note: The following data structures have complex formats and may need special handling:
    // - dungeonLines: Map<dungeonId, Map<lineId, DungeonLine>> - nested structure, not directly accessible by file path
    // - dungeonDatas: Ref<Map<string, DungeonData>> - runtime data, not file-based
    // - characters: Ref<Map<string, Character>> - runtime instances
    // - inventories: Ref<Map<string, Inventory>> - runtime instances
    // - settings.value - converted from array to object, not a Map
    // - debugSettings.value - object, not a Map


    await this.loadExternalFiles(game, mergedManifest, modList);
    return { mergedManifest };
  }

  /**
   * Creates auto_create entities (characters, inventories, etc.) that don't already exist.
   * This runs after save data is loaded, so it can properly detect existing entities
   * and only create missing ones (useful for game updates that add new entities).
   */
  private createDefaultEntities(): void {
    const game = this.game;

    // create default inventories
    //console.log("[createDefaultEntities] Checking for missing auto_create inventories");
    for (let inventoryObject of game.itemSystem.inventoryTemplatesMap.values()) {
      if (inventoryObject.auto_create) {
        let isAlreadyCreated = game.itemSystem.inventories.value.has(inventoryObject.id);
        if (isAlreadyCreated) {
          // console.log("[createDefaultEntities] Inventory already exists, skipping:", inventoryObject.id);
          continue;
        }
        //console.log("[createDefaultEntities] Creating missing inventory:", inventoryObject.id);
        let inventory = game.itemSystem.createInventoryFromTemplate(inventoryObject.id);
        game.itemSystem.addInventory(inventory);
      }
    }

    // create party inventory if it doesn't exist
    const isPartyInventoryExists = game.itemSystem.inventories.value.has(PARTY_INVENTORY_ID);
    if (!isPartyInventoryExists) {
      game.itemSystem.createInventory(PARTY_INVENTORY_ID);
    }

    // create default characters
    //console.log("[createDefaultEntities] Checking for missing auto_create characters");
    for (let characterObject of game.characterSystem.templatesMap.values()) {
      if (characterObject.auto_create) {
        let isAlreadyCreated = game.characterSystem.characters.value.has(characterObject.id);
        if (isAlreadyCreated) {
          //console.log("[createDefaultEntities] Character already exists, skipping:", characterObject.id);
          continue;
        }
        //console.log("[createDefaultEntities] Creating missing character:", characterObject.id);
        let character = game.characterSystem.createCharacterFromTemplate(characterObject.id, characterObject.id);
        game.characterSystem.addCharacter(character, characterObject.add_to_party);
      }
    }


  }

  private async fetchMapValues(gameId: string, fileName: string, modsIds: string[], sortBy: string = 'order'): Promise<Map<string, any>> {
    let map = new Map<string, any>();
    let objects: any[] = await this.loadAndMergeArrayFile<any>(gameId, fileName, modsIds);
    if (sortBy) {
      objects.sort((a, b) => (a[sortBy] || 0) - (b[sortBy] || 0));
    }
    for (let object of objects) {
      let value = { ...object };
      // delete value.id;
      map.set(object.id, value);
    }

    // Auto-register in dataRegistry for centralized access
    this.game.coreSystem.dataRegistry.set(fileName, map);

    return map;
  }
  private async loadPluginData(game: Game, mergedManifest: ManifestObject | null, modList: ManifestObject[]) {

    let gameId = game.coreSystem.gameId;
    let modsIds = modList.map(mod => mod.id);

    // load plugins start
    let pluginList = game.coreSystem.mergedManifest.plugins;
    // Debug: console.warn("pluginList", pluginList);

    // create a list of paths to the plugins for all mods. Overwrite the same plugin with the latest mod
    const pluginPathsMap = new Map<string, string>();

    // Iterate through mods in reverse order so latest mod overwrites earlier ones
    for (let i = modList.length - 1; i >= 0; i--) {
      const mod = modList[i];
      const modId = mod.id;

      if (pluginList && Array.isArray(pluginList)) {
        for (const pluginName of pluginList) {
          // Check if this plugin exists in the current mod
          const pluginPath = `games_files/${gameId}/${modId}/plugins/${pluginName}`;

          // Only add if we haven't seen this plugin yet (latest mod wins)
          if (!pluginPathsMap.has(pluginName)) {
            try {
              // Verify the plugin exists before adding
              await this.storageService.listFolders(`games_files/${gameId}/${modId}/plugins`).then(folders => {
                if (folders.includes(pluginName)) {
                  pluginPathsMap.set(pluginName, pluginPath);
                }
              }).catch(() => {
                // Plugin folder doesn't exist in this mod, continue
              });
            } catch (error) {
              // Plugin folder doesn't exist in this mod, continue
            }
          }
        }
      }
    }

    // Also check for global plugins that aren't overridden by mods
    if (pluginList && Array.isArray(pluginList)) {
      for (const pluginName of pluginList) {
        if (!pluginPathsMap.has(pluginName)) {
          const globalPluginPath = `engine_files/plugins/${pluginName}`;
          try {
            await this.storageService.listFolders('engine_files/plugins').then(folders => {
              if (folders.includes(pluginName)) {
                pluginPathsMap.set(pluginName, globalPluginPath);
              }
            }).catch(() => {
              // Global plugin doesn't exist, continue
            });
          } catch (error) {
            // Global plugin doesn't exist, continue
          }
        }
      }
    }

    const finalPluginPaths = Array.from(pluginPathsMap.values());
    game.coreSystem.pluginPaths = pluginPathsMap;
    //console.log("finalPluginPaths", finalPluginPaths);

    // load plugin.json for each path, retrieve a list of schemas' ids, load the corresponding files from plugins_data folder using loadAndMergeArrayFile and populate game.coreSystem.plugins with this data
    for (const pluginPath of finalPluginPaths) {
      try {
        // Load plugin.json file
        const pluginJsonPath = `${pluginPath}/plugin.json`;
        const pluginJson = await this.storageService.readJson(pluginJsonPath);

        if (!pluginJson) {
          gameLogger.warn(`Plugin JSON not found at ${pluginJsonPath}`);
          continue;
        }

        // Convert plugin.json to PluginObject format
        const pluginConfig = this.convertJsonToPluginObject(pluginJson, pluginJson.id);

        // Store the plugin config for later reuse in loadAndMergeArrayFile
        game.coreSystem.pluginConfigs.set(pluginConfig.id, pluginConfig);

        if (pluginConfig.tabs && Array.isArray(pluginConfig.tabs)) {
          // Initialize plugin data map for this plugin
          const pluginDataMap = new Map<string, any>();

          // Process each tab/schema
          for (const tab of pluginConfig.tabs) {
            const schemaId = tab.id;

            if (!schemaId) {
              continue;
            }

            try {
              // Load data for this schema from plugins_data folder using appropriate method based on isArray
              const pluginDataPath = `plugins_data/${pluginConfig.id}/${schemaId}`;
              let schemaData: any;

              if (tab.isArray) {
                schemaData = await this.loadAndMergeArrayFile<any>(gameId, pluginDataPath, modsIds);
              } else {
                schemaData = await this.loadAndMergeSingleFile<any>(gameId, pluginDataPath, modsIds);
              }

              // Store the data in the plugin's data map
              pluginDataMap.set(schemaId, schemaData);

              // Debug: console.log(`Loaded plugin data for ${pluginConfig.id}/${schemaId}:`, schemaData);
            } catch (error) {
              gameLogger.warn(`Failed to load plugin data for ${pluginConfig.id}/${schemaId}:`, error);
              // Continue with other schemas even if one fails
            }
          }

          // Store the plugin data map in game.coreSystem.plugins
          game.coreSystem.plugins.set(pluginConfig.id, pluginDataMap);

          // Register plugin data in dataRegistry for centralized access
          for (const [schemaId, schemaData] of pluginDataMap) {
            const registryPath = `plugins_data/${pluginConfig.id}/${schemaId}`;
            game.coreSystem.dataRegistry.set(registryPath, schemaData);
          }
        }

      } catch (error) {
        gameLogger.error(`Failed to load plugin config from ${pluginPath}:`, error);
      }



    }

    // load plugins end


  }

  private async loadExternalFiles(game: Game, mergedManifest: ManifestObject | null, modList: ManifestObject[]) {
    let gameId = game.coreSystem.gameId;
    let modsIds = modList.map(mod => mod.id);

    // expose game to global
    (window as any).engine = {
      game: this.game,
      // expose vue to global
      vue: Vue,
      primeVue: PrimeVue,
      vueUse: VueUse,
      floatingUi: FloatingUi,
      gsap: gsap,
      fastCopy: fastCopy,
      // expose reusable components
      components: {
        CharacterFace,
        CharacterDoll,
        BackgroundAsset,
        CustomComponentContainer,
      }
    };


    // load js and css from plugins
    for (const [pluginId, pluginPath] of this.game.coreSystem.pluginPaths) {
      //console.warn("pluginPath", pluginPath);
      let scripts = await this.listFiles(`${pluginPath}/scripts`);
      let csss = await this.listFiles(`${pluginPath}/css`);
      //console.warn("pluginPath scripts", scripts);
      //console.warn("pluginPath csss", csss);
      for (const script of scripts) {
        // Add 'assets/' prefix for browser loading
        await this.loadScript(`assets/${pluginPath}/scripts/${script}`);
      }
      for (const css of csss) {
        // Add 'assets/' prefix for browser loading
        await this.loadCss(`assets/${pluginPath}/css/${css}`);
      }
    }

    // load external scripts
    let scriptPaths = mergedManifest?.scripts || [];
    // Debug: console.log("Scripts to load:", scriptPaths);

    // Load scripts sequentially
    for (const scriptPath of scriptPaths) {
      const fullPath = `${scriptPath}`;
      try {
        await this.loadScript(fullPath);
        gameLogger.success(`Successfully loaded script: ${fullPath}`);
      } catch (error) {
        gameLogger.error(`Failed to load script: ${fullPath}`, error);
        this.addNotification(`Failed to load script: ${scriptPath}`); // Notify user
      }
    }

    // load external css
    let cssPaths = mergedManifest?.css || [];
    // Debug: console.log("CSS to load:", cssPaths);
    for (const cssPath of cssPaths) {
      const fullPath = `${cssPath}`;
      try {
        await this.loadCss(fullPath);
        gameLogger.success(`Successfully loaded CSS: ${fullPath}`);
      } catch (error) {
        gameLogger.error(`Failed to load CSS: ${fullPath}`, error);
        this.addNotification(`Failed to load CSS: ${cssPath}`); // Notify user
      }
    }
  }

  private async initGameAfter(mergedManifest: ManifestObject | null): Promise<void> {

    this.initGameAfterScriptsLoaded();
    gameLogger.success("Game initiated!");
    this.game.coreSystem.gameInitiated.value = true;
  }

  private initGameAfterScriptsLoaded(): void {

    // trigger character_render event for all characters
    for (let character of this.game.characterSystem.characters.value.values()) {
      character.evaluateRenderedLayers();
    }

  }

  private removeGameScripts(): void {
    const existingScripts = document.querySelectorAll(`script[${GAME_SCRIPT_ATTRIBUTE}]`);
    existingScripts.forEach(script => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
        // Debug: console.log(`Removed script: ${script.getAttribute('src')}`);
      }
    });
  }

  private removeGameCss(): void {
    const existingLinks = document.querySelectorAll(`link[${GAME_CSS_ATTRIBUTE}]`);
    existingLinks.forEach(link => {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
        // Debug: console.log(`Removed CSS: ${link.getAttribute('href')}`);
      }
    });
  }

  private loadScript(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if script already exists
      if (document.querySelector(`script[src="${path}"]`)) {
        gameLogger.warn(`Script already loaded: ${path}`);
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = path;
      script.setAttribute('type', 'module');
      script.setAttribute(GAME_SCRIPT_ATTRIBUTE, 'true'); // Mark as a game script
      script.async = false; // Load scripts sequentially to maintain order if needed
      script.onload = () => resolve();
      script.onerror = (error) => {
        gameLogger.error(`Error loading script ${path}:`, error);
        reject(error);
      };
      document.body.appendChild(script); // Append to body
    });
  }

  private loadCss(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if CSS link already exists
      if (document.querySelector(`link[href="${path}"]`)) {
        gameLogger.warn(`CSS already loaded: ${path}`);
        resolve();
        return;
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = path;
      link.setAttribute(GAME_CSS_ATTRIBUTE, 'true'); // Mark as game CSS
      link.onload = () => resolve();
      link.onerror = (error) => {
        gameLogger.error(`Error loading CSS ${path}:`, error);
        reject(error);
      };
      document.head.appendChild(link); // Append link to head
    });
  }

  public async loadAndMergeSingleFile<T extends Identifiable>(gameId: string, path: string, modList: string[], ignorePlugins: boolean = false): Promise<T> {
    let dataList: T[] = [];

    // 1. First, collect plugin data (lowest precedence)
    const pluginData = await this.getPluginDataForSingleFile<T>(gameId, path, modList, ignorePlugins);
    if (pluginData.length > 0) {
      dataList.push(...pluginData);
    }

    for (let mod of modList) {
      let data = await this.readJson(`games_files/${gameId}/${mod}/${path}.json`) as T;
      dataList.push(data);
    }
    let mergedData = mergeObjectArraySequentially<T>(dataList);
    if (!mergedData) {
      throw new Error(`Failed to merge ${path} for game ${gameId} and mods ${modList}`);
    }
    return mergedData;
  }

  public async loadAndMergeArrayFile<T extends Identifiable>(gameId: string, path: string, modList: string[], ignorePlugins: boolean = false): Promise<T[]> {
    let dataList: T[][] = []; // dataList should hold arrays T[]

    // 1. First, collect plugin data (lowest precedence)
    const pluginData = await this.getPluginDataForArrayFile<T>(gameId, path, modList, ignorePlugins);
    if (pluginData.length > 0) {
      dataList.push(pluginData);
    }

    // 2. Then load mod files in order (higher precedence)
    for (let mod of modList) {
      //console.error("mod", mod);
      try {
        let fullPath = `games_files/${gameId}/${mod}/${path}.json`;
        let isExists = await this.pathExists(fullPath);
        if (!isExists) {
          //console.error(`File not found: ${fullPath}`);
          continue;
        }
        let data = await this.readJson(fullPath) as T[];
        //console.log(data);
        if (data && Array.isArray(data)) { // Ensure data is a valid array
          dataList.push(data);
        }
      } catch (error) {
        // File doesn't exist for this mod, continue
        // Debug: console.log(`File not found: games_files/${gameId}/${mod}/${path}.json`);
      }
    }

    // Spread dataList (T[][]) so each inner array (T[]) is passed as an argument
    let mergedData = mergeById<T>(...dataList);
    //console.log(mergedData);
    return mergedData;
  }

  /**
   * Collects plugin data for a specific file path from all active plugins
   * Returns merged plugin data in the correct precedence order
   */
  private async getPluginDataForArrayFile<T extends Identifiable>(gameId: string, fileName: string, modList: string[], ignorePlugins: boolean = false): Promise<T[]> {

    if (ignorePlugins) {
      return [];
    }

    let pluginDataList: T[][] = [];

    // Get the merged manifest to access the plugin list
    const mergedManifest = this.game.coreSystem.mergedManifest;
    const pluginList = mergedManifest?.plugins;

    if (!pluginList || !Array.isArray(pluginList)) {
      return [];
    }

    // Extract the file name from path (remove directory structure)
    const fileNameOnly = fileName.split('/').pop() || fileName;

    // Use the already-loaded plugin configs from game.coreSystem.pluginConfigs
    // These were loaded during initGame() to avoid loading them twice
    for (const [pluginId, pluginConfig] of this.game.coreSystem.pluginConfigs) {
      // Check if plugin has data for this file
      if (pluginConfig.data && Array.isArray(pluginConfig.data)) {
        for (const dataItem of pluginConfig.data) {
          if (dataItem.fileName === fileNameOnly && dataItem.fileData) {
            try {
              const parsedData = JSON.parse(dataItem.fileData);
              if (Array.isArray(parsedData)) {
                pluginDataList.push(parsedData as T[]);
              }
            } catch (e) {
              gameLogger.error('Failed to parse plugin fileData:', e);
            }
          }
        }
      }
    }

    // Merge all plugin data arrays
    if (pluginDataList.length > 0) {
      return mergeById<T>(...pluginDataList);
    }

    return [];
  }

  private async getPluginDataForSingleFile<T extends Identifiable>(gameId: string, fileName: string, modList: string[], ignorePlugins: boolean = false): Promise<T[]> {

    if (ignorePlugins) {
      return [];
    }

    let pluginDataList: T[] = [];

    // Get the merged manifest to access the plugin list
    const mergedManifest = this.game.coreSystem.mergedManifest;
    const pluginList = mergedManifest?.plugins;

    if (!pluginList || !Array.isArray(pluginList)) {
      return [];
    }

    // Extract the file name from path (remove directory structure)
    const fileNameOnly = fileName.split('/').pop() || fileName;

    // Use the already-loaded plugin configs from game.coreSystem.pluginConfigs
    // These were loaded during initGame() to avoid loading them twice
    for (const [pluginId, pluginConfig] of this.game.coreSystem.pluginConfigs) {
      // Check if plugin has data for this file
      if (pluginConfig.data && Array.isArray(pluginConfig.data)) {
        for (const dataItem of pluginConfig.data) {
          if (dataItem.fileName === fileNameOnly && dataItem.fileData) {
            try {
              const parsedData = JSON.parse(dataItem.fileData);
              // For single files, the data should be a single object
              pluginDataList.push(parsedData as T);
            } catch (e) {
              gameLogger.error('Failed to parse plugin fileData:', e);
            }
          }
        }
      }
    }

    return pluginDataList;
  }

















  async readJson(path: string): Promise<any> {
    return this.storageService.readJson(path);
  }

  async writeJson(path: string, data: any): Promise<void> {
    return this.storageService.writeJson(path, data);
  }

  async listFiles(path: string): Promise<string[]> {
    return this.storageService.listFiles(path);
  }
  async listFolders(path: string): Promise<string[]> {
    return this.storageService.listFolders(path);
  }

  async listFilesRecursively(path: string, assetFolders?: string[], ignoreEngineAssets?: boolean): Promise<string[]> {
    return this.storageService.listFilesRecursively(path, assetFolders, ignoreEngineAssets);
  }

  async deleteFile(path: string, recursive: boolean = false): Promise<void> {
    return this.storageService.deleteFile(path, recursive);
  }

  async pathExists(path: string): Promise<boolean> {
    return this.storageService.pathExists(path);
  }

  async createDir(path: string): Promise<void> {
    return this.storageService.createDir(path);
  }

  async getFileSize(path: string): Promise<number> {
    return this.storageService.getFileSize(path);
  }

  async convertToWebP(options: {
    pngPath: string;
    quality: number;
    lossless: boolean;
  }): Promise<{
    webpPath: string;
    originalSize: number;
    newSize: number;
  }> {
    return this.storageService.convertToWebP(options);
  }

  async backupOriginalFile(path: string): Promise<{
    success: boolean;
    backupPath: string;
  }> {
    return this.storageService.backupOriginalFile(path);
  }

  async restoreFromBackup(path: string): Promise<{ success: boolean }> {
    if (this.storageService.restoreFromBackup) {
      return this.storageService.restoreFromBackup(path);
    }
    throw new Error('Restore from backup not supported');
  }

  async exportGameZip(options: {
    gameId: string;
    modId: string;
    assetFolders: string[];
    outputFileName: string;
  }): Promise<{
    success: boolean;
    zipPath: string;
    fileName: string;
    size: number;
  }> {
    return this.storageService.exportGameZip(options);
  }

  async scanInstallArchives(): Promise<string[]> {
    return this.storageService.scanInstallArchives();
  }

  async readArchiveManifest(zipFileName: string): Promise<{
    valid: boolean;
    name?: string;
    type?: 'game' | 'mod';
    version?: string;
    gameId?: string;
    modId?: string;
    error?: string;
  }> {
    return this.storageService.readArchiveManifest(zipFileName);
  }

  async checkModInstalled(gameId: string, modId: string): Promise<{
    installed: boolean;
    version?: string;
  }> {
    return this.storageService.checkModInstalled(gameId, modId);
  }

  async installGameArchive(
    zipFileName: string,
    onProgress?: (progress: { percent: number; currentFile: string; totalFiles: number }) => void
  ): Promise<{
    success: boolean;
    error?: string;
    errorCode?: string;
  }> {
    return this.storageService.installGameArchive(zipFileName, onProgress);
  }

  async getGamesList(): Promise<ManifestObject[]> {
    return this.storageService.getGamesList();
  }

  async getModsList(game: string): Promise<ManifestObject[]> {
    return this.storageService.getModsList(game);
  }

  // Documentation methods
  async readDocFile(category: string, page: string, language: string = 'en'): Promise<{
    content?: string;
    error?: string;
  }> {
    return this.storageService.readDocFile(category, page, language);
  }

  async searchDocs(query: string, language: string = 'en'): Promise<{
    results?: any[];
    total?: number;
    error?: string;
  }> {
    return this.storageService.searchDocs(query, language);
  }

  /**
   * Converts plugin.json (old format with records) to PluginObject (new format with arrays)
   */
  private convertJsonToPluginObject(json: any, pluginId: string): PluginObject {
    // Convert tabs schema from object format to array format
    const convertedTabs = (json.tabs || []).map((tab: any) => {
      if (tab.schema && typeof tab.schema === 'object' && !Array.isArray(tab.schema)) {
        // Convert schema from object to array format
        const schemaArray = Object.entries(tab.schema).map(([propertyId, schemaDef]: [string, any]) => ({
          ...schemaDef,
          uid: schemaDef.uid || this.generateUid(),
          propertyId,
          id: propertyId  // Use id field for form labels - MUST be after spread to override
        }));
        return { ...tab, schema: schemaArray };
      }
      return tab;
    });

    // Convert data from object format to array format
    const dataArray = [];
    if (json.data && typeof json.data === 'object') {
      for (const [fileName, fileData] of Object.entries(json.data)) {
        dataArray.push({
          uid: this.generateUid(),
          fileName,
          fileData: JSON.stringify(fileData, null, 2)
        });
      }
    }

    const pluginObject: PluginObject = {
      uid: json.uid || this.generateUid(),
      id: pluginId,
      meta: {
        name: json.name,
        description: json.description,
        author: json.author,
        version: json.version,
      },
      tabs: convertedTabs,
      data: dataArray
    };

    return pluginObject;
  }

  private generateUid(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  public loadGameSlot(gameId: string, saveName: string) {
    // Always use reload pattern - this ensures proper game initialization
    localStorage.setItem('game_loading_slot', saveName);
    localStorage.setItem('game_loading_game_id', gameId);
    window.location.reload();
  }


}