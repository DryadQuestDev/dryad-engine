import { StorageService } from '../services/storage.interface';
import { ElectronStorageService } from '../services/electron-storage.service';
import { LocalhostStorageService } from '../services/localhost-storage.service';
import { WebStorageService } from '../services/web-storage.service';
import { mergeById, Identifiable, mergeObjectArraySequentially } from '../functions/mergeById';
import { Game } from '../game/game';
import { ManifestObject } from '../schemas/manifestSchema';
import { PropertyObject } from '../schemas/propertySchema';
// import { Stat } from '../game/Stat';
import { loadSave } from '../utility/save-system';
import { IndexedDbSaveService } from '../services/indexeddb-save.service';

import { Property } from '../game/property';
import { Ref, ref, shallowRef, watch } from 'vue';
import { createValidatingDefineComponent } from './templateValidation';
import { useLocalStorage, useStorage } from '@vueuse/core';
import { SettingsObject } from '../schemas/settingsSchema';
import { MenuOptions } from './menuOptions';
import Editor from 'primevue/editor';

import { Editor as EngineEditor } from '../editor/editor';
import { DungeonData } from '../game/core/dungeon/dungeonData';
import { DungeonLine } from '../game/systems/dungeonSystem';
import { DebugSettings } from '../game/data/debugSettings';
import { Character } from '../game/core/character/character';
import { PluginObject } from '../schemas/pluginShema';
import { updateGamePlayOrder } from '../utility/game-order-tracker';
import { gameLogger } from '../game/utils/logger';
import { showConfirm, showAlert } from '../services/dialogService';
import { closeAll as closeAllPopups, closePopupsByKey } from '../game/views/popups/popupStore';
import { MusicPlayer } from '../services/musicPlayer';

// expose imports
import * as Vue from 'vue';
import * as PrimeVue from 'primevue';
import * as VueUse from '@vueuse/core';
import * as FloatingUi from '@floating-ui/vue';
import gsap from 'gsap';
import fastCopy from 'fast-copy';
import { PARTY_INVENTORY_ID } from '../game/systems/itemSystem';
import { DungeonRoomObject } from '../schemas/dungeonRoomSchema';
import { DungeonConfigObject } from '../schemas/dungeonConfigSchema';
import { DungeonEncounterObject } from '../schemas/dungeonEncounterSchema';

// Reusable components for external scripts
import CharacterFace from '../game/views/CharacterFace.vue';
import CharacterDoll from '../game/views/progression/CharacterDoll.vue';
import BackgroundAsset from '../game/views/BackgroundAsset.vue';
import CustomComponentContainer from '../game/views/CustomComponentContainer.vue';
import Savelist from './views/Savelist.vue';

// Progression components
import CharacterSheet from '../game/views/progression/CharacterSheet.vue';
import CharacterStats from '../game/views/progression/CharacterStats.vue';
import CharacterStatuses from '../game/views/progression/CharacterStatuses.vue';
import CharacterSlot from '../game/views/progression/CharacterSlot.vue';
import StatEntity from '../game/views/progression/StatEntity.vue';
import ProgressBar from '../game/views/progression/ProgressBar.vue';
import InventoryComponent from '../game/views/progression/InventoryComponent.vue';
import InventoryHeader from '../game/views/progression/InventoryHeader.vue';
import ItemGrid from '../game/views/progression/ItemGrid.vue';
import ItemSlot from '../game/views/progression/ItemSlot.vue';
import ItemSlots from '../game/views/progression/ItemSlots.vue';
import ItemCard from '../game/views/progression/ItemCard.vue';
import ItemChoices from '../game/views/progression/ItemChoices.vue';
import SkillTree from '../game/views/progression/SkillTree.vue';
import SkillSlot from '../game/views/progression/SkillSlot.vue';
import AbilityCard from '../game/views/progression/AbilityCard.vue';
import StatusObjectDisplay from '../game/views/progression/StatusObjectDisplay.vue';
import StatusBrick from '../game/views/progression/StatusBrick.vue';
import StatusCard from '../game/views/popups/cards/StatusCard.vue';
import AbilitiesViewer from '../game/views/progression/AbilitiesViewer.vue';
import CharacterViewer from '../game/views/progression/CharacterViewer.vue';
import CharacterViewerPopup from '../game/views/progression/CharacterViewerPopup.vue';
import CharacterRename from '../game/views/progression/CharacterRename.vue';

// Define the notification item structure
interface NotificationItem {
  id: number; // Use a number for simplicity, could be string/UUID
  message: string;
}

export type EngineState = 'main_menu' | 'game' | 'editor';

const GAME_SCRIPT_ATTRIBUTE = 'data-game-script'; // Attribute to identify game scripts
const GAME_CSS_ATTRIBUTE = 'data-game-css'; // Attribute to identify game CSS links
const LANDING_CSS_ATTRIBUTE = 'data-landing-css'; // Attribute to identify landing-only CSS

// Item slot size as a percentage of container height (used in both game and editor)
export const ITEM_SLOT_SIZE_PERCENT = 0.08; // 8%

// Arrowhead size for skill tree arrows (used in both game and editor)
export const ARROWHEAD_SIZE = 4;

export class Global {
  public engineState: Vue.Ref<EngineState> = Vue.ref('main_menu');
  public isWebSite = import.meta.env.VITE_WEB_MODE === 'true' && !(window as any).Capacitor;

  /**
   * Init-scoped memo for loadAndMergeArrayFile, non-null only while initGame() runs.
   * Boot reads ~75 data files and used to await them one at a time, which on web costs
   * one network round trip each; initGame now prefetches them all in one parallel batch
   * and the sequential awaits resolve from here. Null outside boot, so editor and
   * in-game callers keep reading straight from storage.
   *
   * A path missing from the prefetch list is not a bug — it just falls through to a
   * real read, exactly as before.
   */
  private initFileCache: Map<string, Promise<any[]>> | null = null;
  public nsfwEnabled = useStorage('nsfwEnabled', false);

  // Hosts where the engine's own 18+ gate applies (our hosted web builds).
  // Anywhere else (itch.io etc.) the hosting platform provides its own age gate.
  public nsfwGatedHosts = ['dryadengine.com', 'localhost', '127.0.0.1'];

  public get isNsfwGated(): boolean {
    if (!this.isWebSite) return false;
    const host = window.location.hostname;
    return this.nsfwGatedHosts.some(h => host === h || host.endsWith('.' + h));
  }

  public isNsfwAllowed(manifest: ManifestObject): boolean {
    if (!this.isNsfwGated) return true;
    if (!manifest.nsfw) return true;
    return this.nsfwEnabled.value;
  }
  private constructor() {
    // Determine environment and instantiate the appropriate storage service
    if (window.electron) {
      this.storageService = new ElectronStorageService();
    } else if (import.meta.env.VITE_WEB_MODE === 'true') {
      this.storageService = new WebStorageService();
      // In web mode, always clear dev mode state (no editor available)
      localStorage.removeItem('devMode');
      localStorage.removeItem('dev_mode_selected_game');
      localStorage.removeItem('dev_mode_selected_mod');
      localStorage.removeItem('returning_to_editor');
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

  public openViewer: Ref<string> = ref('');

  public engineVersion: string = "0.0.0"; // Initialized in constructor now

  private static instance: Global;
  public storageService!: StorageService; // Added definite assignment assertion
  // private game: Game; // Original private property
  get game(): Game { // Changed to a getter
    return Game.getInstance();
  }
  test: string = "global test";


  // Reactive behind a same-named getter: callers keep reading a plain Map (`localeMap.has(key)`,
  // `localeMap.get(key)`) and become reactive for free, so switching language repaints every
  // computed and template expression that resolved a string through it.
  private _localeMap = shallowRef(new Map<string, string>());
  public get localeMap(): Map<string, string> {
    return this._localeMap.value;
  }

  private defaultLanguage: string = 'en';

  // Same shape as localeMap above, and for the same reason: DocsViewer picks its documentation
  // language off this field inside a computed, so a plain string would leave the docs on the
  // language that was selected when the viewer first rendered.
  private _selectedLanguage = ref('en');
  public get selectedLanguage(): string {
    return this._selectedLanguage.value;
  }
  public set selectedLanguage(code: string) {
    this._selectedLanguage.value = code;
  }

  /** Languages found in `engine_files/locales`, each labeled from its own `lang_name`. */
  public availableLanguages: { code: string; name: string }[] = [{ code: 'en', name: 'English' }];

  /** Set once the locales folder has been listed. Until then availableLanguages holds only the
   *  two languages boot already had to parse: English and whichever one is selected. */
  private languagesDiscovered = false;

  // Runtime copy of the engine settings schema. `language.values` is filled from the discovered
  // locale files, which a module-level const cannot do; the copy keeps MenuOptions itself pristine.
  public menuOptions: Ref<SettingsObject[]> = ref(fastCopy(MenuOptions));

  public isMenuOpen = ref(false);
  public toggleMenu() {
    this.isMenuOpen.value = !this.isMenuOpen.value;
  }

  /** Initial tab MenuContainer opens on; consumed (reset to 'main') by its setup. */
  public menuInitialState = ref('main');
  public openMenu(menuState: string = 'main') {
    this.menuInitialState.value = menuState;
    this.isMenuOpen.value = true;
  }

  public closeMenu() {
    this.isMenuOpen.value = false;
  }

  public setViewer(type: string) {
    this.openViewer.value = this.openViewer.value === type ? '' : type;
  }

  public closeViewer() {
    this.openViewer.value = '';
  }

  public async init() {
    // Settings first: the language to load lives in them. initUserSettings is synchronous and
    // reads localStorage directly, so nothing here waits on a file.
    this.initUserSettings();
    // Trust the stored code as-is. Boot never writes user-settings.language back — only the
    // dropdown does — so a code that resolves elsewhere (or not yet at all) is never erased.
    this.selectedLanguage = this.userSettings.value.language || this.defaultLanguage;
    document.documentElement.lang = this.selectedLanguage;
    await this.initLanguages();
    // Discovery is NOT started here. It reads every shipped locale file to collect endonyms, and
    // those are needed only to label the settings dropdown, so it runs the first time that panel
    // opens (see ensureLanguagesDiscovered). Boot therefore costs two reads, English and the
    // selected language, however many translations ship.
  }

  public async toMainMenu() {
    let confirmDialog = "";
    if (this.engineState.value === 'game') {
      confirmDialog = this.getString('menu.return_confirm.game');
    } else if (this.engineState.value === 'editor' && EngineEditor.getInstance().hasUnsavedChanges.value) {
      confirmDialog = this.getString('menu.return_confirm.editor');
    }


    if (confirmDialog) {
      const confirmed = await showConfirm({
        message: confirmDialog,
        header: this.getString('menu.return_confirm.header')
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
    let defaultObject = this.optionsToObject(this.menuOptions.value);
    // Debug: console.log("MenuOptions object", defaultObject);

    // Get existing settings from localStorage
    const existingSettings = JSON.parse(localStorage.getItem('user-settings') || '{}');

    // Merge: existing values take precedence, but add any missing default values
    const mergedSettings = { ...defaultObject, ...existingSettings };

    // Update localStorage with merged settings
    localStorage.setItem('user-settings', JSON.stringify(mergedSettings));

    this.userSettings = useStorage('user-settings', mergedSettings);

    // Live music volume: registered here (not per-game) so it also covers main-menu music
    watch(() => this.userSettings.value.music_volume, (newVolume) => {
      MusicPlayer.getInstance().setVolume(newVolume / 100);
    });

    // Live language switch, registered at the only engine-level site that runs before any screen
    // mounts. Engine strings resolve through the reactive locale map, so no reload is needed.
    watch(() => this.userSettings.value.language, async (lang) => {
      if (!lang || lang === this.selectedLanguage) return;
      this.selectedLanguage = lang;
      await this.initLanguages();
      document.documentElement.lang = lang; // index.html ships a hardcoded lang="en" and never updates it
    });
  }

  /**
   * Builds the language list by listing `engine_files/locales` at runtime, so dropping a file into
   * that folder adds an option with no code change. Every deployment target resolves the listing:
   * the dev server and Electron read the directory, the web/Capacitor build reads its pre-generated
   * files_tree.json. Each file supplies its own display label through `lang_name`, so the engine
   * carries no table of language names.
   */
  public async ensureLanguagesDiscovered(): Promise<void> {
    if (this.languagesDiscovered) return;
    // Set before awaiting: two panel opens in quick succession must not both start a listing.
    this.languagesDiscovered = true;
    try {
      await this.discoverLanguages();
    } catch (error) {
      this.languagesDiscovered = false;
      gameLogger.warn('Could not discover languages.', error);
    }
  }

  private async discoverLanguages(): Promise<void> {
    const found = new Map<string, string>();

    try {
      const files = await this.listFiles('engine_files/locales');
      // A leading underscore reserves a name for sidecar files that are not languages.
      const localeFiles = files.filter(file => file.endsWith('.json') && !file.startsWith('_'));
      // In parallel: a read is an HTTP GET on the web build, and one round trip per shipped
      // language in series is the part that grows with the number of translations.
      const parsed = await Promise.all(localeFiles.map(async file => ({
        file,
        data: await this.readJson(`engine_files/locales/${file}`) as Record<string, string> | null,
      })));
      for (const { file, data } of parsed) {
        if (!data) {
          gameLogger.warn(`Locale file "${file}" is missing or could not be parsed - skipping it.`);
          continue;
        }
        const code = file.slice(0, -'.json'.length);
        found.set(code, data.lang_name || code);
      }
    } catch (error) {
      gameLogger.warn('Could not list engine_files/locales - falling back to English only.', error);
    }

    this.setAvailableLanguages([...found]);

    // Boot could name only English and the selected language: republish the live map with the
    // endonyms discovery has now read. A copy, because _localeMap is a shallowRef and a mutation
    // in place would not repaint the open dropdown.
    const withNames = new Map(this.localeMap);
    this.applyLanguageNames(withNames);
    this._localeMap.value = withNames;
  }

  /**
   * Publishes the language list and refreshes the dropdown's options. Called twice: once from
   * initLanguages with the two files boot reads, then again once the folder has been listed.
   */
  private setAvailableLanguages(entries: [string, string][]): void {
    const found = new Map(entries);
    // Union in English and whatever code is persisted. A failed listing, or a locale file deleted
    // out from under a stored choice, must still leave a usable dropdown rather than a Select
    // bound to a value that has no option.
    if (!found.has(this.defaultLanguage)) found.set(this.defaultLanguage, 'English');
    const storedLanguage = this.userSettings?.value?.language;
    if (storedLanguage && !found.has(storedLanguage)) found.set(storedLanguage, storedLanguage);

    this.availableLanguages = [...found].map(([code, name]) => ({ code, name }));

    // SettingsObject is derived from an `as const` schema, so its fields are readonly: the option
    // is replaced rather than patched in place.
    const codes = this.availableLanguages.map(lang => lang.code);
    this.menuOptions.value = this.menuOptions.value.map(
      option => option.id === 'language' ? { ...option, values: codes } : option
    );
  }

  /**
   * Endonyms for the language dropdown. These keys exist in no locale file - each file names only
   * itself, through `lang_name` - but GfieldRenderer resolves a chooseOne option through
   * `<settingId>.<value>`, so `language.de` is synthesized here from de.json's own lang_name.
   */
  private applyLanguageNames(map: Map<string, string>): void {
    for (const lang of this.availableLanguages) {
      map.set(`language.${lang.code}`, lang.name);
    }
  }

  /** A parsed locale file, read fresh: an edited locale file must show up on the next switch. */
  private async readLocaleFile(code: string): Promise<Record<string, string>> {
    const data = await this.readJson(`engine_files/locales/${code}.json`) as Record<string, string> | null;
    return data || {};
  }

  /**
   * The editor's own strings, kept in `locales/editor/` beside the player file. Both halves land
   * in the same map, so no call site cares which file a key came from - the split exists so a
   * translator is handed the player file alone, and because `listFiles` returns files and never
   * folders, which keeps `editor/` out of the language dropdown. A language that ships only the
   * player half simply falls back to English for the editor, same as any missing key.
   */
  private async readEditorLocaleFile(code: string): Promise<Record<string, string>> {
    const data = await this.readJson(`engine_files/locales/editor/${code}.json`) as Record<string, string> | null;
    return data || {};
  }

  private async initLanguages() {
    try {
      const [editorDataEn, localeDataEn] = await Promise.all([
        this.readEditorLocaleFile(this.defaultLanguage),
        this.readLocaleFile(this.defaultLanguage),
      ]);

      let localeData: Record<string, string> = { ...editorDataEn, ...localeDataEn };

      let selectedName = '';
      if (this.selectedLanguage !== this.defaultLanguage) {
        const [editorDataSelected, localeDataSelected] = await Promise.all([
          this.readEditorLocaleFile(this.selectedLanguage),
          this.readLocaleFile(this.selectedLanguage),
        ]);
        // Merge selected language over default (selected language translations take precedence)
        localeData = { ...localeData, ...editorDataSelected, ...localeDataSelected };
        selectedName = localeDataSelected.lang_name || '';
      }

      // Before the folder has been listed, these two files are the only ones that have been read,
      // and they already carry their own endonyms - so the dropdown can name both without any
      // extra request. The rest arrive when the settings panel first opens.
      if (!this.languagesDiscovered) {
        this.setAvailableLanguages([
          [this.defaultLanguage, localeDataEn.lang_name || 'English'],
          ...(this.selectedLanguage !== this.defaultLanguage
            ? [[this.selectedLanguage, selectedName || this.selectedLanguage] as [string, string]]
            : []),
        ]);
      }

      // Build the map in full before publishing it: _localeMap is a shallowRef, so an
      // assign-then-fill shape would publish an empty map and then mutate it untracked.
      const newMap = new Map<string, string>();
      for (const [key, value] of Object.entries(localeData)) {
        newMap.set(key, value || '');
      }

      this.applyLanguageNames(newMap);

      this._localeMap.value = newMap;
    } catch (error) {
      gameLogger.error('Error loading locale data', error);
    }
  }

  // Add a helper method for easy lookup
  public getString(id: string | undefined, params: Record<string, string | number> = {}): string {
    let string = this.localeMap.get(id || '') || `[${id}]`; // Return ID as fallback if not found
    for (const [key, value] of Object.entries(params)) {
      // replaceAll, not replace: inflected languages routinely repeat a placeholder in one
      // sentence, and game.getLine already uses replaceAll – the two resolvers must not disagree.
      // The replacement is a function so that $&, $1 and $$ inside a substituted name (item titles
      // and player-chosen character names are user data) stay literal instead of being expanded.
      string = string.replaceAll(`|${key}|`, () => String(value));
    }
    return string;
  }

  /**
   * A localized string with a literal fallback: the running game's own locale first (a game may
   * rename an engine label through it), then the engine locale, then `fallback` untouched.
   * Registry titles pass a locale key as both arguments, so a game or plugin that registered a
   * literal title keeps rendering that literal.
   */
  public getStringOr(id: string, fallback: string): string {
    if (!id) return fallback;
    if (this.engineState.value === 'game') {
      const gameLine = this.game.getLine(id);
      if (gameLine && gameLine !== `[${id}]`) return gameLine;
    }
    const engineLine = this.getString(id);
    if (engineLine && engineLine !== `[${id}]`) return engineLine;
    return fallback;
  }


  private notificationCounter = 0; // Counter for unique IDs
  public notifications: Ref<NotificationItem[]> = ref([]);

  public addNotification(message: string) {
    message = this.game.resolveString(message).output;
    gameLogger.info(`[notification] ${message}`);
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
      this.addNotificationId('error_load_save_not_found', { save: saveName });
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

    // Re-apply per-game accent across the engine for in-game UI (menu, popups, etc.)
    this.applyEngineTheme(modsManifests);

    gameLogger.info("Game initialized, loading save data...");
    if (!this.game.coreSystem.trigger("save_load_before", data)) {
      gameLogger.warn("Save load aborted by save_load_before listener.");
      return null;
    }

    // Materialize shadow dungeons from the raw save BEFORE deserialization, so dungeon data
    // merges onto real instances and the current dungeon can restore inside a shadow one.
    const shadowDefinitions = (data as any)?.dungeonSystem?.shadowDungeons;
    if (shadowDefinitions && typeof shadowDefinitions === 'object') {
      this.game.dungeonSystem.rematerializeShadowDungeons(shadowDefinitions);
    }

    loadSave(this.game, data);

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

    // Stash the loaded save's versions map — the migration pass below and game.isOldSave()
    // both compare it against the current (game + mods) versions.
    if (data.saveMeta?.versions && typeof data.saveMeta.versions === 'object') {
      this.game.coreSystem.loadedSaveVersions = { ...data.saveMeta.versions };
    }

    await this.initGameAfter(mergedManifest);
    this.game.coreSystem.loadGame(this.game, saveName);

    // Track that this game was played
    updateGamePlayOrder(gameId);
    this.initGameAfterScriptsLoaded();
    gameLogger.success(`Loaded game "${gameId}" from save "${saveName}"`);
    this.game.coreSystem.stateLoading.value = false;
    // Restore saved entities from the current definitions before any listener can read them.
    this.game.coreSystem.runRegisteredSaveMigrations();
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

    // Re-apply per-game accent across the engine for in-game UI (menu, popups, etc.)
    this.applyEngineTheme(modList);

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
    try {
      return await this.initGameRun(gameManifest, modList);
    } finally {
      // Never let the boot memo outlive boot, even on a failed init: every later read
      // (editor tabs, in-game getFileData) must go to storage for fresh data.
      this.initFileCache = null;
    }
  }

  /**
   * Every array data file initGameRun() goes on to read, warmed in one parallel batch.
   * Runs after loadPluginData (the merge folds in plugin-contributed entries from the
   * already-loaded plugin configs) and after the dungeon list is known.
   *
   * Keep this list in step with the reads below. It is an optimization only — a name
   * missing here just falls through to its own read, and a name listed but never read
   * costs one wasted fetch.
   */
  private async prefetchGameData(gameId: string, modsIds: string[], dungeonsList: string[]): Promise<void> {
    const rootFiles = [
      "ability_definitions", "ability_groups", "ability_templates",
      "accolades", "accolade_groups", "accolade_tiers",
      "asset_meta", "assets", "character_attributes", "character_skin_layers",
      "character_slot_templates", "character_stats", "character_statuses",
      "character_templates", "character_traits", "character_views",
      "custom_choices", "dungeon_traits", "encyclopedia_trees", "galleries", "game_settings",
      "inventory_traits", "item_categories", "item_inventories", "item_recipes", "item_slots",
      "item_templates", "item_traits", "locale", "music",
      "narrative_segments", "narrative_slots", "narrative_states", "narrative_tags",
      "pool_definitions", "pool_entries", "properties", "recipe_groups",
      "records", "skill_slots", "skill_trees", "sounds", "stat_groups",
      "stat_meta", "status_meta",
    ];

    const paths = [...rootFiles];
    for (const dungeon of dungeonsList) {
      paths.push(`dungeons/${dungeon}/content_parsed`);
      paths.push(`dungeons/${dungeon}/rooms`);
      paths.push(`dungeons/${dungeon}/encounters`);
    }

    this.initFileCache = new Map();
    // loadAndMergeArrayFile swallows a missing file per mod, so a rejection here would be
    // a real storage fault; allSettled keeps it from aborting boot before the read that
    // owns it can report it.
    await Promise.allSettled(paths.map(path => this.loadAndMergeArrayFile<any>(gameId, path, modsIds)));
  }

  private async initGameRun(gameManifest: ManifestObject, modList: ManifestObject[]): Promise<{ mergedManifest: ManifestObject | null }> {
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

    await this.prefetchGameData(gameId, modsIds, dungeonsList);

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
      const dungeonConfig = dungeonLinesMap.get('_config_')?.params as DungeonConfigObject | undefined;
      if (dungeonConfig?.dungeon_type === 'screen' && dungeonRoomsMap.size === 0) {
        dungeonRoomsMap.set('main', { id: 'main', uid: 'main' });
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

    // load object maps for properties(static DATA ONLY)
    game.coreSystem.propertiesMap = await this.fetchMapValues(gameId, `properties`, modsIds);

    // load object maps for character system
    game.characterSystem.statsMap = await this.fetchMapValues(gameId, `character_stats`, modsIds, 'order');
    game.characterSystem.statsVisibleMap = new Map(Array.from(game.characterSystem.statsMap.entries()).filter(([_, stat]) => !stat.is_hidden));
    game.characterSystem.statGroupsMap = await this.fetchMapValues(gameId, `stat_groups`, modsIds, 'order');
    game.characterSystem.attributesMap = await this.fetchMapValues(gameId, `character_attributes`, modsIds);
    game.characterSystem.skinLayersMap = await this.fetchMapValues(gameId, `character_skin_layers`, modsIds);
    // Attribute ids shadow skin-layer ids in the attr/char action and _char condition fallbacks
    /*for (const id of game.characterSystem.skinLayersMap.keys()) {
      if (game.characterSystem.attributesMap.has(id)) {
       gameLogger.warn(`Id "${id}" is both a character attribute and a skin layer. The attribute takes precedence: "attr: ${id} = true" sets the attribute, never the layer visibility.`);
       }
    }*/
    game.characterSystem.traitsMap = await this.fetchMapValues(gameId, `character_traits`, modsIds, 'order');
    game.characterSystem.templatesMap = await this.fetchMapValues(gameId, `character_templates`, modsIds);
    game.characterSystem.statusesMap = await this.fetchMapValues(gameId, `character_statuses`, modsIds);
    game.characterSystem.skillSlotsMap = await this.fetchMapValues(gameId, `skill_slots`, modsIds);
    game.characterSystem.skillTreesMap = await this.fetchMapValues(gameId, `skill_trees`, modsIds);
    game.characterSystem.abilityDefinitionsMap = await this.fetchMapValues(gameId, `ability_definitions`, modsIds);
    game.characterSystem.abilityTemplatesMap = await this.fetchMapValues(gameId, `ability_templates`, modsIds);
    game.characterSystem.abilityGroupsMap = await this.fetchMapValues(gameId, `ability_groups`, modsIds, 'order');

    // load object maps for item system
    game.itemSystem.itemTemplatesMap = await this.fetchMapValues(gameId, `item_templates`, modsIds);
    game.itemSystem.inventoryTemplatesMap = await this.fetchMapValues(gameId, `item_inventories`, modsIds);
    game.itemSystem.itemTraitsMap = await this.fetchMapValues(gameId, `item_traits`, modsIds);
    game.itemSystem.itemSlotsMap = await this.fetchMapValues(gameId, `item_slots`, modsIds);
    game.itemSystem.itemCategoriesMap = await this.fetchMapValues(gameId, `item_categories`, modsIds);
    game.itemSystem.itemRecipesMap = await this.fetchMapValues(gameId, `item_recipes`, modsIds);
    game.itemSystem.recipeGroupsMap = await this.fetchMapValues(gameId, `recipe_groups`, modsIds);

    // load object maps for asset system
    game.dungeonSystem.assetsMap = await this.fetchMapValues(gameId, `assets`, modsIds);

    // load the meta/trait key definition files (the `fromFile` sources behind an entity's
    // meta/traits/view fields). No system map owns these — they are loaded for the
    // dataRegistry side effect, so game and plugin scripts can read a key's type, default,
    // description and order via getData(), not just the value sitting on the entity.
    await this.fetchMapValues(gameId, `stat_meta`, modsIds);
    await this.fetchMapValues(gameId, `status_meta`, modsIds);
    await this.fetchMapValues(gameId, `asset_meta`, modsIds);
    await this.fetchMapValues(gameId, `character_views`, modsIds);
    await this.fetchMapValues(gameId, `dungeon_traits`, modsIds);
    await this.fetchMapValues(gameId, `inventory_traits`, modsIds);

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
    const gameSettingsMap = new Map<string, any>();
    for (const s of gameSettings) gameSettingsMap.set(s.id, s);
    game.coreSystem.dataRegistry.set('game_settings', gameSettingsMap);

    // load object maps for music and sounds
    game.coreSystem.musicMap = await this.fetchMapValues(gameId, `music`, modsIds);
    game.coreSystem.soundsMap = await this.fetchMapValues(gameId, `sounds`, modsIds);

    // load object maps for locale system
    game.coreSystem.localeMap = await this.fetchMapValues(gameId, `locale`, modsIds);

    // load object maps for pool system
    game.logicSystem.poolDefinitionsMap = await this.fetchMapValues(gameId, `pool_definitions`, modsIds);
    game.logicSystem.poolEntriesMap = await this.fetchMapValues(gameId, `pool_entries`, modsIds);

    // load object maps for narrative system
    await this.fetchMapValues(gameId, `narrative_tags`, modsIds);
    await this.fetchMapValues(gameId, `narrative_slots`, modsIds);
    await this.fetchMapValues(gameId, `narrative_states`, modsIds);
    await this.fetchMapValues(gameId, `narrative_segments`, modsIds);
    game.narrativeSystem.recordsMap = await this.fetchMapValues(gameId, `records`, modsIds);
    game.narrativeSystem.encyclopediaTreesMap = await this.fetchMapValues(gameId, `encyclopedia_trees`, modsIds, 'order');
    game.narrativeSystem.buildEncyclopediaIndex();
    game.narrativeSystem.buildSegmentIndex();

    game.accoladeSystem.initData(
      await this.fetchMapValues(gameId, `accolades`, modsIds, 'order'),
      await this.fetchMapValues(gameId, `accolade_tiers`, modsIds, 'order'),
      await this.fetchMapValues(gameId, `accolade_groups`, modsIds, 'order'),
    );

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
    // game.coreSystem.dataRegistry.set('properties', game.coreSystem.properties.value);

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
        game.itemSystem.createInventory(inventoryObject.id, inventoryObject.id);
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
        let character = game.characterSystem.createCharacter(characterObject.id, characterObject.id);
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

    if (pluginList && Array.isArray(pluginList)) {
      // One listing per mod, in parallel. A folder's contents answer every plugin name at
      // once — the old loop re-listed the same directory once per plugin name.
      const modPluginFolders = await Promise.all(
        modList.map(mod =>
          this.storageService.listFolders(`games_files/${gameId}/${mod.id}/plugins`)
            .catch(() => [] as string[]) // plugins folder doesn't exist in this mod
        )
      );

      // Iterate through mods in reverse order so latest mod overwrites earlier ones
      for (let i = modList.length - 1; i >= 0; i--) {
        const modId = modList[i].id;
        for (const pluginName of pluginList) {
          // Only add if we haven't seen this plugin yet (latest mod wins)
          if (pluginPathsMap.has(pluginName)) continue;
          if (modPluginFolders[i].includes(pluginName)) {
            pluginPathsMap.set(pluginName, `games_files/${gameId}/${modId}/plugins/${pluginName}`);
          }
        }
      }

      // Also check for global plugins that aren't overridden by mods
      const unresolved = pluginList.filter(pluginName => !pluginPathsMap.has(pluginName));
      if (unresolved.length > 0) {
        const globalFolders = await this.storageService.listFolders('engine_files/plugins')
          .catch(() => [] as string[]); // global plugin doesn't exist
        for (const pluginName of unresolved) {
          if (globalFolders.includes(pluginName)) {
            pluginPathsMap.set(pluginName, `engine_files/plugins/${pluginName}`);
          }
        }
      }
    }

    // Pass 1: Load all plugin.json configs and store in pluginConfigs
    const pluginPathEntries = [...pluginPathsMap.entries()];
    const pluginJsons = await Promise.all(
      pluginPathEntries.map(([, pluginPath]) =>
        this.storageService.readJson(`${pluginPath}/plugin.json`)
          .catch(error => {
            gameLogger.error(`Failed to load plugin config from ${pluginPath}:`, error);
            return null;
          })
      )
    );

    // Registered in pluginPathsMap order, not completion order, so pluginConfigs is
    // deterministic (the `order` sort below reads it, and equal orders keep insertion order).
    for (let i = 0; i < pluginPathEntries.length; i++) {
      const pluginPath = pluginPathEntries[i][1];
      const pluginJson = pluginJsons[i];
      try {
        if (!pluginJson) {
          gameLogger.warn(`Plugin JSON not found at ${pluginPath}/plugin.json`);
          continue;
        }

        const pluginConfig = this.convertJsonToPluginObject(pluginJson, pluginJson.id);
        game.coreSystem.pluginConfigs.set(pluginConfig.id, pluginConfig);
      } catch (error) {
        gameLogger.error(`Failed to load plugin config from ${pluginPath}:`, error);
      }
    }

    // Sort plugins by their `order` field (lower values first) and rebuild pluginPaths in sorted order
    // This determines plugin load order for both data (pass 2) and scripts/CSS (loadExternalFiles)
    const sortedPluginIds = [...game.coreSystem.pluginConfigs.entries()]
      .sort((a, b) => (a[1].order || 0) - (b[1].order || 0))
      .map(([id]) => id);

    const sortedPluginPaths = new Map<string, string>();
    for (const id of sortedPluginIds) {
      const path = pluginPathsMap.get(id);
      if (path) sortedPluginPaths.set(id, path);
    }
    game.coreSystem.pluginPaths = sortedPluginPaths;

    // Pass 2: Load plugin tab data (schemas, plugins_data files) in sorted order and register in dataRegistry.
    // Every tab of every plugin is read in one parallel batch, then registered in the
    // original plugin/tab order so `plugins` and `dataRegistry` are insertion-stable.
    const tabLoads: { pluginId: string; schemaId: string; isArray: boolean; path: string }[] = [];
    for (const [pluginId] of sortedPluginPaths) {
      const pluginConfig = game.coreSystem.pluginConfigs.get(pluginId);
      if (!pluginConfig) continue;
      if (!pluginConfig.tabs || !Array.isArray(pluginConfig.tabs)) continue;

      for (const tab of pluginConfig.tabs) {
        const schemaId = tab.id;
        if (!schemaId) continue;
        tabLoads.push({
          pluginId: pluginConfig.id,
          schemaId,
          isArray: !!tab.isArray,
          path: `plugins_data/${pluginConfig.id}/${schemaId}`,
        });
      }
    }

    // undefined marks a tab that failed to load — it stays out of pluginDataMap, matching
    // the old per-tab catch that skipped the pluginDataMap.set.
    const tabData = await Promise.all(tabLoads.map(async load => {
      try {
        if (load.isArray) {
          const arrayData = await this.loadAndMergeArrayFile<any>(gameId, load.path, modsIds);
          const map = new Map<string, any>();
          for (const item of arrayData) {
            map.set(item.id || item.uid, item);
          }
          return map as any;
        }
        return await this.loadAndMergeSingleFile<any>(gameId, load.path, modsIds) as any;
      } catch (error) {
        gameLogger.warn(`Failed to load plugin data for ${load.pluginId}/${load.schemaId}:`, error);
        return undefined;
      }
    }));

    const pluginDataMaps = new Map<string, Map<string, any>>();
    for (let i = 0; i < tabLoads.length; i++) {
      if (tabData[i] === undefined) continue;
      const { pluginId, schemaId } = tabLoads[i];
      let pluginDataMap = pluginDataMaps.get(pluginId);
      if (!pluginDataMap) {
        pluginDataMap = new Map<string, any>();
        pluginDataMaps.set(pluginId, pluginDataMap);
      }
      pluginDataMap.set(schemaId, tabData[i]);
    }

    for (const [pluginId] of sortedPluginPaths) {
      const pluginConfig = game.coreSystem.pluginConfigs.get(pluginId);
      if (!pluginConfig) continue;
      if (!pluginConfig.tabs || !Array.isArray(pluginConfig.tabs)) continue;

      // A plugin whose every tab failed still registered an empty map before, so keep that.
      const pluginDataMap = pluginDataMaps.get(pluginConfig.id) ?? new Map<string, any>();
      game.coreSystem.plugins.set(pluginConfig.id, pluginDataMap);

      for (const [schemaId, schemaData] of pluginDataMap) {
        const registryPath = `plugins_data/${pluginConfig.id}/${schemaId}`;
        game.coreSystem.dataRegistry.set(registryPath, schemaData);
      }
    }

    // load plugins end


  }

  private async loadExternalFiles(game: Game, mergedManifest: ManifestObject | null, modList: ManifestObject[]) {
    let gameId = game.coreSystem.gameId;
    let modsIds = modList.map(mod => mod.id);

    // Create wrapped Vue with validating defineComponent
    const wrappedVue = {
      ...Vue,
      defineComponent: createValidatingDefineComponent(),
    };

    // expose game to global
    (window as any).engine = {
      game: this.game,
      // expose vue to global (with validation wrapper)
      vue: wrappedVue,
      primeVue: PrimeVue,
      vueUse: VueUse,
      floatingUi: FloatingUi,
      gsap: gsap,
      fastCopy: fastCopy,
      // expose dialog utilities
      showConfirm,
      showAlert,
      // expose hover/pinned popup control (e.g. close lingering item cards before a modal)
      popups: { closeAll: closeAllPopups, closePopupsByKey },
      // expose reusable components
      components: {
        CharacterFace,
        CharacterDoll,
        BackgroundAsset,
        CustomComponentContainer,
        Savelist,
        // Progression components
        CharacterSheet,
        CharacterStats,
        CharacterStatuses,
        CharacterSlot,
        CharacterViewer,
        CharacterViewerPopup,
        CharacterRename,
        StatEntity,
        ProgressBar,
        InventoryComponent,
        InventoryHeader,
        ItemGrid,
        ItemSlot,
        ItemSlots,
        ItemCard,
        ItemChoices,
        SkillTree,
        SkillSlot,
        AbilityCard,
        StatusObjectDisplay,
        StatusBrick,
        StatusCard,
        AbilitiesViewer,
      }
    };


    // Every plugin's css folder listed in one batch. Listing has no side effects, and the
    // scripts and css below are still applied one at a time in plugin order — load order
    // is what decides script registration and css cascade.
    const pluginCssLists = new Map<string, string[]>();
    await Promise.all(
      [...this.game.coreSystem.pluginPaths].map(async ([pluginId, pluginPath]) => {
        pluginCssLists.set(pluginId, await this.listFiles(`${pluginPath}/css`).catch(() => [] as string[]));
      })
    );

    // Every css file the two loops below will append, in append order, fetched up front.
    const allCssPaths: string[] = [];
    for (const [pluginId, pluginPath] of this.game.coreSystem.pluginPaths) {
      for (const css of pluginCssLists.get(pluginId) || []) {
        allCssPaths.push(`assets/${pluginPath}/css/${css}`);
      }
    }
    for (const cssPath of mergedManifest?.css || []) {
      allCssPaths.push(`${cssPath}`);
    }
    const cssText = await this.prefetchCssText(allCssPaths);

    // load js and css from plugins
    for (const [pluginId, pluginPath] of this.game.coreSystem.pluginPaths) {
      //console.warn("pluginPath", pluginPath);
      const pluginJson = this.game.coreSystem.pluginConfigs.get(pluginId);

      // Load only explicitly specified scripts
      const scripts = pluginJson?.scripts;
      if (scripts && Array.isArray(scripts)) {
        for (const scriptPath of scripts) {
          // Normalize path separators for browser (Windows uses \ but browsers need /)
          const normalizedPath = scriptPath.replace(/\\/g, '/');
          const fullPath = `assets/${pluginPath}/scripts/${normalizedPath}`;
          await this.loadScript(fullPath);
        }
      }

      // CSS loading - always load all CSS files
      let csss = pluginCssLists.get(pluginId) || [];
      //console.warn("pluginPath csss", csss);
      for (const css of csss) {
        // Add 'assets/' prefix for browser loading
        await this.loadCss(`assets/${pluginPath}/css/${css}`, cssText);
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
        this.addNotificationId('error_load_script_failed', { script: scriptPath });
      }
    }

    // load external css
    let cssPaths = mergedManifest?.css || [];
    // Debug: console.log("CSS to load:", cssPaths);
    for (const cssPath of cssPaths) {
      const fullPath = `${cssPath}`;
      try {
        await this.loadCss(fullPath, cssText);
        gameLogger.success(`Successfully loaded CSS: ${fullPath}`);
      } catch (error) {
        gameLogger.error(`Failed to load CSS: ${fullPath}`, error);
        this.addNotificationId('error_load_css_failed', { css: cssPath });
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
    const existingStyles = document.querySelectorAll(`style[${GAME_CSS_ATTRIBUTE}]`);
    existingStyles.forEach(style => {
      if (style.parentNode) {
        style.parentNode.removeChild(style);
      }
    });
  }

  public async loadLandingCss(manifests: ManifestObject[]): Promise<void> {
    const target = new Set<string>();
    for (const manifest of manifests) {
      const paths = manifest?.landing_css;
      if (!paths) continue;
      for (const path of paths) {
        if (path) target.add(path);
      }
    }

    // Load any newly-needed sheets BEFORE removing the old ones, so there's
    // no gap where the page renders un-themed.
    await Promise.all(
      [...target].map(async path => {
        if (document.querySelector(`style[${LANDING_CSS_ATTRIBUTE}="${path}"]`)) return;
        try {
          await this.loadLandingCssFile(path);
        } catch (error) {
          gameLogger.error(`Failed to load landing CSS: ${path}`, error);
        }
      })
    );

    // Remove any landing CSS that is no longer in the target set.
    document.querySelectorAll(`style[${LANDING_CSS_ATTRIBUTE}]`).forEach(style => {
      const path = style.getAttribute(LANDING_CSS_ATTRIBUTE);
      if (!path || !target.has(path)) style.parentNode?.removeChild(style);
    });
  }

  public unloadLandingCss(): void {
    const existingStyles = document.querySelectorAll(`style[${LANDING_CSS_ATTRIBUTE}]`);
    existingStyles.forEach(style => {
      style.parentNode?.removeChild(style);
    });
  }

  public applyEngineTheme(manifests: ManifestObject[]): void {
    let primary: string | undefined;
    let accent: string | undefined;
    for (const m of manifests) {
      if (m?.theme?.primary) primary = m.theme.primary;
      if (m?.theme?.accent) accent = m.theme.accent;
    }
    this.setThemeVar('--glass-tint', accent);
    this.setThemeVar('--theme-primary', primary);
  }

  public clearEngineTheme(): void {
    document.body.style.removeProperty('--glass-tint');
    document.body.style.removeProperty('--theme-primary');
  }

  private setThemeVar(name: string, value: string | undefined): void {
    if (!value) {
      document.body.style.removeProperty(name);
      return;
    }
    const c = /^(#|rgb|hsl)/i.test(value) ? value : `#${value}`;
    document.body.style.setProperty(name, c);
  }

  private async loadLandingCssFile(path: string): Promise<void> {
    if (document.querySelector(`style[${LANDING_CSS_ATTRIBUTE}="${path}"]`)) return;
    const response = await fetch(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const cssText = await response.text();
    const style = document.createElement('style');
    style.setAttribute(LANDING_CSS_ATTRIBUTE, path);
    style.textContent = cssText;
    document.head.appendChild(style);
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

  /**
   * Fetches every css file's text in one parallel batch. Boot used to await ~29 of these
   * one at a time, and on web that chain cost more than the whole data layer did.
   * Appending still happens one file at a time in load order below — the cascade depends
   * on it. A path that fails here is simply absent from the map, so loadCss falls back to
   * its own fetch and reports the failure exactly as it did before.
   */
  private async prefetchCssText(paths: string[]): Promise<Map<string, string>> {
    const texts = new Map<string, string>();
    await Promise.all(paths.map(async path => {
      try {
        const response = await fetch(path);
        if (response.ok) texts.set(path, await response.text());
      } catch {
        // leave it out; loadCss re-fetches and reports
      }
    }));
    return texts;
  }

  private async loadCss(path: string, preloaded?: Map<string, string>): Promise<void> {
    // Check if CSS already loaded
    if (document.querySelector(`style[${GAME_CSS_ATTRIBUTE}="${path}"]`)) {
      gameLogger.warn(`CSS already loaded: ${path}`);
      return;
    }

    try {
      let cssText = preloaded?.get(path);
      if (cssText === undefined) {
        const response = await fetch(path);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        cssText = await response.text();
      }

      const style = document.createElement('style');
      style.setAttribute(GAME_CSS_ATTRIBUTE, path);
      style.textContent = cssText;
      document.head.appendChild(style);
    } catch (error) {
      gameLogger.error(`Error loading CSS ${path}:`, error);
      throw error;
    }
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
    if (!this.initFileCache) {
      return this.readAndMergeArrayFile<T>(gameId, path, modList, ignorePlugins);
    }

    const key = `${gameId}|${path}|${modList.join(',')}|${ignorePlugins}`;
    let loading = this.initFileCache.get(key);
    if (!loading) {
      loading = this.readAndMergeArrayFile<T>(gameId, path, modList, ignorePlugins);
      this.initFileCache.set(key, loading);
    }
    // Hand every caller its own array: fetchMapValues sorts in place, so a shared
    // instance would let one consumer reorder another's.
    return (await loading).slice() as T[];
  }

  /** Uncached read+merge. Use loadAndMergeArrayFile — it adds the boot-time memo. */
  private async readAndMergeArrayFile<T extends Identifiable>(gameId: string, path: string, modList: string[], ignorePlugins: boolean = false): Promise<T[]> {
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

    // Use the already-loaded plugin configs from game.coreSystem.pluginConfigs
    // These were loaded during initGame() to avoid loading them twice
    for (const [pluginId, pluginConfig] of this.game.coreSystem.pluginConfigs) {
      // Check if plugin has data for this file
      if (pluginConfig.data && Array.isArray(pluginConfig.data)) {
        for (const dataItem of pluginConfig.data) {
          if (dataItem.fileName === fileName && dataItem.fileData) {
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

    // Use the already-loaded plugin configs from game.coreSystem.pluginConfigs
    // These were loaded during initGame() to avoid loading them twice
    for (const [pluginId, pluginConfig] of this.game.coreSystem.pluginConfigs) {
      // Check if plugin has data for this file
      if (pluginConfig.data && Array.isArray(pluginConfig.data)) {
        for (const dataItem of pluginConfig.data) {
          if (dataItem.fileName === fileName && dataItem.fileData) {
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

  async readText(path: string): Promise<string | null> {
    return this.storageService.readText(path);
  }

  async writeText(path: string, content: string): Promise<void> {
    return this.storageService.writeText(path, content);
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

  async copyDir(src: string, dest: string): Promise<{ success: boolean; error?: string }> {
    return this.storageService.copyDir(src, dest);
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
  async readDocFile(category: string, page: string, language: string = 'en', basePath: string): Promise<{
    content?: string;
    error?: string;
  }> {
    return this.storageService.readDocFile(category, page, language, basePath);
  }

  async searchDocs(query: string, language: string = 'en', basePath: string): Promise<{
    results?: any[];
    total?: number;
    error?: string;
  }> {
    return this.storageService.searchDocs(query, language, basePath);
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

    // Start with shallow copy of all top-level fields (future-proof - new fields automatically included)
    // Then override specific fields that need special handling
    const pluginObject: PluginObject = {
      ...json,
      uid: this.generateUid(),  // Always generate new uid (editor-only field)
      id: pluginId,              // Use parameter (folder name) as id
      tabs: convertedTabs,       // Use converted tabs
      data: dataArray            // Use converted data
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