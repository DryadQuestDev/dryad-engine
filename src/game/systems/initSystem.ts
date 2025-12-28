import { Game } from '../game';
import { Global } from '../../global/global';
import { gameLogger } from '../utils/logger';
import { Character } from '../core/character/character';
import { AssetObject } from '../../schemas/assetSchema';
import { CharacterSceneSlotObject } from '../../schemas/characterSceneSlotSchema';
import { Status } from '../core/character/status';
import { computed, reactive } from 'vue';

// Import Vue components for registration
import ExplorationComponent from '../views/states/exploration/Exploration.vue';
import BattleComponent from '../views/states/battle/Battle.vue';
import QuestsTab from '../views/progression/QuestsTab.vue';
import CharacterSheet from '../views/progression/CharacterSheet.vue';
import CharacterStats from '../views/progression/CharacterStats.vue';
import InventoryComponent from '../views/progression/InventoryComponent.vue';
import InventoryHeader from '../views/progression/InventoryHeader.vue';
import GalleryTab from '../views/progression/GalleryTab.vue';
import SkillTree from '../views/progression/SkillTree.vue';
import DebugOptions from '../views/debug_containers/DebugOptions.vue';
import DebugDungeons from '../views/debug_containers/DebugDungeons.vue';
import DebugCharacters from '../views/debug_containers/DebugCharacters.vue';
import DebugChoices from '../views/debug_containers/DebugChoices.vue';
import DebugRegistry from '../views/debug_containers/DebugRegistry.vue';
import DebugInventories from '../views/debug_containers/DebugInventories.vue';
import DebugStores from '../views/debug_containers/DebugStores.vue';
import DebugProperties from '../views/debug_containers/DebugProperties.vue';
import OverlayNavigation from '../views/overlays/OverlayNavigation.vue';
import OverlayExchange from '../views/overlays/OverlayExchange.vue';
import BackComponent from '../views/navigation-toolbar/Back.vue';
import EncounterNavComponent from '../views/navigation-toolbar/EncounterNav.vue';
import ToggleCirclesComponent from '../views/navigation-toolbar/ToggleCircles.vue';
import ZoomControlsComponent from '../views/navigation-toolbar/ZoomControls.vue';
import CenterRoomComponent from '../views/navigation-toolbar/CenterRoom.vue';
import MinimizeToolbarComponent from '../views/navigation-toolbar/MinimizeToolbar.vue';
import LogsButtonComponent from '../views/navigation-toolbar/LogsButton.vue';
import CharacterListComponent from '../views/ui-container/CharacterList.vue';
import { PARTY_INVENTORY_ID } from './itemSystem';
import { Item } from '../core/character/item';
import { Dungeon } from '../core/dungeon/dungeon';
import { Inventory } from '../core/character/inventory';
import { Choice } from '../core/content/choice';

// ============================================
// CORE EMITTER SIGNATURES
// ============================================

// Single source of truth for core emitter names and their signatures.
// EmitterMap type and registration logic will be derived from this.
// Callbacks can return boolean | void. Returning false stops propagation.
export const CORE_EMITTER_SIGNATURES = {
    "game_initiated": (): boolean | void => { },
    "game_save": (saveName: string): boolean | void => { },
    "html_mount": (): boolean | void => { },
    "state_change": (stateId: string, newValue: any, oldValue: any): boolean | void => { },
    "dungeon_create": (dungeon: Dungeon): boolean | void => { }, // will be triggered when a dungeon is created, including on loading a save file(because dungeons are not serialized).
    "dungeon_enter": (dungeonId: string, roomId: string): boolean | void => { },
    "room_enter_before": (roomId: string): boolean | void => { },
    "room_enter_after": (roomId: string): boolean | void => { },
    "scene_play_before": (sceneId: string, dungeonId: string, isRootScene: boolean): boolean | void => { },
    "scene_play_after": (sceneId: string, dungeonId: string, isRootScene: boolean): boolean | void => { },
    "event_end": (): boolean | void => { },

    "character_create": (character: Character): boolean | void => { },
    "character_resource_change": (character: Character, statId: string, oldValue: number, newValue: number): boolean | void => { },
    //"character_update": (character: Character): boolean | void => { },
    "character_delete": (character: Character): boolean | void => { },
    "character_join_party": (character: Character): boolean | void => { },
    "character_leave_party": (character: Character): boolean | void => { },

    // triggered when the character's render layers are built
    // listeners can reassign character.renderedLayers to filter layers
    "character_render": (character: Character): boolean | void => { },
    "asset_render": (asset: AssetObject): boolean | void => { },

    "item_create": (item: Item): boolean | void => { },
    //"item_destroy": (item: Item): boolean | void => { },
    "item_equip_before": (item: Item, character: Character): boolean | void => { },
    "item_equip_after": (item: Item, character: Character): boolean | void => { },
    "item_unequip_before": (item: Item, character: Character): boolean | void => { },
    "item_unequip_after": (item: Item, character: Character): boolean | void => { },
    //"item_use_before": (item: Item, character: Character): boolean | void => { },
    //"item_use_after": (item: Item, character: Character): boolean | void => { },
    // "item_pickup": (item: Item, character: Character): boolean | void => { },
    "inventory_open": (inventory: Inventory): boolean | void => { },
    "inventory_close": (inventory: Inventory): boolean | void => { },
    "inventory_apply": (inventory: Inventory): boolean | void => { },
    "inventory_transfer": (inventory: Inventory, targetInventory: Inventory, item: Item, quantity: number, isTrade: boolean): boolean | void => { },
    "trade_init": (traderInventory: Inventory, item: Item): boolean | void => { }, // runs over each item in the exchange inventory after it is opened OR the trade is opened
    "recipe_learned": (recipeId: string): boolean | void => { }, // triggered when a recipe is learned
    "skill_learned": (skillTreeId: string, skillId: string, level: number): boolean | void => { }, // triggered when a skill is learned
    "skill_unlearned": (skillTreeId: string, skillId: string): boolean | void => { }, // triggered when a skill is unlearned
};

/**
 * InitSystem - Centralized registration system for all game components, actions, states, etc.
 *
 * It provides a single entry point for initializing all game registrations.
 */
export class InitSystem {
    private game: Game;

    constructor(game: Game) {
        this.game = game;
    }

    /**
     * Main initialization method - registers everything in the correct order
     */
    public init(): void {
        this.registerStates();
        this.registerEmitters();
        this.registerComponents();
        this.registerConditions();
        this.registerPlaceholders();
        this.registerActions();
        this.registerStatComputers();
    }

    // ============================================
    // GAME STATE INITIALIZATION
    // ============================================

    /**
     * Initialize a new game state.
     * Sets up starting dungeon, auto-creates characters, and initializes UI state.
     */
    public initNewGameState() {
        const coreSystem = this.game.coreSystem;

        if (coreSystem.mergedManifest.starting_state == 'custom') {
            coreSystem.setGameState(coreSystem.gameManifest.starting_custom_state!);
        } else {
            coreSystem.setGameState(coreSystem.gameManifest.starting_state!);
        }
        //coreSystem.stateLoading.value = false;

        this.game.dungeonSystem.enterDungeon(
            coreSystem.mergedManifest.starting_dungeon_id!,
            coreSystem.mergedManifest.starting_dungeon_room_id!
        );

        // add default characters to party. Moved to global.createDefaultEntities()
        /*
        for (let characterObject of this.game.characterSystem.templatesMap.values()) {
            if (characterObject.auto_create) {
                let character = this.game.characterSystem.characters.value.get(characterObject.id);
                if (character) {
                    this.game.logicSystem.resolveActions({
                        updateCharacter: {
                            id: character.id,
                            party: characterObject.add_to_party
                        }
                    });
                }
            }
        }
            */

        // Initialize selected character to first party member if not already set
        this.initializeSelectedCharacter();
    }

    /**
     * Initialize selected_character to the first party member if not already set.
     */
    public initializeSelectedCharacter(): void {
        const currentSelectedId = this.game.coreSystem.getState<string | null>('selected_character');
        if (!currentSelectedId && this.game.characterSystem.party.value.length > 0) {
            const firstPartyMember = this.game.characterSystem.party.value[0];
            if (firstPartyMember) {
                this.game.coreSystem.setState('selected_character', firstPartyMember.id);
            }
        }
    }

    // ============================================
    // STATE REGISTRATIONS
    // ============================================

    /**
     * Register all core UI states
     */
    private registerStates(): void {
        this.game.registerState('disable_ui', false);
        this.game.registerState('block_party_inventory', false);
        this.game.registerState('show_character_list', true);
        this.game.registerState('progression_state', null);
        this.game.registerState('progression_sub_state', null);
        this.game.registerState('gallery_tab', 'characters');
        this.game.registerState('game_state', '');
        this.game.registerState('map_zoom_factor', 1);
        this.game.registerState('is_show_completed_quests', false);
        this.game.registerState('selected_character', null);
        this.game.registerState('active_character', null);
        this.game.registerState('active_inventory', null);
        this.game.registerState('active_item', null);
        this.game.registerState('popup_state', null);
        this.game.registerState('overlay_state', 'overlay-navigation');

        this.game.registerState('supress_game_events', false);
        this.game.registerState('disable_saves', false);
        this.game.registerState('replay_mode', false);
        this.game.registerState('replay_mode_unlock_choices', false);

        this.game.registerState('max_log', 40);
    }

    // ============================================
    // EMITTER REGISTRATIONS
    // ============================================

    /**
     * Register all core event emitters
     */
    private registerEmitters(): void {
        const coreEmitters = Object.keys(CORE_EMITTER_SIGNATURES) as string[];
        for (const emitterName of coreEmitters) {
            this.game.coreSystem.registerEmitter(emitterName as any);
        }
    }

    // ============================================
    // COMPONENT REGISTRATIONS
    // ============================================

    /**
     * Register all Vue components into their respective slots
     */
    private registerComponents(): void {
        this.registerStateComponents();
        this.registerOverlayComponents();
        this.registerProgressionComponents();
        this.registerCharacterTabComponents();
        this.registerDebugComponents();
        this.registerToolbarComponents();
        this.registerUiContainerComponents();
    }

    /**
     * Register state components
     */
    private registerStateComponents(): void {
        this.game.coreSystem.addComponent({
            id: 'exploration',
            slot: 'game_state',
            component: ExplorationComponent
        });
        /*
        this.game.coreSystem.addComponent({
            id: 'battle_debug',
            slot: 'game_state',
            component: BattleComponent
        });
        */
    }

    /**
     * Register overlay components
     */
    private registerOverlayComponents(): void {
        this.game.coreSystem.addComponent({
            id: 'overlay-navigation',
            slot: 'overlay',
            component: OverlayNavigation
        });

        this.game.coreSystem.addComponent({
            id: 'overlay-exchange',
            slot: 'overlay',
            component: OverlayExchange
        });
    }

    /**
     * Register progression tab components
     */
    private registerProgressionComponents(): void {
        this.game.coreSystem.addComponent({
            id: 'quests',
            slot: 'progression-tabs',
            title: 'Quests',
            component: QuestsTab,
        });

        this.game.coreSystem.addComponent({
            id: 'character',
            slot: 'progression-tabs',
            title: 'Characters',
            component: CharacterSheet
        });

        this.game.coreSystem.addComponent({
            id: 'gallery',
            slot: 'progression-tabs',
            title: 'Gallery',
            component: GalleryTab,
        });
    }

    /**
     * Register character tab components (sub-tabs within character sheet)
     */
    private registerCharacterTabComponents(): void {
        this.game.coreSystem.addComponent({
            id: 'stats',
            slot: 'character-tabs',
            title: 'Character Sheet',
            component: CharacterStats
        });

        this.game.coreSystem.addComponent({
            id: 'skill-trees',
            slot: 'character-tabs',
            title: 'Skills',
            component: SkillTree,
            order: 3
        });

        this.game.coreSystem.addComponent({
            id: 'inventory',
            slot: 'character-tabs',
            title: 'Inventory',
            component: InventoryComponent,
            props: {
                inventory_id: PARTY_INVENTORY_ID
            }
        });

        this.game.coreSystem.addComponent({
            id: 'default-inventory-header',
            slot: 'inventory-header',
            component: InventoryHeader,
            props: {
                inventory_id: PARTY_INVENTORY_ID
            }
        });
    }

    /**
     * Register debug tab components
     */
    private registerDebugComponents(): void {
        this.game.coreSystem.addComponent({
            id: 'debug-options',
            slot: 'debug-tabs',
            title: 'Options',
            component: DebugOptions,
            order: 1
        });

        this.game.coreSystem.addComponent({
            id: 'debug-dungeons',
            slot: 'debug-tabs',
            title: 'Dungeons',
            component: DebugDungeons,
            order: 2
        });

        this.game.coreSystem.addComponent({
            id: 'debug-characters',
            slot: 'debug-tabs',
            title: 'Characters',
            component: DebugCharacters,
            order: 3
        });

        this.game.coreSystem.addComponent({
            id: 'debug-choices',
            slot: 'debug-tabs',
            title: 'Debug Choices',
            component: DebugChoices,
            order: 4
        });

        this.game.coreSystem.addComponent({
            id: 'debug-registry',
            slot: 'debug-tabs',
            title: 'Registry',
            component: DebugRegistry,
            order: 5
        });

        this.game.coreSystem.addComponent({
            id: 'debug-inventories',
            slot: 'debug-tabs',
            title: 'Inventories',
            component: DebugInventories,
            order: 6
        });

        this.game.coreSystem.addComponent({
            id: 'debug-stores',
            slot: 'debug-tabs',
            title: 'Stores',
            component: DebugStores,
            order: 7
        });

        this.game.coreSystem.addComponent({
            id: 'debug-properties',
            slot: 'debug-tabs',
            title: 'Properties',
            component: DebugProperties,
            order: 8
        });
    }

    /**
     * Register navigation toolbar components
     */
    private registerToolbarComponents(): void {
        this.game.coreSystem.addComponent({
            id: 'toolbar-back',
            slot: 'navigation-toolbar',
            component: BackComponent,
            order: 1
        });

        this.game.coreSystem.addComponent({
            id: 'toolbar-encounter-nav',
            slot: 'navigation-toolbar',
            component: EncounterNavComponent,
            order: 2
        });

        this.game.coreSystem.addComponent({
            id: 'toolbar-toggle-circles',
            slot: 'navigation-toolbar',
            component: ToggleCirclesComponent,
            order: 3
        });

        this.game.coreSystem.addComponent({
            id: 'toolbar-zoom-controls',
            slot: 'navigation-toolbar',
            component: ZoomControlsComponent,
            order: 4
        });

        this.game.coreSystem.addComponent({
            id: 'toolbar-center-room',
            slot: 'navigation-toolbar',
            component: CenterRoomComponent,
            order: 5
        });

        this.game.coreSystem.addComponent({
            id: 'toolbar-logs',
            slot: 'navigation-toolbar',
            component: LogsButtonComponent,
            order: 6
        });

        this.game.coreSystem.addComponent({
            id: 'toolbar-minimize',
            slot: 'navigation-toolbar',
            component: MinimizeToolbarComponent,
            order: 7
        });
    }

    /**
     * Register ui-container components
     */
    private registerUiContainerComponents(): void {
        this.game.coreSystem.addComponent({
            id: 'character-list',
            slot: 'ui-container',
            component: CharacterListComponent,
            order: 1
        });
    }

    // ============================================
    // CONDITION REGISTRATIONS
    // ============================================

    /**
     * Register all conditional checks
     * Note: Conditions now return values (not booleans). The system handles comparison.
     * Examples:
     *   _room_visited(dungeon1.room5) = true     → returns boolean (true/false)
     *   _room_visited(room5) = true              → uses current dungeon
     *   _selected_character = alice              → returns character ID ("alice", "bob", etc.)
     *   _item_on(alice, sword) = true            → returns boolean
     *   _char(alice.attribute.sex) = female      → returns attribute value
     */
    private registerConditions(): void {
        // Returns a property's current value (supports nested paths for object properties)
        // Usage: _property(gold) > 100
        //        _property(isDebugMode) = true
        //        _property(settings.volume) > 50
        //        _property(data.user.name) = Alice
        this.game.registerCondition("_property", (path: string) => {
            const parts = path.split('.');
            const propertyId = parts[0];
            const property = this.game.coreSystem.properties.value.get(propertyId);
            if (!property) {
                gameLogger.error(`[_property] Property "${propertyId}" not found`);
                return undefined;
            }

            // If nested path, use utility to traverse
            if (parts.length > 1) {
                const nestedPath = parts.slice(1).join('.');
                return this.game.logicSystem.getNestedValue(property.currentValue, nestedPath);
            }

            return property.currentValue;
        });

        // Returns boolean: whether a room has been visited
        // Usage: _room_visited(dungeon1.room5) = true (explicit dungeon)
        //        _room_visited(room5) = true (uses current dungeon)
        this.game.registerCondition("_room_visited", (param: string) => {
            let dungeonId: string;
            let roomId: string;

            // Parse parameter: "dungeon1.room5" or just "room5"
            if (param.includes('.')) {
                const parts = param.split('.');
                dungeonId = parts[0];
                roomId = parts[1];
            } else {
                // No dungeon specified, use current dungeon
                roomId = param;
                dungeonId = this.game.dungeonSystem.currentDungeonId.value!;
            }

            //console.log("[_location_visited]", dungeonId, roomId);

            let dungeonData = this.game.dungeonSystem.dungeonDatas.value.get(dungeonId);
            if (!dungeonData) {
                throw new Error(`[_room_visited]: Dungeon data for ${dungeonId} not found`);
            }
            return dungeonData.isRoomVisited(roomId);
        });

        // Returns boolean: whether a scene is active
        // Usage: _scene = true  or  _scene() = true
        this.game.registerCondition("_scene", () => {
            return !!this.game.dungeonSystem.currentSceneId.value;
        });

        // Returns the currently selected character ID
        // Usage: _selected_character = alice  or  _selected_character() = alice
        this.game.registerCondition("_selected_character", () => {
            return this.game.getState('selected_character');
        });


        // Returns boolean: whether a character has an item equipped
        // Usage: _item_on(alice, sword) = true
        this.game.registerCondition("_item_on", (characterId: string, itemId: string) => {
            let character = this.game.getCharacter(characterId);
            if (!character) {
                gameLogger.error(`character not found for condition _item_on: ${characterId}`);
                return false;
            }
            let equippedItems = character.getEquippedItems();
            return equippedItems.some(item => item.id === itemId);
        });


        // Returns a character property value by path
        // Usage: _char(alice.attribute.sex) = female
        //        _char(alice.trait.name) = Alice
        //        _char(alice.stat.strength) > 10
        //        _char(alice.resource.health) >= 50
        //        _char(alice.skinStyle.hat) = class1
        this.game.registerCondition("_char", (path: string) => {
            // Path format: "characterId.type.key"
            const parts = path.split('.');
            if (parts.length !== 3) {
                gameLogger.error(`[_char] Invalid path format: "${path}". Expected "charId.type.key"`);
                return undefined;
            }

            const [charId, type, key] = parts;
            const character = this.game.characterSystem.getCharacter(charId);
            if (!character) {
                gameLogger.error(`[_char] Character "${charId}" not found`);
                return undefined;
            }

            try {
                switch (type) {
                    case 'trait':
                        return character.getTrait(key);

                    case 'attribute':
                        return character.getAttribute(key);

                    case 'stat': {
                        return character.getStat(key).value;
                    }

                    case 'resource':
                        return character.getResource(key);

                    case 'skinStyle': {
                        const styles = character.skinLayerStyles.get(key) || [];
                        // Return as string for single value, or array for multiple
                        return styles.length === 1 ? styles[0] : styles;
                    }

                    default:
                        gameLogger.error(`[_char] Unknown type "${type}". Valid types: trait, attribute, stat, resource, skinStyle`);
                        return undefined;
                }
            } catch (error) {
                gameLogger.error(`[_char] Error getting ${type}.${key} for character "${charId}": ${error}`);
                return undefined;
            }
        });

        // Returns the learned level of a skill (0 if not learned)
        // Usage: _skill(alice.fire_magic.fireball) > 0  (check if learned)
        //        _skill(fire_magic.fireball) >= 3       (uses selected character, check level)
        this.game.registerCondition("_skill", (path: string) => {
            const parts = path.split(".");

            let characterId: string;
            let treeId: string;
            let slotId: string;

            if (parts.length === 2) {
                // Format: "treeId.slotId" - use selected character
                characterId = this.game.getState('selected_character');
                if (!characterId) {
                    gameLogger.error(`[_skill] No selected character for path: "${path}"`);
                    return 0;
                }
                treeId = parts[0];
                slotId = parts[1];
            } else if (parts.length === 3) {
                // Format: "characterId.treeId.slotId"
                characterId = parts[0];
                treeId = parts[1];
                slotId = parts[2];
            } else {
                gameLogger.error(`[_skill] Invalid path format: "${path}". Use "treeId.slotId" or "characterId.treeId.slotId"`);
                return 0;
            }

            const character = this.game.getCharacter(characterId);
            if (!character) {
                gameLogger.error(`[_skill] Character "${characterId}" not found`);
                return 0;
            }

            const learned = character.learnedSkills.find(
                s => s.skillTreeId === treeId && s.id === slotId
            );
            return learned?.level || 0;
        });

    }



    // ============================================
    // PLACEHOLDER REGISTRATIONS
    // ============================================

    /**
     * Register all text placeholders
     * Usage in text: |placeholderName(arg1, arg2)|
     * Examples:
     *   |flag(myFlag)|           → returns flag value
     *   |item(itemUid, invId)|   → returns item name
     */
    private registerPlaceholders(): void {
        // Usage: |flag(flagName)|
        this.game.registerPlaceholder("flag", (flagName: string) => {
            let flag = this.game.dungeonSystem.getFlag(flagName);
            return flag;
        });

        // Usage: |item(itemUid, inventoryId)|
        this.game.registerPlaceholder("item", (itemUid: string, inventoryId: string) => {
            let inventory = this.game.itemSystem.getInventory(inventoryId);
            let item = inventory?.getItemByUid(itemUid);
            return item?.getName() || "";
        });

        // Usage: |property(propertyId)| or |property(propertyId.nested.path)|
        this.game.registerPlaceholder("property", (path: string) => {
            const parts = path.split('.');
            const propertyId = parts[0];
            const property = this.game.coreSystem.properties.value.get(propertyId);
            if (!property) {
                gameLogger.error(`[property placeholder] Property "${propertyId}" not found`);
                return "";
            }

            // If nested path, use utility to traverse
            let value: any = property.currentValue;
            if (parts.length > 1) {
                const nestedPath = parts.slice(1).join('.');
                value = this.game.logicSystem.getNestedValue(value, nestedPath);
            }

            if (value === undefined || value === null) return "";
            if (typeof value === 'object') return JSON.stringify(value);
            return String(value);
        });
    }

    // ============================================
    // ACTION REGISTRATIONS
    // ============================================

    /**
     * Register all game actions from all systems
     */
    private registerActions(): void {
        this.registerCoreActions();
        this.registerDungeonActions();
        this.registerCharacterActions();
        this.registerItemActions();
    }

    /**
     * Register core system actions
     */
    private registerCoreActions(): void {
        this.game.registerAction("notification", {
            action: (text: string) => {
                Global.getInstance().addNotification(text);
                gameLogger.info(`[notification] Displayed notification: "${text}"`);
            }
        });

        this.game.registerAction("flash", {
            action: (text: string) => {
                this.game.dungeonSystem.addFlash(text);
            }
        });
        /*
                this.game.registerAction("test", {
                    action: (text: string) => {
                        gameLogger.info("#####Hello, ", text);
                    }
                });
        
                this.game.registerAction("testModifier", {
                    action: (text: string) => {
                        Global.getInstance().addNotification(text);
                        gameLogger.info(`[testModifier] Executed test modifier with text: "${text}"`);
                    },
                    choiceModifier: (choice: Choice, text: string) => {
                        choice.nameComputed = computed(() => choice.name + " " + text + Game.getInstance().dungeonSystem.getFlag(text));
                        // choice.isVisible = computed(() => Game.getInstance().dungeonSystem.getFlag(text) > 0);
                    }
                });
        */
        // Modify property values
        // String format: "propId=value" (set), "propId>value" (add), "propId<value" (subtract)
        // Object format: { propertyId: value } or { propertyId: { op: "add", value: 10 } }
        this.game.registerAction("property", {
            action: (data: string | Record<string, any>) => {
                const modifiedProps: string[] = [];

                if (typeof data === 'string') {
                    // Parse string format: "propId=value, propId2>10"
                    const parts = data.split(',').map(s => s.trim());
                    for (const part of parts) {
                        // Match: propertyId followed by operator (=, >, <) and value
                        const match = part.match(/^([^=><]+)([=><])(.+)$/);
                        if (!match) {
                            gameLogger.error(`[property] Invalid format: "${part}". Use "propId=value", "propId>value", or "propId<value"`);
                            continue;
                        }

                        const [, propId, op, rawValue] = match;
                        const property = this.game.coreSystem.properties.value.get(propId.trim());
                        if (!property) {
                            gameLogger.error(`[property] Property "${propId}" not found`);
                            continue;
                        }

                        // Parse value based on property type
                        let value: any = rawValue.trim();
                        if (property.type === 'number') {
                            value = Number(value);
                            if (isNaN(value)) {
                                gameLogger.error(`[property] Invalid number value for "${propId}": ${rawValue}`);
                                continue;
                            }
                        } else if (property.type === 'boolean') {
                            value = value === 'true';
                        }

                        // Apply operation
                        if (op === '=') {
                            property.currentValue = value;
                            modifiedProps.push(`${propId}=${value}`);
                        } else if (op === '>' && property.type === 'number') {
                            property.addCurrentValue(value);
                            modifiedProps.push(`${propId}+=${value}`);
                        } else if (op === '<' && property.type === 'number') {
                            property.addCurrentValue(-value);
                            modifiedProps.push(`${propId}-=${value}`);
                        } else {
                            gameLogger.error(`[property] Operator "${op}" not supported for type "${property.type}"`);
                        }
                    }
                } else {
                    // Object format: { propertyId: value }
                    for (const [propId, value] of Object.entries(data)) {
                        const property = this.game.coreSystem.properties.value.get(propId);
                        if (!property) {
                            gameLogger.error(`[property] Property "${propId}" not found`);
                            continue;
                        }
                        property.currentValue = value;
                        modifiedProps.push(`${propId}=${JSON.stringify(value)}`);
                    }
                }

                if (modifiedProps.length > 0) {
                    gameLogger.info(`[property] Modified: ${modifiedProps.join(', ')}`);
                }
            }
        });

        this.game.registerAction("state", {
            action: (data: string | Record<string, any>) => {
                const updatedStates: string[] = [];
                if (typeof data === 'string') {
                    // Parse "key=value, key2=value2" format
                    const pairs = data.split(',').map(s => s.trim());
                    for (const pair of pairs) {
                        const [key, rawValue] = pair.split('=').map(s => s.trim());
                        if (!key || rawValue === undefined) {
                            gameLogger.error(`Invalid state format: "${pair}". Use "key=value"`);
                            continue;
                        }

                        // Parse value (handle booleans, numbers, strings)
                        let value: any = rawValue;
                        if (rawValue === 'true') value = true;
                        else if (rawValue === 'false') value = false;
                        else if (rawValue === 'null') value = null;
                        else if (!isNaN(Number(rawValue)) && rawValue !== '') value = Number(rawValue);

                        this.game.coreSystem.setState(key, value);
                        updatedStates.push(`${key}=${JSON.stringify(value)}`);
                    }
                } else {
                    // Object format: { "state_key": value }
                    for (const [key, value] of Object.entries(data)) {
                        this.game.coreSystem.setState(key, value);
                        updatedStates.push(`${key}=${JSON.stringify(value)}`);
                    }
                }
                if (updatedStates.length > 0) {
                    gameLogger.info(`[state] Updated game states: ${updatedStates.join(', ')}`);
                }
            }
        });

        this.game.registerAction("popup", {
            action: (popupId: string | false) => {
                if (popupId === false) {
                    this.game.coreSystem.setState('popup_state', null);
                    gameLogger.info('[popup] Closed popup');
                } else {
                    this.game.coreSystem.setState('popup_state', popupId);
                    gameLogger.info(`[popup] Opened popup: "${popupId}"`);
                }
            },
            eventDelayed: true
        });
    }

    /**
     * Register dungeon system actions
     */
    private registerDungeonActions(): void {
        this.game.registerAction("music", {
            action: (music: string) => {
                this.game.setMusic(music);
                gameLogger.info(`[music] Playing music: "${music}"`);
            }
        });

        this.game.registerAction("sound", {
            action: (sound: string) => {
                this.game.playSounds(sound);
                gameLogger.info(`[sound] Playing sound effect: "${sound}"`);
            }
        });

        this.game.registerAction("asset", {
            action: (data: string | (Partial<AssetObject> & { id: string })) => {
                const processedAssets: string[] = [];

                if (!data) {
                    this.game.dungeonSystem.assets.value = [];
                    gameLogger.info('[asset] Cleared all assets');
                    return;
                }

                // Handle string input with potential ! prefix for removal and [props] for inline properties
                if (typeof data === 'string') {
                    const assetSpecs = this.game.logicSystem.getParts(data);

                    for (const spec of assetSpecs) {
                        // Check for ! prefix (removal)
                        if (spec.startsWith('!')) {
                            const assetId = spec.substring(1).trim();
                            this.game.dungeonSystem.removeAssets(assetId);
                            processedAssets.push(`removed ${assetId}`);
                            continue;
                        }

                        // Parse asset string: "assetId" or "assetId(prop1=val1, prop2=val2)"
                        const bracketMatch = spec.match(/^([^\(]+)(?:\(([^\)]+)\))?$/);
                        if (!bracketMatch) {
                            gameLogger.warn(`[asset] Invalid format: "${spec}"`);
                            continue;
                        }

                        const assetId = bracketMatch[1].trim();
                        const propsString = bracketMatch[2];

                        // Check if asset already exists in scene
                        const existingAsset = this.game.dungeonSystem.assets.value.find(a => a.id === assetId);

                        if (propsString) {
                            // Has inline properties - parse them
                            const inlineProps = this.game.dungeonSystem.parseInlineProperties(propsString);

                            if (existingAsset) {
                                // Update existing asset
                                Object.assign(existingAsset, inlineProps);
                                this.game.trigger('asset_render', existingAsset);
                                // add to discovered assets for the gallery system
                                this.game.coreSystem.addAssetToGallery(existingAsset);
                                processedAssets.push(`updated ${assetId}`);
                            } else {
                                // Create new asset with merged properties
                                this.game.dungeonSystem.addAssets({ id: assetId, ...inlineProps });
                                processedAssets.push(`added ${assetId}`);
                            }
                        } else {
                            // No inline properties
                            if (existingAsset) {
                                // Asset already exists, skip
                                gameLogger.info(`[asset] Asset "${assetId}" already in scene, skipping`);
                            } else {
                                // Add new asset from template
                                this.game.dungeonSystem.addAssets(assetId);
                                processedAssets.push(`added ${assetId}`);
                            }
                        }
                    }
                } else {
                    // Object format - add or update
                    this.game.dungeonSystem.addAssets(data);
                    processedAssets.push(data.id);
                }

                if (processedAssets.length > 0) {
                    gameLogger.info(`[asset] Processed asset(s): ${processedAssets.join(', ')}`);
                }
            }
        });


        this.game.registerAction("flag", {
            action: (data: string | Record<string, any>) => {
                this.game.dungeonSystem.processFlagAction(data);
                const flagInfo = typeof data === 'string' ? data : JSON.stringify(data);
                gameLogger.info(`[flag] Flag operation(s): ${flagInfo}`);
            }
        });

        this.game.registerAction("exit", {
            eventDelayed: true,
            action: () => {
                this.game.dungeonSystem.exitScene();
                gameLogger.info('[exit] Exited current scene');
            }
        });

        this.game.registerAction("enter", {
            eventDelayed: true,
            action: (id: string) => {
                this.game.dungeonSystem.enter(id);
                gameLogger.info(`[enter] Entered room: "${id}"`);
            }
        });

        this.game.registerAction("scene", {
            eventDelayed: true,
            action: (value: string) => {
                let { sceneId, dungeonId } = this.game.dungeonSystem.resolveSceneId(value);
                //console.log("sceneId", sceneId);
                //console.log("dungeonId", dungeonId);
                this.game.dungeonSystem.playScene(sceneId, dungeonId);
                gameLogger.info(`[scene] Playing scene: "${sceneId}" in dungeon: "${dungeonId}"`);
            }
        });

        this.game.registerAction("redirect", {
            action: (value: string) => {
                this.game.logicSystem.resolveActions({ scene: value });
                gameLogger.info(`[redirect] Redirected to scene: "${value}"`);
            }
        });

        this.game.registerAction("choices", {
            onGameLoad: true,
            action: (value: string) => {
                let { sceneId, dungeonId } = this.game.dungeonSystem.resolveSceneId(value);
                //console.log("choices", sceneId, dungeonId);
                let choices = this.game.dungeonSystem.createChoices(sceneId);
                //console.log("choices", choices);
                if (choices) {
                    this.game.dungeonSystem.isChoices = 1;
                    this.game.dungeonSystem.eventChoices.value = choices;
                    const count = Array.isArray(choices) ? choices.length : 1;
                    gameLogger.info(`[choices] Loaded ${count} choice(s) from scene: "${sceneId}"`);
                } else {
                    gameLogger.info(`[choices] No choices found for scene: "${sceneId}"`);
                }
            }
        });

        this.game.registerAction("choicesOver", {
            onGameLoad: true,
            action: (value: string) => {
                let { sceneId, dungeonId } = this.game.dungeonSystem.resolveSceneId(value);
                let choices = this.game.dungeonSystem.createChoices(sceneId);
                if (choices) {
                    this.game.dungeonSystem.isChoices = 2;
                    this.game.dungeonSystem.eventChoices.value = choices;
                    const count = Array.isArray(choices) ? choices.length : 1;
                    gameLogger.info(`[choicesOver] Loaded ${count} choice(s) (override mode) from scene: "${sceneId}"`);
                } else {
                    gameLogger.info(`[choicesOver] No choices found for scene: "${sceneId}"`);
                }
            }
        });

        this.game.registerAction("actor", {
            action: (data: string | (Partial<CharacterSceneSlotObject> & { char: string })) => {
                const processedActors: string[] = [];

                // if data is empty, clear all actors from the scene
                if (!data) {
                    this.game.dungeonSystem.sceneSlots.value = [];
                    return;
                }

                // Handle string format
                if (typeof data === 'string') {
                    const actorSpecs = this.game.logicSystem.getParts(data);
                    for (const spec of actorSpecs) {
                        // Check for arrow syntax: "charId->slotId" or "!charId"
                        const arrowMatch = spec.match(/^([^->]+)->(.+)$/);

                        if (arrowMatch) {
                            let charId = arrowMatch[1].trim();
                            const slotPart = arrowMatch[2].trim();

                            // Check if charId starts with ! for removal
                            if (charId.startsWith('!')) {
                                charId = charId.substring(1);
                                // Parse inline properties for exit animation
                                const bracketMatch = slotPart.match(/^([^\(]+)(?:\(([^\)]+)\))?$/);
                                const propsString = bracketMatch ? bracketMatch[2] : undefined;
                                const inlineProps = propsString ? this.game.dungeonSystem.parseInlineProperties(propsString) : undefined;

                                if (this.game.dungeonSystem.removeActorFromScene(charId, inlineProps)) {
                                    processedActors.push(charId);
                                }
                            } else {
                                // Check for inline properties
                                const bracketMatch = slotPart.match(/^([^\(]+)(?:\(([^\)]+)\))?$/);
                                if (bracketMatch) {
                                    const slotId = bracketMatch[1].trim();
                                    const propsString = bracketMatch[2];
                                    const inlineProps = propsString ? this.game.dungeonSystem.parseInlineProperties(propsString) : undefined;

                                    // Check if character exists in scene
                                    const existingSlot = this.game.dungeonSystem.findSlotByChar(charId);

                                    if (existingSlot) {
                                        // Character exists -> move to new slot
                                        if (this.game.dungeonSystem.moveActorToSlot(charId, slotId, inlineProps)) {
                                            processedActors.push(charId);
                                        }
                                    } else {
                                        // Character doesn't exist -> add new actor
                                        const slot = this.game.dungeonSystem.parseActorString(spec);
                                        if (this.game.dungeonSystem.addActorToScene(slot)) {
                                            processedActors.push(charId);
                                        }
                                    }
                                }
                            }
                        } else {
                            // No arrow syntax -> check for ! prefix or property update
                            let charId = spec.trim();

                            // Check if charId starts with ! for removal
                            if (charId.startsWith('!')) {
                                charId = charId.substring(1);
                                // Parse inline properties for exit animation
                                const bracketMatch = charId.match(/^([^\(]+)(?:\(([^\)]+)\))?$/);
                                if (bracketMatch) {
                                    const cleanCharId = bracketMatch[1].trim();
                                    const propsString = bracketMatch[2];
                                    const inlineProps = propsString ? this.game.dungeonSystem.parseInlineProperties(propsString) : undefined;

                                    if (this.game.dungeonSystem.removeActorFromScene(cleanCharId, inlineProps)) {
                                        processedActors.push(cleanCharId);
                                    }
                                }
                            } else {
                                // Property update only: "charId(props)"
                                const bracketMatch = spec.match(/^([^\(]+)(?:\(([^\)]+)\))?$/);
                                if (bracketMatch && bracketMatch[2]) {
                                    const charId = bracketMatch[1].trim();
                                    const props = this.game.dungeonSystem.parseInlineProperties(bracketMatch[2]);
                                    if (this.game.dungeonSystem.updateActorProperties(charId, props)) {
                                        processedActors.push(charId);
                                    }
                                } else {
                                    gameLogger.warn(`[actor] Invalid format: "${spec}". Expected "char->slot(props)", "char(props)", or "!char"`);
                                }
                            }
                        }
                    }
                }
                // Handle object format: { char: "character1", id: "slot1", x: 40, ... }
                else if (data.char) {
                    const charId = data.char;
                    const existingSlot = this.game.dungeonSystem.findSlotByChar(charId);

                    if (existingSlot) {
                        // Character exists -> update properties
                        const { char, ...updates } = data;
                        if (this.game.dungeonSystem.updateActorProperties(charId, updates)) {
                            processedActors.push(charId);
                        }
                    } else {
                        // Character doesn't exist -> add new actor
                        const slot = this.game.dungeonSystem.createSlotFromData(data);
                        if (this.game.dungeonSystem.addActorToScene(slot)) {
                            processedActors.push(charId);
                        }
                    }
                }

                if (processedActors.length > 0) {
                    gameLogger.info(`[actor] Processed actor(s): ${processedActors.join(', ')}`);
                }
            }
        });

        this.game.registerAction("quest", {
            action: (questPath: string) => {
                // Support multiple quest logs separated by commas
                const questPaths = questPath.split(",").map(p => p.trim());
                const addedQuests: string[] = [];

                // Track quest states per unique quest (Map<questKey, questState>)
                const questStates = new Map<string, {
                    hasNewQuest: boolean;
                    hasCompletedQuest: boolean;
                    hasUpdatedQuest: boolean;
                    questTitle: string;
                }>();

                for (const path of questPaths) {
                    // Strip leading $ prefix if present
                    let cleanPath = path;
                    if (cleanPath.startsWith("$")) {
                        cleanPath = cleanPath.substring(1); // Remove "$"
                    }

                    // Parse quest path: "questId.goalId.logId" or "dungeonId.questId.goalId.logId"
                    const parts = cleanPath.split(".");

                    let dungeonId: string;
                    let questId: string;
                    let goalId: string;
                    let logId: string;

                    if (parts.length === 3) {
                        // Format: "questId.goalId.logId"
                        dungeonId = this.game.dungeonSystem.currentDungeonId.value || this.game.dungeonSystem.activeDungeonId.value || "";
                        if (!dungeonId) {
                            gameLogger.error(`Cannot add quest log - no active dungeon context for path "${path}"`);
                            continue;
                        }
                        questId = parts[0];
                        goalId = parts[1];
                        logId = parts[2];
                    } else if (parts.length === 4) {
                        // Format: "dungeonId.questId.goalId.logId"
                        dungeonId = parts[0];
                        questId = parts[1];
                        goalId = parts[2];
                        logId = parts[3];
                    } else {
                        gameLogger.error(`Invalid quest path format: ${path}`);
                        continue;
                    }

                    // Verify the dungeon exists
                    if (!this.game.dungeonSystem.dungeonLines.has(dungeonId)) {
                        gameLogger.error(`Cannot add quest log - dungeon "${dungeonId}" not found. Available:`, Array.from(this.game.dungeonSystem.dungeonLines.keys()));
                        continue;
                    }

                    const result = this.game.dungeonSystem.addQuestLog(dungeonId, questId, goalId, logId);
                    addedQuests.push(cleanPath);

                    // Track quest state changes per unique quest
                    if (result && !result.wasQuestCompleted) {
                        const questKey = `${dungeonId}.${questId}`;

                        if (!questStates.has(questKey)) {
                            questStates.set(questKey, {
                                hasNewQuest: false,
                                hasCompletedQuest: false,
                                hasUpdatedQuest: false,
                                questTitle: result.questTitle
                            });
                        }

                        const state = questStates.get(questKey)!;

                        if (result.isNewQuest) {
                            state.hasNewQuest = true;
                        } else if (result.isQuestCompletedNow) {
                            state.hasCompletedQuest = true;
                        } else {
                            state.hasUpdatedQuest = true;
                        }
                    }
                }

                // Add one flash notification per quest based on the most significant state change
                const global = Global.getInstance();
                for (const [questKey, state] of questStates.entries()) {
                    if (state.hasCompletedQuest) {
                        // Quest completed (highest priority)
                        const message = global.getString('quest.complete', { quest: state.questTitle });
                        this.game.dungeonSystem.addFlash(message);
                    } else if (state.hasNewQuest) {
                        // Quest started (medium priority)
                        const message = global.getString('quest.start', { quest: state.questTitle });
                        this.game.dungeonSystem.addFlash(message);
                    } else if (state.hasUpdatedQuest) {
                        // Quest updated (lowest priority)
                        const message = global.getString('quest.update', { quest: state.questTitle });
                        this.game.dungeonSystem.addFlash(message);
                    }
                }

                if (addedQuests.length > 0) {
                    gameLogger.info(`[quest] Added quest log(s): ${addedQuests.join(', ')}`);
                }
            }
        });
    }

    /**
     * Register character system actions
     */
    private registerCharacterActions(): void {


        this.game.registerAction("joinParty", (data: string) => {
            for (let part of this.game.logicSystem.getParts(data, true)) {
                let character = this.game.characterSystem.getCharacter(part);
                if (!character) {
                    throw new Error(`Character with id "${part}" not found.`);
                }
                if (this.game.characterSystem.isCharacterInParty(character)) {
                    gameLogger.warn(`[joinParty] Character "${part}" is already in the party, skipping`);
                    continue;
                }
                this.game.characterSystem.addToParty(character);
                gameLogger.info(`[joinParty] Added character "${part}" to party`);
                this.game.dungeonSystem.addFlash(Global.getInstance().getString('party.joined', { character: character.getName() }));
            }

        });

        this.game.registerAction("leaveParty", (data: string) => {
            for (let part of this.game.logicSystem.getParts(data, true)) {
                let character = this.game.characterSystem.getCharacter(part);
                if (!character) {
                    throw new Error(`Character with id "${part}" not found.`);
                }
                if (!this.game.characterSystem.isCharacterInParty(character)) {
                    gameLogger.warn(`[leaveParty] Character "${part}" is not in the party, skipping`);
                    continue;
                }
                this.game.characterSystem.removeFromParty(character);
                gameLogger.info(`[leaveParty] Removed character "${part}" from party`);
                this.game.dungeonSystem.addFlash(Global.getInstance().getString('party.left', { character: character.getName() }));
            }
        });


        this.game.registerAction("createCharacter", (data: any) => {
            if (!data.id) {
                throw new Error("Character id is required when creating a character.");
            }

            let character
            if (data.template) {
                character = this.game.characterSystem.createCharacter(data.id, data.template);
                gameLogger.info(`[createCharacter] Created character "${data.id}" from template "${data.template}"${data.party ? ' and added to party' : ''}`);
            } else {
                character = this.game.characterSystem.createCharacter(data.id, data);
                gameLogger.info(`[createCharacter] Created character "${data.id}"${data.party ? ' and added to party' : ''}`);
            }

            this.game.characterSystem.addCharacter(character, data.party);
        });

        this.game.registerAction("updateCharacter", (data: any) => {
            if (!data.id) {
                throw new Error("Character id is required when updating a character.");
            }
            let character = this.game.characterSystem.characters.value.get(data.id);
            if (!character) {
                throw new Error(`Character with id "${data.id}" not found.`);
            }
            character.update(data);

            let partyStatus = '';
            // update party
            if (data.party) {
                if (data.party == true) {
                    this.game.characterSystem.addToParty(character);
                    partyStatus = ', added to party';
                } else {
                    this.game.characterSystem.removeFromParty(character);
                    partyStatus = ', removed from party';
                }
            }
            gameLogger.info(`[updateCharacter] Updated character "${data.id}"${partyStatus}`);
        });

        this.game.registerAction("deleteCharacter", (data: any) => {
            if (!data.id) {
                throw new Error("Character id is required when deleting a character.");
            }
            this.game.characterSystem.partyIds.value.delete(data.id);
            this.game.characterSystem.characters.value.delete(data.id);
            gameLogger.info(`[deleteCharacter] Deleted character "${data.id}"`);
        });

        this.game.registerAction("addStatus", (data: any) => {
            if (!data.character) {
                throw new Error("Character id is required when adding a status.");
            }

            let character = this.game.characterSystem.characters.value.get(data.character);
            if (!character) {
                throw new Error(`Character with id "${data.id}" not found.`);
            }
            let statusObject = this.game.characterSystem.statusesMap.get(data.statusId);
            if (!statusObject) {
                throw new Error(`Status with id "${data.statusId}" not found.`);
            }
            let status = reactive(new Status());
            status.id = data.statusId;
            status.setValues(statusObject);
            character.addStatus(status);
            gameLogger.info(`[addStatus] Added status "${data.statusId}" to character "${data.character}"`);
        });

        this.game.registerAction("char", {
            action: (data: string | Record<string, any>) => {
                this.game.characterSystem.processCharAction(data);
                const charInfo = typeof data === 'string' ? data : JSON.stringify(data);
                gameLogger.info(`[char] Modified character: ${charInfo}`);
            }
        });

        this.game.registerAction("addSkinLayer", {
            action: (data: string) => {
                this.game.characterSystem.processAddSkinLayerAction(data);
                gameLogger.info(`[addSkinLayer] Added skin layer: ${data}`);
            }
        });

        this.game.registerAction("removeSkinLayer", {
            action: (data: string) => {
                this.game.characterSystem.processRemoveSkinLayerAction(data);
                gameLogger.info(`[removeSkinLayer] Removed skin layer: ${data}`);
            }
        });

        this.game.registerAction("addItemSlot", {
            action: (data: string) => {
                this.game.characterSystem.processAddItemSlotAction(data);
                gameLogger.info(`[addItemSlot] Added item slot: ${data}`);
            }
        });

        this.game.registerAction("removeItemSlot", {
            action: (data: string) => {
                this.game.characterSystem.processRemoveItemSlotAction(data);
                gameLogger.info(`[removeItemSlot] Removed item slot: ${data}`);
            }
        });

        // Learn skills for characters
        // Format: "characterId.treeId.slotId" or "characterId.treeId.slotId#level"
        // Or: "treeId.slotId" (uses selected character) or "treeId.slotId#level"
        this.game.registerAction("skill", {
            action: (data: string) => {
                const skillSpecs = data.split(",").map(s => s.trim());
                const learnedSkills: string[] = [];

                for (const spec of skillSpecs) {
                    // Parse level suffix: "path#level"
                    const [pathPart, levelPart] = spec.split("#");
                    const level = levelPart ? parseInt(levelPart, 10) : 1;

                    if (isNaN(level) || level <= 0) {
                        gameLogger.error(`[skill] Invalid level in: "${spec}"`);
                        continue;
                    }

                    const parts = pathPart.split(".");

                    let characterId: string;
                    let treeId: string;
                    let slotId: string;

                    if (parts.length === 2) {
                        // Format: "treeId.slotId" - use selected character
                        characterId = this.game.getState('selected_character');
                        if (!characterId) {
                            gameLogger.error(`[skill] No selected character for: "${spec}"`);
                            continue;
                        }
                        treeId = parts[0];
                        slotId = parts[1];
                    } else if (parts.length === 3) {
                        // Format: "characterId.treeId.slotId"
                        characterId = parts[0];
                        treeId = parts[1];
                        slotId = parts[2];
                    } else {
                        gameLogger.error(`[skill] Invalid format: "${spec}". Use "treeId.slotId" or "characterId.treeId.slotId"`);
                        continue;
                    }

                    const character = this.game.getCharacter(characterId);
                    if (!character) {
                        gameLogger.error(`[skill] Character "${characterId}" not found`);
                        continue;
                    }

                    character.learnSkill(treeId, slotId, level);
                    learnedSkills.push(`${characterId}.${treeId}.${slotId}${level > 1 ? '#' + level : ''}`);
                }

                if (learnedSkills.length > 0) {
                    gameLogger.info(`[skill] Learned skill(s): ${learnedSkills.join(', ')}`);
                }
            }
        });
    }

    /**
     * Register item system actions
     */
    private registerItemActions(): void {
        this.game.registerAction("equipItem", (data: {
            itemUid: string;
            characterId: string;
            slotId: string;
            slotIndex: number;
        }) => {
            const itemUid = data.itemUid || this.game.getState('active_item');
            const characterId = data.characterId || this.game.characterSystem.usedCharacterId.value || "";
            const character = this.game.getCharacter(characterId);
            if (!character) {
                throw new Error(`Character with id "${characterId}" not found.`);
            }

            character.equipItem(itemUid, data.slotId, data.slotIndex);
            gameLogger.info(`[equipItem] Equipped item "${itemUid}" to character "${character.id}"`);
        });

        this.game.registerAction("unequipItem", (data: {
            characterId: string;
            itemUid: string;
        }) => {
            const characterId = data.characterId || this.game.characterSystem.usedCharacterId.value || "";
            const character = this.game.getCharacter(characterId);
            if (!character) {
                throw new Error(`Character with id "${characterId}" not found.`);
            }

            const itemUid = data.itemUid || this.game.getState('active_item');
            character.unequipItem(itemUid);
            gameLogger.info(`[unequipItem] Unequipped item "${itemUid}" from character "${character.id}"`);
        });

        this.game.registerAction("addItem", (data: string | string[]) => {
            // Convert single string to array, splitting by commas if needed
            let items: string[];
            if (Array.isArray(data)) {
                items = data;
            } else {
                // Split by comma for comma-separated items
                items = data.split(',').map(s => s.trim()).filter(s => s.length > 0);
            }

            const addedItems: string[] = [];
            for (const itemSpec of items) {
                // Parse format: "item_id", "item_id#quantity", "item_id->inventory_id", or "item_id#quantity->inventory_id"
                const parts = itemSpec.split('->');
                const itemPart = parts[0].trim();
                const targetInventoryId = parts[1]?.trim() || PARTY_INVENTORY_ID;

                // Parse item_id and quantity
                const itemDetails = itemPart.split('#');
                const itemId = itemDetails[0].trim();
                const quantity = itemDetails[1] ? parseInt(itemDetails[1], 10) : 1;

                if (!itemId) {
                    throw new Error(`Invalid item specification: "${itemSpec}"`);
                }

                if (isNaN(quantity) || quantity <= 0) {
                    throw new Error(`Invalid quantity in item specification: "${itemSpec}"`);
                }

                // Get target inventory
                const inventory = this.game.itemSystem.inventories.value.get(targetInventoryId);
                if (!inventory) {
                    throw new Error(`Inventory with id "${targetInventoryId}" not found.`);
                }

                // Create item from template
                const item = this.game.itemSystem.createItem(itemId);
                if (!item) {
                    throw new Error(`Item template with id "${itemId}" not found.`);
                }

                // Add item to inventory (skip validation to allow overflow)
                inventory.addItem(item, quantity, true);
                let quantityText = quantity > 1 ? `(x${quantity})` : "";

                // show flash notification only for party inventory
                if (targetInventoryId === PARTY_INVENTORY_ID) {
                    const message = Global.getInstance().getString('item.added', { item: item.getName(), quantity: quantityText });
                    this.game.dungeonSystem.addFlash(message);
                }

                addedItems.push(`${itemId}${quantity > 1 ? ' x' + quantity : ''}${targetInventoryId !== PARTY_INVENTORY_ID ? ' -> ' + targetInventoryId : ''}`);
            }

            if (addedItems.length > 0) {
                gameLogger.info(`[addItem] Added item(s): ${addedItems.join(', ')}`);
            }
        })

        this.game.registerAction("loot",
            {
                action: (inventoryId: string) => {
                    this.game.itemSystem.openExchange(inventoryId, 'loot');
                    gameLogger.info(`[loot] Opened loot exchange with inventory "${inventoryId}"`);
                },
                eventDelayed: true
            }
        );

        this.game.registerAction("trade",
            {
                action: (inventoryId: string) => {
                    this.game.itemSystem.openExchange(inventoryId, 'trade');
                    gameLogger.info(`[trade] Opened trade exchange with inventory "${inventoryId}"`);
                },
                eventDelayed: true
            }
        );

        this.game.registerAction("learnRecipe", (recipeId: string) => {
            let parts = recipeId.split(",").map(p => p.trim());
            for (const part of parts) {
                this.game.itemSystem.addLearnedRecipe(part);
                console.log("recipe learned:", part);
            }
            gameLogger.info(`[learnRecipe] Learned recipe(s): ${parts.join(', ')}`);
        });
    }

    // ============================================
    // STAT COMPUTER REGISTRATIONS
    // ============================================

    /**
     * Register stat computer functions for dynamic character stat calculations
     */
    private registerStatComputers(): void {
        /*
        this.game.characterSystem.registerStatComputer("armorToPowerComputer", (char: Character) => {
            const armorValue = char.getStat("armor").value || 0;
            const lewdness = Number(this.game.getProperty("lewds")?.currentValue) || 0
            return {
                power: armorValue * 2,
                lewdness: lewdness * 2,
            };
        });
*/

    }
}
