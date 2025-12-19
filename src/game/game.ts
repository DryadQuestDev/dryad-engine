import { Skip, Populate } from '../utility/save-system';
import { Global } from '../global/global';

import { DungeonSystem } from './systems/dungeonSystem';
import { ActionObject, LogicSystem } from './systems/logicSystem';
import { CharacterSystem, StatComputerFunction } from './systems/characterSystem';
import { ItemSystem } from './systems/itemSystem';
import { CoreSystem, type EmitterMap, type CustomComponent } from './systems/coreSystem';
import { gameLogger } from './utils/logger';
import { Character } from './core/character/character';
import { Inventory } from './core/character/inventory';
import { Item } from './core/character/item';
import { Choice } from './core/content/choice';
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

  // ============================================
  // PUBLIC API: Game Lifecycle
  // ============================================

  public createUid(): string {
    return this.coreSystem.uidGenerator.rnd();
  }

  @Skip()
  public isNewGame = true;

  public async saveGame(saveName: string, options?: { hidden?: boolean }) {
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

  public createCharacter(characterId: string, template: any): Character {
    return this.characterSystem.createCharacter(characterId, template);
  }

  public createCharacterFromTemplate(characterId: string, templateId: string): Character {
    return this.characterSystem.createCharacterFromTemplate(characterId, templateId);
  }

  public addCharacter(character: Character, isParty: boolean = false): void {
    this.characterSystem.addCharacter(character, isParty);
  }

  public isCharacterInParty(character: Character | string): boolean {
    return this.characterSystem.isCharacterInParty(character);
  }

  public addToParty(character: Character): void {
    this.characterSystem.addToParty(character);
  }

  public removeFromParty(character: Character): void {
    this.characterSystem.removeFromParty(character);
  }

  public deleteCharacter(character: Character): void {
    this.characterSystem.deleteCharacter(character);
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

  public createInventory(id: string): Inventory {
    return this.itemSystem.createInventory(id);
  }

  public createInventoryFromTemplate(templateId: string, inventoryId?: string): Inventory {
    return this.itemSystem.createInventoryFromTemplate(templateId, inventoryId);
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

  public createItem(template: any): Item {
    return this.itemSystem.createItem(template);
  }

  public createItemFromTemplate(templateId: string): Item {
    return this.itemSystem.createItemFromTemplate(templateId);
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

  public setMusic(val: string | false, load: boolean = false) {
    this.coreSystem.setMusic(val, load);
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

  // ============================================
  // PUBLIC API: Data Access
  // ============================================

  public getData(filePath: string): Map<string, any> | undefined {
    const data = this.coreSystem.dataRegistry.get(filePath);
    if (!data) {
      throw new Error(`Data does not exist for path: ${filePath}`);
    }
    return data;
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

  public registerStatComputer(key: string, computer: StatComputerFunction): void {
    this.characterSystem.registerStatComputer(key, computer);
  }

  public getStatComputer(key: string): StatComputerFunction | undefined {
    return this.characterSystem.getStatComputer(key);
  }

  public execute(params: Record<string, any> | string, skipDelayed: boolean = false) {
    this.logicSystem.resolveActions(params, skipDelayed);
  }

  public createCustomChoice(params: { id: string; name?: string; params?: string | Record<string, any> }): Choice {
    return this.logicSystem.createCustomChoice(params);
  }

  public resolveString(input: string, noExecuteActions: boolean = false): { output: string; actions: Record<string, any> } {
    return this.logicSystem.resolveString(input, noExecuteActions);
  }

  // ============================================
  // MISCELLANEOUS
  // ============================================

  public showNotification(message: string) {
    Global.getInstance().addNotification(message);
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
