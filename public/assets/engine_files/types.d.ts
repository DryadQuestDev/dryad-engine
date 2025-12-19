/// <reference path="./types/vue.d.ts" />
/// <reference path="./types/@vueuse/core.d.ts" />
/// <reference path="./types/@floating-ui/vue.d.ts" />
/// <reference path="./types/gsap.d.ts" />
/// <reference path="./types/fast-copy.d.ts" />

// Import 3rd party types
import type * as VueTypes from './types/vue';
import type * as VueUseTypes from './types/@vueuse/core';
import type * as FloatingUiTypes from './types/@floating-ui/vue';
import type * as GsapTypes from './types/gsap';
import type * as FastCopyTypes from './types/fast-copy';

/**
 * Dryad Engine - Type Definitions for Devs
 *
 * This file provides TypeScript type definitions for the game engine API.
 * It enables IntelliSense, autocomplete, and type checking in VS Code for JavaScript files.
 *
 */

// ============================================
// Game API Types
// ============================================

/**
 * Core Engine Event Signatures
 *
 * These events are built into the engine and have fully typed callback parameters.
 * You can also register custom events using game.registerEmitter() - those will accept any parameters.
 *
 * Event callbacks can return:
 * - false: Stop event propagation and cancel the event
 * - true: Stop event propagation but allow the event to continue
 * - void/undefined: Continue to next event listener
 */
interface GameEvents {
  // Lifecycle & Save Events
  /** Triggered when the game finishes initialization (after all data is loaded) */
  game_initiated: () => boolean | void;
  /** Triggered when the game is being saved */
  game_save: (saveName: string) => boolean | void;
  /** Triggered when the game HTML mounts to the DOM */
  html_mount: () => boolean | void;

  // State Events
  /** Triggered when a state value changes */
  state_change: (stateId: string, newValue: any, oldValue: any) => boolean | void;

  // Dungeon Events
  /** Triggered when a dungeon is created */
  dungeon_create: (dungeon: any) => boolean | void;
  /** Triggered when entering a dungeon */
  dungeon_enter: (dungeonId: string, roomId: string) => boolean | void;
  /** Triggered before entering a room */
  room_enter_before: (roomId: string) => boolean | void;
  /** Triggered after entering a room */
  room_enter_after: (roomId: string) => boolean | void;
  /** Triggered before a scene plays */
  scene_play_before: (sceneId: string, dungeonId: string, isRootScene: boolean) => boolean | void;
  /** Triggered after a scene plays */
  scene_play_after: (sceneId: string, dungeonId: string, isRootScene: boolean) => boolean | void;
  /** Triggered when an event ends */
  event_end: () => boolean | void;

  // Character Events
  /** Triggered when a character is created */
  character_create: (character: Character) => boolean | void;
  /** Triggered when a character's resource (HP, MP, etc.) changes */
  character_resource_change: (character: Character, statId: string, oldValue: number, newValue: number) => boolean | void;
  /** Triggered when a character is deleted */
  character_delete: (character: Character) => boolean | void;
  /** Triggered when a character joins the party */
  character_join_party: (character: Character) => boolean | void;
  /** Triggered when a character leaves the party */
  character_leave_party: (character: Character) => boolean | void;
  /** Triggered when a character's render layers are built. Listeners can reassign character.renderedLayers to filter layers. */
  character_render: (character: Character) => boolean | void;

  // Render Events
  /** Triggered when an asset is rendered. Listeners can modify asset properties before display. */
  asset_render: (asset: Asset) => boolean | void;

  // Item Events
  /** Triggered when an item is created */
  item_create: (item: Item) => boolean | void;
  /** Triggered before an item is equipped (return false to cancel) */
  item_equip_before: (item: Item, character: Character) => boolean | void;
  /** Triggered after an item is equipped */
  item_equip_after: (item: Item, character: Character) => boolean | void;
  /** Triggered before an item is unequipped (return false to cancel) */
  item_unequip_before: (item: Item, character: Character) => boolean | void;
  /** Triggered after an item is unequipped */
  item_unequip_after: (item: Item, character: Character) => boolean | void;

  // Inventory Events
  /** Triggered when an inventory is opened */
  inventory_open: (inventory: Inventory) => boolean | void;
  /** Triggered when an inventory is closed */
  inventory_close: (inventory: Inventory) => boolean | void;
  /** Triggered when inventory changes are applied */
  inventory_apply: (inventory: Inventory) => boolean | void;
  /** Triggered when items are transferred between inventories */
  inventory_transfer: (inventory: Inventory, targetInventory: Inventory, item: Item, quantity: number, isTrade: boolean) => boolean | void;

  // Trade & Recipe Events
  /** Triggered when a trade is initiated */
  trade_init: (traderInventory: Inventory, item: Item) => boolean | void;
  /** Triggered when a recipe is learned */
  recipe_learned: (recipeId: string) => boolean | void;

  // Skill Events
  /** Triggered when a skill is learned */
  skill_learned: (skillTreeId: string, skillId: string, level: number) => boolean | void;
  /** Triggered when a skill is unlearned */
  skill_unlearned: (skillTreeId: string, skillId: string) => boolean | void;
}

// ============================================
// Component & Action Types
// ============================================

/**
 * CustomComponent - Configuration for registering UI components in slots.
 *
 * @example
 * game.addComponent({
 *   id: 'combat-ui',
 *   slot: 'state',
 *   component: CombatComponent,
 *   order: 1
 * });
 */
interface CustomComponent {
  /** Unique identifier for this component */
  id: string;
  /** Slot where the component will be rendered */
  slot: string;
  /** The Vue component to render */
  component: any;
  /** Optional tab title (components with titles render as tabs) */
  title?: string;
  /** Render order (lower numbers render first) */
  order?: number;
}

/**
 * ActionObject - Configuration for registered actions.
 *
 * @example
 * game.registerAction('heal_party', {
 *   action: (amount) => {
 *     game.getParty().forEach(c => c.addResource('health', amount));
 *   },
 *   delayed: true
 * });
 */
interface ActionObject {
  /** The function to execute when the action is triggered */
  action: Function;
  /** If true, action is deferred until scene transition */
  delayed?: boolean;
}

/**
 * Asset - A visual element displayed in the scene.
 * Assets can be images, videos, or Spine animations.
 *
 * @example
 * game.on('asset_render', (asset) => {
 *   if (asset.id === 'hero') {
 *     asset.x = 50; // Modify position before render (percentage)
 *   }
 * });
 */
interface Asset {
  /** Unique identifier for this asset instance */
  uid: string;
  /** Asset template ID */
  id: string;
  /** Type of asset: 'image', 'video', or 'spine' */
  type: 'image' | 'video' | 'spine';
  /** Path to image file (for image type) */
  file_image?: string;
  /** Path to video file (for video type) */
  file_video?: string;
  /** Tags for categorizing and filtering */
  tags?: string[];
  /** How the asset fits within its container */
  fit_mode?: 'cover' | 'contain' | 'fill' | 'scale-down' | 'none';
  /** X position as percentage (0-100) */
  x: number;
  /** Y position as percentage (0-100) */
  y: number;
  /** Z-index for layering (higher = on top) */
  z: number;
  /** Uniform scale factor (1.0 = original size) */
  scale?: number;
  /** Horizontal scale factor */
  xscale?: number;
  /** Vertical scale factor */
  yscale?: number;
  /** Rotation angle in degrees */
  rotation?: number;
  /** Opacity (0.0 = transparent, 1.0 = opaque) */
  alpha?: number;
  /** Blur amount in pixels */
  blur?: number;
  /** Enter transition effect */
  enter?: string;
  /** Enter transition duration in seconds */
  enter_duration?: number;
  /** Exit transition effect */
  exit?: string;
  /** Exit transition duration in seconds */
  exit_duration?: number;
  /** Idle/looping animation effect */
  idle?: string;
  /** Spine animation name (for spine type) */
  animation?: string;
  /** Spine skin names (for spine type) */
  skins?: string[];
  /** Whether to loop Spine animation */
  loop?: boolean;
}

interface Game {
  /**
   * Will be set to false when a game is loaded from a save file.
   */
  isNewGame: boolean;

  // ============================================
  // Systems (Advanced Usage)
  // ============================================

  /** Core system - handles components, events, state, audio, stores */
  coreSystem: any;

  /** Dungeon system - handles dungeons, rooms, scenes, quests */
  dungeonSystem: any;

  /** Character system - handles characters, stats, party management */
  characterSystem: any;

  /** Item system - handles items, inventories, recipes, trading */
  itemSystem: any;

  /** Logic system - handles conditions, actions, placeholders */
  logicSystem: any;

  // ============================================
  // Game Lifecycle
  // ============================================

  /**
   * Create a unique ID.
   * @returns A unique string identifier
   */
  createUid(): string;

  /**
   * Save the current game state to IndexedDB.
   * @param saveName - Name of the save file
   * @param options - Optional save options (e.g., hidden to hide from save list)
   */
  saveGame(saveName: string, options?: { hidden?: boolean }): Promise<void>;

  /**
   * Save the current game state to a downloadable JSON file.
   * @param saveName - Name of the save file
   */
  saveGameToFile(saveName: string): void;

  /**
   * Load a saved game from IndexedDB.
   * @param saveName - Name of the save file to load
   */
  loadGame(saveName: string): void;

  /**
   * Check if saving is currently disabled.
   * Saving is disabled in replay mode or when disable_saves state is true.
   * @returns true if saving is disabled
   * @example
   * if (!game.isSaveDisabled()) {
   *   game.saveGame('checkpoint');
   * }
   */
  isSaveDisabled(): boolean;

  /**
   * Go to next scene or exit scene if there's no next scene.
   */
  nextScene(): void;

  /**
   * Exit the current scene and return to exploration.
   * @param skipEvents - If true, skip triggering scene exit events
   */
  exitScene(skipEvents?: boolean): void;

  // ============================================
  // Event System
  // ============================================

  /**
   * Register a custom event emitter.
   * Allows external scripts to create their own event types.
   * @param name - Name of the event type to register
   * @example
   * game.registerEmitter("custom_event");
   * game.on("custom_event", () => console.log("Event fired!"));
   * game.trigger("custom_event");
   */
  registerEmitter(name: string): void;

  /**
   * Register a callback for a core engine event (with full type checking).
   * @param type - Event type (autocomplete available for core events)
   * @param callback - Function to call when event is triggered
   * @param order - Execution order (lower numbers run first, default: 0)
   * The callback can return a boolean. In both cases (true or false), the event will be stopped propagating.
   * On returning false, the event itself (e.g user input) will be cancelled.
   * @example
   * game.on("dungeon_enter", (dungeonId, roomId) => {
   *   console.log(`Entered dungeon: ${dungeonId}, room: ${roomId}`);
   * });
   */
  on<K extends keyof GameEvents>(type: K, callback: GameEvents[K], order?: number): void;
  /**
   * Register a callback for a custom event (flexible typing).
   * @param type - Custom event name
   * @param callback - Event callback with any parameters
   * @param order - Execution order (lower numbers run first, default: 0)
   * @example
   * game.registerEmitter("my_custom_event");
   * game.on("my_custom_event", (data) => {
   *   console.log("Custom event triggered", data);
   * });
   */
  on(type: string, callback: (...args: any[]) => boolean | void, order?: number): void;

  /**
   * Trigger an event, calling all registered callbacks in order.
   * @param type - Event type to trigger
   * @param args - Arguments to pass to event callbacks
   * @returns false if any callback returned false (stopped propagation), true otherwise
   * @example
   * game.trigger("dungeon_enter", "forest_dungeon", "entrance");
   */
  trigger<K extends keyof GameEvents>(type: K, ...args: Parameters<GameEvents[K]>): boolean;
  /**
   * Trigger a custom event (flexible typing).
   * @param type - Custom event name
   * @param args - Event arguments
   * @returns false if any callback cancelled, true otherwise
   */
  trigger(type: string, ...args: any[]): boolean;

  // ============================================
  // Component Registration
  // ============================================

  /**
   * Add a component to a slot. Components with a title are rendered as tabs,
   * components without a title are injected into the container.
   * If a component with the same id already exists, it will be replaced.
   *
   * @param component - Component configuration
   * @example
   * // Add a game state component
   * game.addComponent({
   *   id: 'combat',
   *   slot: 'state',
   *   component: CombatComponent
   * });
   *
   * @example
   * // Add a progression tab
   * game.addComponent({
   *   id: 'custom-skills',
   *   slot: 'progression-tabs',
   *   title: 'Skills',
   *   component: SkillsTab,
   *   order: 3
   * });
   *
   * @example
   * // Add a character sheet tab
   * game.addComponent({
   *   id: 'custom-talents',
   *   slot: 'character-tabs',
   *   title: 'Talents',
   *   component: TalentsTab,
   *   order: 2
   * });
   *
   * @example
   * // Inject a component into character face (no title)
   * game.addComponent({
   *   id: 'face-overlay',
   *   slot: 'character-face',
   *   component: CustomOverlay,
   *   order: 1
   * });
   */
  addComponent(component: CustomComponent): void;

  /**
   * Remove a component by id.
   * @param id - Component id to remove
   * @returns true if component was found and removed, false otherwise
   * @example
   * game.removeComponent('custom-skills');
   */
  removeComponent(id: string): boolean;

  /**
   * Clear all registered components from a slot.
   * @param slot - Slot to clear
   * @example
   * game.clearComponentSlot('debug-tabs');
   */
  clearComponentSlot(slot: string): void;

  // ============================================
  // State Management
  // ============================================

  /**
   * Register a new UI state with a default value.
   * States registered here are saved/loaded automatically.
   * @param key - State key (use snake_case)
   * @param defaultValue - Default value for the state
   * @throws Error if state is already registered
   * @example
   * game.registerState('custom_mode', false);
   * game.registerState('active_tab', 'skills');
   */
  registerState<T>(key: string, defaultValue: T): void;

  /**
   * Get the value of a registered UI state.
   * @param key - State key
   * @returns The state value
   * @throws Error with available states if key is not registered
   * @example
   * const mode = game.getState<string>('game_state');
   * const isVisible = game.getState<boolean>('show_character_list');
   */
  getState<T>(key: string): T;

  /**
   * Set the value of a registered UI state.
   * @param key - State key
   * @param value - New value
   * @throws Error if state is not registered
   * @example
   * game.setState('game_state', 'exploration');
   * game.setState('show_character_list', true);
   */
  setState<T>(key: string, value: T): void;

  /**
   * Get the type of the current dungeon.
   * @returns "map" | "screen" | "text"
   */
  getDungeonType(): "map" | "screen" | "text";

  /**
   * Get a flag value by ID.
   * @param id - Flag ID (can be "flagName" for current dungeon or "dungeonId.flagName" for specific dungeon)
   * @returns The flag value (number)
   * @example
   * const progress = game.getFlag('quest_progress');
   * const otherDungeonFlag = game.getFlag('forest.explored');
   */
  getFlag(id: string): number;

  /**
   * Enter a dungeon room or dungeon.
   * @param val - Room ID (e.g., "room1") or dungeon.room (e.g., "forest.entrance")
   * @example
   * game.enter('tavern'); // Enter room in current dungeon
   * game.enter('forest.entrance'); // Enter specific dungeon and room
   */
  enter(val: string): void;

  /**
   * Add assets to the current scene.
   * @param data - Asset ID(s) as string, comma-separated string, array, or Asset object(s)
   * @example
   * // By ID
   * game.addAssets('background_forest');
   * game.addAssets('tree1, tree2, rock');
   * game.addAssets(['npc_merchant', 'stall']);
   *
   * // With asset properties
   * game.addAssets({ id: 'hero', x: 50, y: 30, animation: 'idle' });
   * game.addAssets({ id: 'spine_char', skins: ['default', 'armor'], animation: 'walk' });
   */
  addAssets(data: string | string[] | Partial<Asset> | Partial<Asset>[]): void;

  /**
   * Remove assets from the current scene.
   * @param data - Asset ID(s) as string, comma-separated string, or array
   * @example
   * game.removeAssets('background_forest');
   * game.removeAssets(['tree1', 'tree2']);
   */
  removeAssets(data: string[] | string): void;

  /**
   * Add a flash text effect to the current scene.
   * Flash text appears briefly on screen for emphasis.
   * @param flash - The flash text to display
   * @example
   * game.addFlash('Critical Hit!');
   */
  addFlash(flash: string): void;

  /**
   * Set the map zoom factor for the dungeon map view.
   * @param factor - Zoom factor (0.3 to 2.0)
   * @example
   * game.setMapZoomFactor(1.5); // Zoom in
   * game.setMapZoomFactor(0.5); // Zoom out
   */
  setMapZoomFactor(factor: number): void;

  // ============================================
  // Quest System
  // ============================================

  /**
   * Get the display name of a dungeon.
   * @param dungeonId - The dungeon ID
   * @returns The dungeon's display name (from $dungeon_name line) or the ID if not found
   * @example
   * const name = game.getDungeonName('forest'); // "Dark Forest"
   */
  getDungeonName(dungeonId: string): string;

  /**
   * Get the title of a quest.
   * @param dungeonId - The dungeon ID where the quest is defined
   * @param questId - The quest ID
   * @returns The quest title
   * @example
   * const title = game.getQuestTitle('forest', 'rescue_villager');
   */
  getQuestTitle(dungeonId: string, questId: string): string;

  /**
   * Get the title of a quest goal.
   * @param dungeonId - The dungeon ID where the quest is defined
   * @param questId - The quest ID
   * @param goalId - The goal ID
   * @returns The goal title
   * @example
   * const goal = game.getGoalTitle('forest', 'rescue_villager', 'find_key');
   */
  getGoalTitle(dungeonId: string, questId: string, goalId: string): string;

  /**
   * Add a log entry to a quest goal.
   * Creates the quest/goal if they don't exist.
   * @param dungeonId - The dungeon ID where the quest is defined
   * @param questId - The quest ID
   * @param goalId - The goal ID
   * @param logId - The log entry ID
   * @example
   * game.addQuestLog('forest', 'rescue_villager', 'find_key', 'found_clue');
   */
  addQuestLog(dungeonId: string, questId: string, goalId: string, logId: string): void;

  // ============================================
  // Character System
  // ============================================

  /**
   * Get a character by ID.
   * @param id - Character ID
   * @returns The character or null if not found
   * @example
   * const character = game.getCharacter('mc');
   */
  getCharacter(id: string): Character | null;

  /**
   * Get all characters in the party.
   * @returns Array of party members
   */
  getParty(): Character[];

  /**
   * Get all characters in the game.
   * @returns Array of all characters
   */
  getAllCharacters(): Character[];

  /**
   * Create a character from a custom template object.
   * Use this when you need to dynamically create character templates at runtime.
   * @param characterId - Unique ID for the new character
   * @param template - Custom template object with character properties
   * @returns The created character
   * @example
   * const customTemplate = {
   *   traits: { name: 'Custom NPC' },
   *   stats: { health: 100, strength: 10 },
   *   attributes: { sex: 'male' }
   * };
   * const npc = game.createCharacter('custom_npc', customTemplate);
   * game.addCharacter(npc);
   */
  createCharacter(characterId: string, template: any): Character;

  /**
   * Create a character from a registered template.
   * @param characterId - Unique ID for the new character
   * @param templateId - Template ID to create the character from
   * @returns The created character
   * @throws Error if template not found
   * @example
   * const npc = game.createCharacterFromTemplate('shopkeeper', 'shopkeeper_template');
   */
  createCharacterFromTemplate(characterId: string, templateId: string): Character;

  /**
   * Add a character to the game.
   * @param character - The character to add
   * @param isParty - Whether to also add the character to the party (default: false)
   * @throws Error if character with same ID already exists
   * @example
   * const npc = game.createCharacterFromTemplate('merchant', 'merchant_template');
   * game.addCharacter(npc); // Add without joining party
   * game.addCharacter(npc, true); // Add and join party
   */
  addCharacter(character: Character, isParty?: boolean): void;

  /**
   * Check if a character is in the party.
   * @param character - Character instance or character ID string
   * @returns true if character is in the party
   * @example
   * if (game.isCharacterInParty('alice')) {
   *   console.log('Alice is in the party');
   * }
   */
  isCharacterInParty(character: Character | string): boolean;

  /**
   * Add a character to the party.
   * Triggers character_join_party event.
   * @param character - The character to add to the party
   * @example
   * const npc = game.getCharacter('alice');
   * game.addToParty(npc);
   */
  addToParty(character: Character): void;

  /**
   * Remove a character from the party.
   * Triggers character_leave_party event.
   * @param character - The character to remove from the party
   * @example
   * const npc = game.getCharacter('alice');
   * game.removeFromParty(npc);
   */
  removeFromParty(character: Character): void;

  /**
   * Delete a character from the game entirely.
   * Also removes their private inventory and removes them from the party.
   * Triggers character_delete event.
   * @param character - The character to delete
   * @example
   * const npc = game.getCharacter('temporary_npc');
   * game.deleteCharacter(npc);
   */
  deleteCharacter(character: Character): void;

  // ============================================
  // Item System
  // ============================================

  /**
   * Add a recipe to the player's learned recipes.
   * If already learned, does nothing.
   * Triggers recipe_learned event.
   * @param recipeId - The recipe ID to learn
   * @example
   * game.addLearnedRecipe('iron_sword_recipe');
   */
  addLearnedRecipe(recipeId: string): void;

  /**
   * Get all learned recipe IDs.
   * @returns Set of learned recipe IDs
   * @example
   * const recipes = game.getLearnedRecipes();
   * if (recipes.has('iron_sword_recipe')) {
   *   console.log('Player can craft iron swords');
   * }
   */
  getLearnedRecipes(): Set<string>;

  /**
   * Create a new empty inventory.
   * @param id - Unique identifier for the inventory
   * @returns The created inventory
   * @throws Error if inventory with same ID already exists
   * @example
   * const chest = game.createInventory('treasure_chest_1');
   */
  createInventory(id: string): Inventory;

  /**
   * Create an inventory from a registered template.
   * The template defines initial items, size limits, and recipes.
   * @param templateId - The inventory template ID
   * @param inventoryId - Optional custom ID (defaults to templateId)
   * @returns The created inventory
   * @throws Error if template not found
   * @example
   * const shop = game.createInventoryFromTemplate('blacksmith_shop');
   * const customShop = game.createInventoryFromTemplate('blacksmith_shop', 'my_shop_1');
   */
  createInventoryFromTemplate(templateId: string, inventoryId?: string): Inventory;

  /**
   * Add an existing inventory instance to the game.
   * @param inventory - The inventory to add
   * @example
   * const inventory = new Inventory();
   * inventory.id = 'custom_inventory';
   * game.addInventory(inventory);
   */
  addInventory(inventory: Inventory): void;

  /**
   * Remove an inventory from the game.
   * @param inventory - Inventory instance or inventory ID string
   * @returns true if inventory was found and removed
   * @example
   * game.removeInventory('temporary_chest');
   * // or
   * game.removeInventory(chestInventory);
   */
  removeInventory(inventory: string | Inventory): boolean;

  /**
   * Open an exchange UI (loot or trade) with an inventory.
   * Sets up trade prices if in trade mode.
   * @param inventoryId - The inventory ID to exchange with
   * @param state - 'loot' for free taking, 'trade' for buying/selling
   * @throws Error if inventory not found
   * @example
   * game.openExchange('merchant_inventory', 'trade');
   * game.openExchange('treasure_chest', 'loot');
   */
  openExchange(inventoryId: string, state: 'loot' | 'trade'): void;

  /**
   * Create an item from a custom template object.
   * Use this when you need to dynamically create item templates at runtime.
   * @param template - Custom item template object
   * @returns The created item
   * @example
   * const customItem = game.createItem({
   *   id: 'custom_sword',
   *   traits: { name: 'Custom Sword', damage: 25 },
   *   slots: ['weapon_slot'],
   *   tags: ['weapon', 'sword']
   * });
   */
  createItem(template: any): Item;

  /**
   * Create an item from a registered template.
   * @param templateId - The item template ID
   * @returns The created item
   * @throws Error if template not found
   * @example
   * const sword = game.createItemFromTemplate('iron_sword');
   * inventory.addItem(sword);
   */
  createItemFromTemplate(templateId: string): Item;

  /**
   * Get an inventory by ID.
   * @param id - The inventory ID
   * @returns The inventory or null if not found
   * @example
   * const inventory = game.getInventory('party_inventory');
   * if (inventory) {
   *   console.log(`Inventory has ${inventory.items.length} items`);
   * }
   */
  getInventory(id: string): Inventory | null;

  /**
   * Check if item usage is currently allowed.
   * Returns false when party inventory is blocked (e.g., during exchanges).
   * @returns true if items can be used
   * @example
   * if (game.canUseItems()) {
   *   // Show use item button
   * }
   */
  canUseItems(): boolean;

  /**
   * Close the exchange UI and proceed to the next scene.
   * Triggers inventory_close event.
   * @param exchangeInventory - The exchange inventory being closed
   * @example
   * const merchant = game.getInventory('merchant_shop');
   * game.closeExchangeInventory(merchant);
   */
  closeExchangeInventory(exchangeInventory: Inventory): void;

  // ============================================
  // Music & Sound
  // ============================================

  /**
   * Set the currently playing music track.
   * Includes fade-out transition from previous track.
   * @param val - Music ID from musicMap, or false to use dungeon's default music
   * @param load - Whether this is being called during game load
   * @example
   * game.setMusic('battle_theme');
   * game.setMusic(false); // Use current dungeon's music
   */
  setMusic(val: string | false, load?: boolean): void;

  /**
   * Play sound effect(s).
   * @param val - Sound ID(s) - can be comma-separated string or array
   * @example
   * game.playSounds('door_open');
   * game.playSounds(['sword_swing', 'enemy_hit']);
   */
  playSounds(val: string | string[]): void;

  // ============================================
  // Store System
  // ============================================

  /**
   * Create a new named store (key-value storage).
   * @param id - Unique ID for the store
   * @returns The created store Map
   * @example
   * const myStore = game.createStore('my_data');
   * myStore.set('key', 'value');
   */
  createStore(id: string): Map<string, any>;

  /**
   * Get an existing store by ID.
   * @param id - Store ID
   * @returns The store Map Object - use .get(key), .set(key, value), .has(key), .delete(key) to access values
   * @throws Error if store doesn't exist
   * @example
   * const store = game.getStore('my_store');
   * store.set('player_name', 'Alice');
   * const name = store.get('player_name');
   * if (store.has('score')) { ... }
   * store.delete('old_key');
   * for (const [key, value] of store) { console.log(key, value); }
   */
  getStore(id: string): Map<string, any>;

  /**
   * Check if a store exists.
   * @param id - Store ID
   * @returns true if store exists
   */
  hasStore(id: string): boolean;

  /**
   * Delete a store by ID.
   * @param id - Store ID to delete
   * @example
   * game.deleteStore('temporary_data');
   */
  deleteStore(id: string): void;

  // ============================================
  // Data Access
  // ============================================

  /**
   * Get game data by file path. Provides centralized access to all game data.
   * @param filePath - File path identifier (e.g., "character_stats", "dungeons/my_dungeon/content_parsed", "plugins_data/my_plugin/my_schema")
   * @returns Map of data indexed by ID.
   * @throws Error if data not found
   * @example
   * // Core data
   * const stats = game.getData("character_stats");
   *
   * // Get a specific item from the Map
   * const healthStat = game.getData("character_stats")?.get("health");
   *
   * // Nested path
   * const dungeonLines = game.getData("dungeons/dungeon_id/content_parsed");
   *
   * // Get Dungeon Document's value by its id
   * const specificContent = game.getData("dungeons/dungeon_id/content_parsed")?.get("line_id").val;
   *
   * // Plugin data
   * const pluginData = game.getData("plugins_data/my_plugin/my_schema");
   */
  getData(filePath: string): Map<string, any> | undefined;

  /**
   * Get a global property by ID.
   * @param id - Property ID
   * @returns Property object
   * @throws Error if property not found
   */
  getProperty(id: string): Property;

  // ============================================
  // Logic System (Conditions, Actions, Placeholders)
  // ============================================

  /**
   * Register a custom condition function.
   * Conditions are used in logic checks throughout the game.
   * @param id - Unique ID for the condition
   * @param func - Function that returns a boolean
   * @example
   * game.registerCondition("has_gold", (amount) => {
   *   return game.getProperty('gold').currentValue >= amount;
   * });
   */
  registerCondition(id: string, func: Function): void;

  /**
   * Register a custom action.
   * Actions can be triggered from game data files or scripts.
   * @param id - Unique ID for the action
   * @param actionObject - Action configuration object or a simple function
   * @example
   * // Simple function
   * game.registerAction("gain_gold", (amount) => {
   *   game.getProperty('gold').addCurrentValue(amount);
   * });
   *
   * // With delayed execution
   * game.registerAction("delayed_heal", {
   *   action: (amount) => character.addResource('health', amount),
   *   delayed: true
   * });
   */
  registerAction(id: string, actionObject: ActionObject | Function): void;

  /**
   * Register a custom placeholder for text substitution.
   * Placeholders are replaced in game text (e.g., |player_name|).
   * @param id - Placeholder ID (used as |id| in text)
   * @param func - Function that returns the replacement text
   * @example
   * game.registerPlaceholder("player_name", () => {
   *   return game.characterSystem.getPartyLeader().name;
   * });
   */
  registerPlaceholder(id: string, func: Function): void;

  /**
   * Register a stat computer function.
   * Stat computers calculate derived stat values based on other stats.
   * @param key - Stat property key
   * @param computer - Function that computes the stat value
   * @example
   * game.registerStatComputer("damage", (character) => {
   *   return character.getStat('power').value * 10;
   * });
   */
  registerStatComputer(key: string, computer: Function): void;

  /**
   * Get a registered stat computer function.
   * @param key - Stat computer key
   * @returns The stat computer function or undefined if not found
   * @example
   * const damageComputer = game.getStatComputer("damage");
   * if (damageComputer) {
   *   const damage = damageComputer(character);
   * }
   */
  getStatComputer(key: string): Function | undefined;

  /**
   * Execute a list of actions.
   * @param params - Action ID or object with action parameters
   * @param skipDelayed - Whether to skip delayed actions
   * @example
   * game.execute({ gain_gold: 10 });
   */
  execute(params: Record<string, any> | string, skipDelayed?: boolean): void;

  /**
   * Create a custom choice programmatically.
   * Useful for dynamically generating choices at runtime.
   * @param params - Choice configuration object
   * @returns The created Choice object
   * @example
   * const choice = game.createCustomChoice({
   *   id: 'attack_enemy',
   *   name: 'Attack',
   *   params: { damage: 10, target: 'enemy' }
   * });
   * choice.do(); // Execute the choice
   */
  createCustomChoice(params: { id: string; name?: string; params?: string | Record<string, any> }): Choice;

  /**
   * Resolve a text string with placeholders, conditionals, and inline actions.
   * Processes |placeholder|, if{} blocks, templates, and {action} objects.
   * @param input - The text string to resolve
   * @param noExecuteActions - If true, parses but doesn't execute inline actions
   * @returns Object with resolved output string and accumulated actions
   * @example
   * const result = game.resolveString('Hello |player_name|! if{gold > 100}You are rich!fi{}');
   * console.log(result.output); // "Hello Alice! You are rich!"
   *
   * // Parse without executing
   * const { output, actions } = game.resolveString('{heal: 10} You feel better.', true);
   */
  resolveString(input: string, noExecuteActions?: boolean): { output: string; actions: Record<string, any> };

  // ============================================
  // Miscellaneous
  // ============================================

  /**
   * Show a notification.
   * @param message - Message to show
   * @example
   * game.showNotification("Hello, world!");
   */
  showNotification(message: string): void;
}

/**
 * CharacterSkinLayerObject - Represents a skin layer for character rendering.
 *
 * Skin layers are image layers that compose a character's visual appearance.
 * They can be filtered or modified during the character_render event.
 */
interface CharacterSkinLayerObject {
  /** Unique identifier for the skin layer */
  uid: string;

  /** Skin layer ID used to reference this layer */
  id: string;

  /** The z-index of the skin layer. Higher values are rendered on top of lower values. */
  z_index?: number;

  /** Character attributes that determine which images to use for this layer */
  attributes?: string[];

  /** Images of the skin layer, dynamically built based on attributes */
  images?: Record<string, any>;

  /** Clip all image layers below this layer inside this mask boundaries */
  masks?: Record<string, any>;

  /** Custom css classes to apply to the skin layer by default */
  styles?: string[];

  /** Used for categorizing and filtering */
  tags?: string[];
}

/**
 * Character - Represents a game character with stats, traits, abilities, and equipment.
 *
 * @example
 * // Get a character and read their stats
 * const mc = game.getCharacter('mc');
 * const health = mc.getStat('health').value;
 * const currentHp = mc.getResource('health');
 *
 * @example
 * // Modify character traits
 * const mc = game.getCharacter('mc');
 * mc.setTrait('mood', 'happy');
 * mc.setAttribute('hair_color', 'blonde');
 */
interface Character {
  /** Unique identifier for this character instance */
  id: string;

  /** Template ID this character was created from */
  templateId: string;

  /** Custom actions registered on this character */
  actions: Record<string, any>;

  /** Set of skill tree IDs available to this character */
  skillTrees: Set<string>;

  /** Array of skills this character has learned */
  learnedSkills: Array<{ skillTreeId: string; id: string; level: number }>;

  /** Equipment slots on this character */
  itemSlots: ItemSlot[];

  /** Status effects currently applied to this character */
  statuses: Status[];

  /** Character traits (key-value pairs for custom data) */
  traits: Record<string, any>;

  /** Character attributes (string key-value pairs, e.g., hair_color, eye_color) */
  attributes: Record<string, string>;

  /** Set of skin layer IDs currently active on this character */
  skinLayers: Set<string>;

  /** Set of ability IDs this character has */
  abilities: Set<string>;

  /** Modifiers applied to abilities from statuses */
  abilityModifiers: Record<string, any>;

  /** CSS classes applied to specific skin layers */
  skinLayerStyles: Map<string, string[]>;

  /**
   * Rendered skin layers for display. Set during character_render event.
   * Can be reassigned in character_render listeners to filter/modify displayed layers.
   */
  renderedLayers: CharacterSkinLayerObject[];

  // ============================================
  // Skill Tree Methods
  // ============================================

  /**
   * Add a skill tree to this character's available skill trees.
   * @param skillTreeId - The skill tree ID to add
   * @example
   * character.addSkillTree('combat_skills');
   */
  addSkillTree(skillTreeId: string): void;

  /**
   * Remove a skill tree from this character's available skill trees.
   * @param skillTreeId - The skill tree ID to remove
   * @example
   * character.removeSkillTree('combat_skills');
   */
  removeSkillTree(skillTreeId: string): void;

  /**
   * Learn a skill from a skill tree.
   * If the skill is already learned, increases its level (up to max).
   * @param skillTreeId - The skill tree ID
   * @param id - The skill slot ID (unique ID in the tree)
   * @param level - Number of levels to learn (default: 1)
   * @example
   * character.learnSkill('combat_skills', 'fireball', 1);
   */
  learnSkill(skillTreeId: string, id: string, level?: number): void;

  /**
   * Unlearn a skill, removing it from the character.
   * Refunds currency if the skill tree has a refund_factor set.
   * @param skillTreeId - The skill tree ID
   * @param id - The skill slot ID
   * @example
   * character.unlearnSkill('combat_skills', 'fireball');
   */
  unlearnSkill(skillTreeId: string, id: string): void;

  /**
   * Generate a status ID for a skill.
   * @param skillTreeId - The skill tree ID
   * @param skillSlotId - The skill slot ID
   * @returns Status ID in format: _skill_[skillTreeId]_[skillSlotId]
   */
  getSkillStatusId(skillTreeId: string, skillSlotId: string): string;

  // ============================================
  // Inventory Methods
  // ============================================

  /**
   * Set the character's private inventory.
   * @param inventory - Inventory ID string or Inventory instance
   * @example
   * character.setPrivateInventory('mc_backpack');
   */
  setPrivateInventory(inventory: string | Inventory): void;

  /**
   * Get the character's private inventory.
   * @returns The private inventory or null if not set
   */
  getPrivateInventory(): Inventory | null;

  /**
   * Get the inventory to use for equipping items.
   * Returns party inventory if character is in party, otherwise private inventory.
   * @returns The relevant inventory or null
   */
  getPartyInventory(): Inventory | null;

  /**
   * Get all items currently equipped by this character.
   * @returns Array of equipped items
   */
  getEquippedItems(): Item[];

  /**
   * Equip an item to this character.
   * @param item - The item to equip (Item instance or uid string)
   * @param slotId - Optional: specific slot type to equip to
   * @param slotIndex - Optional: specific slot index (when multiple slots of same type exist)
   * @example
   * character.equipItem("item_uid_123");           // Auto-find slot
   * character.equipItem(swordItem);                // Using Item instance
   * character.equipItem("item_uid_123", "weapon"); // Specific slot type
   * character.equipItem("item_uid_123", "ring", 1); // Specific slot index
   */
  equipItem(item: Item | string, slotId?: string, slotIndex?: number): void;

  /**
   * Unequip an item from this character.
   * @param item - The item to unequip (Item instance or uid string)
   * @example
   * character.unequipItem("item_uid_123");
   * character.unequipItem(swordItem);
   */
  unequipItem(item: Item | string): void;

  // ============================================
  // Status Methods
  // ============================================

  /**
   * Get the core status (first status, contains base character data).
   * @returns The core status
   */
  getCoreStatus(): Status;

  /**
   * Add a status effect to the character.
   * If status already exists and is stackable, adds stacks instead.
   * @param status - The status to add
   * @example
   * const poisonStatus = new Status();
   * poisonStatus.id = 'poison';
   * character.addStatus(poisonStatus);
   */
  addStatus(status: Status): void;

  /**
   * Remove a status effect by ID.
   * @param id - The status ID to remove
   * @example
   * character.removeStatus('poison');
   */
  removeStatus(id: string): void;

  /**
   * Get a status by ID.
   * @param id - The status ID
   * @returns The status
   * @throws Error if status doesn't exist
   */
  getStatus(id: string): Status;

  // ============================================
  // Trait & Attribute Methods
  // ============================================

  /**
   * Get a trait value by key.
   * @param key - The trait key
   * @returns The trait value or null if not set
   * @throws Error if trait key doesn't exist in schema
   * @example
   * const mood = character.getTrait('mood');
   */
  getTrait(key: string): any | null;

  /**
   * Set a trait value on the character's core status.
   * @param key - The trait key
   * @param value - The value to set
   * @throws Error if trait key doesn't exist in schema
   * @example
   * character.setTrait('mood', 'happy');
   */
  setTrait(key: string, value: any): void;

  /**
   * Get an attribute value by key.
   * @param key - The attribute key
   * @returns The attribute value or null if not set
   * @throws Error if attribute key doesn't exist in schema
   * @example
   * const hairColor = character.getAttribute('hair_color');
   */
  getAttribute(key: string): string | null;

  /**
   * Set an attribute value on the character's core status.
   * @param key - The attribute key
   * @param value - The value to set
   * @throws Error if attribute key doesn't exist in schema
   * @example
   * character.setAttribute('hair_color', 'blonde');
   */
  setAttribute(key: string, value: string): void;

  // ============================================
  // Stat & Resource Methods
  // ============================================

  /**
   * Get a stat's computed value (sum of all status contributions).
   * @param name - The stat name
   * @returns Object with reactive value property
   * @throws Error if stat doesn't exist in schema
   * @example
   * const maxHealth = character.getStat('health').value;
   */
  getStat(name: string): { value: number };

  /**
   * Get the current value of a resource (e.g., current HP).
   * @param name - The resource/stat name
   * @returns The current resource value
   * @throws Error if stat doesn't exist or isn't a resource
   * @example
   * const currentHp = character.getResource('health');
   */
  getResource(name: string): number;

  /**
   * Add to a resource value (can be negative to subtract).
   * Value is clamped between 0 and the stat's max value.
   * @param name - The resource/stat name
   * @param value - Amount to add (negative to subtract)
   * @throws Error if stat doesn't exist or isn't a resource
   * @example
   * character.addResource('health', -10); // Take 10 damage
   * character.addResource('health', 20);  // Heal 20
   */
  addResource(name: string, value: number): void;

  /**
   * Set a resource to a specific value.
   * Value is clamped between 0 and the stat's max value.
   * @param name - The resource/stat name
   * @param value - The value to set
   * @throws Error if stat doesn't exist or isn't a resource
   * @example
   * character.setResource('health', 50);
   */
  setResource(name: string, value: number): void;

  /**
   * Get the ratio of current resource to max stat value.
   * @param name - The resource/stat name
   * @returns Ratio between 0 and 1
   * @throws Error if stat doesn't exist or isn't a resource
   * @example
   * const healthPercent = character.getResourceRatio('health'); // 0.75 = 75%
   */
  getResourceRatio(name: string): number;

  // ============================================
  // Skin Layer Methods
  // ============================================

  /**
   * Add skin layers to the character.
   * @param layers - Array of skin layer IDs to add
   * @throws Error if any skin layer doesn't exist
   * @example
   * character.addSkinLayers(['armor_plate', 'helmet']);
   */
  addSkinLayers(layers: string[]): void;

  /**
   * Remove skin layers from the character.
   * @param layers - Array of skin layer IDs to remove
   * @example
   * character.removeSkinLayers(['armor_plate', 'helmet']);
   */
  removeSkinLayers(layers: string[]): void;

  /**
   * Get the set of active skin layer IDs.
   * @returns Set of skin layer IDs
   */
  getSkinLayers(): Set<string>;

  /**
   * Set (overwrite) the CSS style classes for a specific skin layer.
   * @param layerId - The skin layer ID
   * @param styles - Array of CSS class names or a single class name
   * @throws Error if skin layer not found on character
   * @example
   * character.setSkinLayerStyle('face', ['blushing', 'sweating']);
   */
  setSkinLayerStyle(layerId: string, styles: string | string[]): void;

  /**
   * Add a CSS style class to a specific skin layer (won't add duplicates).
   * @param layerId - The skin layer ID
   * @param styleClass - The CSS class name to add
   * @throws Error if skin layer not found on character
   * @example
   * character.addSkinLayerStyle('face', 'blushing');
   */
  addSkinLayerStyle(layerId: string, styleClass: string): void;

  /**
   * Remove a CSS style class from a specific skin layer.
   * @param layerId - The skin layer ID
   * @param styleClass - The CSS class name to remove
   * @throws Error if skin layer not found on character
   * @example
   * character.removeSkinLayerStyle('face', 'blushing');
   */
  removeSkinLayerStyle(layerId: string, styleClass: string): void;

  // ============================================
  // Ability Methods
  // ============================================

  /**
   * Get all final computed abilities (base + modifiers merged).
   * @returns Reactive computed object of abilities
   * @example
   * const abilities = character.getAbilities().value;
   * // Returns:
   * // {
   * //   fireball: {
   * //     meta: { name: "Fireball", icon: "path/to/icon.png", cooldown_base: 3 },
   * //     effects: {
   * //       main_damage: { damage: 50, damage_type: "fire" },
   * //       burn: { damage: 10, damage_type: "fire" }
   * //     }
   * //   },
   * //   water_splash: { meta: {...}, effects: {...} }
   * // }
   */
  getAbilities(): { value: Record<string, { meta: Record<string, any>; effects: Record<string, Record<string, any>> }> };

  /**
   * Get a specific final computed ability by ID.
   * @param abilityId - The ability ID
   * @returns The ability object or undefined if not found
   * @example
   * const fireball = character.getAbility('fireball');
   * // Returns:
   * // {
   * //   meta: { name: "Fireball", icon: "path/to/icon.png", cooldown_base: 3 },
   * //   effects: {
   * //     main_damage: { damage: 50, damage_type: "fire" },
   * //     burn: { damage: 10, damage_type: "fire" }
   * //   }
   * // }
   *
   * // Access effect data:
   * for (const effectId in fireball.effects) {
   *   const aspects = fireball.effects[effectId];
   *   console.log(effectId, aspects.damage); // "main_damage" 50
   * }
   */
  getAbility(abilityId: string): { meta: Record<string, any>; effects: Record<string, Record<string, any>> } | undefined;

  // ============================================
  // Item Slot Methods
  // ============================================

  /**
   * Add an equipment slot to the character.
   * @param id - Unique ID for this slot instance
   * @param slotId - The slot type ID (from item_slots schema)
   * @param x - X position for UI
   * @param y - Y position for UI
   * @returns The created ItemSlot
   * @throws Error if slot type doesn't exist
   * @example
   * character.addItemSlot('main_hand_1', 'weapon_slot', 100, 200);
   */
  addItemSlot(id: string, slotId: string, x: number, y: number): ItemSlot;

  /**
   * Get an item slot by its unique ID.
   * @param id - The slot's unique ID
   * @returns The ItemSlot or null if not found
   */
  getItemSlotById(id: string): ItemSlot | null;

  /**
   * Get all item slots on this character.
   * @returns Array of ItemSlots
   */
  getItemSlots(): ItemSlot[];

  /**
   * Remove an item slot from the character.
   * @param slot - The ItemSlot to remove
   */
  removeItemSlot(slot: ItemSlot): void;

  /**
   * Get all item slots of a specific slot type.
   * @param slotId - The slot type ID
   * @returns Array of ItemSlots matching the type
   * @example
   * const weaponSlots = character.getItemSlotsBySlotId('weapon_slot');
   */
  getItemSlotsBySlotId(slotId: string): ItemSlot[];

  /**
   * Get all slots where an item can be equipped.
   * @param item - The item to check
   * @returns Array of compatible ItemSlots
   */
  getAvailableSlotsForItem(item: Item): ItemSlot[];

  // ============================================
  // Update & Utility Methods
  // ============================================

  /**
   * Bulk update character data (stats, traits, attributes, skin_layers).
   * @param data - Object containing updates
   * @example
   * character.update({
   *   stats: { strength: 10 },
   *   traits: { mood: 'happy' },
   *   attributes: { hair_color: 'red' }
   * });
   */
  update(data: {
    stats?: Record<string, number>;
    traits?: Record<string, any>;
    attributes?: Record<string, string>;
    skin_layers?: Record<string, any>;
  }): void;

  /**
   * Get the character's display name (from 'name' trait).
   * @returns The character's name or "undefined" if not set
   */
  getName(): string;
}

/**
 * Property - A typed global variable with optional min/max bounds.
 * Properties can hold numbers, booleans, strings, or arrays.
 * Use properties for game-wide values like currencies, flags, settings, and counters.
 *
 * @example
 * // Track a value
 * const corruption = game.getProperty('corruption');
 * corruption.addCurrentValue(10); // Gain 10 corruption
 *
 * @example
 * // Track game progress
 * const questsCompleted = game.getProperty('quests_completed');
 * questsCompleted.addCurrentValue(1);
 *
 * @example
 * // Toggle a game setting
 * const hardMode = game.getProperty('hard_mode');
 * hardMode.switch(); // Toggle on/off
 */
interface Property {
  /** Unique identifier for this property */
  id: string;

  /** Display name of the property */
  name?: string;

  /** Data type of this property */
  type: 'number' | 'boolean' | 'string' | 'array';

  /** Decimal precision for number types (e.g., 2 = two decimal places) */
  precision?: number;

  /** Whether negative values are allowed (for number types) */
  isNegative?: boolean;

  /** The default value this property was initialized with */
  defaultValue?: number | boolean | string | any[];

  /** Whether the value can exceed maxValue (for number types) */
  canOverflow?: boolean;

  /**
   * The current value of the property.
   * For number types, setting this value will automatically apply clamping and precision.
   * @example
   * const corruption = game.getProperty('corruption');
   * corruption.currentValue = 50;
   * console.log(corruption.currentValue); // 50
   */
  currentValue: number | boolean | string | any[] | undefined;

  // ============================================
  // Value Accessors
  // ============================================

  /**
   * Get the current value of the property.
   * @returns The current value
   * @example
   * const value = game.getProperty('corruption').getCurrentValue();
   */
  getCurrentValue(): number | boolean | string | any[] | undefined;

  /**
   * Set the current value of the property.
   * For number types, the value will be clamped to min/max bounds and precision applied.
   * @param value - The new value to set
   * @example
   * game.getProperty('corruption').setCurrentValue(100);
   */
  setCurrentValue(value: number | boolean | string | any[]): void;

  /**
   * Add a value to the current value (number types only).
   * The result will be clamped to min/max bounds.
   * @param valueToAdd - The amount to add (can be negative to subtract)
   * @example
   * // Increase corruption
   * game.getProperty('corruption').addCurrentValue(10);
   *
   * // Decrease corruption
   * game.getProperty('corruption').addCurrentValue(-5);
   */
  addCurrentValue(valueToAdd: number): void;

  // ============================================
  // Min/Max Value Management (Number Types Only)
  // ============================================

  /**
   * Get the minimum allowed value (number types only).
   * @returns The minimum value, or undefined if not set
   * @example
   * const minRep = game.getProperty('reputation').getMinValue(); // -100
   */
  getMinValue(): number | undefined;

  /**
   * Set the minimum allowed value (number types only).
   * If the current value is below the new minimum, it will be clamped.
   * @param value - The new minimum value, or undefined to remove the limit
   * @example
   * game.getProperty('reputation').setMinValue(-100);
   */
  setMinValue(value: number | undefined): void;

  /**
   * Add to the minimum value (number types only).
   * @param valueToAdd - The amount to add to the minimum
   * @example
   * game.getProperty('reputation').addMinValue(-50); // Lower the minimum reputation floor
   */
  addMinValue(valueToAdd: number): void;

  /**
   * Get the maximum allowed value (number types only).
   * @returns The maximum value, or undefined if not set
   * @example
   * const maxRep = game.getProperty('reputation').getMaxValue(); // 100
   */
  getMaxValue(): number | undefined;

  /**
   * Set the maximum allowed value (number types only).
   * If the current value exceeds the new maximum (and canOverflow is false), it will be clamped.
   * @param value - The new maximum value, or undefined to remove the limit
   * @example
   * game.getProperty('reputation').setMaxValue(150); // Raise the reputation cap
   */
  setMaxValue(value: number | undefined): void;

  /**
   * Add to the maximum value (number types only).
   * @param valueToAdd - The amount to add to the maximum
   * @example
   * game.getProperty('reputation').addMaxValue(20); // Increase max reputation by 20
   */
  addMaxValue(valueToAdd: number): void;

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Get the ratio of current value to maximum value (number types only).
   * Useful for progress bars, gauges, etc.
   * @returns A number between 0 and 1 (or greater if canOverflow is true). Returns 1 if maxValue is not set or is 0.
   * @example
   * const reputation = game.getProperty('reputation');
   * // reputation.currentValue = 75, reputation.maxValue = 100
   * console.log(reputation.getRatio()); // 0.75
   *
   * // Use for a progress bar width
   * const barWidth = reputation.getRatio() * 100 + '%';
   */
  getRatio(): number;

  /**
   * Toggle the value between true and false (boolean types only).
   * @example
   * const isVisible = game.getProperty('show_minimap');
   * isVisible.switch(); // Toggle visibility
   */
  switch(): void;
}

/**
 * Item - A game item that can be stored in inventories, equipped, traded, or used.
 * Items have traits (dynamic properties), attributes (string values), and can be stacked.
 *
 * @example
 * // Get an item and check its properties
 * const sword = inventory.getFirstItemById('iron_sword');
 * console.log(sword.getName()); // "Iron Sword"
 * console.log(sword.getWeight()); // 5
 *
 * @example
 * // Check item trading
 * if (item.isTradable()) {
 *   const price = item.getPrice('gold');
 *   console.log(`Costs ${price} gold`);
 * }
 *
 * @example
 * // Work with item tags
 * if (item.hasTag('weapon')) {
 *   // Handle weapon-specific logic
 * }
 */
interface Item {
  /** Template ID this item was created from */
  id: string;

  /** Unique instance identifier for this specific item */
  uid: string;

  /** Dynamic properties of the item (e.g., name, damage, weight) */
  traits: Record<string, any>;

  /** String attributes (e.g., rarity, type) */
  attributes: Record<string, string>;

  /** Property objects attached to this item */
  properties: Record<string, Property>;

  /** Status effect data applied when item is equipped */
  statusObject: any;

  /** Action handlers for item events (e.g., item_equip_before, item_use) */
  actions: any;

  /** Choice IDs available when using this item */
  choices: string[];

  /**
   * Base price of the item in various currencies.
   * Format: { currency_id: amount }
   */
  price: Record<string, number>;

  /**
   * Trade prices used during active trades.
   * Set when trade opens, can be modified by 'trade_init' event.
   */
  tradePrice: {
    /** Price when player sells to trader */
    player: Record<string, number>;
    /** Price when player buys from trader */
    trader: Record<string, number>;
  };

  /** Whether this item is a currency (used for trading/crafting costs) */
  is_currency: boolean;

  /** Equipment slot IDs this item can be equipped to */
  slots: string[];

  /** Tags for categorizing and filtering items */
  tags: string[];

  /** Whether this item is currently equipped */
  isEquipped: boolean;

  /** Current stack quantity */
  quantity: number;

  // ============================================
  // Trading Methods
  // ============================================

  /**
   * Check if item has a price defined (is tradable).
   * @returns true if item has at least one price entry
   * @example
   * if (item.isTradable()) {
   *   console.log('This item can be bought/sold');
   * }
   */
  isTradable(): boolean;

  /**
   * Get the price of the item.
   * @param currency - Optional specific currency to get price for
   * @returns Price for specific currency (number), or all prices (Record)
   * @example
   * // Get gold price
   * const goldCost = item.getPrice('gold'); // 100
   *
   * // Get all prices
   * const allPrices = item.getPrice(); // { gold: 100, gems: 5 }
   */
  getPrice(currency?: string): number | Record<string, number>;

  // ============================================
  // Tag Methods
  // ============================================

  /**
   * Get all tags on this item.
   * @returns Array of tag strings
   */
  getTags(): string[];

  /**
   * Check if item has a specific tag.
   * @param tag - Tag to check for
   * @returns true if item has the tag
   * @example
   * if (item.hasTag('consumable')) {
   *   // Show use button
   * }
   */
  hasTag(tag: string): boolean;

  // ============================================
  // Stacking Methods
  // ============================================

  /**
   * Get the maximum stack size for this item.
   * @returns Max stack size. 1 = non-stackable, -1 = unlimited stacking
   * @example
   * if (item.maxStack() > 1) {
   *   console.log('This item is stackable');
   * }
   */
  maxStack(): number;

  // ============================================
  // Trait & Attribute Methods
  // ============================================

  /**
   * Get a trait value by key.
   * If trait is marked as persistent, returns template value instead.
   * @param key - The trait key
   * @returns The trait value or null if not set
   * @throws Error if trait key doesn't exist in schema
   * @example
   * const damage = item.getTrait('damage'); // 25
   * const name = item.getTrait('name'); // "Iron Sword"
   */
  getTrait(key: string): any | null;

  /**
   * Get CSS class names based on item attributes.
   * Converts attributes like { rarity: "rare", type: "ring" }
   * to classes like ["rarity_rare", "type_ring"].
   * @returns Array of CSS class names
   * @example
   * const classes = item.getAttributeClasses();
   * // ["rarity_legendary", "type_weapon"]
   */
  getAttributeClasses(): string[];

  // ============================================
  // Convenience Trait Accessors
  // ============================================

  /**
   * Get the item's display name.
   * @returns Item name from 'name' trait, or id if not set
   */
  getName(): string;

  /**
   * Get the item's image path.
   * @returns Image path from 'image' trait, or empty string
   */
  getImage(): string;

  /**
   * Get the item's description.
   * @returns Description from 'description' trait, or empty string
   */
  getDescription(): string;

  /**
   * Get the item's rarity.
   * @returns Rarity from 'rarity' trait, or empty string
   */
  getRarity(): string;

  /**
   * Get the item's type.
   * @returns Type from 'type' trait, or empty string
   */
  getType(): string;

  /**
   * Get the item's weight (multiplied by quantity).
   * @returns Weight value from 'weight' trait, or 0
   */
  getWeight(): number;
}

/**
 * Inventory - A container for items with optional size and weight limits.
 * Supports item stacking, equipment management, crafting, and currency operations.
 *
 * @example
 * // Get a character's inventory and add an item
 * const inventory = character.getPrivateInventory();
 * const sword = game.itemSystem.createItemFromTemplate('iron_sword');
 * inventory.addItem(sword);
 *
 * @example
 * // Check inventory capacity
 * const slots = inventory.getAvailableSlots();
 * const weight = inventory.getAvailableWeight();
 * if (slots !== null && slots > 0) {
 *   console.log(`${slots} slots available`);
 * }
 *
 * @example
 * // Work with currencies
 * const goldAmount = inventory.getCurrencyAmount('gold');
 * if (inventory.canAffordPrice({ gold: 100 })) {
 *   inventory.deductCurrency({ gold: 100 });
 * }
 */
interface Inventory {
  /** Unique identifier for this inventory instance */
  id: string;

  /** Display name of the inventory */
  name: string;

  /**
   * Maximum number of items (stacks) in the inventory.
   * 0 or undefined means unlimited capacity.
   */
  maxSize: number;

  /**
   * Maximum total weight the inventory can hold.
   * 0 or undefined means unlimited weight capacity.
   */
  maxWeight: number;

  /**
   * Action ID to execute when clicking 'apply' button in inventory UI.
   * If empty, defaults to 'craft' if recipes are available.
   */
  interactive: string;

  /**
   * Set of recipe IDs that can be crafted in this inventory.
   */
  recipes: Set<string>;

  /**
   * Currently selected recipe ID for crafting.
   */
  selectedRecipeId: string;

  /**
   * Array of items in this inventory.
   */
  items: Item[];

  // ============================================
  // Recipe Methods
  // ============================================

  /**
   * Add a recipe to this inventory's available recipes.
   * @param recipeId - The recipe ID to add
   * @example
   * inventory.addRecipe('iron_sword_recipe');
   */
  addRecipe(recipeId: string): void;

  /**
   * Get all available recipes for this inventory.
   * @returns Set of recipe IDs
   */
  getRecipes(): Set<string>;

  // ============================================
  // Capacity Methods
  // ============================================

  /**
   * Calculate total weight of unequipped items.
   * Equipped items don't count toward weight limit.
   * @returns Total weight of unequipped items
   * @example
   * const weight = inventory.getTotalWeight();
   * console.log(`Carrying ${weight} units of weight`);
   */
  getTotalWeight(): number;

  /**
   * Get all equipped items in the inventory.
   * @returns Array of equipped items
   */
  getEquippedItems(): Item[];

  /**
   * Get all unequipped items (items that occupy inventory slots).
   * @returns Array of unequipped items
   */
  getUnequippedItems(): Item[];

  /**
   * Get the number of available inventory slots.
   * @returns Number of available slots, or null if unlimited
   * @example
   * const available = inventory.getAvailableSlots();
   * if (available === null) {
   *   console.log('Unlimited inventory');
   * } else {
   *   console.log(`${available} slots free`);
   * }
   */
  getAvailableSlots(): number | null;

  /**
   * Get the available weight capacity.
   * @returns Available weight, or null if unlimited
   */
  getAvailableWeight(): number | null;

  /**
   * Check if inventory is overflowing (more unequipped items than maxSize).
   * @returns true if overflowing
   */
  isOverflowing(): boolean;

  /**
   * Check if inventory is overweight (total weight exceeds maxWeight).
   * @returns true if overweight
   */
  isOverweight(): boolean;

  // ============================================
  // Item Management Methods
  // ============================================

  /**
   * Add items to inventory with intelligent stacking.
   * Automatically fills existing stacks before creating new ones.
   * @param item - Item to add (used as template for new items)
   * @param quantity - How many to add (defaults to item.quantity if not provided)
   * @param skipValidation - Skip inventory space/weight validation (for currency payments, etc.)
   * @returns Array of items created or modified
   * @throws Error if inventory is full and cannot accommodate the items
   * @example
   * // Add a single item
   * inventory.addItem(sword);
   *
   * // Add multiple stackable items
   * inventory.addItem(potion, 5);
   *
   * // Add without validation (e.g., for currency rewards)
   * inventory.addItem(goldCoin, 100, true);
   */
  addItem(item: Item, quantity?: number, skipValidation?: boolean): Item[];

  /**
   * Deep clone an item with a new UID.
   * The cloned item will not be equipped.
   * @param item - Item to clone
   * @returns A new Item instance with unique UID
   */
  cloneItem(item: Item): Item;

  /**
   * Remove an item from the inventory.
   * @param item - The item instance to remove
   */
  removeItem(item: Item): void;

  /**
   * Get the first item matching the given template ID.
   * @param id - Item template ID
   * @returns The first matching item or null
   */
  getFirstItemById(id: string): Item | null;

  /**
   * Get all items matching the given template ID.
   * @param id - Item template ID
   * @returns Array of matching items
   * @example
   * const potions = inventory.getItemsById('health_potion');
   * console.log(`You have ${potions.length} health potion stacks`);
   */
  getItemsById(id: string): Item[];

  /**
   * Get an item by its unique instance ID (UID).
   * If uid is not provided, uses the 'active_item' state.
   * @param uid - The item's unique instance ID
   * @returns The item or null if not found
   */
  getItemByUid(uid: string): Item | null;

  /**
   * Get all items that have a specific trait defined.
   * @param trait - The trait key to search for
   * @returns Array of items with the trait
   * @example
   * const weapons = inventory.getItemsByTrait('damage');
   */
  getItemsByTrait(trait: string): Item[];

  // ============================================
  // Equipment Methods
  // ============================================

  /**
   * Equip an item to a slot.
   * Unequips any existing item in the slot first.
   * Triggers item_equip_before and item_equip_after events.
   * @param slot - The equipment slot
   * @param item - The item to equip
   * @param character - The character to equip on
   * @returns true if equip succeeded, false if cancelled by event
   */
  equipSlot(slot: ItemSlot, item: Item, character: Character): boolean;

  /**
   * Unequip an item from a slot.
   * Triggers item_unequip_before and item_unequip_after events.
   * @param slot - The equipment slot
   * @param character - The character to unequip from
   * @returns true if unequip succeeded, false if cancelled by event
   */
  unequipSlot(slot: ItemSlot, character: Character): boolean;

  // ============================================
  // Transfer Methods
  // ============================================

  /**
   * Transfer items from this inventory to another.
   * Validates source has the item and target has capacity.
   * Triggers inventory_transfer event.
   * @param target - Target inventory
   * @param item - Item to transfer
   * @param quantity - Quantity to transfer
   * @param silentFail - If true, suppress error notifications (for batch operations)
   * @returns true if successful, false otherwise
   * @example
   * const success = playerInventory.transferTo(chestInventory, sword, 1);
   */
  transferTo(target: Inventory, item: Item, quantity: number, silentFail?: boolean): boolean;

  // ============================================
  // Currency Methods
  // ============================================

  /**
   * Check if this inventory can afford an item's price.
   * @param item - Item to check (must have price defined)
   * @returns true if affordable, false otherwise
   * @example
   * if (playerInventory.canAfford(shopItem)) {
   *   // Show buy button
   * }
   */
  canAfford(item: Item): boolean;

  /**
   * Get the total amount of a specific currency in this inventory.
   * Only counts unequipped currency items.
   * @param currencyId - The currency item template ID
   * @returns Total quantity of unequipped currency items
   * @example
   * const goldAmount = inventory.getCurrencyAmount('gold');
   */
  getCurrencyAmount(currencyId: string): number;

  /**
   * Check if this inventory can afford a specific price.
   * @param price - Price object mapping currency IDs to amounts
   * @returns true if affordable, false otherwise
   * @example
   * if (inventory.canAffordPrice({ gold: 100, gems: 5 })) {
   *   // Player has enough currency
   * }
   */
  canAffordPrice(price: Record<string, number>): boolean;

  /**
   * Deduct currency from this inventory.
   * Shows notification if not enough currency.
   * @param price - Currency requirements { currency_id: amount }
   * @returns true if successful, false if not enough currency
   * @example
   * const paid = inventory.deductCurrency({ gold: 100 });
   * if (paid) {
   *   console.log('Payment successful');
   * }
   */
  deductCurrency(price: Record<string, number>): boolean;

  /**
   * Get all currencies in this inventory.
   * @returns Record of currency_id to total_quantity
   * @example
   * const currencies = inventory.getCurrencies();
   * // { gold: 150, gems: 20 }
   */
  getCurrencies(): Record<string, number>;

  // ============================================
  // Crafting Methods
  // ============================================

  /**
   * Apply the inventory's interactive action or craft.
   * If interactive is set, executes that action.
   * Otherwise, attempts to craft using available recipes.
   * Triggers inventory_apply event.
   */
  apply(): void;

  /**
   * Attempt to craft using a recipe.
   * Uses selectedRecipeId if no recipe specified.
   * Checks for learned recipes, ingredients, and output space.
   * @param selectedRecipeId - Optional specific recipe to craft
   * @returns true if crafting succeeded, false otherwise
   * @example
   * inventory.selectedRecipeId = 'iron_sword_recipe';
   * inventory.craft();
   */
  craft(selectedRecipeId?: string): boolean;
}

/**
 * Status - A status effect or buff/debuff applied to a character.
 * Statuses can modify stats, traits, attributes, skin layers, and abilities.
 * Supports stacking and expiration mechanics.
 *
 * @example
 * // Create and add a status to a character
 * const poisonStatus = new Status();
 * poisonStatus.id = 'poison';
 * poisonStatus.stats = { health: -5 };
 * poisonStatus.maxStacks = 3;
 * character.addStatus(poisonStatus);
 *
 * @example
 * // Check and modify stacks
 * const status = character.getStatus('poison');
 * if (status.isStackable()) {
 *   status.addStacks(1);
 * }
 */
interface Status {
  /** Unique identifier for this status instance */
  id: string;

  /**
   * Maximum stack count for this status.
   * 1 = non-stackable, -1 = unlimited stacks
   */
  maxStacks: number;

  /** Current stack count (for stackable statuses) */
  currentStacks: number;

  /** Whether this status is hidden from the UI */
  isHidden: boolean;

  /**
   * When this status should expire.
   * 'none' = never expires, 'exploration' = expires on exploration, 'combat' = expires after combat
   */
  expirationTrigger: 'none' | 'exploration' | 'combat';

  /**
   * Duration of the status effect.
   * -1 means permanent (no expiration).
   */
  duration: number;

  /** Stats provided by this status (e.g., { health: 10, strength: 5 }) */
  stats: Record<string, number>;

  /** Traits provided by this status */
  traits: Record<string, any>;

  /** Attributes provided by this status */
  attributes: Record<string, string>;

  /** Skin layers added by this status */
  skinLayers: Set<string>;

  /** Abilities granted by this status */
  abilities: Set<string>;

  /** Modifiers applied to abilities from this status */
  abilityModifiers: any[];

  // ============================================
  // Setup Methods
  // ============================================

  /**
   * Set values from a status object (from template or schema).
   * Populates traits, attributes, skinLayers, abilities, stats, and abilityModifiers.
   * @param obj - Status object with properties to apply
   * @example
   * status.setValues({
   *   stats: { strength: 10 },
   *   traits: { name: 'Power Buff' },
   *   abilities: ['power_strike']
   * });
   */
  setValues(obj: any): void;

  // ============================================
  // Stack Methods
  // ============================================

  /**
   * Check if this status is stackable.
   * @returns true if maxStacks > 1 or maxStacks === -1 (unlimited)
   * @example
   * if (status.isStackable()) {
   *   console.log('This status can stack');
   * }
   */
  isStackable(): boolean;

  /**
   * Add stacks to this status.
   * Will not exceed maxStacks unless unlimited (-1).
   * @param amount - Number of stacks to add (default: 1)
   * @returns true if all stacks were added, false if capped at max
   * @example
   * status.addStacks(2); // Add 2 stacks
   */
  addStacks(amount?: number): boolean;

  // ============================================
  // Stat Methods
  // ============================================

  /**
   * Add a stat value to this status.
   * @param name - The stat name
   * @param value - The value to add
   * @throws Error if stat doesn't exist in schema
   * @example
   * status.addStat('strength', 5);
   */
  addStat(name: string, value: number): void;

  /**
   * Set computed stats key for dynamic stat calculation.
   * @param key - The stat computer key (registered via game.registerStatComputer)
   * @throws Error if stat computer is not registered
   * @example
   * status.setComputedStats('level_scaling');
   */
  setComputedStats(key: string): void;
}

/**
 * ItemSlot - An equipment slot on a character where items can be equipped.
 */
interface ItemSlot {
  /** Unique identifier for this slot instance */
  id: string;

  /** The slot type ID (from item_slots schema) */
  slotId: string;

  /** X position for UI rendering */
  x: number;

  /** Y position for UI rendering */
  y: number;

  /** UID of the currently equipped item (empty string if none) */
  itemUid: string;

  /**
   * Get the slot type definition object.
   * @returns The slot type object from schema
   */
  getSlotObject(): any;
}

/**
 * Choice - A selectable option in the game (dialogue choices, action buttons, etc.).
 * Choices have visibility/availability conditions and execute actions when selected.
 *
 * @example
 * // Create and execute a choice
 * const choice = game.createCustomChoice({
 *   id: 'buy_item',
 *   name: 'Buy Sword (100 gold)',
 *   params: { if: '_gold >= 100', deduct_gold: 100, add_item: 'sword' }
 * });
 *
 * if (choice.isChoiceAvailable()) {
 *   choice.do();
 * }
 */
interface Choice {
  /** Unique identifier for this choice */
  id: string;

  /** Display name of the choice */
  name: string;

  /** Action parameters to execute when choice is selected */
  params: Record<string, any>;

  /** Reactive computed property for visibility (based on 'if' condition) */
  isVisible: { value: boolean };

  /** Reactive computed property for availability (based on 'active' condition) */
  isAvailable: { value: boolean };

  /** Reactive computed property for the display name */
  nameComputed: { value: string };

  /**
   * Check if the choice is currently available (active condition passes).
   * @returns true if the choice can be selected
   * @example
   * if (choice.isChoiceAvailable()) {
   *   // Enable the choice button
   * }
   */
  isChoiceAvailable(): boolean;

  /**
   * Execute the choice's actions.
   * Will not execute if the choice is not available.
   * Records the choice as visited and adds to dialogue log if named.
   * @example
   * choice.do(); // Execute the choice
   */
  do(): void;

  /**
   * Set the action parameters for this choice.
   * @param params - Action parameters object
   * @example
   * choice.setParams({ heal: 10, next_scene: 'victory' });
   */
  setParams(params: Record<string, any> | undefined): void;
}

// ============================================
// Global Window Interface
// ============================================

declare global {
  interface Window {
    engine: {
      game: Game;
      vue: typeof VueTypes;
      primeVue: any; // PrimeVue types are used in the templates, so keep them as any.
      vueUse: typeof VueUseTypes;
      floatingUi: typeof FloatingUiTypes;
      gsap: typeof GsapTypes;
      fastCopy: typeof FastCopyTypes;
      /** Reusable Vue components for custom scripts */
      components: {
        /** Character face/portrait component. Props: character (Character) */
        CharacterFace: any;
        /** Full character doll with skin layers. Props: character (Character), width?, height?, showFace? */
        CharacterDoll: any;
        /** Background asset component for rendering images/videos/spine with transitions. Props: asset (Asset) */
        BackgroundAsset: any;
        /** Renders all components registered to a slot. Props: slot (string). Use to create custom extensible UI areas. */
        CustomComponentContainer: any;
      };
    };
  }
}

export { };
