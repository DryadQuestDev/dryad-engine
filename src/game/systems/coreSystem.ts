import { save, Skip, Populate } from '../../utility/save-system';
import { ManifestObject } from '../../schemas/manifestSchema';
import { Global } from '../../global/global';
import { IndexedDbSaveService } from '../../services/indexeddb-save.service';
import { Ref, ref, markRaw, type Component, computed, watch, ComputedRef } from 'vue';
import { useIdle, type UseIdleReturn } from '@vueuse/core';
import { DebugSettingsType } from '../data/debugSettings';
import { SettingsObject } from '../../schemas/settingsSchema';
import { Property } from '../property';
import { SoundObject } from '../../schemas/soundSchema';
import { MusicObject } from '../../schemas/musicSchema';
import { Character } from '../core/character/character';
import type { Identifiable } from '../../functions/mergeById';
import { Game } from '../game';
import { gameLogger, captureCallerInfo } from '../utils/logger';
import { GalleryObject } from '../../schemas/gallerySchema';
import { DiscoveredCharacter } from '../core/character/discoveredCharacter';
import { DiscoveredAsset } from '../core/asset/discoveredAsset';
import { AssetObject } from '../../schemas/assetSchema';
import { InitSystem, CORE_EMITTER_SIGNATURES } from './initSystem';
import ShortUniqueId from 'short-unique-id';
import { PropertyObject } from '../../schemas/propertySchema';

export type CustomComponent = {
  id: string;
  slot: string;
  component: Component;
  title?: string;
  order?: number;
  props?: Record<string, any>; // Optional props
}


export interface ProgressionComponentPayload {
  id: string;
  title: string;
  component: Component;
  props?: Record<string, any>; // Optional props
}

// Type for the actual task stored, using a generic callback
type GenericEmitterTaskPayload = {
  callback: (...args: any[]) => boolean | void;
  order: number;
  metadata?: {
    source?: string;      // e.g., "@assets/games_assets/.../script1.js:167"
    timestamp?: number;   // When registered (Date.now())
  };
};

// EmitterMap is derived from CORE_EMITTER_SIGNATURES for strict type checking.
// It ensures that EmitterMap perfectly reflects the defined core emitters.
// CORE_EMITTER_SIGNATURES is now defined in initSystem.ts
export type EmitterMap = typeof CORE_EMITTER_SIGNATURES;

/**
 * CoreSystem handles all infrastructure and utility logic for the game engine.
 * This includes music/sound management, plugin loading, component registration,
 * state management, event emitters, save/load functionality, and play time tracking.
 */
export class CoreSystem {



  @Skip()
  public uidGenerator = new ShortUniqueId({ length: 15 });

  @Skip()
  private imageCache = new Map<string, HTMLImageElement>();

  /**
   * Keeps an image in browser memory cache by maintaining a reference.
   * Call this on image @load to prevent browser from evicting the cached image.
   * Cache is capped at 600 entries; oldest is evicted when full.
   */
  public persistImage(src: string): void {
    if (src && !this.imageCache.has(src)) {
      if (this.imageCache.size >= 600) {
        const firstKey = this.imageCache.keys().next().value!;
        this.imageCache.delete(firstKey);
      }
      const img = new Image();
      img.src = src;
      this.imageCache.set(src, img);
    }
  }

  // ============================================
  // COMPUTED PROPERTIES (Created at runtime)
  // ============================================

  /**
   * Returns true when the current dungeon UI should be text-based.
   * Initialized by createComputedProperties().
   */
  @Skip()
  public isTextUIContent!: ComputedRef<boolean>;

  /**
   * Returns true when the game is ready to interact with.
   * Initialized by createComputedProperties().
   */
  //@Skip()
  //public isReady!: ComputedRef<boolean>;

  // ============================================
  // UI STATE MANAGEMENT
  // ============================================

  // Centralized state registry for all saveable UI states
  @Skip()
  private registeredStates = new Set<string>();

  public state: Ref<Map<string, any>> = ref(new Map());

  @Skip()
  public gameInitiated = ref(false);

  @Skip()
  public stateLoading = ref(true);

  /**
   * Registers a new UI state with a default value.
   * Throws an error if the state is already registered.
   */
  public registerState<T>(key: string, defaultValue: T): void {
    if (this.registeredStates.has(key)) {
      throw new Error(`State "${key}" is already registered`);
    }
    this.registeredStates.add(key);
    this.state.value.set(key, defaultValue);
  }

  /**
   * Gets the value of a registered UI state.
   * Throws an error with helpful message if state is not registered.
   */
  public getState<T>(key: string): T {
    if (!this.registeredStates.has(key)) {
      const available = Array.from(this.registeredStates).sort().join(', ');
      throw new Error(
        `State "${key}" is not registered.\n` +
        `Available states: ${available}\n` +
        `You can register a new state using:\n` +
        `  game.registerState('your_key', defaultValue);`
      );
    }
    return this.state.value.get(key) as T;
  }

  /**
   * Sets the value of a registered UI state.
   * Throws an error if state is not registered.
   * Triggers 'state_change' event with stateId, newValue, oldValue.
   */
  public setState<T>(key: string, value: T): void {
    if (!this.registeredStates.has(key)) {
      const available = Array.from(this.registeredStates).sort().join(', ');
      throw new Error(
        `Cannot set state "${key}": State not registered.\n` +
        `Available states: ${available}`
      );
    }
    const oldValue = this.state.value.get(key);
    this.state.value.set(key, value);

    // switch navigation overlay
    if (key === "game_state") {

      if (value === "exploration") {
        this.setState('overlay_state', 'overlay-navigation');
      } else {
        this.setState('overlay_state', null);
      }

    }

    this.trigger('state_change', key, value, oldValue);
  }

  // Legacy helper methods - redirects to state Map
  // ignore types
  public setDisableUi(isDisabled: boolean) {
    this.setState('disable_ui', isDisabled);
  }

  // ignore types
  public toggleCharacterList() {
    this.setState('show_character_list', !this.getState('show_character_list'));
  }

  // ignore types
  public setProgressionState(state: string) {
    this.setState('progression_state', state);
  }

  // ============================================
  // MUSIC & SOUND SYSTEM
  // ============================================

  @Skip()
  public musicMap: Map<string, MusicObject> = new Map();
  @Skip()
  public soundsMap: Map<string, SoundObject> = new Map();

  music: string; // id from MusicMap
  @Skip() musicArray: string[];
  @Skip() musicIndex: number;
  @Skip() musicPlayer: HTMLAudioElement;
  @Skip() musicFadeInterval: number;

  public playSounds(val: string | string[]) {
    if (!val) {
      return;
    }

    let sounds: string[] = [];
    if (typeof val === "string") {
      sounds = val.split(",");
    } else {
      sounds = val;
    }

    for (let sound of sounds) {
      sound = sound.trim();

      let compiledSound = this.soundsMap.get(sound);
      if (!compiledSound) {
        gameLogger.error(`Sound not found: ${sound}`);
        continue;
      }
      let soundUrls = compiledSound.files;
      let soundElements: HTMLAudioElement[] = [];
      let loadedCount = 0;

      // Load all sounds
      soundUrls?.forEach((url, index) => {
        const audio = new Audio(`${url}`);
        audio.addEventListener('canplaythrough', () => {
          loadedCount++;
          // If all sounds are loaded, start playing
          if (loadedCount === soundUrls.length) {
            playNextSound(0);
          }
        });
        audio.addEventListener('error', (e) => {
          gameLogger.error(`Error loading sound: ${url}`, e);
        });
        soundElements[index] = audio;
      });

      let playNextSound = (index: number) => {
        if (index < soundElements.length) {
          soundElements[index].play();
          soundElements[index].volume = Global.getInstance().userSettings.value.sound_volume / 100;
          soundElements[index].addEventListener('ended', () => {
            soundElements[index] = null as any; // Remove reference to the finished sound
            playNextSound(index + 1);
          });
        }
      }
    }
  }

  public setMusic(val: string | false, load: boolean = false) {
    if (val === false) {
      const game = Game.getInstance();
      val = game.dungeonSystem.currentDungeon.value?.music || "";
    }

    if (!load && this.music && this.music == val) {
      return;
    }

    if (!val) {
      return;
    }

    if (this.musicFadeInterval) {
      clearInterval(this.musicFadeInterval);
    }

    this.music = val;
    if (this.musicPlayer) {
      let volume = this.musicPlayer.volume;
      let steps = 10;
      let currentStep = 0;
      this.musicFadeInterval = setInterval(() => {
        currentStep++;
        if (currentStep == steps) {
          this.musicPlayer.pause();
          this.musicPlayer.currentTime = 0;
          this.musicPlayer.remove();
          this.setNextSongMap();
          clearInterval(this.musicFadeInterval);
        } else {
          this.musicPlayer.volume = volume - volume * (currentStep / steps);
        }
      }, 100); // Increase volume every 100ms

    } else {
      this.setNextSongMap();
    }
  }

  private setNextSongMap() {
    // randomize an array
    function shuffle(array: string[]) {
      let currentIndex = array.length;

      // While there remain elements to shuffle...
      while (currentIndex != 0) {

        // Pick a remaining element...
        let randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [
          array[randomIndex], array[currentIndex]];
      }
    }

    this.musicArray = this.musicMap.get(this.music)?.files || [];
    if (!this.musicArray) {
      gameLogger.error(`Music not found in map: ${this.music}`);
      return;
    }

    shuffle(this.musicArray);

    // Debug: console.log(this.musicArray)

    this.musicIndex = 0;
    this.musicPlayer = new Audio();
    // Event listener for when the song ends
    this.musicPlayer.addEventListener('ended', () => {
      // Debug: console.warn("ended song");
      this.musicIndex++;
      if (this.musicIndex >= this.musicArray.length) {
        this.musicIndex = 0;
      }
      this.playSong();
    });

    this.playSong();
  }

  private playSong() {
    this.musicPlayer.src = `${this.musicArray[this.musicIndex]}`;
    // Debug: console.warn("music volume", Global.getInstance().userSettings.value.music_volume);
    this.musicPlayer.volume = (Global.getInstance().userSettings.value.music_volume || 0) / 100;
    this.musicPlayer.currentTime = 0;
    this.musicPlayer.play().catch(error => {
      if (error.name === 'NotAllowedError' || error.name === 'DOMException') {
        gameLogger.warn('Music play prevented - waiting for user interaction');
        let handleFirstInteraction = () => {
          gameLogger.info('User interaction detected - resuming music');
          this.setMusic(this.music, true);

          // Remove all event listeners after the first interaction
          document.removeEventListener('click', handleFirstInteraction);
          document.removeEventListener('keydown', handleFirstInteraction);
          document.removeEventListener('touchstart', handleFirstInteraction);
        }
        // Add event listeners for different types of user interactions
        document.addEventListener('click', handleFirstInteraction);
        document.addEventListener('keydown', handleFirstInteraction);
        document.addEventListener('touchstart', handleFirstInteraction);
      } else {
        gameLogger.error('Unexpected music playback error:', error);
      }
    });
    gameLogger.info(`Playing music: ${this.musicArray[this.musicIndex]}`);
  }

  // ============================================
  // PLUGIN SYSTEM (ignore types)
  // ============================================

  @Skip()
  pluginPaths: Map<string, string> = new Map();

  // Store loaded plugin configs to avoid reloading them
  @Skip()
  pluginConfigs: Map<string, any> = new Map();

  // Actual data from plugins_data folder
  @Skip()
  plugins: Map<string, Map<string, any>> = new Map();

  // Centralized registry for all game data indexed by file path
  @Skip()
  dataRegistry: Map<string, Map<string, any>> = new Map();

  // ignore types
  public getPlugin(tabId: string, pluginId: string) {
    return this.plugins.get(tabId)?.get(pluginId);
  }

  // ============================================
  // STORE SYSTEM
  // ============================================

  @Populate(Map, { mode: 'replace' })
  store: Ref<Map<string, Map<string, any>>> = ref(new Map());

  public createStore(id: string): Map<string, any> {
    if (this.store.value.has(id)) {
      //throw new Error(`Store ${id} already exists`);
      return this.store.value.get(id)!;
    }
    this.store.value.set(id, new Map());
    return this.store.value.get(id)!;
  }

  public getStore(id: string): Map<string, any> {
    if (!this.store.value.has(id)) {
      throw new Error(`Store ${id} not found`);
    }
    return this.store.value.get(id)!;
  }

  public hasStore(id: string): boolean {
    return this.store.value.has(id);
  }

  public deleteStore(id: string) {
    this.store.value.delete(id);
  }

  // ============================================
  // PROPERTIES
  // ============================================

  @Populate(Property, { mode: 'update' })
  public properties: Ref<Map<string, Property>> = ref(new Map());

  @Skip()
  public propertiesMap!: Map<string, PropertyObject>;

  public getProperty(id: string) {
    return this.properties.value.get(id);
  }

  // ============================================
  // PLAY TIME TRACKING(ignore types)
  // ============================================

  @Skip()
  private lastCheckTime: number = Date.now();
  @Skip()
  private accumulatedPlayTime: number = 0;
  @Skip()
  private idleState: UseIdleReturn;

  // ignore types
  public initPlayTimeTracking() {
    // Play Time Logic
    this.idleState = useIdle(60 * 1000); // 1 min
    this.lastCheckTime = Date.now(); // Initialize lastCheckTime

    watch(this.idleState.idle, (isIdle) => {
      const currentTime = Date.now();
      if (isIdle) {
        // Debug: console.log("idle")
        // User has become idle, add the time they were active before this point
        this.accumulatedPlayTime += (currentTime - this.lastCheckTime) / 1000;
        this.lastCheckTime = currentTime; // Mark the time idleness began
      } else {
        // User has become active, set lastCheckTime to now to start tracking new active period
        this.lastCheckTime = currentTime;
      }
    });
  }

  // ignore types
  public resetPlayTimeOnLoad(loadedPlayTime: number): void {
    this.accumulatedPlayTime = loadedPlayTime || 0;
    this.lastCheckTime = Date.now();
  }

  // ignore types
  public generateSaveMetaData(gameManifest: ManifestObject, modsManifests: ManifestObject[], options?: { hidden?: boolean }): any {
    const currentTime = Date.now();

    // If the user is currently active, add the ongoing active segment to playtime
    if (!this.idleState.idle.value) {
      this.accumulatedPlayTime += (currentTime - this.lastCheckTime) / 1000;
    }
    // Always update lastCheckTime to the current time for the next cycle
    this.lastCheckTime = currentTime;


    // Get engine version from Global instance
    const globalInstance = Global.getInstance();
    const engineVersion = globalInstance.engineVersion;

    // Check if in dev mode
    const isDevMode = localStorage.getItem('devMode') === 'true';

    return {
      saveDate: currentTime,
      playTime: Math.round(this.accumulatedPlayTime),
      engineVersion: engineVersion,
      gameVersion: gameManifest?.version || "N/A",
      mods: modsManifests.map(mod => `${mod.name} v${mod.version}`),
      isDevMode: isDevMode,
      hidden: options?.hidden
    };
  }

  // ============================================
  // COMPONENT REGISTRY
  // ============================================

  // Unified component registry - all custom components organized by slot
  // Slots include: 'state', 'progression-tabs', 'character-tabs', and any COMPONENT_ID for injections
  @Skip()
  private componentsBySlot = new Map<string, CustomComponent[]>();

  // Reverse index for O(1) component deletion by id
  @Skip()
  private componentSlotIndex = new Map<string, string>(); // id -> slot

  /**
   * Add a component to a slot. If a component with the same id already exists, it will be replaced.
   * Components with a title will be rendered as tabs, components without a title will be injected.
   * @param cm - Component configuration with slot, id, component, optional title, order, and props
   */
  public addComponent(cm: CustomComponent): void {
    // Remove existing component with same id if present
    if (this.componentSlotIndex.has(cm.id)) {
      // Debug: console.warn(`Component "${cm.id}" already exists in slot "${cm.slot}". Overwriting.`);
      this.removeComponent(cm.id, cm);
    }

    // Get or create slot array
    const slotComponents = this.componentsBySlot.get(cm.slot) || [];

    // Add component with markRaw to prevent Vue reactivity on component definition
    const rawComponent: CustomComponent = {
      ...cm,
      component: markRaw(cm.component)
    };
    slotComponents.push(rawComponent);

    // Sort by order (lower order first, components without order go last)
    slotComponents.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Update maps
    this.componentsBySlot.set(cm.slot, slotComponents);
    this.componentSlotIndex.set(cm.id, cm.slot);

    gameLogger.success(`Component "${cm.id}" added to slot "${cm.slot}"${cm.title ? ` with title "${cm.title}"` : ''}`);
  }

  /**
   * Remove a component by id from all slots.
   * @param id - Component id to remove
   * @returns true if component was found and removed, false otherwise
   */
  public removeComponent(id: string, replacedBy?: CustomComponent): boolean {
    const slot = this.componentSlotIndex.get(id);
    if (!slot) {
      gameLogger.error(`Component "${id}" not found in registry`);
      return false;
    }

    const components = this.componentsBySlot.get(slot);
    if (!components) return false;

    const index = components.findIndex(c => c.id === id);
    if (index === -1) return false;

    components.splice(index, 1);
    this.componentSlotIndex.delete(id);

    if (replacedBy) {
      gameLogger.overwrite(`Component "${id}" from slot "${slot}" has been replaced`);
    } else {
      gameLogger.info(`Component "${id}" deleted from slot "${slot}"`);
    }
    return true;
  }

  /**
   * Clear all registered components from a slot.
   * @param slot - Slot to clear
   * @example
   * game.clearComponentSlot('debug-tabs');
   */
  public clearComponentSlot(slot: string): void {
    this.componentsBySlot.delete(slot);
    this.componentSlotIndex.clear();
    gameLogger.info(`All components cleared from slot "${slot}"`);
  }

  /**
   * Get all components for a specific slot, sorted by order.
   * @param slot - Slot name (usually matches COMPONENT_ID of the parent component)
   * @returns Array of components for this slot
   */
  public getComponentsBySlot(slot: string): CustomComponent[] {
    return this.componentsBySlot.get(slot) || [];
  }

  /**
   * Get all registered component slots with their components.
   * @returns Map of slot names to their component arrays
   */
  public getAllComponentSlots(): Map<string, CustomComponent[]> {
    return this.componentsBySlot;
  }

  public setGameState(name: string) {
    const stateComponents = this.getComponentsBySlot('game_state');
    const stateComponent = stateComponents.find(c => c.id === name);

    if (!stateComponent) {
      gameLogger.error(`Cannot set game state to "${name}": Component not found in registry`);
      return;
    }
    // this.stateLoading.value = false;
    this.setState('game_state', name);
    // Note: state_change event is triggered automatically by setState()
  }

  public getStateComponent(name: string): Component | undefined {
    const stateComponents = this.getComponentsBySlot('game_state');
    return stateComponents.find(c => c.id === name)?.component;
  }


  // ============================================
  // EVENT EMITTER SYSTEM
  // ============================================

  // Runtime configuration for all known emitter types - now a list of registered event names.
  @Skip()
  public emitterConfig: Set<string> = new Set();

  @Skip()
  private tasks: { [eventType: string]: GenericEmitterTaskPayload[] } = {};

  public registerEmitter<K extends keyof EmitterMap>(
    name: K
  ): void {
    if (this.emitterConfig.has(name)) {
      throw new Error(`Emitter type "${name}" is already registered.`);
    }
    this.emitterConfig.add(name);
    gameLogger.success(`Emitter type "${name}" registered`);
  }

  public on<K extends keyof EmitterMap>(
    type: K,
    callback: NonNullable<EmitterMap[K]>,
    order = 0
  ) {
    // TODO: perhars remove the check so it can be used before registration
    // Though it does not make sense as scripts are loaded after plugins and plugins are not supposed to interact with each other
    // make order for plugins???

    if (!this.emitterConfig.has(type)) {
      const availableEmitters = Array.from(this.emitterConfig).join('\n');
      throw new Error(
        `Emitter type "${type}" is not registered. Known types:\n${availableEmitters}`
      );
    }

    // Capture caller info in dev mode for debugging
    let metadata: GenericEmitterTaskPayload['metadata'] | undefined;
    try {
      const isDevMode = localStorage.getItem('devMode') === 'true';
      if (isDevMode) {
        const source = captureCallerInfo();
        if (source) {
          metadata = {
            source,
            timestamp: Date.now()
          };
        }
      }
    } catch (e) {
      // Silently fail if localStorage unavailable
    }

    const list: GenericEmitterTaskPayload[] = this.tasks[type] ?? [];
    list.push({
      callback: callback as (...args: any[]) => boolean | void,
      order,
      metadata
    });
    list.sort((a, b) => a.order - b.order);
    this.tasks[type] = list;
  }

  @Skip()
  ignoreSupressEvents: Set<string> = new Set(['character_render']);

  public trigger<K extends keyof EmitterMap>(
    type: K,
    ...args: Parameters<NonNullable<EmitterMap[K]>>
  ): boolean {
    if (this.getState('supress_game_events') && !this.ignoreSupressEvents.has(type)) {
      return true;
    }
    if (!this.emitterConfig.has(type)) {
      const availableEmitters = Array.from(this.emitterConfig).join('\n');
      throw new Error(
        `Emitter type "${type}" is not registered. Known types:\n${availableEmitters}`
      );
    }

    const list = this.tasks[type];
    if (!list) return true;

    for (const task of list) {
      const result = (task.callback as (...a: typeof args) => boolean | void)(...args);
      // If callback returns boolean, stop propagation
      if (result === false) {
        return false;
      }
      if (result === true) {
        return true;
      }
    }

    return true;
  }

  /**
   * Get all registered listeners for a specific event type
   * Returns metadata about each listener including source location (in dev mode)
   * @param type The event type to query
   * @returns Array of listener metadata
   */
  // ignore types
  public getListenersForEvent<K extends keyof EmitterMap>(type: K): Array<{
    order: number;
    source?: string;
    timestamp?: number;
  }> {
    const list = this.tasks[type] || [];
    return list.map(task => ({
      order: task.order,
      source: task.metadata?.source,
      timestamp: task.metadata?.timestamp
    }));
  }

  // ============================================
  // GAME METADATA & SETTINGS (ignore types)
  // ============================================

  public gameId: string = "";
  public modList: string[] = [];

  @Skip()
  public gameManifest!: ManifestObject;
  @Skip()
  public mergedManifest!: ManifestObject;
  @Skip()
  public modsManifests: ManifestObject[] = [];

  // custom settings object for the game
  public settings: Ref<any> = ref({});

  @Skip()
  public debugSettings: Ref<DebugSettingsType> = ref({});

  /**
   * Get a debug setting value, but only if in dev mode.
   * This ensures debug features only work when dev mode is active.
   * @param key - The debug setting key
   * @returns The setting value if in dev mode, false otherwise
   */
  // ignore types
  public getDebugSetting<K extends keyof DebugSettingsType>(key: K): DebugSettingsType[K] | false {
    const isDevMode = localStorage.getItem('devMode') === 'true';
    if (!isDevMode) {
      return false;
    }
    return this.debugSettings.value[key] || false;
  }

  // schema for the game settings
  @Skip()
  public gameSettingsSchema: SettingsObject[] = [];

  // ============================================
  // SAVE/LOAD INFRASTRUCTURE
  // ============================================

  @Skip()
  private indexedDbSaveService = new IndexedDbSaveService();

  // ignore types
  public getIndexedDbSaveService() {
    return this.indexedDbSaveService;
  }

  // ============================================
  // MUSIC VOLUME WATCHER
  // ============================================

  // ignore types
  public initMusicVolumeWatcher() {
    // music volume change watcher
    watch(() => Global.getInstance().userSettings.value.music_volume, (newVolume) => {
      // Debug: console.warn("volume changed", newVolume);
      if (this.musicPlayer) {
        this.musicPlayer.volume = newVolume / 100;
      }
    });
  }

  // ============================================
  // COMPUTED PROPERTIES INITIALIZATION
  // ============================================

  /**
   * Create computed properties that depend on systems.
   * Must be called after systems are initialized.
   */
  public createComputedProperties(dungeonSystem: any) {
    this.isTextUIContent = computed(() => {
      return dungeonSystem.currentDungeon.value?.dungeon_type === 'text';
    });
    /*
        this.isReady = computed(() => {
          //return dungeonSystem.dungeonLoaded.value && !this.stateLoading.value;
          return !this.stateLoading.value;
        });
    */
  }

  // ============================================
  // INITIALIZATION & REGISTRATION
  // ============================================

  /**
   * Initialize the entire core system.
   * Sets up infrastructure, registers emitters, and prepares for game start.
   */
  // ignore types
  public init() {
    const game = Game.getInstance();

    // Init infrastructure
    this.initMusicVolumeWatcher();
    this.initPlayTimeTracking();
    this.createComputedProperties(game.dungeonSystem);

    // Initialize all registrations via InitSystem
    const initSystem = new InitSystem(game);
    initSystem.init();
  }


  // ============================================
  // GAME LIFECYCLE METHODS
  // ============================================

  /**
   * Initialize a new game state.
   * Delegates to InitSystem for actual initialization logic.
   */
  // ignore types
  public initNewGameState(game: any) {
    const initSystem = new InitSystem(game);
    initSystem.initNewGameState();
  }

  /**
   * Save the current game state to IndexedDB.
   */
  public async saveGame(game: any, saveName: string, options?: { hidden?: boolean }) {
    const gameId = this.gameManifest?.id;
    if (!gameId) {
      gameLogger.error('Game ID is not set - cannot save game');
      return;
    }

    if (this.isSaveDisabled()) {
      gameLogger.warn('Save is disabled - cannot save game');
      return;
    }


    let proceed = this.trigger('game_save', saveName);
    if (!proceed) {
      return;
    }

    const metaData = this.generateSaveMetaData(this.gameManifest, this.modsManifests, options);
    const gameCoreData = save(game);
    const dataToStore = { ...gameCoreData, saveMeta: metaData };

    try {
      const globalService = Global.getInstance();
      await this.indexedDbSaveService.save(gameId, saveName, dataToStore);
      // Debug: console.log(`Saved game ${gameId} as ${saveName}:`, dataToStore);
      gameLogger.success(`Game saved: ${saveName}`);
      if (!options?.hidden) {
        globalService.addNotification('Game saved: ' + saveName);
      }
    } catch (error) {
      const globalService = Global.getInstance();
      gameLogger.error(`Failed to save game ${gameId} as ${saveName}`, error);
      globalService.addNotificationId("error_save_generic");
    }
  }

  /**
   * Save the current game state to a downloadable JSON file.
   */
  // ignore types
  public saveGameToFile(game: any, saveName: string): void {
    console.log("saving game to file", saveName);
    const metaData = this.generateSaveMetaData(this.gameManifest, this.modsManifests);
    const gameCoreData = save(game);
    const dataToStore = { ...gameCoreData, saveMeta: metaData };

    const fileName = `${saveName.replace(/[^a-z0-9_\\-]+/gi, '_')}.json`;

    try {
      const jsonString = JSON.stringify(dataToStore, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (error) {
      const globalService = Global.getInstance();
      gameLogger.error(`Failed to save game ${this.gameId} to file ${fileName}`, error);
      globalService.addNotificationId("error_save_to_file_failed");
    }
  }

  /**
   * Load a saved game from IndexedDB.
   */
  public loadGame(game: Game, saveName: string) {
    // Set flag to skip enter animations during load
    game.dungeonSystem.isLoadingSave.value = true;

    game.dungeonSystem._loadAndSetDungeonActual(game.dungeonSystem.currentDungeonId.value!);

    // call onLoad Actions
    let onLoadActions = game.dungeonSystem.reloadActionObject;
    game.logicSystem.resolveActions(onLoadActions);

    // reload event choices
    if (game.dungeonSystem.currentSceneId.value) {
      game.dungeonSystem.loadDocChoices();
    }

    // hide progression state
    this.setState('progression_state', '');

    // load music
    this.setMusic(this.music, true);

    // Initialize selected character to first party member if not already set
    const initSystem = new InitSystem(game);
    initSystem.initializeSelectedCharacter();

    // Note: isLoadingSave flag will be reset when playScene() is called for the next scene
  }

  /**
   * Fetch a single data file from the game assets.
   */
  // ignore types
  public async fetchSingleFile<T extends Identifiable>(fileName: string, dungeonId?: string): Promise<T> {
    let path = fileName;
    if (dungeonId) {
      path = `dungeons/${dungeonId}/${fileName}`;
    }
    return await Global.getInstance().loadAndMergeSingleFile<T>(
      this.gameId,
      path,
      this.modList
    );
  }

  /**
   * Fetch an array data file from the game assets.
   */
  // ignore types
  public async fetchArrayFile<T extends Identifiable>(fileName: string, dungeonId?: string): Promise<T[]> {
    let path = fileName;
    if (dungeonId) {
      path = `dungeons/${dungeonId}/${fileName}`;
    }
    return await Global.getInstance().loadAndMergeArrayFile<T>(
      this.gameId,
      path,
      this.modList,
      true
    );
  }

  public isSaveDisabled(): boolean {
    return this.getState('replay_mode') || this.getState('disable_saves');
  }

  // Gallery system
  @Skip()
  public galleriesMap!: Map<string, GalleryObject>;

  @Populate(DiscoveredAsset, { mode: 'replace' })
  discoveredAssets: Map<string, DiscoveredAsset> = new Map();

  @Populate(DiscoveredCharacter, { mode: 'replace' })
  discoveredCharacters: Map<string, DiscoveredCharacter> = new Map();

  public addCharacterToGallery(character: Character) {
    // Skip if character has no template (not a template-based character)
    if (!character.templateId) {
      //console.log('addCharacterToGallery: Character has no template', character);
      return;
    }

    let discoveredCharacter = this.discoveredCharacters.get(character.templateId);
    if (!discoveredCharacter) {
      // Create new entry with attributes as Map of Sets
      const attributesMap = new Map<string, Set<string>>();
      for (const [key, value] of Object.entries(character.attributes)) {
        attributesMap.set(key, new Set([value]));
      }

      // Create skinLayerStyles map with Sets of individual CSS classes
      const skinLayerStylesMap = new Map<string, Set<string>>();
      for (const [layerId, styles] of character.skinLayerStyles.entries()) {
        // Flatten the styles array into individual classes
        skinLayerStylesMap.set(layerId, new Set(styles));
      }

      const discovered = new DiscoveredCharacter();
      discovered.attributes = attributesMap;
      discovered.skinLayers = new Set(character.skinLayers);
      discovered.skinLayerStyles = skinLayerStylesMap;
      this.discoveredCharacters.set(character.templateId, discovered);
    } else {
      // Merge attributes: add new values to existing Sets in the Map
      for (const [key, value] of Object.entries(character.attributes)) {
        const existingSet = discoveredCharacter.attributes.get(key);
        if (!existingSet) {
          discoveredCharacter.attributes.set(key, new Set([value]));
        } else {
          existingSet.add(value);
        }
      }

      // Merge skin layers: add new skin layers if not already present
      for (const layer of character.skinLayers) {
        discoveredCharacter.skinLayers.add(layer);
      }

      // Merge skin layer styles: add individual CSS classes to existing Sets
      for (const [layerId, styles] of character.skinLayerStyles.entries()) {
        const existingStylesSet = discoveredCharacter.skinLayerStyles.get(layerId);
        if (!existingStylesSet) {
          // Create new Set with individual classes from this layer
          discoveredCharacter.skinLayerStyles.set(layerId, new Set(styles));
        } else {
          // Add each individual class to the existing Set (Set automatically dedupes)
          for (const styleClass of styles) {
            existingStylesSet.add(styleClass);
          }
        }
      }
    }
  }

  public addAssetToGallery(asset: AssetObject) {
    let discoveredAsset = this.discoveredAssets.get(asset.id);

    if (!discoveredAsset) {
      // Create new entry
      const discovered = new DiscoveredAsset();

      // Add animation if present
      if (asset.animation != null) {
        discovered.animations.add(String(asset.animation));
      }

      // Add skins if present
      if (asset.skins && Array.isArray(asset.skins)) {
        for (const skin of asset.skins) {
          discovered.skins.add(String(skin));
        }
      }

      this.discoveredAssets.set(asset.id, discovered);
    } else {
      // Merge: add new animation if present
      if (asset.animation != null) {
        discoveredAsset.animations.add(String(asset.animation));
      }

      // Merge: add new skins if present
      if (asset.skins && Array.isArray(asset.skins)) {
        for (const skin of asset.skins) {
          discoveredAsset.skins.add(String(skin));
        }
      }
    }

    //console.log('discoveredAssets', this.discoveredAssets);
  }

}
