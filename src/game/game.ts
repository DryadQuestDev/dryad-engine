import { Skip, Populate } from '../utility/save-system';
import { Global } from '../global/global';
import copy from 'fast-copy';
import { computed, ComputedRef } from 'vue';

import { DungeonSystem, DungeonLine } from './systems/dungeonSystem';
import { DungeonData } from './core/dungeon/dungeonData';
import { ActionObject, AspectRenderer, LogicSystem, PoolSettings, PoolDrawResult, CollectionSettings } from './systems/logicSystem';
import { NarrativeSystem } from './systems/narrativeSystem';
import { CharacterSystem, StatComputerFunction, type StatGroupResolverFunction } from './systems/characterSystem';
import { ItemSystem } from './systems/itemSystem';
import { CoreSystem, type EmitterMap, type CustomComponent, type SaveOptions } from './systems/coreSystem';
import { gameLogger } from './utils/logger';
import { Character } from './core/character/character';
import { Inventory } from './core/character/inventory';
import { Item } from './core/character/item';
import { Status } from './core/character/status';
import { Choice } from './core/content/choice';
import { PoolEntryObject } from '../schemas/poolEntrySchema';
import { ManifestObject } from '../schemas/manifestSchema';
export class Game {

  // ============================================
  // GAME SYSTEMS
  // ============================================

  /**
   * Core infrastructure system handling music, sound, game lifecycle events, components,
   * state management, save/load, and other engine utilities.
   * @internal - For internal engine use. External scripts should use the public API methods.
   */
  @Populate(CoreSystem, { mode: 'update' })
  public coreSystem = new CoreSystem();

  /**
   * Dungeon system - manages dungeons, rooms, scenes, and exploration state.
   */
  @Populate(DungeonSystem, { mode: 'update' })
  public dungeonSystem = new DungeonSystem();

  /**
   * Character system - manages characters, stats, properties, and party.
   */
  @Populate(CharacterSystem, { mode: 'update' })
  public characterSystem = new CharacterSystem();

  /**
   * Item system - manages items, inventories, and equipment.
   */
  @Populate(ItemSystem, { mode: 'update' })
  public itemSystem = new ItemSystem();

  /**
   * Logic system - handles conditions, actions, and placeholder resolution.
   */
  @Skip()
  public logicSystem = new LogicSystem();

  /**
   * Narrative system - data-driven component selection for narrative slots.
   */
  @Populate(NarrativeSystem, { mode: 'update' })
  public narrativeSystem = new NarrativeSystem();

  /**
   * Service registry - cross-script utility sharing for plugins and game scripts.
   */
  @Skip()
  private serviceRegistry = new Map<string, any>();

  // ============================================
  // PUBLIC API: Game Lifecycle
  // ============================================

  public createUid(): string {
    return this.coreSystem.uidGenerator.rnd();
  }

  @Skip()
  public isNewGame = true;

  public async saveGame(saveName: string, options?: SaveOptions) {
    await this.coreSystem.saveGame(this, saveName, options);
  }

  public saveGameToFile(saveName: string): void {
    this.coreSystem.saveGameToFile(this, saveName);
  }

  public loadGame(saveName: string) {
    Global.getInstance().loadGameSlot(this.coreSystem.gameId, saveName);
  }

  public isSaveDisabled(): boolean {
    return this.coreSystem.isSaveDisabled();
  }

  /** Returns the current game's manifest (id, name, author, version, etc.). Read-only. */
  public getManifest(): ManifestObject {
    return this.coreSystem.gameManifest;
  }

  /** Returns the current game's id (shorthand for `getManifest().id`). */
  public getId(): string {
    return this.coreSystem.gameManifest?.id || '';
  }

  /** Returns the manifests of all active mods, in load order. Empty array if no mods are loaded. */
  public getMods(): ManifestObject[] {
    return this.coreSystem.modsManifests;
  }

  /** Returns the merged manifest (`_core` + all active mods, last-wins by load order). Use when you want a manifest field a mod might override. */
  public getMergedManifest(): ManifestObject {
    return this.coreSystem.mergedManifest ?? this.coreSystem.gameManifest;
  }

  /** Returns the current game's manifest.version, or '0' if unset. */
  public getGameVersion(): string {
    return this.coreSystem.gameManifest?.version || '0';
  }

  /**
   * Returns the current `(game + mods)` versions map — keyed by source id (`_core` for the game, mod id for mods).
   * Each entry is `{ name, version }`. Mirrors the shape stamped into saves at `saveMeta.versions`.
   */
  public getVersions(): Record<string, { name: string; version: string }> {
    return this.coreSystem.getVersions();
  }

  /**
   * Returns the versions map stamped on the save that was just loaded, or `null` for a new game.
   * Each entry is `{ name, version }`.
   */
  public getLoadedSaveVersions(): Record<string, { name: string; version: string }> | null {
    return this.coreSystem.loadedSaveVersions ? { ...this.coreSystem.loadedSaveVersions } : null;
  }

  /**
   * Rebuild every character's state from current definitions when the loaded save's versions differ from the current.
   */
  public runDefaultSaveMigration(options: { ignoreStats?: string[]; ignoreTraits?: string[]; ignoreAttributes?: string[]; ignoreItemTraits?: string[]; ignoreItemAttributes?: string[]; } = {}): void {
    this.coreSystem.runDefaultSaveMigration(options);
  }

  // ============================================
  // PUBLIC API: Event System
  // ============================================

  public registerEmitter<K extends keyof EmitterMap>(name: K): void {
    this.coreSystem.registerEmitter(name);
  }

  public on<K extends keyof EmitterMap>(
    type: K,
    callback: NonNullable<EmitterMap[K]>,
    order = 0
  ) {
    this.coreSystem.on(type, callback, order);
  }

  public trigger<K extends keyof EmitterMap>(
    type: K,
    ...args: Parameters<NonNullable<EmitterMap[K]>>
  ): boolean {
    return this.coreSystem.trigger(type, ...args);
  }

  // ============================================
  // PUBLIC API: Component Registration
  // ============================================

  public addComponent(component: CustomComponent): void {
    this.coreSystem.addComponent(component);
  }

  public removeComponent(id: string): boolean {
    return this.coreSystem.removeComponent(id);
  }

  public clearComponentSlot(slot: string): void {
    this.coreSystem.clearComponentSlot(slot);
  }

  public registerComponent(name: string, component: any): void {
    if ((window as any).engine.components[name]) {
      gameLogger.overwrite(`registerComponent: '${name}' already exists and will be overwritten`);
    }
    (window as any).engine.components[name] = component;
    gameLogger.info(`registerComponent: '${name}'`);
  }

  public getComponent(name: string): any {
    const comp = (window as any).engine.components[name];
    if (!comp) {
      gameLogger.error(`getComponent: '${name}' not found. Make sure it was registered with game.registerComponent() or is a built-in engine component.`);
    }
    return comp;
  }

  // ============================================
  // PUBLIC API: Service Registry
  // ============================================

  /**
   * Register a named service (utility object/function) for cross-script sharing.
   */
  public registerService(id: string, service: any): void {
    if (this.serviceRegistry.has(id)) {
      gameLogger.overwrite(`Service "${id}" already exists - overwriting`);
    }
    this.serviceRegistry.set(id, service);
  }

  /**
   * Get a registered service by ID.
   */
  public getService(id: string): any {
    const svc = this.serviceRegistry.get(id);
    if (!svc) {
      gameLogger.error(`Service "${id}" not found. Register it with game.registerService().`);
    }
    return svc;
  }

  // ============================================
  // PUBLIC API: State Management
  // ============================================

  public registerState<T>(key: string, defaultValue: T): void {
    this.coreSystem.registerState(key, defaultValue);
  }

  public getState<T>(key: string): T {
    return this.coreSystem.getState<T>(key);
  }

  public setState<T>(key: string, value: T): void {
    this.coreSystem.setState(key, value);
  }

  // ============================================
  // PUBLIC API: Popups (the `popup_state` stack)
  // ============================================

  /** Open one or more popups (by registered `popup`-slot component id). Pushed on top; ids already open are ignored. */
  public openPopup(...ids: string[]): void {
    const open = [...this.getOpenPopups()];
    for (const id of ids) if (id && !open.includes(id)) open.push(id);
    this.setState('popup_state', open);
  }

  /** Close one or more specific popups, leaving the rest of the stack open. */
  public closePopup(...ids: string[]): void {
    this.setState('popup_state', this.getOpenPopups().filter(p => !ids.includes(p)));
  }

  /** Close every open popup. */
  public closeAllPopups(): void {
    this.setState('popup_state', []);
  }

  /** The currently open popup ids, bottom-to-top (last = topmost). */
  public getOpenPopups(): string[] {
    return this.getState<string[]>('popup_state') || [];
  }

  /** Whether a given popup id is currently open. */
  public isPopupOpen(id: string): boolean {
    return this.getOpenPopups().includes(id);
  }

  public getDungeonType(): "map" | "screen" | "text" {
    return this.dungeonSystem.currentDungeon.value?.dungeon_type as "map" | "screen" | "text";
  }

  public nextScene() {
    this.dungeonSystem.nextScene();
  }

  public exitScene(skipEvents: boolean = false) {
    this.dungeonSystem.exitScene(skipEvents);
  }

  public getFlag(id: string): number {
    return this.dungeonSystem.getFlag(id);
  }

  public enter(val: string): void {
    this.dungeonSystem.enter(val);
  }

  /**
   * Plays a scene, resolving friendly id forms the same way the `scene` action does:
   * `scene`, `room.scene`, `dungeon.room.scene` (each optionally `#`-prefixed),
   * `&anchor`, `&dungeon.anchor`, `next`, `shift:x`, or a full `#room.scene.1.1.1` id.
   */
  public playScene(sceneId: string | null, dungeonId: string | null = null): void {
    this.dungeonSystem.playSceneResolver(sceneId, dungeonId);
  }

  public resolveSceneId(value: string): { sceneId: string | null, dungeonId: string | null } {
    return this.dungeonSystem.resolveSceneId(value);
  }

  public getDungeonId(dungeonId: string | null = null): string {
    return this.dungeonSystem.getDungeonId(dungeonId);
  }

  public getLineByDungeonId(lineId: string, dungeonId: string | null = null): DungeonLine {
    return this.dungeonSystem.getLineByDungeonId(lineId, dungeonId);
  }

  public getDungeonDataById(id: string): DungeonData {
    return this.dungeonSystem.getDungeonDataById(id);
  }

  public addAssets(data: string[] | string): void {
    this.dungeonSystem.addAssets(data);
  }

  public removeAssets(data: string[] | string): void {
    this.dungeonSystem.removeAssets(data);
  }

  public addFlash(flash: string): void {
    this.dungeonSystem.addFlash(flash);
  }

  public setMapZoomFactor(factor: number): void {
    this.dungeonSystem.setMapZoomFactor(factor);
  }

  public getDungeonName(dungeonId: string): string {
    return this.dungeonSystem.getDungeonName(dungeonId);
  }

  public getQuestTitle(dungeonId: string, questId: string): string {
    return this.dungeonSystem.getQuestTitle(dungeonId, questId);
  }

  public getGoalTitle(dungeonId: string, questId: string, goalId: string): string {
    return this.dungeonSystem.getGoalTitle(dungeonId, questId, goalId);
  }

  public addQuestLog(dungeonId: string, questId: string, goalId: string, logId: string): void {
    this.dungeonSystem.addQuestLog(dungeonId, questId, goalId, logId);
  }

  // ============================================
  // PUBLIC API: Character System
  // ============================================

  public getCharacter(id: string): Character | null {
    return this.characterSystem.getCharacter(id);
  }

  public getParty(): Character[] {
    return this.characterSystem.party.value;
  }

  public getAllCharacters(): Character[] {
    return Array.from(this.characterSystem.characters.value.values());
  }

  public createCharacter(characterId: string, template: any, skipEvents: boolean = false): Character {
    return this.characterSystem.createCharacter(characterId, template, skipEvents);
  }

  public createStatus(template: any | string): Status {
    return this.characterSystem.createStatus(template);
  }

  public addCharacter(character: Character, isParty: boolean = false): void {
    this.characterSystem.addCharacter(character, isParty);
  }

  public isCharacterInParty(character: Character | string): boolean {
    return this.characterSystem.isCharacterInParty(character);
  }

  public addToParty(character: Character | string): void {
    this.characterSystem.addToParty(character);
  }

  public removeFromParty(character: Character | string): void {
    this.characterSystem.removeFromParty(character);
  }

  public deleteCharacter(character: Character | string): void {
    this.characterSystem.deleteCharacter(character);
  }

  /**
   * Parse a generic `id<op>value` specification into a typed list of ops.
   */
  public parseOpsSpec(data: string | Record<string, any>): Array<{ id: string; op: '=' | '>' | '<'; value: any }> {
    return this.logicSystem.parseOpsSpec(data);
  }

  /**
   * Parse a `targetId->item & item & ..., targetId->!item, ...` specification
   * into a typed list of per-target add/remove operations.
   * See {@link LogicSystem.parseTargetedSpec} for behaviour.
   */
  public parseTargetedSpec(data: string): Array<{ characterId: string; items: Array<{ name: string; remove: boolean }> }> {
    return this.logicSystem.parseTargetedSpec(data);
  }

  // ============================================
  // PUBLIC API: Item System
  // ============================================

  public addLearnedRecipe(recipeId: string): void {
    this.itemSystem.addLearnedRecipe(recipeId);
  }

  public getLearnedRecipes(): Set<string> {
    return this.itemSystem.getLearnedRecipes();
  }

  public createInventory(id: string, template?: any | string): Inventory {
    return this.itemSystem.createInventory(id, template);
  }

  public addInventory(inventory: Inventory): void {
    this.itemSystem.addInventory(inventory);
  }

  public removeInventory(inventory: string | Inventory): boolean {
    return this.itemSystem.removeInventory(inventory);
  }

  public openExchange(inventoryId: string, state: 'loot' | 'trade'): void {
    this.itemSystem.openExchange(inventoryId, state);
  }

  public createItem(template: any | string): Item {
    return this.itemSystem.createItem(template);
  }

  public getInventory(id: string): Inventory | null {
    return this.itemSystem.getInventory(id);
  }

  public canUseItems(): boolean {
    return this.itemSystem.canUseItems();
  }

  public closeExchangeInventory(exchangeInventory: Inventory): void {
    this.itemSystem.closeExchangeInventory(exchangeInventory);
  }

  // ============================================
  // PUBLIC API: Music & Sound
  // ============================================

  /**
   * Play music by id, or pass `false` to fall back to the current dungeon's music.
   * @param disableTransition - When true, switch instantly with no crossfade (default 1.0s).
   */
  public setMusic(val: string | false, disableTransition: boolean = false) {
    this.coreSystem.setMusic(val, false, disableTransition);
  }

  public playSounds(val: string | string[]) {
    this.coreSystem.playSounds(val);
  }

  // ============================================
  // PUBLIC API: Store System
  // ============================================

  public createStore(id: string): Map<string, any> {
    return this.coreSystem.createStore(id);
  }

  public getStore(id: string): Map<string, any> {
    return this.coreSystem.getStore(id);
  }

  public hasStore(id: string): boolean {
    return this.coreSystem.hasStore(id);
  }

  public deleteStore(id: string): void {
    this.coreSystem.deleteStore(id);
  }

  /**
   * Get a reactive computed reference to store data.
   * Use this in Vue components instead of getStore() to maintain reactivity.
   * @param id - The store ID
   * @param key - Optional key to get a specific item from the store
   * @returns A computed ref that reactively tracks the store data
   * @example
   * // Get reactive ref to entire store
   * const runsStore = game.useStore("runs");
   *
   * // Get reactive ref to specific item
   * const run = game.useStore("runs", runUid);
   */
  public useStore<T = any>(id: string, key?: string): ComputedRef<T | undefined> {
    if (key) {
      return computed(() => this.coreSystem.getStore(id)?.get(key) as T | undefined);
    }
    return computed(() => this.coreSystem.getStore(id) as unknown as T | undefined);
  }

  // ============================================
  // PUBLIC API: Settings
  // ============================================

  /**
   * Get an engine-level setting value (persisted to browser, shared across all games).
   */
  public getEngineSetting(key: string): any {
    return Global.getInstance().userSettings.value[key];
  }

  /**
   * Set an engine-level setting value. Automatically persisted to browser localStorage.
   */
  public setEngineSetting(key: string, value: any): void {
    Global.getInstance().userSettings.value[key] = value;
  }

  /**
   * Get a per-game setting value (defined in game_settings.json, shown in Game Settings menu).
   */
  public getGameSetting(key: string): any {
    return this.coreSystem.settings.value[key];
  }

  /**
   * Set a per-game setting value. Persisted in save files.
   */
  public setGameSetting(key: string, value: any): void {
    this.coreSystem.settings.value[key] = value;
  }

  // ============================================
  // PUBLIC API: Plugin System
  // ============================================

  public getPluginPath(pluginId: string): string | null {
    return this.coreSystem.pluginPaths.get(pluginId) || null;
  }

  // ============================================
  // PUBLIC API: Data Access
  // ============================================

  public getData(filePath: string, noCopy?: boolean): Map<string, any> | Record<string, any> {
    const data = this.coreSystem.dataRegistry.get(filePath);
    if (!data) {
      throw new Error(`Data does not exist for path: ${filePath}`);
    }
    return noCopy ? data : copy(data);
  }

  public getProperty(id: string) {
    let property = this.coreSystem.getProperty(id);
    if (!property) {
      throw new Error(`Property not found for id: ${id}`);
    }
    return property;
  }

  // ============================================
  // PUBLIC API: Logic System (Conditions, Actions, Placeholders)
  // ============================================

  public registerCondition(id: string, func: Function) {
    this.logicSystem.registerCondition(id, func);
  }

  public registerAction(id: string, actionObject: ActionObject | Function) {
    if (typeof actionObject === 'function') {
      this.logicSystem.registerAction(id, { action: actionObject });
    } else {
      this.logicSystem.registerAction(id, actionObject);
    }
  }

  public registerPlaceholder(id: string, func: Function) {
    this.logicSystem.registerPlaceholder(id, func);
  }

  /**
   * Register a custom renderer for an ability aspect's `[v]` (and sibling `[id]`) substitution.
   * The renderer's return value (HTML string) replaces the default `<b>value</b>` wrap.
   *
   * Use this to surface derived values (e.g. "20% of power (60)" instead of just "20") in
   * auto-generated ability tooltips. Renderers receive `{ value, aspects, character? }` —
   * `character` is present when the tooltip is built with a `characterId`.
   */
  public registerAspectRenderer(aspectId: string, fn: AspectRenderer) {
    this.logicSystem.registerAspectRenderer(aspectId, fn);
  }

  @Skip()
  private _abilityUsabilityCheckers: ((characterId: string, abilityId: string) => boolean)[] = [];
  /**
   * Register a provider that decides whether a character can currently use an ability (e.g. a battle
   * system). Each returns true=usable / false=blocks. Multiple systems can register; an ability is
   * usable only if every checker passes. Used by UI (e.g. AbilityCard) to grey out unusable abilities.
   */
  public registerAbilityUsabilityChecker(fn: (characterId: string, abilityId: string) => boolean): void {
    this._abilityUsabilityCheckers.push(fn);
  }
  /** True unless some registered checker blocks the ability. No checkers registered → usable. */
  public isAbilityUsable(characterId: string, abilityId: string): boolean {
    return this._abilityUsabilityCheckers.every(fn => typeof fn !== 'function' || fn(characterId, abilityId));
  }

  /** Returns the current resolve context set by `resolveString(input, noExecute, context)`. Use inside custom placeholders. */
  public getResolveContext(): Record<string, any> {
    return this.logicSystem.resolveContext;
  }

  // ============================================
  // PUBLIC API: Narrative System
  // ============================================

  public registerNarrativeState(id: string, evaluator: Function) {
    this.narrativeSystem.registerState(id, evaluator);
  }

  /** Returns a record by id, or undefined if not found. */
  public getRecord(id: string) {
    return this.narrativeSystem.getRecord(id);
  }

  /** Marks a record as discovered. No-op if already discovered or unknown id. */
  public discoverRecord(id: string): void {
    this.narrativeSystem.discoverRecord(id);
  }

  /** Returns true if the record is discovered (or has auto_discovery=true). */
  public isRecordDiscovered(id: string): boolean {
    return this.narrativeSystem.isRecordDiscovered(id);
  }

  /** Returns all encyclopedia trees, sorted by `order`. */
  public getEncyclopediaTrees() {
    return [...this.narrativeSystem.encyclopediaTreesMap.values()]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  /** Returns true if the record is referenced by any encyclopedia tree (i.e., has a full entry to "open"). */
  public isRecordInEncyclopedia(id: string): boolean {
    return this.narrativeSystem.isRecordInEncyclopedia(id);
  }

  /** Switches the progression UI to the Encyclopedia tab and selects the given record. No-op if the record isn't in any tree. */
  public openEncyclopediaForRecord(recordId: string): void {
    this.narrativeSystem.openInEncyclopedia(recordId);
    this.coreSystem.setState('progression_state', 'encyclopedia');
  }

  public registerStatComputer(key: string, computer: StatComputerFunction): void {
    this.characterSystem.registerStatComputer(key, computer);
  }

  public getStatComputer(key: string): StatComputerFunction | undefined {
    return this.characterSystem.getStatComputer(key);
  }

  public registerStatGroupResolver(resolver: StatGroupResolverFunction): void {
    this.characterSystem.registerStatGroupResolver(resolver);
  }

  public execute(params: Record<string, any> | string, skipDelayed: boolean = false) {
    this.logicSystem.resolveActions(params, skipDelayed);
  }

  public createCustomChoice(params: { id: string; name?: string; params?: string | Record<string, any> }): Choice {
    return this.logicSystem.createCustomChoice(params);
  }

  public resolveString(input: string, noExecuteActions: boolean = false, context?: Record<string, any>): { output: string; actions: Record<string, any> } {
    return this.logicSystem.resolveString(input, noExecuteActions, context);
  }

  public buildAbilityEffectsDescription(
    abilityIdOrData: string | { meta?: Record<string, any>, effects?: Record<string, Record<string, any>> },
    characterId?: string, isFlat?: boolean,
    baseData?: { meta?: Record<string, any>, effects?: Record<string, Record<string, any>> }
  ): { name?: string, lines: string[] }[] | string[] {
    return this.logicSystem.buildAbilityEffectsDescription(abilityIdOrData, characterId, isFlat, baseData);
  }

  public buildAbilityMetaDescription(
    abilityIdOrData: string | { meta?: Record<string, any>, effects?: Record<string, Record<string, any>> },
    characterId?: string,
    baseData?: { meta?: Record<string, any>, effects?: Record<string, Record<string, any>> }
  ): string[] {
    return this.logicSystem.buildAbilityMetaDescription(abilityIdOrData, characterId, baseData);
  }

  public mergeAbilityData(base: any, modifier: any): { meta: Record<string, any>, effects: Record<string, Record<string, any>> } {
    return this.characterSystem.mergeAbilityData(base, modifier);
  }

  public getLine(lineId: string, params: Record<string, any> = {}): string {
    return this.logicSystem.getLine(lineId, params);
  }

  // ============================================
  // POOL SYSTEM
  // ============================================

  /**
   * Draw templates from a pool based on weighted random selection.
   * @param entry Pool entry ID or custom entry object
   * @param settings Optional draw settings (type: 'weight'|'chance', draws: number, unique: boolean)
   * @returns Array of { id, quantity } results drawn from the pool
   */
  public drawFromPool(entry: string | PoolEntryObject, settings?: PoolSettings): PoolDrawResult[] {
    return this.logicSystem.drawFromPool(entry, settings);
  }

  /**
   * Draw items from a collection based on random selection.
   * @param data Collection to draw from (Array, Map, or Record)
   * @param settings Draw settings (type: 'uniform'|'weight'|'chance', count, unique)
   * @returns Array of drawn items
   */
  public drawFromCollection<T>(
    data: T[] | Map<string, T> | Record<string, T>,
    settings?: CollectionSettings
  ): T[] {
    return this.logicSystem.drawFromCollection(data, settings);
  }

  /**
   * Convert a Record to an array of objects with id and value fields.
   * @param data Record to convert (e.g., { goblins: 50, orcs: 30 })
   * @param valueField Name for the value field (e.g., 'weight', 'amount', 'chance')
   * @returns Array of objects (e.g., [{ id: 'goblins', weight: 50 }, ...])
   */
  public toEntries<T>(data: Record<string, T>, valueField: string): { id: string;[key: string]: T | string }[] {
    return this.logicSystem.toEntries(data, valueField);
  }

  // ============================================
  // MISCELLANEOUS
  // ============================================

  public showNotification(message: string) {
    Global.getInstance().addNotification(message);
  }

  public isDevMode(): boolean {
    return localStorage.getItem('devMode') === 'true';
  }


  // ============================================
  // SINGLETON PATTERN
  // ============================================

  private constructor() {
    // Private constructor for singleton pattern
  }

  private static instance: Game | null = null;

  /**
   * Get the singleton instance of the Game class.
   * @returns The Game instance
   */
  public static getInstance(): Game {
    if (!Game.instance) {
      Game.instance = new Game();
    }
    return Game.instance;
  }

  /**
   * Reset the singleton instance (used for testing or restarting).
   */
  public static resetInstance() {
    Game.instance = null;
  }
}
