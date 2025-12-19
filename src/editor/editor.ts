import { Global } from "../global/global";
import { ManifestObject, ManifestSchema } from "../schemas/manifestSchema";
import { Observable, Subject, BehaviorSubject, takeUntil, filter, firstValueFrom, of } from 'rxjs';
import { Schema, Schemable, SchemaToType, getFileExtensions } from "../utility/schema";
import { EditorMap } from "./editorMap";
import { debounceTime, switchMap, startWith, catchError, map, tap } from 'rxjs/operators';
import { ref, reactive, Ref, watch, nextTick, computed, Component } from "vue";
import { getImageDimensions, parseText } from "../utility/functions";
import { DevEncountersDefaultObject, DevEncountersDefaultSchema } from "../schemas/devEncountersDefaultSchema";
import ShortUniqueId from 'short-unique-id';
import { EDITOR_TABS, EditorTab, registerEditorCustomComponents } from "./editorTabs";
import { PluginManager } from "./pluginManager";
import { DungeonConfigObject } from "../schemas/dungeonConfigSchema";
import { showConfirm, showAlert } from "../services/dialogService";
import { DevSettingsObject } from "../schemas/devSettings";

export type DungeonConfigBonus = {
  map_width?: number;
  map_height?: number;
}
export type DungeonConfigParsed = DungeonConfigObject & DungeonConfigBonus;

// Custom component type for editor popups
export type EditorCustomComponent = {
  id: string;
  name: string;
  component: Component;
}

// Props interface that all custom popup components should receive
export interface EditorCustomPopupProps {
  item: any;
  coreItem?: any;
  schema?: Schema;
  subtabId: string;
}

// Define the structure for the persistent state
interface EditorState {
  selectedGame: string | null; // Use null instead of undefined for JSON compatibility
  selectedMod: string | null;
  selectedMainTab: string;
  selectedDungeon?: string | null; // TODO
  selectedSubTabs: { [mainTabId: string]: string }; // Stores the active subtab for each main tab
}

// Define the structure for file search trigger
interface FileSearchCriteria {
  searchTerm: string;
  fileType: string;
}


export class Editor {
  private static instance: Editor;
  private global: Global;
  public pluginManager: PluginManager;
  test: string = "editor test";
  public map: EditorMap;

  public devSettings: Ref<DevSettingsObject | null> = ref(null);

  // Single localStorage key for the entire state
  private readonly EDITOR_STATE_KEY = 'dryadEditor_state';

  // Store original main tab before plugin restoration
  private originalSavedMainTab: string | null = null;
  // test
  // --- State Management ---
  public state: EditorState = reactive({
    selectedGame: null,
    selectedMod: null,
    selectedMainTab: 'general', // Default value
    selectedDungeon: null,
    selectedSubTabs: {}
  });

  private switchTimeout: ReturnType<typeof setTimeout> | null = null;

  public hasUnsavedChanges: Ref<boolean> = ref(false); // Flag to track explicit changes

  // --- File Search Properties ---
  private fileSearchSubject = new Subject<FileSearchCriteria>();
  public filteredFileResults$: Observable<string[]> = of([]);
  public isSearchingFiles: Ref<boolean> = ref(false);
  private allFilesCache: { [key: string]: string[] } = {};
  // --- End File Search Properties ---

  // --- WebP Conversion Settings ---
  public webpAutoConvert: Ref<boolean> = ref(false);
  public webpBackupOriginal: Ref<boolean> = ref(true);
  public webpQuality: Ref<number> = ref(95);
  public webpLossless: Ref<boolean> = ref(false);
  // --- End WebP Conversion Settings ---

  // --- Custom Component Registry ---
  private editorCustomComponents = new Map<string, EditorCustomComponent>();
  // --- End Custom Component Registry ---

  // Function to stop the current activeObject watcher
  private stopActiveObjectWatcher: (() => void) | null = null;

  private constructor() {
    this.global = Global.getInstance();
    this.pluginManager = new PluginManager();


    // Assign the instance *before* potentially creating dependents like EditorMap
    // Although getInstance handles this, being explicit can help clarity.
    // Editor.instance = this; // Not strictly needed if getInstance is used correctly

    //this.loadState(); // Load state from localStorage on initialization
    this.map = new EditorMap(this); // Pass 'this' (the current Editor instance)

    // --- Initialize File Search ---
    this.setupFileSearch();
    // --- End Initialize File Search ---

    // --- Initialize WebP Settings ---
    this.loadWebPSettings();
    this.watchWebPSettings();
    // --- End Initialize WebP Settings ---
  }

  public static getInstance(): Editor {
    if (!Editor.instance) {
      // Create the instance FIRST
      const newInstance = new Editor();
      // Assign it to the static property
      Editor.instance = newInstance;
      // Register custom components after instance is created
      registerEditorCustomComponents(newInstance);
      // THEN return it
      return newInstance;
    }
    return Editor.instance;
  }

  public async init(): Promise<void> {


    this.loadState(); // Load state from localStorage on initialization


    // init active plugins
    //console.warn('INIT ACTIVE PLUGINS');
    //await this.pluginManager.initActivePlugins(this.selectedGame ?? '', this.selectedMod ?? '');
    //console.log('PLUGIN LIST:', this.pluginManager.pluginList.value);
    //console.log('ACTIVE PLUGINS:', this.pluginManager.plugins.value);
    //console.log('PLUGIN TABS:', this.pluginManager.pluginTabs.value);

    //this.loadState(); // we need to load the state again after initializing the plugins

    await this.loadGames();
    await this.setGame(this.state.selectedGame ?? '', true);
    //await this.loadGames();
    //await this.loadActiveObject();
    //await this.loadDungeons();


  }

  public getAllTabs(): EditorTab[] {
    // console.log('GET ALL TABS:', [...EDITOR_TABS, ...this.pluginManager.pluginTabs.value]);
    return [...EDITOR_TABS, ...this.pluginManager.pluginTabs.value];
  }


  public async fetchDevSettings(): Promise<void> {
    const devSettings = await this.global.readJson(`games_files/${this.selectedGame}/${this.selectedMod}/dev/dev_settings.json`) as DevSettingsObject;
    this.devSettings.value = devSettings;
  }



  private loadState(): void {
    const savedState = localStorage.getItem(this.EDITOR_STATE_KEY);
    let loadedState: Partial<EditorState> = {};

    if (savedState) {
      try {
        loadedState = JSON.parse(savedState) || {};
        // Store the original main tab before it gets overwritten
        this.originalSavedMainTab = loadedState.selectedMainTab || null;
      } catch (e) {
        console.error("Error parsing editor state from localStorage, resetting to defaults.", e);
        loadedState = {}; // Reset on error
      }
    }

    // Initialize selectedSubTabs from saved state or as an empty object
    const selectedSubTabs = loadedState.selectedSubTabs || {};
    const defaultMainTab = 'general'; // Define default

    // Ensure default subtabs are set for all main tabs
    this.getAllTabs().forEach(tab => {
      if (tab.subtabs.length > 0) {
        const currentSubTab = selectedSubTabs[tab.id];
        // If no subtab is saved for this main tab, or the saved one is no longer valid, set the default
        if (!currentSubTab || !tab.subtabs.some(subtab => subtab.id === currentSubTab)) {
          selectedSubTabs[tab.id] = tab.subtabs[0].id;
        }
      }
    });

    // --- Update the *existing* reactive state object ---
    this.state.selectedGame = loadedState.selectedGame ?? null;
    this.state.selectedMod = loadedState.selectedMod ?? null;
    // Don't validate plugin tabs here as they haven't been loaded yet
    // Plugin tab validation will be handled later in restorePluginTabStates()
    const staticTabs = [...EDITOR_TABS];
    this.state.selectedMainTab = (loadedState.selectedMainTab && staticTabs.some(t => t.id === loadedState.selectedMainTab))
      ? loadedState.selectedMainTab
      : (loadedState.selectedMainTab ? loadedState.selectedMainTab : defaultMainTab);
    this.state.selectedDungeon = loadedState.selectedDungeon ?? null;
    this.state.selectedSubTabs = selectedSubTabs; // Assign the processed subtabs
    // --- End state update ---
  }

  // Restore plugin-specific tab states after plugins are loaded
  private restorePluginTabStates(): void {
    const savedState = localStorage.getItem(this.EDITOR_STATE_KEY);
    if (!savedState) return;

    try {
      const loadedState: Partial<EditorState> = JSON.parse(savedState) || {};
      const savedSubTabs = loadedState.selectedSubTabs || {};

      // Store current main tab before processing plugin tabs
      const currentMainTab = this.state.selectedMainTab;

      // Only process plugin tabs (tabs that weren't available during initial state load)
      this.pluginManager.pluginTabs.value.forEach(pluginTab => {
        const savedSubTab = savedSubTabs[pluginTab.id];
        if (savedSubTab && pluginTab.subtabs.some(subtab => subtab.id === savedSubTab)) {
          // Restore the saved subtab for this plugin
          this.state.selectedSubTabs[pluginTab.id] = savedSubTab;
        } else if (pluginTab.subtabs.length > 0) {
          // Set default if no valid saved state
          this.state.selectedSubTabs[pluginTab.id] = pluginTab.subtabs[0].id;
        }
      });

      // Only restore main tab if:
      // 1. The current main tab is not valid anymore (not in available tabs), OR
      // 2. The current main tab is valid AND it's a plugin tab that exists in the new plugin list
      const allAvailableTabs = this.getAllTabs();
      const isCurrentMainTabValid = allAvailableTabs.some(tab => tab.id === currentMainTab);
      const isCurrentMainTabPlugin = this.pluginManager.pluginTabs.value.some(tab => tab.id === currentMainTab);

      if (!isCurrentMainTabValid) {
        // Current main tab is no longer valid, try to restore from saved state
        if (this.originalSavedMainTab && allAvailableTabs.some(tab => tab.id === this.originalSavedMainTab)) {
          this.state.selectedMainTab = this.originalSavedMainTab;
        } else {
          // Fallback to 'general' tab instead of first tab
          this.state.selectedMainTab = 'general';
        }
      } else if (isCurrentMainTabValid && !isCurrentMainTabPlugin) {
        // Current main tab is valid and not a plugin tab, keep it
        // No change needed
      } else if (isCurrentMainTabValid && isCurrentMainTabPlugin) {
        // Current main tab is valid and is a plugin tab, keep it (it's already in the new plugin list)
        // No change needed
      }
    } catch (e) {
      console.error("Error restoring plugin tab states:", e);
    }
  }

  // Save the current state object to localStorage
  private saveState(): void {
    try {
      // Prune subtabs for disabled main tabs before saving (optional, but good practice)
      const stateToSave = { ...this.state };
      stateToSave.selectedSubTabs = { ...this.state.selectedSubTabs }; // Clone subtabs object
      localStorage.setItem(this.EDITOR_STATE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.error("Error saving editor state to localStorage", e);
    }
  }

  // --- Getters for state properties ---
  get selectedGame(): string | null {
    return this.state.selectedGame;
  }

  get selectedMod(): string | null {
    return this.state.selectedMod;
  }

  get selectedDungeon(): string | null {
    return this.state.selectedDungeon ?? null;
  }

  get mainTab(): string {
    return this.state.selectedMainTab;
  }

  get secondaryTab(): string | undefined {
    // Return the selected subtab for the *current* main tab
    return this.state.selectedSubTabs[this.state.selectedMainTab];
  }



  public games: ManifestObject[] = [];
  public filteredGames: Ref<string[]> = ref([]);

  public mods: ManifestObject[] = [];
  public filteredMods: Ref<string[]> = ref([]);

  public dungeonsList: DungeonConfigObject[] = [];
  public filteredDungeons: Ref<string[]> = ref([]);

  async loadGames(): Promise<void> {
    const gameFolders = await this.global.listFolders('games_files');
    this.games = [];
    for (const gameFolder of gameFolders) {
      try {
        const gameManifest = await this.global.readJson(`games_files/${gameFolder}/_core/manifest.json`) as ManifestObject;
        this.games.push(gameManifest);
      } catch (error) {
        console.error(`Failed to load manifest for game: ${gameFolder}`, error);
      }
    }

    this.setFilteredGames("");

    if (this.selectedGame) {
      await this.loadMods();
    }

  }
  async loadMods(): Promise<void> {
    this.mods = [];
    if (!this.selectedGame) {
      console.error("No game selected when selecting mods");
      return;
    }

    try {
      const modFolders = await this.global.listFolders(`games_files/${this.selectedGame}`);
      console.log("Mod folders found:", modFolders);
      for (const modFolder of modFolders) {
        try {
          const manifestPath = `games_files/${this.selectedGame}/${modFolder}/manifest.json`;
          const modManifest = await this.global.readJson(manifestPath) as ManifestObject;
          const modManifestCopy = { ...modManifest };
          // Assign ID based on folder name, crucial for '_core'
          modManifestCopy.id = modFolder;
          this.mods.push(modManifestCopy);
        } catch (manifestError) {
          console.error(`Failed to load manifest for mod: ${modFolder} in game ${this.selectedGame}`, manifestError);
        }
      }
      this.mods.sort((a, b) => (a.load_order || 0) - (b.load_order || 0));
      // Clear file state when mods are reloaded
    } catch (listError) {
      console.error(`Failed to list mods for game: ${this.selectedGame}`, listError);
      this.mods = []; // Ensure mods list is empty on error
    }

    this.setFilteredMods("");

  }
  async loadDungeons(): Promise<void> {
    if (!this.selectedGame || !this.selectedMod) {
      return;
    }

    this.dungeonsList = [];
    try {
      const dungeonFolders = await this.global.listFolders(`games_files/${this.selectedGame}/${this.selectedMod}/dungeons`);
      for (const dungeonFolder of dungeonFolders) {
        const dungeonConfig = await this.global.readJson(`games_files/${this.selectedGame}/${this.selectedMod}/dungeons/${dungeonFolder}/config.json`) as DungeonConfigObject;
        this.dungeonsList.push(dungeonConfig);
      }
      //this.dungeonsList.sort((a, b) => (a.order || 0) - (b.order || 0));

      if (!this.dungeonsList) {
        this.dungeonsList = [];
      }
      this.setFilteredDungeons('');
      if (!this.dungeonsList.find(d => d.id === this.state.selectedDungeon)) {
        this.state.selectedDungeon = this.dungeonsList[0].id ?? null;
      }
      console.log('[Editor] Dungeons list loaded:' + this.dungeonsList);
    } catch (error) {
      console.warn(`[Editor] Failed to load dungeons list for ${this.selectedGame}/${this.selectedMod}:`, error);
      this.dungeonsList = []; // Set to empty array on error
      this.setFilteredDungeons('');
      this.state.selectedDungeon = null;
    }

    this.saveState();

    // otherwise load the dungeons
  }

  public addGame(game: ManifestObject): void {
    this.games.push(game);
    this.setGame(game.id);
    this.setFilteredGames("");
  }
  public addMod(mod: ManifestObject): void {
    this.mods.push(mod);
    this.mods.sort((a, b) => (a.load_order || 0) - (b.load_order || 0));
    this.setMod(mod.id);
    this.setFilteredMods("");
  }
  public async addDungeon(dungeon: DungeonConfigObject): Promise<void> {
    this.dungeonsList.push(dungeon);
    this.dungeonsList.sort((a, b) => (a.order || 0) - (b.order || 0));
    await this.setDungeon(dungeon.id);
    this.setFilteredDungeons("");
  }

  public async setGame(game: string, onLoad: boolean = false): Promise<void> {

    this.state.selectedGame = game;
    this.saveState();
    this.clearFileCache();

    await this.loadMods();
    if (onLoad) {
      await this.setMod(this.state.selectedMod ?? '');
    } else {
      await this.setMod(this.mods[0].id);
    }


  }
  public async setMod(mod: string): Promise<void> {

    this.state.selectedMod = mod;
    // this.saveState();

    await this.fetchDevSettings();
    this.clearFileCache();


    // we need to load plugins and the state again after initializing the plugins

    //this.loadState();
    await this.pluginManager.initActivePlugins(this.state.selectedGame ?? '', this.state.selectedMod ?? '');

    // Restore plugin-specific tab states after plugins are initialized
    this.restorePluginTabStates();

    // Additional check: ensure we don't end up with an invalid main tab
    // But only if it's actually invalid (not just a plugin tab that no longer exists)
    const allTabs = this.getAllTabs();
    const currentTab = this.state.selectedMainTab;
    const isValidTab = allTabs.some(tab => tab.id === currentTab);

    // Only fallback if the current tab is truly invalid AND it's not handled by restorePluginTabStates
    if (!isValidTab) {
      this.state.selectedMainTab = 'general';
    }

    console.log('PLUGIN LIST:', this.pluginManager.pluginList.value);
    console.log('ACTIVE PLUGINS:', this.pluginManager.plugins.value);
    console.log('PLUGIN TABS:', this.pluginManager.pluginTabs.value);

    await this.loadDungeons();
    this.setFilteredDungeons('');
    await this.setDungeon(this.state.selectedDungeon ?? '');

    // If we restored a plugin main tab, ensure the UI reflects it properly
    if (this.pluginManager.pluginTabs.value.some(tab => tab.id === this.state.selectedMainTab)) {
      await this.loadActiveObject();
    }

    //this.saveState();

  }

  public async setDungeon(dungeon: string): Promise<void> {
    // If the selection hasn't actually changed, do nothing
    this.state.selectedDungeon = dungeon;
    this.saveState();
    await this.loadActiveObject();

    if (this.mainTab === 'dungeons' && !this.selectedDungeon) {
      this.global.addNotificationId('create_dungeon_first');
      this.state.selectedMainTab = 'new';
      this.state.selectedSubTabs[this.state.selectedMainTab] = 'new_dungeon';
      this.saveState();
      this.setMainTab('new');
      return;
    }

    if (this.showMap.value) {
      await this.loadMap();
    }

  }

  // Check for unsaved changes before switching
  public async isProceedUnsavedChanges(): Promise<boolean> {
    if (this.hasUnsavedChanges.value) {
      const proceed = await showConfirm({
        message: "You have unsaved changes. Are you sure you want to proceed? Any unsaved changes will be lost.",
        header: "Unsaved Changes"
      });
      if (!proceed) {
        return false; // Abort tab switch
      }
    }
    this.hasUnsavedChanges.value = false;
    return true;
  }

  public async setMainTab(tab: string): Promise<void> {

    if (!(await this.isProceedUnsavedChanges())) {
      return;
    }

    if (tab === 'dungeons' && !this.selectedDungeon) {
      this.global.addNotificationId('create_dungeon_first');
      this.state.selectedMainTab = 'new';
      this.state.selectedSubTabs[this.state.selectedMainTab] = 'new_dungeon';
      this.saveState();
      this.setMainTab('new');
      return;
    }

    console.log("Setting main tab: ", tab);
    this.state.selectedMainTab = tab;
    this.saveState();

    this.setSecondaryTab(this.state.selectedSubTabs[tab]);


  }

  public async setSecondaryTab(tab: string): Promise<void> {

    if (!(await this.isProceedUnsavedChanges())) {
      console.log("Unsaved changes, aborting");
      return;
    }

    console.log("Setting secondary tab: ", tab);
    this.state.selectedSubTabs[this.state.selectedMainTab] = tab;
    this.saveState();
    await this.loadActiveObject();

    if (this.showMap.value) {
      await this.loadMap();
    }
  }

  public setMapState(): void {
    this.map.currentStates.value = this.map.mapStates.find(state => state.tab === this.secondaryTab)?.states ?? [];
    this.map.currentStates.value = this.map.currentStates.value.map(state => this.secondaryTab + '.' + state);
    this.map.activeState.value = this.map.currentStates.value[0];
  }

  public setFilteredGames(term: string): void {
    //console.log("this.games:", this.games);
    if (!this.games || this.games.length === 0) { // Add check for undefined/null
      this.filteredGames.value = []; // Assign to .value
      return;
    }
    if (!term) {
      this.filteredGames.value = this.games.map(game => game.id); // Assign to .value
      //console.log("Filtered games:", this.filteredGames);
      return;
    }
    const searchTermLower = term.toLowerCase();

    this.filteredGames.value = this.games.filter(game => game && game.id.toLowerCase().includes(searchTermLower)).map(game => game.id); // Assign to .value

  }

  public setFilteredMods(term: string): void {
    if (!this.mods || this.mods.length === 0) { // Add check for undefined/null
      this.filteredMods.value = []; // Assign to .value
      return;
    }
    if (!term) {
      this.filteredMods.value = this.mods.map(mod => mod.id); // Assign to .value
      return;
    }
    const searchTermLower = term.toLowerCase();

    this.filteredMods.value = this.mods.filter(mod => mod && mod.id.toLowerCase().includes(searchTermLower)).map(mod => mod.id); // Assign to .value
  }

  public setFilteredDungeons(term: string): void {
    if (!this.dungeonsList || this.dungeonsList.length === 0) {
      this.filteredDungeons.value = []; // Assign to .value
      return;
    }
    if (!term) {
      this.filteredDungeons.value = this.dungeonsList.sort((a, b) => (a.order || 0) - (b.order || 0)).map(dungeon => dungeon.id); // Assign to .value
      console.log("Filtered dungeons:", this.filteredDungeons.value);
      return;
    }
    const searchTermLower = term.toLowerCase();

    this.filteredDungeons.value = this.dungeonsList.sort((a, b) => (a.order || 0) - (b.order || 0)).filter(dungeon => dungeon && dungeon.id.toLowerCase().includes(searchTermLower)).map(dungeon => dungeon.id); // Assign to .value
  }

  // Represents the currently active object being edited (e.g., a dungeon config, item template)
  public activeObject: Ref<any | null> = ref(null);

  coreObject: Ref<any | null> = ref(null);
  customPopups: Ref<string[] | null> = ref(null);

  pluginObjects: Ref<any | null> = ref(null);

  skinAttributes: Ref<any | null> = ref(null); // only for character_skin_layers

  isShowForm: string | boolean = false;

  schema: Ref<Schema | null> = ref(null);
  filePath: string = '';
  fileName: string = '';
  fileNameOriginal: string = '';
  isArray: Ref<boolean> = ref(false);
  disableId: Ref<boolean> = ref(false);
  title: Ref<string> = ref('');
  create: 'game' | 'mod' | 'dungeon' | null = null;
  requiresDungeon: boolean = false;
  showMap: Ref<boolean> = ref(false);
  dungeonConfig: Ref<DungeonConfigObject | null> = ref(null);
  ignoreDefaultValues: boolean = false;
  public async loadActiveObject(): Promise<void> {
    if (this.switchTimeout) {
      clearTimeout(this.switchTimeout);
    }
    // Stop any previous watcher before loading new data
    if (this.stopActiveObjectWatcher) {
      //console.log("[Editor] Stopping previous activeObject watcher.");
      this.stopActiveObjectWatcher();
      this.stopActiveObjectWatcher = null;
    }

    //console.log("[loadActiveObject()]Loading activeObject");
    //console.warn('ALL TABS:', this.getAllTabs());
    let settings = this.getAllTabs().find(tab => tab.id === this.mainTab)?.subtabs.find(subtab => subtab.id === this.secondaryTab)
    let fileName = settings?.file ?? '';
    this.fileNameOriginal = fileName;
    this.requiresDungeon = settings?.requiresDungeon ?? false;


    this.isShowForm = this.setShowForm();
    this.ignoreDefaultValues = settings?.ignoreDefaultValues ?? false;
    this.showMap.value = settings?.showMap ?? false;
    if (!this.selectedGame && !settings?.create) {
      return;
    }

    // Special handling for plugins tab
    if (settings?.isPlugins && this.selectedGame && this.selectedMod) {
      await this.loadPluginsTab();
      return;
    }

    if (settings?.requiresDungeon) {
      if (!this.selectedDungeon) {
        return;
      } else {
        fileName = fileName.replace('[dungeon]', 'dungeons/' + this.selectedDungeon);
      }
    }



    if (!fileName && !settings?.create) {
      console.warn(`No file associated with mainTab: ${this.mainTab}, secondaryTab: ${this.secondaryTab}`);
      this.schema.value = settings?.schema ?? null;
      this.title.value = settings?.name ?? Global.getInstance().getString(settings?.title ?? '');
      this.create = settings?.create ?? null;
      this.activeObject.value = null;
      return;
    }

    // load attributes
    if (settings?.loadSkinAttributes) {
      this.skinAttributes.value = await this.loadFullData('character_attributes');
    } else {
      this.skinAttributes.value = null;
    }

    //console.error("skinAttributes:", this.skinAttributes.value);



    let filePath = `games_files/${this.selectedGame}/${this.selectedMod}/${fileName}.json`;
    console.log("Reading file:", filePath);
    // try {

    let file = await this.global.readJson(filePath);

    // load plugin objects
    this.pluginObjects.value = this.pluginManager.getPluginDataList(fileName);
    // console.warn("Active plugins:", this.pluginManager.plugins.value);
    // console.warn("Plugin objects:", this.pluginObjects.value);

    // load dungeon config
    await this.setDungeonConfig();
    //console.warn("Dungeon config:", this.dungeonConfig.value);


    // load original game object
    this.coreObject.value = null; // Reset before loading
    if (this.selectedMod !== '_core' && this.selectedGame && fileName) { // Ensure selectedGame and fileName are valid
      try {
        const coreData = await this.global.readJson(`games_files/${this.selectedGame}/_core/${fileName}.json`);
        if (typeof coreData === 'object' && coreData !== null) {
          this.coreObject.value = coreData;
        } else {
          console.warn(`[Editor] Core object loaded from games_files/${this.selectedGame}/_core/${fileName}.json is not an object, received:`, coreData);
          this.coreObject.value = null;
        }
      } catch (e) {
        console.warn(`[Editor] Failed to load core object from games_files/${this.selectedGame}/_core/${fileName}.json:`, e);
        this.coreObject.value = null;
      }
    }

    // Process schema for fromFile properties before assigning
    let currentSchema = settings?.schema ?? null;
    if (currentSchema && this.selectedGame && this.selectedMod) {
      const basePath = `games_files/${this.selectedGame}/${this.selectedMod}`;
      try {
        // Make a deep copy of the schema before processing if it's shared or might be mutated elsewhere unexpectedly
        // For EDITOR_TABS, schemas are typically static, but caution is good.
        const schemaToProcess = JSON.parse(JSON.stringify(currentSchema));
        currentSchema = await this.processSchemaFromFileProperties(schemaToProcess, basePath) as Schema;
      } catch (e) {
        console.error("[Editor] Error processing schema for fromFile properties:", e);
        // Decide if you want to fall back to original schema or nullify
        // currentSchema = settings?.schema ?? null; // Fallback to original if processing fails
      }
    }

    // process schema for isFromPlugins properties

    const basePath = `games_files/${this.selectedGame}/${this.selectedMod}`;
    currentSchema = await this.pluginManager.processSchema(currentSchema, basePath);


    this.schema.value = currentSchema;
    this.isArray.value = settings?.isArray ?? false;
    this.disableId.value = settings?.disableId ?? false;
    this.title.value = settings?.name ?? Global.getInstance().getString(settings?.title ?? '');
    this.create = settings?.create ?? null;
    this.fileName = fileName;
    this.filePath = filePath;


    if (!file) {
      if (this.isArray.value) {
        file = [];
      } else {
        file = {};
      }
    }

    this.activeObject.value = file;




    // set Default values
    if (!this.isArray.value) {
      // Defaults for single object
      if (this.schema.value && this.activeObject.value && typeof this.activeObject.value === 'object' && this.activeObject.value !== null) {
        this.applyDefaultValuesRecursive(this.activeObject.value, this.schema.value);
      }
    } else {
      // For arrays, we use another watcher
      //  this.populateNewItemWithDefaults();
    }


    // set fromFile options and object



    console.log("devSettings:", this.devSettings);


    // Reset unsaved changes flag after loading new data
    //setTimeout(() => {
    this.hasUnsavedChanges.value = false;
    //  }, 1000);

    // set custom popups
    this.customPopups.value = settings?.customPopups ?? [];

    // Start watching for changes *after* the object is loaded
    console.log("[Editor] Starting new activeObject watcher.");

    this.switchTimeout = setTimeout(() => {
      this.stopActiveObjectWatcher = watch(this.activeObject, (newValue, oldValue) => {
        // This watcher only runs AFTER the initial load for this object is complete.
        // Any change detected here IS a user modification.
        //console.log("[Editor Watcher] User modification detected, setting hasUnsavedChanges to true");
        this.hasUnsavedChanges.value = true;
      }, { deep: true });
    }, 1000);

    //console.log("[loadActiveObject()]Loaded activeObject: ", file);
    //  } catch (error) {
    //      console.warn(`Failed to load: ${this.filePath}`, error);
    //       this.activeObject.value = null;
    //   }
  }

  private applyDefaultValuesRecursive(dataNode: any, currentSchema: Schema | Schemable): void {
    if (!dataNode || !currentSchema) {
      return;
    }

    if (this.ignoreDefaultValues) {
      console.log("ignoreDefaultValues:", this.ignoreDefaultValues);
      return;
    }

    // Only apply defaults for _core game, not for mods
    // Exception: always apply defaults when creating a new game
    const isCore = this.selectedMod === '_core' || this.mainTab === 'new';

    // Case 1: currentSchema is a Schema object (a collection of field definitions for dataNode which is an object)
    // Check that it's NOT a Schemable by verifying 'type' is not a string property
    // (Schemas can have a field named 'type', but Schemables have 'type' as a string value)
    const isNotSchemable = !((currentSchema as any).type && typeof (currentSchema as any).type === 'string');
    if (typeof dataNode === 'object' && dataNode !== null && !Array.isArray(dataNode) &&
      typeof currentSchema === 'object' && !Array.isArray(currentSchema) && isNotSchemable) {
      const objectSchema = currentSchema as Schema;
      for (const key in objectSchema) {
        if (Object.prototype.hasOwnProperty.call(objectSchema, key)) {
          const fieldSchema = objectSchema[key] as Schemable;
          let currentValue = dataNode[key];

          // Apply defaultValue if current value is undefined and an explicit defaultValue exists
          // Only apply defaults for core game, not for mods
          if (isCore && currentValue === undefined && fieldSchema.hasOwnProperty('defaultValue')) {
            // Deep clone default value if it's an object or array
            if (typeof fieldSchema.defaultValue === 'object' && fieldSchema.defaultValue !== null) {
              try {
                dataNode[key] = JSON.parse(JSON.stringify(fieldSchema.defaultValue));
              } catch (e) {
                console.error(`Error cloning default value for key ${key}:`, e);
                dataNode[key] = fieldSchema.defaultValue; // Fallback to shallow copy
              }
            } else {
              dataNode[key] = fieldSchema.defaultValue;
            }
            currentValue = dataNode[key]; // Update currentValue as it's now set by a default
          } else if (isCore && currentValue === undefined) {
            // No explicit defaultValue, and dataNode[key] is currently undefined.
            // Handle implicit creation for schema or schema[] (only for core game).
            if (fieldSchema.type === 'schema' && fieldSchema.objects) {
              const tempNestedObject = {};
              // Recursively apply defaults to this temporary object
              this.applyDefaultValuesRecursive(tempNestedObject, fieldSchema.objects);
              // Only assign it to dataNode[key] if the recursion actually added properties
              if (Object.keys(tempNestedObject).length > 0) {
                dataNode[key] = tempNestedObject;
                currentValue = dataNode[key]; // Update currentValue as it's now set
              }
              // If tempNestedObject remains empty, dataNode[key] stays undefined,
              // and currentValue also remains undefined for this key from this path.
            } else if (fieldSchema.type === 'schema[]' && fieldSchema.objects) {
              // For schema[], an empty array is generally fine as a default container.
              dataNode[key] = [];
              currentValue = dataNode[key]; // Update currentValue as it's now an empty array
            }
          }

          // Recurse for *existing* or *just-created* (and non-empty for 'schema' type) nested structures
          if (fieldSchema.type === 'schema' && fieldSchema.objects && typeof currentValue === 'object' && currentValue !== null && !Array.isArray(currentValue)) {
            this.applyDefaultValuesRecursive(currentValue, fieldSchema.objects);
          } else if (fieldSchema.type === 'schema[]' && fieldSchema.objects && Array.isArray(currentValue)) {
            const itemSchemaForArrayField = fieldSchema.objects as Schema;
            for (const item of currentValue) {
              if (typeof item === 'object' && item !== null) { // Ensure item is an object before recursing
                this.applyDefaultValuesRecursive(item, itemSchemaForArrayField);
              }
            }
          }
        }
      }
    }
    // Case 2: dataNode is an array, and currentSchema is a Schemable of type 'schema[]' defining the items.
    // This is primarily for when applyDefaultValuesRecursive is called on an array field that already exists 
    // or was populated by a defaultValue, and we need to process its items.
    else if (Array.isArray(dataNode) &&
      typeof currentSchema === 'object' && ('type' in currentSchema) &&
      (currentSchema as Schemable).type === 'schema[]' && (currentSchema as Schemable).objects) {
      const itemSchema = (currentSchema as Schemable).objects as Schema;
      for (const item of dataNode) {
        if (typeof item === 'object' && item !== null) {
          this.applyDefaultValuesRecursive(item, itemSchema);
        }
      }
    }
  }

  setShowForm(): string | boolean {
    if (!this.selectedGame) {
      return 'select_game_first';
    }

    if (this.requiresDungeon && !this.selectedDungeon) {
      return 'select_dungeon_first';
    }

    return true;
  }


  //mapContainer: Ref<HTMLDivElement> | null = null;
  public async loadMap(): Promise<void> {

    await this.map.init();
    console.warn('Map initialized:', this.map);
    this.setMapState();
    //if(this.mapRef) {
    // this.mapRef.detectChanges();
    // }
  }




  /**
* Validates an ID based on schema requirements (non-empty, format, uniqueness within array).
* @param id The ID value to validate.
* @param checkIndex The index of the item being validated (for uniqueness checks in arrays).
*                   If undefined or null, uniqueness is not checked against other items.
*                   Use -1 for "new item"
* @returns An object { isValid: boolean, message?: string }.
*/

  // --- Add Item Logic ---

  public newItem = ref<Record<string, any>>({});
  public addItem() {
    //console.log("this.isArray.value", this.isArray.value);
    if (this.isArray.value && Array.isArray(this.activeObject.value) && this.schema.value) {
      // Ensure newItem is initialized if somehow empty (edge case)
      if (Object.keys(this.newItem.value).length === 0 && this.schema.value) {
        this.global.addNotificationId('invalid_id');
        return
      }

      console.log("this.newItem.value", this.newItem.value);
      // Validate the new item id
      const validationResult = this.validateItemId(this.newItem.value.id, false);
      if (!validationResult.isValid) {
        this.global.addNotificationId(validationResult.message ?? 'invalid_id');
        return;
      }

      this.newItem.value.uid = this.createUid(); // create uid for the new item

      // Push a deep clone to prevent reactivity issues with the form
      this.activeObject.value.push(this.newItem.value);
      // Reset the form for the next item
      //this.newItem.value = {};
      this.populateNewItemWithDefaults();
    }
    this.hasUnsavedChanges.value = true;
  }

  public populateNewItemWithDefaults() {
    //console.warn("populateNewItemWithDefaults()");
    if (this.schema.value) {
      const newObjectWithDefaults = {}; // Create a temporary, non-reactive object
      // Populate this temporary object using the recursive function
      this.applyDefaultValuesRecursive(newObjectWithDefaults, this.schema.value);
      // Assign the fully populated object to the ref.
      // This triggers reactivity once, with the complete data.
      this.newItem.value = newObjectWithDefaults;
    } else {
      this.newItem.value = {}; // Fallback if no schema
      // console.warn("[Editor] Cannot populate newItem with defaults: Schema is not available.");
    }
  }

  public getMergedObject() {

  }

  public async saveActiveObject() {
    // Check if this is the plugins tab
    const settings = this.getAllTabs().find(tab => tab.id === this.mainTab)?.subtabs.find(subtab => subtab.id === this.secondaryTab);
    if (settings?.isPlugins && this.selectedGame && this.selectedMod) {
      await this.savePluginsTab();
      return;
    }

    if (!this.filePath) {
      console.error("[Editor] Cannot save: No file path defined.");
      return;
    }
    if (!this.activeObject.value) {
      console.warn("[Editor] Nothing to save.");
      return;
    }
    if (!this.hasUnsavedChanges.value) {
      console.warn("[Editor] No unsaved changes.");
      return;
    }

    if (this.isArray.value) {
      if (this.schema?.value?.order) {
        this.activeObject.value = this.activeObject.value.sort((a: any, b: any) => a.order || 0 - b.order || 0);
      } else {
        this.activeObject.value = this.activeObject.value.sort((a: any, b: any) => a.id.localeCompare(b.id));
      }
    }

    let selected_game = this.selectedGame ?? '';
    let selected_mod = this.selectedMod ?? '';
    let selected_dungeon = this.selectedDungeon ?? '';


    // Validate the active object id
    const validationResult = this.validateItemId(null, true);
    if (!validationResult.isValid) {
      this.global.addNotificationId(validationResult.message ?? 'invalid_id');
      return;
    }
    this.clearEmptyValues();
    if (this.create) {
      const validationCreate = this.validateItemId(this.activeObject.value.id, false);
      if (!validationCreate.isValid) {
        await showAlert(validationCreate.message ?? 'invalid_id', 'Invalid ID');
        return;
      }
    }

    this.hasUnsavedChanges.value = false;

    if (settings?.file === 'dev/dev_settings') {
      this.devSettings.value = this.activeObject.value as DevSettingsObject;
      this.clearFileCache();
    }

    switch (this.create) {
      case 'game':
        await this.createGame();
        return
      case 'mod':
        await this.createMod();
        return;
      case 'dungeon':
        await this.createDungeon();
        return;
    }

    try {

      if (this.secondaryTab === 'encounters') {

        let defaultIcons = await this.global.readJson(this.getModPath("dev/encounters_default")) as DevEncountersDefaultObject[];
        if (defaultIcons) {

          for (let encounter of this.activeObject.value) {
            if (encounter.image) {
              continue;
            }
            let name = encounter.id.split(".")[1];
            if (!name) {
              name = encounter.id;
            }
            let defaultIcon = defaultIcons.find(icon => icon.id === name);
            if (defaultIcon) {
              encounter.image = defaultIcon.image;
            }
          }
        }
      }

      console.log(`[Editor] Saving tab: ${this.secondaryTab}`);
      console.log(`[Editor] Saving active object to: ${this.filePath}`);
      await this.global.writeJson(this.filePath, this.activeObject.value);
      this.hasUnsavedChanges.value = false;
      if (this.secondaryTab === 'config') {
        //console.log("saving config");
        await this.saveConfig(selected_game, selected_mod, selected_dungeon);
      }

      if (this.secondaryTab === 'manifest') {
        await this.saveManifest(selected_game, selected_mod);
      }

      this.global.addNotificationId("save_success");
    } catch (error) {
      console.error(`[Editor] Failed to save file: ${this.filePath}`, error);
      this.global.addNotificationId("save_error");
    }
  }

  private async saveManifest(selected_game: string, selected_mod: string): Promise<void> {
    // update the plugin tabs start
    //console.log(this.pluginManager.pluginTabs.value);
    await this.pluginManager.initActivePlugins(selected_game, selected_mod);
    //this.loadState();
    //console.log(this.pluginManager.pluginTabs.value);
    // update the plugin tabs end
  }

  public async setDungeonConfig(): Promise<void> {
    if (this.mainTab !== 'dungeons') {
      this.dungeonConfig.value = null;
      return;
    }
    let selectedMods = ["_core"]
    if (this.selectedMod !== '_core') {
      selectedMods.push(this.selectedMod!);
    }
    this.dungeonConfig.value = await this.global.loadAndMergeSingleFile<DungeonConfigObject>(this.selectedGame!, `dungeons/${this.selectedDungeon}/config`, selectedMods);

    // update the dungeon list for the changed config
    let index = this.dungeonsList.findIndex(dungeon => dungeon.id === this.dungeonConfig.value?.id);
    if (index !== -1) {
      this.dungeonsList[index] = this.dungeonConfig.value!;
    }
    this.setFilteredDungeons('');
    // if dungeon activeSabTab cannot be accessed then open the first subtab
    let mainTab = this.getAllTabs().find(tab => tab.id === this.mainTab);
    let activeSabTab = mainTab?.subtabs.find(subtab => subtab.id === this.secondaryTab);
    if (activeSabTab?.specificDungeonTypes && !activeSabTab.specificDungeonTypes.includes(this.dungeonConfig.value?.dungeon_type as 'map' | 'screen' | 'text')) {
      this.setSecondaryTab(mainTab?.subtabs[0].id ?? '');
    }
  }

  private async saveConfig(selected_game: string, selected_mod: string, selected_dungeon: string): Promise<void> {

    await this.setDungeonConfig();
    //console.log("dungeonConfig:", this.dungeonConfig.value);


    // parse and save the content
    let content = this.activeObject.value.dungeon_content;

    let parsedContent = parseText(content);
    let path = `games_files/${selected_game}/${selected_mod}/dungeons/${selected_dungeon}/content_parsed.json`;


    // write the config
    let parsedConfig: DungeonConfigParsed = JSON.parse(JSON.stringify(this.activeObject.value)) as DungeonConfigParsed;
    delete parsedConfig.dungeon_content;
    if (this.activeObject.value.dungeon_type !== 'text' && this.activeObject.value.image) {
      let { width, height } = await getImageDimensions(this.activeObject.value.image);
      parsedConfig.map_width = width;
      parsedConfig.map_height = height;
    }
    let objectToWrite = {
      id: "_config_",
      params: parsedConfig
    }
    //console.log("objectToWrite:", objectToWrite);
    parsedContent.unshift(objectToWrite);


    await this.global.writeJson(path, parsedContent);
  }

  // Helper to check for "empty" values (null, '', {})
  // Note: Empty arrays [] are NOT considered empty, as they serve as valid default containers for schema[] fields
  private isEmpty(value: any): boolean {
    if (value === null || value === '' || value === '<p></p>') {
      return true;
    }
    // DON'T consider empty arrays as empty - they're valid containers for schema[]
    // This prevents the undefined → [] → undefined cycle that causes the hasUnsavedChanges bug
    // if (Array.isArray(value) && value.length === 0) {
    //   return true;
    // }
    // Check if it's an object (and not null, not an array) and has no own enumerable properties
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0) {
      return true;
    }
    return false;
  }

  // Recursive function to clean the node in place
  private cleanNode(node: any): void {
    // If it's an object (and not null)
    if (typeof node === 'object' && node !== null) {
      if (Array.isArray(node)) {
        // Iterate backwards through the array for safe removal
        for (let i = node.length - 1; i >= 0; i--) {
          this.cleanNode(node[i]); // Clean the child node first
          // After cleaning the child, check if it has become empty
          if (this.isEmpty(node[i])) {
            node.splice(i, 1); // Remove the empty item from the array
          }
        }
      } else {
        // Iterate through the object keys
        for (const key in node) {
          // Ensure it's an own property before processing
          if (Object.prototype.hasOwnProperty.call(node, key)) {
            this.cleanNode(node[key]); // Clean the child node first
            // After cleaning the child, check if it has become empty
            if (this.isEmpty(node[key])) {
              delete node[key]; // Delete the key-value pair if the value is empty
            }
          }
        }
      }
    }
    // Primitives, null, etc., are left unchanged and don't need further action
  }

  private clearEmptyValues(): void {
    if (this.activeObject.value) {
      // Call the recursive cleaning function on the reactive object's value
      // The function modifies the object/array in place
      this.cleanNode(this.activeObject.value);
      // Vue's reactivity should pick up the mutations on the nested properties/array elements.
    } else {
      console.warn("[Editor] Cannot clear empty values: activeObject is null or undefined.");
    }
  }

  private async createGame(): Promise<void> {
    let data = this.activeObject.value;
    console.log("[Create] Create game active.");
    try {
      // Ensure game data has an ID
      if (!data || !data.id) {
        throw new Error("Game data is missing or does not contain an ID.");
      }
      const gameId = data.id;
      const gameMod = this.selectedMod ?? '_core';

      // Define paths
      const manifestPath = `games_files/${gameId}/_core/manifest.json`;
      const assetsPath = `games_assets/${gameId}/_core`;

      // Create directory structure first
      // Note: createDir might need to handle recursive creation or be called for intermediate dirs too


      await this.global.createDir(`games_files/${gameId}/_core`); // Ensure manifest folder exists
      await this.global.createDir(`games_files/${gameId}/_core/plugins`);
      await this.global.createDir(`games_files/${gameId}/_core/dungeons`);
      await this.global.createDir(`games_files/${gameId}/_core/dev`);
      await this.global.createDir(assetsPath);                     // Ensure assets folder exists

      // Write the manifest file
      console.log(`[WriteJson] ${manifestPath}`);
      await this.global.writeJson(manifestPath, data);

      // Create default dev_settings.json
      const devSettingsPath = `games_files/${gameId}/_core/dev/dev_settings.json`;
      const defaultDevSettings = {
        uid: `${gameId}_core_dev_settings`,
        asset_folders: [`${gameId}/_core`]
      };
      console.log(`[WriteJson] ${devSettingsPath}`);
      await this.global.writeJson(devSettingsPath, defaultDevSettings);

      //await this.createDefault(gameId, '_core');
      console.log(`Game manifest created successfully at: ${manifestPath}`);

      // --- Update Editor State ---
      // const modManifest: any = { ...data, id: "_core" };
      this.addGame(data);

      // Notify user
      this.global.addNotificationId("game_created"); // Add a specific notification ID if desired

    } catch (error) {
      console.error("Error creating game:", error);
      this.global.addNotificationId("create_error"); // Use a general error notification
    }
  }
  private async createMod(): Promise<void> {
    let data = this.activeObject.value;
    console.log("[Debug Dform] Create mod  active.");
    try {
      // Ensure the mod has an ID
      if (!data || !data.id) {
        throw new Error("Mod data is missing or does not contain an ID.");
      }
      const modId = data.id;
      const gameId = this.selectedGame;

      if (!gameId) {
        this.global.addNotificationId("create_mod_error");
        return;
      }

      const manifestPath = `games_files/${gameId}/${modId}/manifest.json`;
      const assetsPath = `games_assets/${gameId}/${modId}`;

      // Create directory first (optional, depends if writeJson creates dirs)
      await this.global.createDir(`games_files/${gameId}/${modId}`); // Ensure parent dir exists
      await this.global.createDir(`games_files/${gameId}/${modId}/plugins`);
      await this.global.createDir(`games_files/${gameId}/${modId}/dungeons`);
      await this.global.createDir(`games_files/${gameId}/${modId}/dev`);
      await this.global.writeJson(manifestPath, data);
      await this.global.createDir(assetsPath);

      // Create default dev_settings.json
      const devSettingsPath = `games_files/${gameId}/${modId}/dev/dev_settings.json`;
      const defaultDevSettings = {
        uid: `${gameId}_${modId}_dev_settings`,
        asset_folders: [`${gameId}/${modId}`]
      };
      console.log(`[WriteJson] ${devSettingsPath}`);
      await this.global.writeJson(devSettingsPath, defaultDevSettings);

      //await this.createDefault(gameId, modId);
      this.global.addNotificationId("mod_created");
      this.addMod(data);
    } catch (error) {
      console.error("Error creating mod:", error);
      this.global.addNotificationId("create_error"); // Use a general error notification
    }
  }
  /*
    private async createDefault(gameId: string, modId: string): Promise<void> {
      // copy default encounters icons
      let encounters_default = await this.global.readJson(`engine_files/templates/encounters_default.json`);
      console.log(`[WriteJson] games_files/${gameId}/${modId}/dev/encounters_default.json`);
      await this.global.writeJson(`games_files/${gameId}/${modId}/dev/encounters_default.json`, encounters_default);
    }
  */
  public getModPath(fileName: string): string {
    return `games_files/${this.selectedGame}/${this.selectedMod}/${fileName}.json`;
  }
  public getDungeonPath(fileName: string): string {
    return `games_files/${this.selectedGame}/${this.selectedMod}/dungeons/${this.selectedDungeon}/${fileName}.json`;
  }


  private async createDungeon(): Promise<void> {

    if (!this.selectedGame || !this.selectedMod) {
      this.global.addNotificationId("create_dungeon_error");
      return;
    }

    let data = this.activeObject.value;
    console.log("[Debug Dform] Create dungeon  active.");

    try {
      // Ensure the dungeon has an ID
      if (!data || !data.id) {
        throw new Error("Mod data is missing or does not contain an ID.");
      }
      const dungeonId = data.id;
      const modId = this.selectedMod;
      const gameId = this.selectedGame;

      const configPath = `games_files/${gameId}/${modId}/dungeons/${dungeonId}/config.json`;


      // Create directory first (optional, depends if writeJson creates dirs)
      let dungeonsFolderExists = await this.global.pathExists(`games_files/${gameId}/${modId}/dungeons`)
      if (!dungeonsFolderExists) {
        await this.global.createDir(`games_files/${gameId}/${modId}/dungeons`); // Ensure parent dir exists
      }

      await this.global.createDir(`games_files/${gameId}/${modId}/dungeons/${dungeonId}`); // Ensure parent dir exists
      //await this.global.writeJson(configPath, data);

      // create config.json file AND content_parsed.json file
      await this.global.writeJson(configPath, data);
      await this.saveConfig(gameId, modId, dungeonId);

      this.global.addNotificationId("dungeon_created");
      this.addDungeon(data);




    } catch (error) {
      console.error("Error creating mod:", error);
      this.global.addNotificationId("create_error"); // Use a general error notification
    }
  }


  public validateItemId(id: string | null | undefined, checkInsideArray: boolean = false): { isValid: boolean, message?: string } {
    // Check 0: Internal array duplicates (only if checkInsideArray is true)
    if (checkInsideArray) {
      if (this.activeObject.value && Array.isArray(this.activeObject.value)) {
        const ids = this.activeObject.value
          .map(item => item?.id) // Get all IDs
          .filter(itemId => itemId !== null && itemId !== undefined && itemId !== ''); // Filter out invalid IDs

        if (ids.length > 0) { // Only check if there are IDs to compare
          const uniqueIds = new Set(ids);
          if (ids.length !== uniqueIds.size) {
            // Find the first duplicate to report for a clearer message
            const counts: { [key: string]: number } = {};
            let firstDuplicate: string | null = null;
            for (const currentId of ids) {
              counts[currentId] = (counts[currentId] || 0) + 1;
              if (counts[currentId] > 1) {
                firstDuplicate = currentId;
                break;
              }
            }
            return { isValid: false, message: `Duplicate ID '${firstDuplicate}' found in the list.` };
          }
        }
      }
      // If checkInsideArray is true, we only perform the internal duplicate check.
      // If no duplicates were found (or the object is not an array), this specific check passes.
      return { isValid: true };
    }

    // --- The following checks run ONLY if checkInsideArray is false --- 

    // Check if schema requires an ID field (relevant when validating a specific 'id')
    if (!this.schema.value || !this.schema.value['id']) {
      return { isValid: true }; // No ID field in schema, so trivially valid
    }

    // 1. Check for Empty ID (for the passed 'id' parameter)
    if (id === null || id === undefined || id === '') {
      return { isValid: false, message: "ID cannot be empty." };
    }

    // 2. Check ID format (Regex) (for the passed 'id' parameter) for only creating game, mod and dungeon
    if (this.create) {
      const idString = String(id);
      const idRegex = /^[a-z0-9_-]*$/;
      if (!idRegex.test(idString)) {
        return {
          isValid: false,
          message: `ID '${idString}' is invalid. ID must contain only lowercase letters, numbers, hyphens (-), or underscores (_).\n e.g: my_id\n`
        };
      }
    }


    // 3. Check if the passed 'id' duplicates an existing ID in the list
    if (this.activeObject.value && Array.isArray(this.activeObject.value)) {
      // We should pass the index of the item being edited if available to exclude self-comparison
      // For now, assumes we are checking a new item or don't have the index.
      const index = this.activeObject.value.findIndex(item => item.id === id);
      if (index !== -1) {
        return { isValid: false, message: `ID '${id}' already exists in this list.` };
      }
    }

    return { isValid: true }; // Passed all checks for the specific ID
  }

  // --- File Search Methods ---

  /**
   * Initializes the file search observable pipeline.
   * Listens to the fileSearchSubject, fetches, filters, and caches file results.
   */
  private setupFileSearch(): void {
    this.filteredFileResults$ = this.fileSearchSubject.pipe(
      debounceTime(300),
      // Ensure searchTerm is always a string
      map(data => ({ ...data, searchTerm: data.searchTerm || '' })),
      // Filter short terms unless empty (to clear results)
      // filter(data => data.searchTerm.length >= 2 || data.searchTerm.length === 0),
      // Set loading state
      tap(() => this.isSearchingFiles.value = true),
      switchMap(async data => {
        // Clear results if search term is empty
        if (data.searchTerm.length === 0) return [];

        const searchTermLower = data.searchTerm.toLowerCase();
        const extensions = getFileExtensions(data.fileType);
        if (extensions.length === 0) {
          console.warn(`[Editor File Search] No extensions defined for fileType: ${data.fileType}`);
          return []; // No extensions means no files to find
        }

        try {
          // Use cache if available for the specific fileType
          if (!this.allFilesCache[data.fileType]) {
            //console.log(`[Editor File Search] Caching files for type: ${data.fileType}`);
            // Fetch all files (might need adjustment based on Global service capability)
            // Apply devSettings filters if narrow_file_search is enabled
            // Convert Vue Proxy to plain array to avoid IPC serialization errors
            const assetFolders = (this.devSettings.value?.narrow_file_search && this.devSettings.value?.asset_folders)
              ? [...this.devSettings.value.asset_folders] // Spread to plain array
              : undefined;
            const ignoreEngineAssets = this.devSettings.value?.ignore_engine_assets;

            const allFiles = await this.global.listFilesRecursively('', assetFolders, ignoreEngineAssets);
            this.allFilesCache[data.fileType] = allFiles
              .filter(filePath =>
                extensions.some(ext => filePath.toLowerCase().endsWith(`.${ext}`)) // Check extension properly
              )
              .map(filePath => `assets/${filePath}`); // Prepend 'assets/' prefix to all paths
          }

          const cachedFiles = this.allFilesCache[data.fileType] || [];
          // Filter cached files by search term
          return cachedFiles.filter(filePath =>
            filePath.toLowerCase().includes(searchTermLower)
          ).slice(0, 50); // Limit results
        } catch (error) {
          console.error('[Editor File Search] Error listing files recursively:', error);
          return []; // Return empty array on error
        }
      }),
      // Clear loading state
      tap(() => this.isSearchingFiles.value = false),
      catchError(error => {
        console.error('[Editor File Search] Error in file search pipe:', error);
        this.isSearchingFiles.value = false; // Ensure loading is false on error
        return of([]); // Return empty array on error
      }),
      startWith([]) // Initialize with empty array
    );
  }

  /**
   * Triggers a file search based on the provided term and type.
   * Pushes the criteria to the internal search subject.
   * @param searchTerm The string to search for in file paths.
   * @param fileType The category of file (e.g., 'image', 'video') used to determine extensions.
   */
  public searchFiles(searchTerm: string, fileType: string): void {
    console.log(`[Editor] searchFiles called with term: '${searchTerm}', type: '${fileType}'`);
    this.fileSearchSubject.next({ searchTerm, fileType });
  }

  /**
   * Clears the file cache. Should be called when file structure might have changed.
   */
  public clearFileCache(): void {
    console.log("[Editor] Clearing file cache.");
    this.allFilesCache = {};
  }

  /**
   * Updates a single file entry in the cache (e.g., when converting PNG to WebP).
   * More efficient than clearing the entire cache.
   */
  public updateFileCacheEntry(oldPath: string, newPath: string): void {
    console.log(`[Editor] Updating file cache entry: ${oldPath} -> ${newPath}`);
    // Iterate through all file type caches
    for (const fileType in this.allFilesCache) {
      const files = this.allFilesCache[fileType];
      const index = files.indexOf(oldPath);
      if (index !== -1) {
        // Replace old path with new path
        files[index] = newPath;
        console.log(`[Editor] Updated cache for file type '${fileType}'`);
      }
    }
  }

  // Method to recursively process schema for fromFile properties
  // Loads and merges data from _core (for mods) and plugins (for everyone)
  private async processSchemaFromFileProperties(currentSchema: Schema | Schemable, basePath: string): Promise<Schema | Schemable> {
    if (typeof currentSchema === 'object' && currentSchema !== null) {
      // Check if it's a Schemable by verifying 'type' is a string value (not an object)
      const isSchemable = 'type' in currentSchema && typeof (currentSchema as any).type === 'string';

      if (!Array.isArray(currentSchema) && !isSchemable) { // It's a Schema object
        const schemaObject = currentSchema as Schema;
        const processedSchema: Schema = {};
        for (const key in schemaObject) {
          if (Object.prototype.hasOwnProperty.call(schemaObject, key)) {
            processedSchema[key] = await this.processSchemaFromFileProperties(schemaObject[key], basePath) as Schemable;
          }
        }
        return processedSchema;
      } else if (isSchemable) { // It's a Schemable object
        const fieldSchema = { ...currentSchema } as Schemable; // Clone to avoid modifying original

        if (fieldSchema.fromFile) {
          console.log(`[Editor] Processing fromFile '${fieldSchema.fromFile}' with type '${fieldSchema.type}'`);
          try {
            // Load and merge data from multiple sources
            let mergedData = await this.loadAndMergeFromFileData(fieldSchema.fromFile, basePath);

            // Apply fromFileTypeAnd and fromFileTypeOr filtering
            if (mergedData && Array.isArray(mergedData)) {
              mergedData = this.filterDataByTypeConditions(mergedData, fieldSchema);
            }

            if (mergedData && Array.isArray(mergedData)) {
              if (fieldSchema.type === 'chooseOne' || fieldSchema.type === 'chooseMany') {
                fieldSchema.options = mergedData.map((item: any) => item.id).filter(id => id !== undefined);
              } else if (fieldSchema.type === 'schema' || fieldSchema.type === 'schema[]') {
                const newObjects: Schema = {};
                for (let item of mergedData) {
                  if (item.id !== undefined) {
                    let schemaRecord = this.getShemaRecord(fieldSchema, item);
                    schemaRecord.options = item.values || [];
                    schemaRecord.tooltip = item.description || '';
                    newObjects[item.id] = schemaRecord;
                  }
                };
                fieldSchema.objects = newObjects;
              }
            } else {
              console.warn(`[Editor] Merged data for fromFile '${fieldSchema.fromFile}' is not an array or is null.`);
              if (fieldSchema.type === 'chooseOne' || fieldSchema.type === 'chooseMany') {
                fieldSchema.options = [];
              }
            }
          } catch (error) {
            console.warn(`[Editor] Could not load and merge data for fromFile: ${fieldSchema.fromFile}`, error);
            if (fieldSchema.type === 'chooseOne' || fieldSchema.type === 'chooseMany') {
              fieldSchema.options = [];
            }
          }
        }

        // Recursively process for nested schemas (e.g., in fieldSchema.objects if type is 'schema' or 'schema[]')
        if ((fieldSchema.type === 'schema' || fieldSchema.type === 'schema[]') && fieldSchema.objects) {
          // Make sure objects is not the one we just created from fileData if it was meant to be the data itself.
          // This recursive call should process the *structure* of fieldSchema.objects if it itself contains fromFile.
          // The current logic for `fromFile` on `schema` or `schema[]` type redefines `fieldSchema.objects` 
          // based on the *content* of the loaded file, not its schema.
          // If `fieldSchema.objects` itself could have `fromFile`, that would be a deeper level of recursion.
          // For now, assuming `fromFile` at one level populates based on file content.
          fieldSchema.objects = await this.processSchemaFromFileProperties(fieldSchema.objects, basePath) as Schema;
        }
        return fieldSchema;
      }
    }
    return currentSchema; // Return as is if not an object or null
  }

  /**
   * Gets a nested value from an object using dot notation (e.g., "someObject.is_currency")
   * @param obj The object to traverse
   * @param path The dot-separated path to the value
   * @returns The value at the path, or undefined if not found
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      return current && typeof current === 'object' ? current[key] : undefined;
    }, obj);
  }

  /**
   * Filters data based on fromFileTypeAnd and fromFileTypeOr conditions
   * @param data The array of items to filter
   * @param fieldSchema The schema containing the filter conditions
   * @returns Filtered array of items
   */
  private filterDataByTypeConditions(data: any[], fieldSchema: Schemable): any[] {
    if (!data || data.length === 0) {
      return data;
    }

    const hasAndCondition = fieldSchema.fromFileTypeAnd && typeof fieldSchema.fromFileTypeAnd === 'object';
    const hasOrCondition = fieldSchema.fromFileTypeOr && typeof fieldSchema.fromFileTypeOr === 'object';

    if (!hasAndCondition && !hasOrCondition) {
      return data;
    }

    return data.filter(item => {
      if (!item || typeof item !== 'object') {
        return false;
      }

      let passesAndCondition = true;
      let passesOrCondition = false;

      // Check fromFileTypeAnd - ALL specified key-value pairs must match
      if (hasAndCondition) {
        passesAndCondition = Object.entries(fieldSchema.fromFileTypeAnd!).every(([key, expectedValue]) => {
          const actualValue = this.getNestedValue(item, key);
          return actualValue === expectedValue;
        });
      }

      // Check fromFileTypeOr - AT LEAST ONE specified key-value pair must match
      if (hasOrCondition) {
        passesOrCondition = Object.entries(fieldSchema.fromFileTypeOr!).some(([key, expectedValue]) => {
          const actualValue = this.getNestedValue(item, key);
          // Support array values: check if actualValue is included in the array
          if (Array.isArray(expectedValue)) {
            return expectedValue.includes(actualValue);
          }
          return actualValue === expectedValue;
        });
      } else {
        // If there's no OR condition, it should pass by default (only AND matters)
        passesOrCondition = true;
      }

      // Both conditions must pass (if both are present, both must be satisfied)
      return passesAndCondition && passesOrCondition;
    });
  }

  public async loadFullData(fileName: string): Promise<any[]> {
    const basePath = `games_files/${this.selectedGame}/${this.selectedMod}`;
    return await this.loadAndMergeFromFileData(fileName, basePath);
  }

  /**
   * Loads and merges data from multiple sources for fromFile properties in precedence order:
   * 1. Plugin data (lowest precedence)
   * 2. _core file (medium precedence, if mod is selected and not _core)
   * 3. Current mod file (highest precedence)
   */
  public async loadAndMergeFromFileData(fileName: string, basePath: string): Promise<any[]> {
    let mergedData: any[] = [];

    // 1. Start with plugin data (lowest precedence)
    const pluginData = this.pluginManager.getPluginDataList(fileName);
    if (pluginData && pluginData.length > 0) {
      mergedData = [...pluginData.flat()];
    }

    // 2. If a mod is selected (not _core), merge with _core file (medium precedence)
    if (this.selectedMod !== '_core' && this.selectedGame) {
      const coreFilePath = `games_files/${this.selectedGame}/_core/${fileName}.json`;
      try {
        const coreFileData = await this.global.readJson(coreFilePath) as any[];
        if (coreFileData && Array.isArray(coreFileData)) {
          // _core data overwrites plugin data
          mergedData = this.mergeArraysByProperty([...mergedData, ...coreFileData], 'id');
        }
      } catch (error) {
        console.log(`[Editor] Core file not found or invalid: ${coreFilePath}`);
      }
    }

    // 3. Finally, load current mod file (highest precedence)
    const currentFilePath = `${basePath}/${fileName}.json`;
    try {
      const currentFileData = await this.global.readJson(currentFilePath) as any[];
      if (currentFileData && Array.isArray(currentFileData)) {
        // Current mod data overwrites everything else
        mergedData = this.mergeArraysByProperty([...mergedData, ...currentFileData], 'id');
      }
    } catch (error) {
      console.log(`[Editor] Current mod file not found or invalid: ${currentFilePath}`);
    }

    // 4. Sort by 'order' field if it exists
    if (mergedData.length > 0 && mergedData.some(item => item && typeof item === 'object' && 'order' in item)) {
      mergedData.sort((a, b) => {
        const orderA = typeof a?.order === 'number' ? a.order : 0;
        const orderB = typeof b?.order === 'number' ? b.order : 0;
        return orderA - orderB;
      });
    }

    return mergedData;
  }

  /**
   * Merges arrays by a property (like 'id'), with later items taking precedence over earlier ones
   * Uses deep merge to combine properties from matching items rather than replacing entirely
   */
  private mergeArraysByProperty(arrays: any[], propertyKey: string): any[] {
    const seen = new Map();

    // Process items in order, with later items overriding earlier ones using deep merge
    for (const item of arrays) {
      if (item && typeof item === 'object' && item[propertyKey] !== undefined) {
        const key = item[propertyKey];
        if (seen.has(key)) {
          // Deep merge the existing item with the new item
          const existing = seen.get(key);
          const merged = this.deepMerge(existing, item);
          seen.set(key, merged);
        } else {
          // First time seeing this key, add a copy of the item
          seen.set(key, { ...item });
        }
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Deep merge two objects, recursively merging nested objects
   * Later (source) values override earlier (target) values
   */
  private deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = { ...target };

    for (const key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        const sourceValue = source[key];
        const targetValue = result[key];

        if (
          sourceValue &&
          typeof sourceValue === 'object' &&
          !Array.isArray(sourceValue) &&
          targetValue &&
          typeof targetValue === 'object' &&
          !Array.isArray(targetValue)
        ) {
          // Both are objects (not arrays), recursively merge
          result[key] = this.deepMerge(targetValue, sourceValue);
        } else if (Array.isArray(targetValue) && Array.isArray(sourceValue)) {
          // Both are arrays, concatenate them
          result[key] = [...targetValue, ...sourceValue];
        } else {
          // Primitive value or null/undefined, source wins
          result[key] = sourceValue;
        }
      }
    }

    return result;
  }

  private getShemaRecord(fieldSchema: Schemable, item: any): Schemable {
    if (fieldSchema.fromFileType === 'custom') {
      let itemType = item.type;
      // 'number', 'string', 'textarea', 'htmlarea', 'boolean', 'color', 'image', 'array'
      switch (itemType) {
        case 'number':
          return { type: 'number', };
        case 'string':
          return { type: 'string', };
        case 'textarea':
          return { type: 'textarea', };
        case 'htmlarea':
          return { type: 'htmlarea', };
        case 'boolean':
          return { type: 'boolean', };
        case 'color':
          return { type: 'color', };
        case 'image':
          return { type: 'file', fileType: 'image' };
        case 'video':
          return { type: 'file', fileType: 'video' };
        case 'chooseOne':
          return { type: 'chooseOne', options: item.values };
        case 'chooseMany':
          return { type: 'chooseMany', options: item.values };
        case 'array':
          return { type: 'string[]', };
        default:
          console.warn(`[Editor] Unknown item.type '${itemType}' for custom fromFileType. Defaulting to 'string'.`);
          return { type: 'string' };
      }
    }

    return { type: fieldSchema.fromFileType! };

  }


  // --- End File Search Methods ---

  public uid = new ShortUniqueId({ length: 12 });
  public createUid(): string {
    return this.uid.rnd();
  }

  public getModList(modId: string): string[] {
    if (modId === '_core') {
      return [modId];
    }
    return ['_core', modId]
  }

  /**
   * Load plugins for the dev/plugins tab
   */
  private async loadPluginsTab(): Promise<void> {
    console.log("[Editor] Loading plugins from plugins folder for dev/plugins tab");

    if (!this.selectedGame || !this.selectedMod) {
      console.warn("[Editor] Cannot load plugins: no game or mod selected");
      return;
    }

    this.pluginObjects.value = null;

    try {
      const plugins = await this.pluginManager.loadPluginsForDevTab(this.selectedGame, this.selectedMod);

      // Set up the schema and file properties
      const settings = this.getAllTabs().find(tab => tab.id === this.mainTab)?.subtabs.find(subtab => subtab.id === this.secondaryTab);
      this.schema.value = settings?.schema ?? null;
      this.isArray.value = settings?.isArray ?? false;
      this.disableId.value = settings?.disableId ?? false;
      this.title.value = settings?.name ?? Global.getInstance().getString(settings?.title ?? '');
      this.create = settings?.create ?? null;
      this.fileName = '';
      this.filePath = ''; // No direct file path for plugins

      // Set the active object to the loaded plugins
      this.activeObject.value = plugins;

      // Reset unsaved changes flag
      this.hasUnsavedChanges.value = false;

      // Start watching for changes
      console.log("[Editor] Starting new activeObject watcher for plugins.");
      this.switchTimeout = setTimeout(() => {
        this.stopActiveObjectWatcher = watch(this.activeObject, (newValue, oldValue) => {
          this.hasUnsavedChanges.value = true;
        }, { deep: true });
      }, 1000);

      console.log("[Editor] Loaded plugins:", plugins);
    } catch (error) {
      console.error("[Editor] Failed to load plugins:", error);
      this.activeObject.value = [];
    }
  }

  /**
   * Save plugins from dev/plugins tab to plugin.json files
   */
  private async savePluginsTab(): Promise<void> {
    console.log("[Editor] Saving plugins to plugin.json files");

    if (!this.selectedGame || !this.selectedMod) {
      console.warn("[Editor] Cannot save plugins: no game or mod selected");
      return;
    }

    if (!this.activeObject.value || !Array.isArray(this.activeObject.value)) {
      console.warn("[Editor] Nothing to save or invalid data");
      return;
    }

    try {
      await this.pluginManager.savePluginsFromDevTab(
        this.selectedGame,
        this.selectedMod,
        this.activeObject.value
      );

      this.hasUnsavedChanges.value = false;
      this.global.addNotificationId("save_success");

      // Reload active plugins to reflect changes
      await this.pluginManager.initActivePlugins(this.selectedGame, this.selectedMod);

      console.log("[Editor] Plugins saved successfully");
    } catch (error) {
      console.error("[Editor] Failed to save plugins:", error);
      this.global.addNotificationId("save_error");
    }
  }

  // --- WebP Conversion Methods ---
  private loadWebPSettings(): void {
    this.webpAutoConvert.value = localStorage.getItem('webp-auto-convert') === 'true';
    // Default to true if not set
    const backupSetting = localStorage.getItem('webp-backup-original');
    this.webpBackupOriginal.value = backupSetting === null ? true : backupSetting === 'true';
    this.webpQuality.value = parseInt(localStorage.getItem('webp-quality') || '95');
    this.webpLossless.value = localStorage.getItem('webp-lossless') === 'true';
  }

  private watchWebPSettings(): void {
    watch(this.webpAutoConvert, (val) => {
      localStorage.setItem('webp-auto-convert', val.toString());
    });
    watch(this.webpBackupOriginal, (val) => {
      localStorage.setItem('webp-backup-original', val.toString());
    });
    watch(this.webpQuality, (val) => {
      localStorage.setItem('webp-quality', val.toString());
    });
    watch(this.webpLossless, (val) => {
      localStorage.setItem('webp-lossless', val.toString());
    });
  }

  async convertPngToWebP(pngPath: string): Promise<{
    webpPath: string;
    originalSize: number;
    newSize: number;
  }> {
    return this.global.convertToWebP({
      pngPath,
      quality: this.webpQuality.value,
      lossless: this.webpLossless.value
    });
  }

  async backupFile(path: string): Promise<{ success: boolean; backupPath: string }> {
    return this.global.backupOriginalFile(path);
  }
  // --- End WebP Conversion Methods ---

  // --- Custom Component Registry Methods ---
  /**
   * Register a custom component for use in editor popups
   * @param config - The component configuration
   */
  registerCustomComponent(config: EditorCustomComponent): void {
    this.editorCustomComponents.set(config.id, config);
  }

  /**
   * Get a custom component by its ID
   * @param id - The component ID
   * @returns The component configuration or undefined if not found
   */
  getCustomComponent(id: string): EditorCustomComponent | undefined {
    return this.editorCustomComponents.get(id);
  }
  // --- End Custom Component Registry Methods ---

}