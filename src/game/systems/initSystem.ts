import { computed } from 'vue';
import { Game } from '../game';
import { Global } from '../../global/global';
import { gameLogger } from '../utils/logger';
import { Character } from '../core/character/character';
import { AssetObject } from '../../schemas/assetSchema';
import { CharacterSceneSlotObject } from '../../schemas/characterSceneSlotSchema';
import { CharacterTemplateObject } from '../../schemas/characterTemplateSchema';
import { Status, StatusInstance } from '../core/character/status';
// Import Vue components for registration
import ExplorationComponent from '../views/states/exploration/Exploration.vue';
import EventItemCard from '../views/events-container/EventItemCard.vue';
import BattleComponent from '../views/states/battle/Battle.vue';
import QuestsTab from '../views/progression/QuestsTab.vue';
import CharacterTab from '../views/progression/CharacterTab.vue';
import CharacterSheet from '../views/progression/CharacterSheet.vue';
import InventoryComponent from '../views/progression/InventoryComponent.vue';
import InventoryHeader from '../views/progression/InventoryHeader.vue';
import GalleryTab from '../views/progression/GalleryTab.vue';
import EncyclopediaTab from '../views/progression/EncyclopediaTab.vue';
import SkillTree from '../views/progression/SkillTree.vue';
import DebugOptions from '../views/debug_containers/DebugOptions.vue';
import DebugDungeons from '../views/debug_containers/DebugDungeons.vue';
import DebugCharacters from '../views/debug_containers/DebugCharacters.vue';
import DebugChoices from '../views/debug_containers/DebugChoices.vue';
import DebugActions from '../views/debug_containers/DebugActions.vue';
import DebugRegistry from '../views/debug_containers/DebugRegistry.vue';
import DebugInventories from '../views/debug_containers/DebugInventories.vue';
import DebugStores from '../views/debug_containers/DebugStores.vue';
import DebugProperties from '../views/debug_containers/DebugProperties.vue';
import DebugActors from '../views/debug_containers/DebugActors.vue';
import OverlayNavigation from '../views/overlays/OverlayNavigation.vue';
import OverlayExchange from '../views/overlays/OverlayExchange.vue';
import DropItemPopup from '../views/popups/DropItemPopup.vue';
import ChooseItemPopup from '../views/popups/ChooseItemPopup.vue';
import BackComponent from '../views/navigation-toolbar/Back.vue';
import EncounterNavComponent from '../views/navigation-toolbar/EncounterNav.vue';
import DungeonNameComponent from '../views/navigation-toolbar/DungeonName.vue';
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
import { ItemRecipeObject } from '../../schemas/itemRecipeSchema';
import { ItemTemplateObject } from '../../schemas/itemTemplateSchema';
import AccoladesTab from '../views/progression/AccoladesTab.vue';
import AccoladeToast from '../views/ui-container/AccoladeToast.vue';

// ============================================
// CORE EMITTER SIGNATURES
// ============================================

// Single source of truth for core emitter names and their signatures.
// EmitterMap type and registration logic will be derived from this.
// Callbacks can return boolean | void. Returning false stops propagation.
export const CORE_EMITTER_SIGNATURES = {
    "game_initiated": (): boolean | void => { },
    "game_save": (saveName: string): boolean | void => { },
    "save_load_before": (saveData: any): boolean | void => { }, // fires with the raw save JSON immediately before deserialization. Listeners may mutate saveData in place to migrate old-shape data. Return false to abort the load entirely.
    // fires inside the save-migration pass (registerSaveMigration), after every declared section has
    // synced and every item_migrate has fired, before the engine re-binds equip statuses and puts
    // resource pools back. Only when the pass actually runs: old save, or any load in dev mode.
    "save_migrated": (): boolean | void => { },
    "html_mount": (): boolean | void => { },
    "state_change": (stateId: string, newValue: any, oldValue: any): boolean | void => { },
    "dungeon_create": (dungeon: Dungeon): boolean | void => { }, // will be triggered when a dungeon is created, including on loading a save file(because dungeons are not serialized).
    // fires on a CROSS-dungeon entry only, before ANY dungeon state mutates — the movement block,
    // the same-dungeon short-circuit and the key gate have all already passed, so a listener here
    // sees the player still standing in the old dungeon. Return false to abort the entry cleanly.
    // Room-to-room movement inside the current dungeon fires room_enter_before instead.
    "dungeon_enter_before": (dungeonId: string, roomId: string): boolean | void => { },
    "dungeon_enter_after": (dungeonId: string, roomId: string): boolean | void => { },
    "room_enter_before": (roomId: string, dungeonId: string): boolean | void => { },
    "room_enter_after": (roomId: string, dungeonId: string): boolean | void => { },
    "encounter_selected": (encounterId: string, dungeonId: string): boolean | void => { }, // an encounter was selected — clicked on the map / screen, or cycled to with the toolbar. Props never fire. Return false to block the selection.
    "encounter_discovered": (encounterId: string, dungeonId: string): boolean | void => { }, // a hidden `@x{discover: "perception#6"}` encounter was revealed; fires once, on the room entry that reveals it.
    "encounter_collected": (encounterId: string, itemSpec: string, dungeonId: string): boolean | void => { }, // a collectable encounter was collected. Regrow needs no listener — time plugins call game.tickCollectables instead.
    "collectable_resolve": (request: { dungeonId: string, encounterId: string, pool: string, itemId: string | null }): boolean | void => { }, // a collectable with a collect_pool asks for its item during dungeon creation (so also on save load). A listener claims the request by setting request.itemId to an item template id; listeners must skip requests already carrying one. An unanswered request degrades the encounter to a plain one with a logged error.
    "item_discovered": (itemId: string): boolean | void => { }, // an item was discovered (recipe learned from its scroll, book read to the last page, painting viewed). Fires once per item per save; drives the item-card check mark.
    "key_used": (keyItemId: string, targetId: string): boolean | void => { }, // a key was auto-used on a locked room or inventory. targetId is "dungeonId.roomId" for rooms, the inventory id for chests. Informational — the unlock already happened.
    "scene_play_before": (sceneId: string, dungeonId: string, isRootScene: boolean): boolean | void => { },
    // fires when a committed scene is about to run its paragraph actions (after gates/redirects,
    // before the actions/assets) — the place to stage default actors so they precede the scene's assets.
    "scene_play": (sceneId: string, dungeonId: string, isRootScene: boolean): boolean | void => { },
    "scene_play_after": (sceneId: string, dungeonId: string, isRootScene: boolean): boolean | void => { },
    // fires when a scene is about to exit (last-paragraph click, {exit} action, playScene(null)).
    // Return false to cancel the exit — e.g. a battle system playing a close animation first.
    "scene_exit_before": (skipEvents: boolean): boolean | void => { },
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
    // triggered while an asset's image layers are built, on EVERY render path — the staged
    // scene, the gallery, the fullscreen overlay, the editor preview. Listeners receive a
    // throwaway copy and may filter/reorder `asset.layers` or swap an entry for
    // { file, classes } to put css classes on one layer. Must be PURE: it runs inside a
    // computed, so writing reactive state from a listener risks a render loop, and the copy
    // is discarded rather than staged or saved.
    "asset_resolve": (asset: AssetObject): boolean | void => { },

    "item_create": (item: Item): boolean | void => { },
    // fires for every inventory item the save-migration pass visits, right after its template-owned
    // fields were reset (per the declared scopes), with a copy of its template. Per-instance
    // derivations done at item_create (level scaling, runtime-added choices) are put back here —
    // items are deserialized, so item_create never fires for them on load.
    "item_migrate": (item: Item, template: ItemTemplateObject): boolean | void => { },
    // Fired before an item is discarded via the drop_item action. Return false in a listener to
    // veto the drop (e.g. protect key items).
    "item_drop_before": (item: Item, character: Character): boolean | void => { },
    // Fired to decide whether a DISCARD AFFORDANCE renders for an item — the item card's Drop
    // choice and the experience plugin's reward-panel trash button both ask. Return false to hide
    // it. The GAME's veto only; the engine's own rules live in Item.isDroppable(), which each of
    // those UIs checks alongside this.
    // Pure predicate: it runs on every render, so listeners must only return, never act.
    "item_drop_render": (item: Item, character?: Character): boolean | void => { },
    //"item_destroy": (item: Item): boolean | void => { },
    "item_equip_before": (item: Item, character: Character): boolean | void => { },
    "item_equip_after": (item: Item, character: Character): boolean | void => { },
    "item_unequip_before": (item: Item, character: Character): boolean | void => { },
    "item_unequip_after": (item: Item, character: Character): boolean | void => { },
    "item_consume_before": (item: Item, character: Character): boolean | void => { },
    "item_consume_after": (item: Item, character: Character): boolean | void => { },
    // "item_pickup": (item: Item, character: Character): boolean | void => { },
    "inventory_open": (inventory: Inventory): boolean | void => { },
    "inventory_close": (inventory: Inventory): boolean | void => { },
    "inventory_apply": (inventory: Inventory): boolean | void => { },
    "inventory_transfer": (inventory: Inventory, targetInventory: Inventory, item: Item, quantity: number, isTrade: boolean): boolean | void => { },
    "inventory_transfer_after": (inventory: Inventory, targetInventory: Inventory, item: Item, quantity: number, isTrade: boolean): boolean | void => { }, // post-mutation counterpart of inventory_transfer — the items already moved. item is the live target-side stack (possibly a pre-existing stack the transfer merged into). Informational.
    "currency_change": (inventory: Inventory, currencyId: string, delta: number): boolean | void => { }, // a trade moved currency in or out of an inventory (negative = paid, positive = received); fires once per currency id, after the stacks changed, and only for genuine is_currency templates. Informational.
    "inventory_craft": (inventory: Inventory, recipe: ItemRecipeObject): boolean | void => { }, // a recipe was crafted — inputs consumed and outputs added. Informational.
    "quest_updated": (questId: string, goalId: string, result: { isNewQuest: boolean, wasQuestCompleted: boolean, isQuestCompletedNow: boolean, questTitle: string }, dungeonId: string): boolean | void => { }, // a quest log line landed (deduped — repeats of the same log don't fire). Informational.
    "accolade_completed": (accoladeId: string, points: number): boolean | void => { }, // an achievement's progress reached its target. The engine scores the points and shows the notification; grant any in-game reward from here. Informational. // a quest log line landed (deduped — repeats of the same log don't fire). Informational.
    "trade_init": (traderInventory: Inventory, item: Item): boolean | void => { }, // runs over each item in the exchange inventory after it is opened OR the trade is opened
    "recipe_learned": (recipeId: string): boolean | void => { }, // triggered when a recipe is learned
    "skill_learned": (skillTreeId: string, skillId: string, level: number): boolean | void => { }, // triggered when a skill is learned
    "skill_unlearned": (skillTreeId: string, skillId: string): boolean | void => { }, // triggered when a skill is unlearned

    "status_apply_before": (character: Character, status: Status, applyArgs?: { stacks?: number; duration?: number; source?: string }): boolean | void => { }, // triggered before a status is applied, including reapplies. Return false to prevent it. Mutate applyArgs (when present) to change the stacks/duration that land
    "status_added": (character: Character, status: Status): boolean | void => { }, // triggered after a new status is added to a character (reapplies don't fire this)
    "status_removed": (character: Character, status: Status): boolean | void => { }, // triggered after a status is removed from a character
    "status_expired": (character: Character, status: Status, instance: StatusInstance): boolean | void => { }, // triggered per expired instance when tickStatusDuration drops its duration to <= 0
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
        this.game.accoladeSystem.init(this.game, { tab: AccoladesTab, toast: AccoladeToast });
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

        const startingDungeonId = coreSystem.mergedManifest.starting_dungeon_id;
        const startingRoomId = coreSystem.mergedManifest.starting_dungeon_room_id;

        if (!startingDungeonId || !startingRoomId) {
            gameLogger.error(
                `Missing starting dungeon configuration. ` +
                `starting_dungeon_id: '${startingDungeonId || '(not set)'}', ` +
                `starting_dungeon_room_id: '${startingRoomId || '(not set)'}'. ` +
                `Set these in the engine editor via Manifest settings.`
            );
            return;
        }

        const dungeonExists = this.game.dungeonSystem.dungeonLines.has(startingDungeonId);
        if (!dungeonExists) {
            gameLogger.error(`Starting dungeon '${startingDungeonId}' not found. Check that the dungeon ID in Manifest matches an existing dungeon.`);
            return;
        }

        const roomExists = this.game.dungeonSystem.dungeonRooms.get(startingDungeonId)?.has(startingRoomId);
        if (!roomExists) {
            gameLogger.error(`Starting room '${startingRoomId}' not found in dungeon '${startingDungeonId}'. Check that the room ID in Manifest matches an existing room.`);
            return;
        }

        this.game.dungeonSystem.enterDungeon(startingDungeonId, startingRoomId);

        // add default characters to party. Moved to global.createDefaultEntities()
        /*
        for (let characterObject of this.game.characterSystem.templatesMap.values()) {
            if (characterObject.auto_create) {
                let character = this.game.characterSystem.characters.value.get(characterObject.id);
                if (character) {
                    this.game.logicSystem.resolveActions({
                        update_character: {
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
        this.game.registerState('block_scene_advance', false);
        this.game.registerState('block_party_inventory', false);
        this.game.registerState('show_character_list', true);
        // Suppress the scene actor rail for a beat without hiding the whole event layer the way
        // hide_events does. The rail already hides itself when nothing is staged.
        this.game.registerState('hide_actor_list', false);
        // The player's own collapse/expand of that rail, behind the eye icon on the panel itself.
        // Deliberately NOT named show_actor_list: it sits next to hide_actor_list above, and two
        // near-identical names with opposite polarity is a trap. This one only folds the faces
        // away — hide_actor_list is what removes the panel outright.
        this.game.registerState('actor_list_expanded', true);
        this.game.registerState('progression_state', null);
        this.game.registerState('progression_sub_state', null);
        this.game.registerState('suppress_character_progression', false);
        this.game.registerState('gallery_tab', 'characters');
        this.game.registerState('game_state', '');
        this.game.registerState('map_zoom_factor', 1);
        this.game.registerState('is_show_completed_quests', false);
        this.game.registerState('selected_character', null);
        this.game.registerState('active_character', null);
        this.game.registerState('active_inventory', null);
        this.game.registerState('active_item', null);
        this.game.registerState('viewed_item', null); // uid shown by the item_view action, cleared on event_end
        this.game.registerState('popup_state', []);
        this.game.registerState('overlay_state', 'overlay-navigation');
        this.game.registerState('previous_overlay_state', null);

        this.game.registerState('supress_game_events', false);
        this.game.registerState('disable_saves', false);
        this.game.registerState('replay_mode', false);
        this.game.registerState('replay_mode_unlock_choices', false);
        // Opens every gallery scene for replay, including ones the player never reached.
        this.game.registerState('replay_mode_unlock_scenes', false);
        // Freezes accolade progress writes — set by debug tooling so seeding doesn't earn achievements.
        this.game.registerState('accolades_frozen', false);
        // Achievements tab view filter: 'all' | 'earned' | 'locked'.
        this.game.registerState('accolades_filter', 'all');

        this.game.registerState('max_log', 40);

        this.game.registerState('hide', 40);

        this.game.registerState('hide_events', false);
        // Hides the map (map dungeons) / background image (screen dungeons) — see isHideMap in Exploration.vue.
        this.game.registerState('hide_map', false);
    }

    // ============================================
    // EMITTER REGISTRATIONS
    // ============================================

    /**
     * Register all core event emitters
     */
    // Open a book page: update the reading state + bookmark, then play the page's scene.
    // The last page (no following paragraph line) discovers the item and clears the bookmark.
    private playBookPage(itemId: string, dungeonId: string, base: string, page: number): void {
        this.game.setState('reading_book', { itemId, dungeonId, base, page });
        const bookmarks = { ...((this.game.getState('book_bookmarks') || {}) as Record<string, number>) };
        const nextPageExists = !!this.game.dungeonSystem.dungeonLines.get(dungeonId)?.get(`#${base}.1.1.${page + 1}`);
        if (nextPageExists) {
            bookmarks[itemId] = page;
        } else {
            delete bookmarks[itemId];
            this.game.itemSystem.discoverItem(itemId);
        }
        this.game.setState('book_bookmarks', bookmarks);
        this.game.dungeonSystem.playSceneResolver(`${base}.1.1.${page}`, dungeonId);
    }

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

        // Item card under the dialogue text, driven by the item_view action.
        this.game.coreSystem.addComponent({
            id: 'event_item_card',
            slot: 'scene-content-bottom',
            component: EventItemCard
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

        // Modal confirm (+ quantity slider for stacks) for the drop_item action.
        this.game.coreSystem.addComponent({
            id: 'drop_item_popup',
            slot: 'popup',
            component: DropItemPopup
        });

        // Item picker for the choose_item scene action.
        this.game.coreSystem.addComponent({
            id: 'choose_item_popup',
            slot: 'popup',
            component: ChooseItemPopup
        });
    }

    /**
     * Register progression tab components
     */
    private registerProgressionComponents(): void {
        const global = Global.getInstance();

        this.game.coreSystem.addComponent({
            id: 'quests',
            slot: 'progression-tabs',
            title: global.getString('progression.tab.quests'),
            component: QuestsTab,
            order: 0
        });

        this.game.coreSystem.addComponent({
            id: 'character',
            slot: 'progression-tabs',
            title: global.getString('progression.tab.party'),
            component: CharacterTab,
            order: 10
        });

        this.game.coreSystem.addComponent({
            id: 'gallery',
            slot: 'progression-tabs',
            title: global.getString('progression.tab.gallery'),
            component: GalleryTab,
            order: 20
        });

        this.game.coreSystem.addComponent({
            id: 'encyclopedia',
            slot: 'progression-tabs',
            title: global.getString('progression.tab.encyclopedia'),
            component: EncyclopediaTab,
            order: 30
        });
    }

    /**
     * Register character tab components (sub-tabs within character sheet)
     */
    private registerCharacterTabComponents(): void {
        const global = Global.getInstance();

        this.game.coreSystem.addComponent({
            id: 'character-sheet',
            slot: 'character-tabs',
            title: global.getString('character.tab.character_sheet'),
            component: CharacterSheet
        });

        // The party inventory gets the whole tab, so it drops the grid's default 400px cap and
        // fills the height instead.
        this.game.coreSystem.addComponent({
            id: 'inventory',
            slot: 'character-tabs',
            title: global.getString('character.tab.inventory'),
            component: InventoryComponent,
            order: 2,
            props: {
                inventory_id: PARTY_INVENTORY_ID,
                maxHeight: 'none'
            }
        });

        this.game.coreSystem.addComponent({
            id: 'skill-trees',
            slot: 'character-tabs',
            title: global.getString('character.tab.skills'),
            component: SkillTree,
            order: 3
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
        const global = Global.getInstance();

        this.game.coreSystem.addComponent({
            id: 'debug-options',
            slot: 'debug-tabs',
            title: global.getString('debug.tab.options'),
            component: DebugOptions,
            order: 1
        });

        this.game.coreSystem.addComponent({
            id: 'debug-dungeons',
            slot: 'debug-tabs',
            title: global.getString('debug.tab.dungeons'),
            component: DebugDungeons,
            order: 2
        });

        this.game.coreSystem.addComponent({
            id: 'debug-characters',
            slot: 'debug-tabs',
            title: global.getString('debug.tab.characters'),
            component: DebugCharacters,
            order: 3
        });

        this.game.coreSystem.addComponent({
            id: 'debug-choices',
            slot: 'debug-tabs',
            title: global.getString('debug.tab.choices'),
            component: DebugChoices,
            order: 4
        });

        this.game.coreSystem.addComponent({
            id: 'debug-actions',
            slot: 'debug-tabs',
            title: global.getString('debug.tab.actions'),
            component: DebugActions,
            order: 5
        });

        this.game.coreSystem.addComponent({
            id: 'debug-registry',
            slot: 'debug-tabs',
            title: global.getString('debug.tab.registry'),
            component: DebugRegistry,
            order: 5
        });

        this.game.coreSystem.addComponent({
            id: 'debug-inventories',
            slot: 'debug-tabs',
            title: global.getString('debug.tab.inventories'),
            component: DebugInventories,
            order: 6
        });

        this.game.coreSystem.addComponent({
            id: 'debug-stores',
            slot: 'debug-tabs',
            title: global.getString('debug.tab.stores'),
            component: DebugStores,
            order: 7
        });

        this.game.coreSystem.addComponent({
            id: 'debug-properties',
            slot: 'debug-tabs',
            title: global.getString('debug.tab.properties'),
            component: DebugProperties,
            order: 8
        });

        this.game.coreSystem.addComponent({
            id: 'debug-actors',
            slot: 'debug-tabs',
            title: global.getString('debug.tab.actors'),
            component: DebugActors,
            order: 9
        });
    }

    /**
     * Register navigation toolbar components
     */
    // The bar reads: encounter controls (left) — dungeon name (center) — map controls (right).
    // The name takes the space between the groups, so plugin buttons should pick an order
    // below 20 to join the left group and above 20 to join the right one.
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
            id: 'toolbar-logs',
            slot: 'navigation-toolbar',
            component: LogsButtonComponent,
            order: 3
        });

        this.game.coreSystem.addComponent({
            id: 'toolbar-dungeon-name',
            slot: 'navigation-toolbar',
            component: DungeonNameComponent,
            order: 20
        });

        this.game.coreSystem.addComponent({
            id: 'toolbar-toggle-circles',
            slot: 'navigation-toolbar',
            component: ToggleCirclesComponent,
            order: 30
        });

        this.game.coreSystem.addComponent({
            id: 'toolbar-zoom-controls',
            slot: 'navigation-toolbar',
            component: ZoomControlsComponent,
            order: 31
        });

        this.game.coreSystem.addComponent({
            id: 'toolbar-center-room',
            slot: 'navigation-toolbar',
            component: CenterRoomComponent,
            order: 32
        });

        this.game.coreSystem.addComponent({
            id: 'toolbar-minimize',
            slot: 'navigation-toolbar',
            component: MinimizeToolbarComponent,
            order: 33
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
        // How many of an item the party carries (any inventory id as optional 2nd segment).
        // Usage: _item_count(pickaxe) > 0   or   _item_count(chest_troglodyte.gold) >= 100
        this.game.registerCondition("_item_count", (param: string) => {
            let inventoryId = PARTY_INVENTORY_ID;
            let itemId = param;
            if (param.includes('.')) {
                const parts = param.split('.');
                inventoryId = parts[0];
                itemId = parts[1];
            }
            return this.game.itemSystem.getInventory(inventoryId)?.getItemQuantity(itemId) ?? 0;
        });

        // Whether the last choose_item pick was this template id ('' after a cancel).
        // Usage: if{_chosen_item(key_mansion) = false}{redirect: "shift:1"} fi{}
        this.game.registerCondition("_chosen_item", (param: string) => {
            return this.game.getState('chosen_item_id') === param;
        });

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
        //        _item_on(alice) = true   — no item id: checks the ACTIVE item (the one whose
        //        custom choice opened the current scene), matching by uid.
        this.game.registerCondition("_item_on", (characterId: string, itemId?: string) => {
            let character = this.game.getCharacter(characterId);
            if (!character) {
                gameLogger.error(`character not found for condition _item_on: ${characterId}`);
                return false;
            }
            let equippedItems = character.getEquippedItems();
            if (!itemId) {
                const activeUid = this.game.getState('active_item');
                if (!activeUid) return false;
                return equippedItems.some(item => item.uid === activeUid);
            }
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

                    case 'attribute': {
                        const cs = this.game.characterSystem;
                        if (!cs.attributesMap.has(key) && cs.skinLayersMap.has(key)) {
                            // Skin-layer visibility fallback: real boolean, not a "true" string —
                            // logicSystem parses the RHS true/false into a boolean and compares with ==.
                            return character.skinLayers.has(key);
                        }
                        return character.getAttribute(key);
                    }

                    case 'stat': {
                        return character.getStat(key);
                    }

                    case 'resource':
                        return character.getResource(key);

                    case 'skinStyle': {
                        const styles = character.skinLayerStyles.get(key) || [];
                        // Return as string for single value, or array for multiple
                        return styles.length === 1 ? styles[0] : styles;
                    }

                    case 'status':
                        return character.hasStatus(key) ? 1 : 0;

                    default:
                        gameLogger.error(`[_char] Unknown type "${type}". Valid types: trait, attribute, stat, resource, skinStyle, status`);
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

        // Does the character currently have an ability? 1 if yes, 0 if not. Reads the FINAL ability
        // set, so status-granted and item-granted abilities count, and one hidden behind an unmet
        // meta.require_status reads as absent — the same view the ability bar shows.
        // Usage: _ability(mc.dryad_fire_ult) = 1
        //        _ability(fireball) = 1            (uses selected character)
        this.game.registerCondition("_ability", (path: string) => {
            const parts = path.split(".");

            let characterId: string;
            let abilityId: string;

            if (parts.length === 1) {
                characterId = this.game.getState('selected_character');
                if (!characterId) {
                    gameLogger.error(`[_ability] No selected character for path: "${path}"`);
                    return 0;
                }
                abilityId = parts[0];
            } else if (parts.length === 2) {
                characterId = parts[0];
                abilityId = parts[1];
            } else {
                gameLogger.error(`[_ability] Invalid path format: "${path}". Use "abilityId" or "characterId.abilityId"`);
                return 0;
            }

            const character = this.game.getCharacter(characterId);
            if (!character) {
                gameLogger.error(`[_ability] Character "${characterId}" not found`);
                return 0;
            }

            return character.getAbility(abilityId) ? 1 : 0;
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
        //        |item| — no args: the ACTIVE item (the one whose custom choice opened the scene)
        this.game.registerPlaceholder("item", (itemUid?: string, inventoryId?: string) => {
            if (!itemUid) {
                itemUid = this.game.getState('active_item');
                inventoryId = inventoryId || this.game.getState('active_inventory') || PARTY_INVENTORY_ID;
                if (!itemUid) return "";
            }
            let inventory = this.game.itemSystem.getInventory(inventoryId!);
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

        // Usage: |stat(statId)| — requires context.character passed to resolveString
        this.game.registerPlaceholder("stat", (statId: string) => {
            const char = this.game.getResolveContext()?.character;
            if (!char) return "";
            const val = char.getStat(statId);
            return val != null ? String(val) : "";
        });

        // Shared: parse key->value args, resolve a locale entry through the full pipeline
        const resolveLocale = (localeId: string, args: string[]): string => {
            const params: Record<string, any> = {};
            for (const arg of args) {
                const sep = arg.indexOf('->');
                if (sep !== -1) params[arg.slice(0, sep).trim()] = arg.slice(sep + 2).trim();
            }
            const raw = this.game.logicSystem.getLine(localeId, params);
            return this.game.logicSystem.resolveString(raw, true).output;
        };

        // Usage: |from(localeId)| or |from(localeId, name->Elf, species->minotaur)|
        this.game.registerPlaceholder("from", (localeId: string, ...args: string[]) => {
            return resolveLocale(localeId, args);
        });

        // Usage: |pick(baseId)| or |pick(baseId, name->Elf)|
        // Randomly selects from numbered locale variants: baseId, baseId_2, baseId_3, ...
        this.game.registerPlaceholder("pick", (baseId: string, ...args: string[]) => {
            const variants = [baseId];
            for (let i = 2; ; i++) {
                const id = `${baseId}_${i}`;
                const line = this.game.logicSystem.getLine(id);
                if (line === `[${id}]`) break;
                variants.push(id);
            }
            const chosen = variants[Math.floor(Math.random() * variants.length)];
            return resolveLocale(chosen, args);
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
            }
        });

        this.game.registerAction("flash", {
            // Accepts a plain string or `{ text, class? }` — the object form wraps the text in
            // <span class="..."> so callers can use e.g. `.flash-small` for a gray sub-line.
            action: (value: string | { text: string; class?: string }) => {
                if (typeof value === 'string') {
                    this.game.dungeonSystem.addFlash(value);
                } else if (value && typeof value === 'object' && typeof value.text === 'string') {
                    const cls = value.class ? ` class="${value.class}"` : '';
                    this.game.dungeonSystem.addFlash(`<span${cls}>${value.text}</span>`);
                }
            }
        });

        this.game.registerAction("lore", {
            action: (data: string) => {
                for (const id of data.split(',').map(s => s.trim()).filter(Boolean)) {
                    this.game.narrativeSystem.discoverRecord(id);
                }
            }
        });

        // Authoring marker for a branch that isn't written yet: renders the choice greyed out and
        // unclickable with a "[wip]" prefix, so planned options stay visible without being reachable.
        // Prefixes `name` rather than setting `nameComputed` so the label still goes through
        // resolveLabel (placeholders, if{} logic, text styles) via performChoiceModifier's fallback.
        // No `action` — the choice can never be picked.
        this.game.registerAction("wip", {
            choiceModifier: (choice: Choice) => {
                choice.name = `[wip] ${choice.name}`;
                choice.isAvailable = computed(() => false);
            }
        });

        // Encumbrance-sensitive travel choice: greys out + becomes unclickable while the party bag
        // is overweight (a proactive affordance — the deep enterRoom/enterDungeon guard is the real
        // enforcement). Reactive: getInventory returns the reactive proxy, so maxWeight and item
        // weight both drive it. No-op unless a game caps the party inventory.
        this.game.registerAction("enc_sensitive", {
            choiceModifier: (choice: Choice) => {
                choice.isAvailable = computed(
                    () => !this.game.itemSystem.getInventory(PARTY_INVENTORY_ID)?.isOverCapacity()
                );
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
                    this.game.closeAllPopups();
                } else {
                    for (const token of String(popupId).split(',').map(s => s.trim()).filter(Boolean)) {
                        if (token.startsWith('!')) this.game.closePopup(token.slice(1).trim());
                        else this.game.openPopup(token);
                    }
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
            }
        });

        this.game.registerAction("sound", {
            action: (sound: string | false) => {
                // {sound: false} stops everything currently playing, mirroring {asset: false}
                if (!sound) {
                    this.game.stopSounds();
                    return;
                }

                const play: string[] = [];
                for (const spec of this.game.logicSystem.getParts(sound)) {
                    // ! prefix stops that sound, looping or not
                    if (spec.startsWith('!')) {
                        this.game.stopSounds(spec.substring(1).trim());
                        continue;
                    }
                    play.push(spec);
                }

                if (play.length) {
                    this.game.playSounds(play);
                }
            }
        });

        this.game.registerAction("asset", {
            action: (data: string | (Partial<AssetObject> & { id: string })) => {
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
                            continue;
                        }

                        // "false", "clear" and "reset" are fake asset ids. false removes
                        // EVERY asset (incl. the dungeon/room defaults); clear sweeps away
                        // every non-default asset (keeps the backdrop); reset hard-clears
                        // the stage and re-stages the defaults fresh. All compose with
                        // other specs, e.g. {asset: "false, forest, pic1"}.
                        if (spec === 'false') {
                            this.game.dungeonSystem.clearAssets();
                            continue;
                        }
                        if (spec === 'clear') {
                            this.game.dungeonSystem.clearTransientAssets();
                            continue;
                        }
                        if (spec === 'reset') {
                            this.game.dungeonSystem.resetToDefaultAssets();
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

                        // Delegate to addAssets for both create and update — it already branches
                        // on whether the id is staged, and it revives an asset caught mid-exit.
                        // Duplicating the lookup here would bypass that revive and leave the
                        // backdrop stranded for `{asset: "!bg"}` followed by `{asset: "bg"}`.
                        if (propsString) {
                            const inlineProps = this.game.dungeonSystem.parseInlineProperties(propsString);
                            this.game.dungeonSystem.addAssets({ id: assetId, ...inlineProps });
                        } else {
                            this.game.dungeonSystem.addAssets(assetId);
                        }
                    }
                } else {
                    // Object format - add or update
                    this.game.dungeonSystem.addAssets(data);
                }
            }
        });


        this.game.registerAction("grade", {
            // Neither eventDelayed nor onGameLoad: the grade should change as the paragraph renders
            // (like music/asset), and the saved value is what restores it on load.
            action: (data: string | boolean | Record<string, any>) => {
                this.game.setGrade(data);
            }
        });

        this.game.registerAction("flag", {
            action: (data: string | Record<string, any>) => {
                this.game.dungeonSystem.processFlagAction(data);
            }
        });

        this.game.registerAction("exit", {
            eventDelayed: true,
            action: () => {
                this.game.dungeonSystem.exitScene();
            }
        });

        this.game.registerAction("enter", {
            eventDelayed: true,
            action: (id: string) => {
                this.game.dungeonSystem.enter(id);
            }
        });

        this.game.registerAction("scene", {
            eventDelayed: true,
            action: (value: string) => {
                let { sceneId, dungeonId } = this.game.dungeonSystem.resolveSceneId(value);
                //console.log("sceneId", sceneId);
                //console.log("dungeonId", dungeonId);
                this.game.dungeonSystem.playScene(sceneId, dungeonId);
            }
        });

        this.game.registerAction("redirect", {
            action: (value: string) => {
                this.game.logicSystem.resolveActions({ scene: value });
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

        this.game.registerAction("choices_over", {
            onGameLoad: true,
            action: (value: string) => {
                let { sceneId, dungeonId } = this.game.dungeonSystem.resolveSceneId(value);
                let choices = this.game.dungeonSystem.createChoices(sceneId);
                if (choices) {
                    this.game.dungeonSystem.isChoices = 2;
                    this.game.dungeonSystem.eventChoices.value = choices;
                    const count = Array.isArray(choices) ? choices.length : 1;
                    gameLogger.info(`[choices_over] Loaded ${count} choice(s) (override mode) from scene: "${sceneId}"`);
                } else {
                    gameLogger.info(`[choices_over] No choices found for scene: "${sceneId}"`);
                }
            }
        });

        this.game.registerAction("actor", {
            action: (data: string | (Partial<CharacterSceneSlotObject> & { char: string })) => {
                // if data is empty, remove all actors with exit animations
                if (!data) {
                    const charIds = this.game.dungeonSystem.sceneSlots.value
                        .filter(s => !s.isRemoving)
                        .map(s => s.char!);
                    for (const charId of charIds) {
                        this.game.dungeonSystem.removeActorFromScene(charId);
                    }
                    return;
                }

                // Handle string format
                if (typeof data === 'string') {
                    const actorSpecs = this.game.logicSystem.getParts(data);
                    for (const spec of actorSpecs) {
                        // "false" and "clear" are fake actor ids that remove every staged
                        // actor: false cuts instantly (no exit animation), clear removes
                        // them with their exit animations. Both compose with other specs,
                        // e.g. {actor: "false, alice->right"}.
                        if (spec === 'false') {
                            this.game.dungeonSystem.clearActors();
                            continue;
                        }
                        if (spec === 'clear') {
                            for (const s of [...this.game.dungeonSystem.sceneSlots.value]) {
                                if (!s.isRemoving) this.game.dungeonSystem.removeActorFromScene(s.char!);
                            }
                            continue;
                        }

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

                                this.game.dungeonSystem.removeActorFromScene(charId, inlineProps);
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
                                        this.game.dungeonSystem.moveActorToSlot(charId, slotId, inlineProps);
                                    } else {
                                        // Character doesn't exist -> add new actor
                                        const slot = this.game.dungeonSystem.parseActorString(spec);
                                        this.game.dungeonSystem.addActorToScene(slot);
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

                                    this.game.dungeonSystem.removeActorFromScene(cleanCharId, inlineProps);
                                }
                            } else {
                                // Property update only: "charId(props)"
                                const bracketMatch = spec.match(/^([^\(]+)(?:\(([^\)]+)\))?$/);
                                if (bracketMatch && bracketMatch[2]) {
                                    const charId = bracketMatch[1].trim();
                                    const props = this.game.dungeonSystem.parseInlineProperties(bracketMatch[2]);
                                    this.game.dungeonSystem.updateActorProperties(charId, props);
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
                        this.game.dungeonSystem.updateActorProperties(charId, updates);
                    } else {
                        // Character doesn't exist -> add new actor
                        const slot = this.game.dungeonSystem.createSlotFromData(data);
                        this.game.dungeonSystem.addActorToScene(slot);
                    }
                }
            }
        });

        // List a character in the scene's actor panel without staging any art for them — someone
        // present in the fiction who has no portrait on stage, or who should be inspectable before
        // they appear. Mirrors `actor`'s syntax: bare ids add, `!id` removes, `false` clears.
        // Scene-scoped, so it clears when the actors do. Staged actors are listed automatically and
        // do not need this; listing one anyway is harmless (the panel de-duplicates).
        this.game.registerAction("panel_actor", {
            action: (data: string | boolean) => {
                const dungeonSystem = this.game.dungeonSystem;
                if (data === false) {
                    dungeonSystem.panelActors.value = [];
                    return;
                }
                if (typeof data !== 'string') {
                    gameLogger.error('[panel_actor] expects a comma-separated id string or false, got', data);
                    return;
                }
                const next = [...dungeonSystem.panelActors.value];
                for (const spec of this.game.logicSystem.getParts(data)) {
                    const id = spec.trim();
                    if (!id) continue;
                    if (id.startsWith('!')) {
                        const removeId = id.substring(1).trim();
                        const at = next.indexOf(removeId);
                        if (at !== -1) next.splice(at, 1);
                        continue;
                    }
                    if (!this.game.getCharacter(id)) {
                        gameLogger.error(`[panel_actor] Character "${id}" not found — not listed.`);
                        continue;
                    }
                    if (!next.includes(id)) next.push(id);
                }
                dungeonSystem.panelActors.value = next;
            }
        });

        this.game.registerAction("quest", {
            action: (questPath: string) => {
                // Support multiple quest logs separated by commas
                const questPaths = questPath.split(",").map(p => p.trim());

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
            }
        });
    }

    /**
     * Register character system actions
     */
    private registerCharacterActions(): void {


        this.game.registerAction("party", (data: string) => {
            for (let part of this.game.logicSystem.getParts(data, true)) {
                const leave = part.startsWith('!');
                const id = leave ? part.slice(1).trim() : part;
                let character = this.game.characterSystem.getCharacter(id);
                if (!character) {
                    throw new Error(`Character with id "${id}" not found.`);
                }
                if (leave) {
                    if (!this.game.characterSystem.isCharacterInParty(character)) {
                        gameLogger.warn(`[party] Character "${id}" is not in the party, skipping`);
                        continue;
                    }
                    this.game.characterSystem.removeFromParty(character);
                    this.game.dungeonSystem.addFlash(Global.getInstance().getString('party.left', { character: character.getName() }));
                } else {
                    if (this.game.characterSystem.isCharacterInParty(character)) {
                        gameLogger.warn(`[party] Character "${id}" is already in the party, skipping`);
                        continue;
                    }
                    this.game.characterSystem.addToParty(character);
                    this.game.dungeonSystem.addFlash(Global.getInstance().getString('party.joined', { character: character.getName() }));
                }
            }
        });


        // Accepts {create_character: "villager"} / "villager, guard" (id doubles as template id)
        // as well as {create_character: {id: "npc1", template: "villager", party: true}}.
        this.game.registerAction("create_character", (data: string | Record<string, any>) => {
            for (const spec of this.toCharacterSpecs(data, true)) {
                if (!spec.id) {
                    throw new Error("Character id is required when creating a character.");
                }

                // Checked here, before createCharacter: addCharacter throws on a duplicate id, and
                // resolveActions has no try/catch — a throw from a room hook aborts enterRoom()
                // before the room_enter_after trigger, leaving a half-built character behind.
                if (this.game.characterSystem.getCharacter(spec.id)) {
                    gameLogger.error(`[create_character] Character "${spec.id}" already exists, skipping`);
                    continue;
                }
                if (spec.template && !this.game.characterSystem.templatesMap.has(spec.template)) {
                    gameLogger.error(`[create_character] No template found for "${spec.template}"`);
                    continue;
                }

                let character
                if (spec.template) {
                    character = this.game.characterSystem.createCharacter(spec.id, spec.template);
                } else {
                    character = this.game.characterSystem.createCharacter(spec.id, spec as CharacterTemplateObject);
                }
                gameLogger.info(`[create_character] Created character "${spec.id}"${spec.template ? ` from template "${spec.template}"` : ''}`);

                this.game.characterSystem.addCharacter(character, spec.party);
            }
        });

        this.game.registerAction("update_character", (data: any) => {
            if (!data.id) {
                throw new Error("Character id is required when updating a character.");
            }
            let character = this.game.characterSystem.getCharacter(data.id);
            if (!character) {
                gameLogger.error(`[update_character] Character "${data.id}" not found`);
                return;
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
            gameLogger.info(`[update_character] Updated character "${data.id}"${partyStatus}`);
        });

        this.game.registerAction("delete_character", (data: any) => {
            if (!data.id) {
                throw new Error("Character id is required when deleting a character.");
            }
            // Log-and-return rather than letting deleteCharacter() throw: resolveActions has no
            // try/catch, so a throw here kills the rest of the action bag — and from a room hook
            // it aborts enterRoom() before the room_enter_after trigger (no turn tick, no event).
            if (!this.game.characterSystem.getCharacter(data.id)) {
                gameLogger.error(`[delete_character] Character "${data.id}" not found`);
                return;
            }
            this.game.characterSystem.deleteCharacter(data.id);
            gameLogger.info(`[delete_character] Deleted character "${data.id}"`);
        });

        // Accepts {reset_character: "orc"} / "orc, goblin" as well as
        // {reset_character: {id: "orc", template: "orc_veteran", party: false}}.
        this.game.registerAction("reset_character", (data: string | Record<string, any>) => {
            for (const spec of this.toCharacterSpecs(data)) {
                if (!spec.id) {
                    throw new Error("Character id is required when resetting a character.");
                }

                // Every state check lives here, not in resetCharacter: resolveActions has no try/catch,
                // so a throw from a room hook aborts enterRoom() before the room_enter_after trigger.
                const templates = this.game.characterSystem.templatesMap;
                if (spec.template && !templates.has(spec.template)) {
                    gameLogger.error(`[reset_character] No template found for "${spec.template}"`);
                    continue;
                }

                const character = this.game.characterSystem.getCharacter(spec.id);
                let fresh: Character;
                if (!character) {
                    // Nothing live — fall back to id-as-template-id, so the same call creates or rebuilds.
                    const templateId = spec.template || spec.id;
                    if (!templates.has(templateId)) {
                        gameLogger.error(`[reset_character] No live character or template found for "${spec.id}"`);
                        continue;
                    }
                    fresh = this.game.characterSystem.resetCharacter(spec.id, templateId);
                    gameLogger.warn(`[reset_character] "${spec.id}" was not live, created from template "${templateId}"`);
                } else {
                    const templateId = spec.template || character.templateId;
                    if (!templateId || !templates.has(templateId)) {
                        gameLogger.error(`[reset_character] Character "${spec.id}" has no known template ("${templateId}")`);
                        continue;
                    }
                    fresh = this.game.characterSystem.resetCharacter(character, templateId);
                    gameLogger.info(`[reset_character] Reset character "${spec.id}" from template "${templateId}"`);
                }

                // Party membership is preserved by resetCharacter; only an explicit key overrides it.
                if (spec.party !== undefined) {
                    const inParty = this.game.characterSystem.isCharacterInParty(fresh);
                    if (spec.party == true && !inParty) {
                        this.game.characterSystem.addToParty(fresh);
                    } else if (spec.party != true && inParty) {
                        this.game.characterSystem.removeFromParty(fresh);
                    }
                }
            }
        });

        this.game.registerAction("status", {
            action: (data: string) => {
                const groups = this.game.logicSystem.parseTargetedSpec(data);
                for (const group of groups) {
                    const character = this.game.characterSystem.characters.value.get(group.characterId);
                    if (!character) {
                        gameLogger.error(`[status] character not found: "${group.characterId}"`);
                        continue;
                    }
                    const characterName = character.getName?.() || character.getTrait?.('name') || group.characterId;
                    // Flashes are party-only: the player has no stake in a status landing on an NPC or an off-screen character.
                    const announce = this.game.isCharacterInParty(character);
                    for (const item of group.items) {
                        if (item.remove) {
                            const existing = character.getStatus(item.name);
                            character.removeStatus(item.name);
                            // Only announce a removal that happened. A room description clearing a
                            // status on entry runs on every entry, so arriving without the status
                            // would otherwise flash a line naming it by its raw id.
                            // The flash footer runs through v-script, so the lore link renders as a
                            // hoverable status card.
                            if (announce && existing) this.game.addFlash(Global.getInstance().getString('status.removed', {
                                character: characterName,
                                status: `[[status:${existing.id || item.name}]]`,
                            }));
                        } else {
                            try {
                                const status = this.game.createStatus(item.name);
                                character.addStatus(status);
                                const lineId = status?.polarity === 'positive' ? 'status.added.positive'
                                    : status?.polarity === 'negative' ? 'status.added.negative'
                                        : 'status.added.neutral';
                                if (announce) this.game.addFlash(Global.getInstance().getString(lineId, {
                                    character: characterName,
                                    status: `[[status:${status?.id || item.name}]]`,
                                }));
                            } catch (e) {
                                gameLogger.error(`[status] cannot apply "${item.name}" to "${group.characterId}": ${e}`);
                            }
                        }
                    }
                }
                gameLogger.info(`[status] ${data}`);
            }
        });

        this.game.registerAction("char", {
            action: (data: string | Record<string, any>) => {
                this.game.characterSystem.processCharAction(data);
            }
        });

        // Shortcuts for the char action with the type segment implied.
        // Usage: attr: "ane.face = hurt" ≡ char: "ane.attribute.face = hurt"
        const charShortcuts: Record<string, string> = {
            attr: 'attribute',
            trait: 'trait',
            stat: 'stat',
            resource: 'resource',
            skin_style: 'skinStyle',
        };
        for (const actionId in charShortcuts) {
            const type = charShortcuts[actionId];
            this.game.registerAction(actionId, {
                action: (data: string | Record<string, any>) => {
                    this.game.characterSystem.processCharAction(data, type);
                }
            });
        }

        this.game.registerAction("skin_layer", {
            action: (data: string) => {
                const groups = this.game.logicSystem.parseTargetedSpec(data);
                const adds: string[] = [];
                const removes: string[] = [];
                for (const group of groups) {
                    for (const item of group.items) {
                        const spec = `${group.characterId}.${item.name}`;
                        (item.remove ? removes : adds).push(spec);
                    }
                }
                if (adds.length) this.game.characterSystem.processAddSkinLayerAction(adds.join(', '));
                if (removes.length) this.game.characterSystem.processRemoveSkinLayerAction(removes.join(', '));
            }
        });

        this.game.registerAction("item_slot", {
            action: (data: string) => {
                const groups = this.game.logicSystem.parseTargetedSpec(data);
                const adds: string[] = [];
                const removes: string[] = [];
                for (const group of groups) {
                    for (const item of group.items) {
                        const spec = `${group.characterId}.${item.name}`;
                        (item.remove ? removes : adds).push(spec);
                    }
                }
                if (adds.length) this.game.characterSystem.processAddItemSlotAction(adds.join(', '));
                if (removes.length) this.game.characterSystem.processRemoveItemSlotAction(removes.join(', '));
            }
        });

        // Grant / remove innate (core-status) abilities per target.
        // Format: "charId->abilityId & abilityId, otherChar->!abilityId" (`!` removes)
        this.game.registerAction("ability", {
            action: (data: string) => {
                const groups = this.game.logicSystem.parseTargetedSpec(data);
                for (const group of groups) {
                    const character = this.game.getCharacter(group.characterId);
                    if (!character) {
                        gameLogger.warn(`[ability] character not found: "${group.characterId}"`);
                        continue;
                    }
                    for (const item of group.items) {
                        try {
                            if (item.remove) character.removeAbility(item.name);
                            else character.addAbility(item.name);
                        } catch (e) {
                            gameLogger.warn(`[ability] failed "${item.name}" for "${group.characterId}": ${e}`);
                        }
                    }
                }
                gameLogger.info(`[ability] ${data}`);
            }
        });

        // Learn skills for characters
        // Format: "characterId.treeId.slotId" or "characterId.treeId.slotId#level"
        // Or: "treeId.slotId" (uses selected character) or "treeId.slotId#level"
        this.game.registerAction("skill", {
            action: (data: string) => {
                const skillSpecs = data.split(",").map(s => s.trim());

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

                    // Capture the level as a NUMBER, not the entry: learnSkill mutates the live
                    // `learnedSkills` object in place, so a held reference would already read the
                    // new level by the time we compare.
                    const before = character.learnedSkills.find(s => s.skillTreeId === treeId && s.id === slotId)?.level ?? 0;

                    character.learnSkill(treeId, slotId, level);

                    const after = character.learnedSkills.find(s => s.skillTreeId === treeId && s.id === slotId)?.level ?? 0;
                    // learnSkill silently no-ops at max_upgrade_level, and a room description
                    // re-runs its actions on every entry — announce only a level that moved.
                    if (after <= before) continue;

                    // Flashes are party-only, the same contract `status` keeps: the player has no
                    // stake in a skill landing on an NPC or an off-screen character.
                    if (this.game.isCharacterInParty(character)) {
                        const skillId = this.game.characterSystem.skillTreesMap.get(treeId)?.skills?.find(s => s.id === slotId)?.skill;
                        const skillName = (skillId && this.game.characterSystem.skillSlotsMap.get(skillId)?.name) || slotId;
                        // Three lines, not two: `#level` on an UNLEARNED slot lands several levels at
                        // once, and picking on `before` alone would drop the level the author asked for.
                        const lineId = before ? 'skill.upgraded'
                            : after > 1 ? 'skill.learned.level'
                                : 'skill.learned';
                        this.game.addFlash(Global.getInstance().getString(lineId, {
                            skill: skillName,
                            level: after,
                        }));
                    }
                }
            }
        });
    }

    /**
     * Normalize a create_character / reset_character payload into a list of specs.
     * `"a, b"` becomes one spec per id. Objects pass through untouched, so create_character can
     * still treat the object itself as an inline template body.
     * Arrays need no handling here: resolveActions already runs the action once per element.
     * @param templateFromId - fill `template` with the id, the shape createDefaultEntities uses.
     *        create_character needs it (nothing else names a template); reset_character must not
     *        have it, or an explicit id would shadow the live character's own templateId —
     *        `orc_boss_2` built from `orc` has to keep resetting to `orc`.
     */
    private toCharacterSpecs(data: string | Record<string, any>, templateFromId: boolean = false): Record<string, any>[] {
        if (typeof data === 'string') {
            return this.game.logicSystem.getParts(data, true)
                .filter(id => id)
                .map(id => templateFromId ? { id, template: id } : { id });
        }
        return [data || {}];
    }

    /**
     * Register item system actions
     */
    private registerItemActions(): void {
        this.game.registerAction("equip_item", (data: {
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
        });

        this.game.registerAction("unequip_item", (data: {
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
        });

        this.game.registerAction("equip", (data: string) => {
            if (typeof data !== 'string') return;

            for (const spec of data.split(',').map(s => s.trim()).filter(Boolean)) {
                try {
                    const arrowIdx = spec.indexOf('->');

                    if (arrowIdx === -1) {
                        if (!spec.startsWith('!')) {
                            gameLogger.warn(`[equip] invalid spec (missing '->'): "${spec}"`);
                            continue;
                        }
                        const target = spec.slice(1).trim();
                        const dotIdx = target.indexOf('.');
                        const charId = (dotIdx === -1 ? target : target.slice(0, dotIdx)).trim();
                        const slotType = dotIdx === -1 ? "" : target.slice(dotIdx + 1).trim();

                        const character = this.game.getCharacter(charId);
                        if (!character) {
                            gameLogger.warn(`[equip] character not found: "${charId}"`);
                            continue;
                        }

                        const slots = slotType ? character.getItemSlotsBySlotId(slotType) : character.itemSlots;
                        let cleared = 0;
                        for (const slot of [...slots]) {
                            if (slot.itemUid) {
                                character.unequipItem(slot.itemUid);
                                cleared++;
                            }
                        }
                        if (cleared === 0) {
                            gameLogger.warn(`[equip] nothing to clear for "${spec}"`);
                        }
                        continue;
                    }

                    const target = spec.slice(0, arrowIdx).trim();
                    const dotIdx = target.indexOf('.');
                    const charId = (dotIdx === -1 ? target : target.slice(0, dotIdx)).trim();
                    const slotType = dotIdx === -1 ? "" : target.slice(dotIdx + 1).trim();

                    if (!charId) {
                        gameLogger.warn(`[equip] missing character in spec: "${spec}"`);
                        continue;
                    }

                    const character = this.game.getCharacter(charId);
                    if (!character) {
                        gameLogger.warn(`[equip] character not found: "${charId}"`);
                        continue;
                    }

                    const inventory = character.getPartyInventory();
                    if (!inventory) {
                        gameLogger.warn(`[equip] no inventory for character "${charId}"`);
                        continue;
                    }

                    const payloads = spec.slice(arrowIdx + 2).split('&').map(s => s.trim()).filter(Boolean);
                    for (const payload of payloads) {
                        try {
                            const remove = payload.startsWith('!');
                            const itemId = (remove ? payload.slice(1) : payload).trim();
                            if (!itemId) continue;

                            if (remove) {
                                const candidateSlots = slotType ? character.getItemSlotsBySlotId(slotType) : character.itemSlots;
                                let removed = 0;
                                for (const slot of [...candidateSlots]) {
                                    if (!slot.itemUid) continue;
                                    const equipped = inventory.getItemByUid(slot.itemUid);
                                    if (equipped && equipped.id === itemId) {
                                        character.unequipItem(slot.itemUid);
                                        removed++;
                                    }
                                }
                                if (removed === 0) {
                                    gameLogger.warn(`[equip] "${itemId}" is not equipped on "${charId}"${slotType ? ` in slot "${slotType}"` : ''}`);
                                }
                                continue;
                            }

                            let item: Item | null = inventory.items.find(i => i.id === itemId && !i.isEquipped) ?? null;
                            let created = false;
                            if (!item) {
                                try {
                                    item = this.game.createItem(itemId);
                                    created = true;
                                } catch {
                                    gameLogger.warn(`[equip] item id not found / not resolvable: "${itemId}"`);
                                    continue;
                                }
                            }

                            if (slotType) {
                                if (character.getItemSlotsBySlotId(slotType).length === 0) {
                                    gameLogger.warn(`[equip] slot type not found: "${charId}.${slotType}"`);
                                    continue;
                                }
                                character.equipItem(item, slotType);
                            } else {
                                if (!character.getRelevantSlotForItem(item)) {
                                    gameLogger.warn(`[equip] no compatible slot for item "${itemId}" on "${charId}"`);
                                    continue;
                                }
                                character.equipItem(item);
                            }
                            if (created) {
                                const message = Global.getInstance().getString('item.added', { item: item.getName(), quantity: '' });
                                this.game.dungeonSystem.addFlash(message);
                            }
                        } catch (e) {
                            gameLogger.warn(`[equip] failed payload "${payload}" in spec "${spec}": ${e}`);
                        }
                    }
                } catch (e) {
                    gameLogger.warn(`[equip] failed spec "${spec}": ${e}`);
                }
            }
        });

        // Learn the recipe named by the item's `learn_recipe` field, consuming the item. If the recipe
        // is already known, learns nothing and just notifies. Value is optional { itemUid, characterId };
        // both fall back to the active-item / used-character state (so a bare `{learn_recipe_item: true}`
        // works from an item choice or a scene action).
        this.game.registerAction("learn_recipe_item", (data: {
            itemUid?: string;
            characterId?: string;
        } = {}) => {
            const itemUid = data.itemUid || this.game.getState('active_item') || "";
            const characterId = data.characterId || this.game.characterSystem.usedCharacterId.value || "";
            const character = this.game.getCharacter(characterId);
            const inventory = character?.getPartyInventory();
            const item = inventory?.getItemByUid(itemUid) || this.game.itemSystem.getItemByUid(itemUid);
            if (!item || !item.learn_recipe) {
                gameLogger.warn(`[learn_recipe_item] item "${itemUid}" not found or has no learn_recipe`);
                return;
            }

            const recipeId = item.learn_recipe;
            const recipeName = this.game.itemSystem.itemRecipesMap.get(recipeId)?.name || recipeId;

            if (this.game.itemSystem.learnedRecipes.value.has(recipeId)) {
                this.game.showNotification(Global.getInstance().getString('recipe.already_known', { recipe: recipeName }));
                return;
            }

            this.game.itemSystem.addLearnedRecipe(recipeId);
            this.game.itemSystem.discoverItem(item.id);
            inventory?.removeItem(item);
            this.game.showNotification(Global.getInstance().getString('recipe.learned', { recipe: recipeName }));
        });

        this.game.registerAction("consume_item", (data: {
            itemUid: string;
            characterId: string;
        }) => {
            const itemUid = data.itemUid || this.game.getState('active_item');
            const characterId = data.characterId || this.game.characterSystem.usedCharacterId.value || "";
            const character = this.game.getCharacter(characterId);
            if (!character) {
                throw new Error(`Character with id "${characterId}" not found.`);
            }

            const inventory = character.getPartyInventory();
            if (!inventory) {
                throw new Error(`No inventory found for character "${characterId}"`);
            }

            const item = inventory.getItemByUid(itemUid);
            if (!item || !item.isConsumable()) {
                throw new Error(`Item with uid "${itemUid}" not found or not consumable`);
            }

            // Set active states for action scripts
            if (!this.game.getState('supress_game_events')) {
                this.game.coreSystem.setState('active_character', characterId);
                this.game.coreSystem.setState('active_inventory', inventory.id);
                this.game.coreSystem.setState('active_item', item.uid);
            }

            // Before scripts + emitter (cancellable)
            if (item.actions?.item_consume_before) {
                this.game.logicSystem.resolveActions(item.actions.item_consume_before);
            }
            if (!this.game.trigger('item_consume_before', item, character)) return;

            // 1) Apply consume statuses — real status templates, so each carries its own
            // duration/max_stacks/polarity/group_id. addStatus handles stacking + group replacement.
            for (const entry of item.apply_statuses_on_consume) {
                if (!entry?.status) continue;
                try {
                    const status = this.game.createStatus(entry.status);
                    // A consumable's status wears the icon of the item that applied it, so game data
                    // does not have to duplicate the art on both. Recorded as an id — see
                    // Status.displayImage. A status that defines its own image keeps it.
                    if (!status.image) status.iconSource = item.id;
                    character.addStatus(status, { stacks: entry.stacks ?? 1 });
                } catch (e) {
                    gameLogger.error(`[consume_item] cannot apply status "${entry.status}" from item "${item.id}": ${e}`);
                }
            }

            // 2) Apply consume_percentage (% of max resource)
            for (const statId in item.consume_percentage) {
                const pct = item.consume_percentage[statId];
                if (!pct) continue;
                const stat = this.game.characterSystem.statsMap.get(statId);
                if (!stat || !stat.is_resource) {
                    gameLogger.warn(`[consume_item] Stat "${statId}" not found or not a resource, skipping`);
                    continue;
                }
                const maxVal = character.getStat(statId);
                character.addResource(statId, maxVal * (pct / 100));
            }

            // 3) Apply consume_absolute (flat resource change)
            for (const statId in item.consume_absolute) {
                const amount = item.consume_absolute[statId];
                if (!amount) continue;
                const stat = this.game.characterSystem.statsMap.get(statId);
                if (!stat || !stat.is_resource) {
                    gameLogger.warn(`[consume_item] Stat "${statId}" not found or not a resource, skipping`);
                    continue;
                }
                character.addResource(statId, amount);
            }

            // 4) Reduce quantity by 1; remove if empty
            inventory.reduceItemQuantity(item, 1);

            // After scripts + emitter
            if (item.actions?.item_consume_after) {
                this.game.logicSystem.resolveActions(item.actions.item_consume_after);
            }
            this.game.trigger('item_consume_after', item, character);

            const itemName = item.getTrait('name') || item.id;
            const rarity = item.getRarity() || '';
            const rarityClass = rarity ? `item-name rarity_${rarity}` : '';
            const itemHtml = `<b class="${rarityClass}">${itemName}</b>`;
            Global.getInstance().addNotification(
                `${character.getName()} consumed ${itemHtml}`
            );
            gameLogger.info(`[consume_item] "${character.id}" consumed "${item.id}"`);
        });

        // Open the drop confirmation popup (quantity slider for stacks). The popup owns the confirm,
        // the cancellable item_drop_before emitter, and the removal — see DropItemPopup.vue. Items
        // the render emitter vetoes never reach here; getItemChoices omits their Drop choice.
        this.game.registerState('drop_item_pending', null);
        this.game.registerAction("drop_item", (data: { itemUid: string; characterId: string }) => {
            const itemUid = data.itemUid || this.game.getState('active_item');
            const characterId = data.characterId || this.game.characterSystem.usedCharacterId.value || "";
            const inventory = this.game.itemSystem.getInventory(PARTY_INVENTORY_ID);
            if (!inventory?.getItemByUid(itemUid)) return;
            this.game.setState('drop_item_pending', { itemUid, characterId });
            this.game.openPopup('drop_item_popup');
        });

        // choose_item — DQ9's item picker popup. Pauses the scene (eventDelayed parks it on the
        // synthetic continue choice), opens a grid of matching party-bag items; the pick lands in
        // active_item (uid) + chosen_item_id (template id, survives remove: true), then the
        // follow-up scene plays (or the story resumes). Cancel resumes with chosen_item_id = ''.
        // Value: "all" | "<category>" | { id?, category?, tags?, remove?, scene?, title? }
        // (id/category/tags accept a string or an array; branch on _chosen_item(item_id)).
        this.game.registerState('choose_item_pending', null);
        this.game.registerState('chosen_item_id', '');
        this.game.registerAction("choose_item", {
            eventDelayed: true,
            action: (value: string | { id?: string | string[]; category?: string | string[]; tags?: string | string[]; remove?: boolean; scene?: string; title?: string }) => {
                let pending: Record<string, any>;
                if (typeof value === 'string' || value === true as any) {
                    pending = (typeof value === 'string' && value !== 'all') ? { category: value } : {};
                } else {
                    pending = { ...value };
                    if (pending.category === 'all') delete pending.category;
                }
                this.game.setState('chosen_item_id', '');
                this.game.setState('choose_item_pending', pending);
                this.game.openPopup('choose_item_popup');
            },
        });

        // ── Books & paintings ──
        // A book item (trait `book` = scene id in the global dungeon, e.g. "books.eilfiel") reads
        // through the scene system: paragraphs are pages, choices are Next/Previous/Read again/
        // Close (created in dungeonSystem.createBookChoices while reading_book is set). Bookmarks
        // persist per item; finishing the last page discovers the item and clears the bookmark.
        this.game.registerState('reading_book', null);
        this.game.registerState('book_bookmarks', {});

        const resolveItemValue = (value: any): Item | null => {
            const itemUid = value?.itemUid || (value === true || typeof value !== 'string' ? this.game.getState('active_item') : '');
            if (itemUid) {
                return this.game.itemSystem.getItemByUid(itemUid) || null;
            }
            if (typeof value === 'string') {
                return this.game.itemSystem.getInventory(PARTY_INVENTORY_ID)?.getItemsById(value)[0] || null;
            }
            return null;
        };

        this.game.registerAction("read_book", (value: any) => {
            const item = resolveItemValue(value);
            const ref = (item?.traits as any)?.book;
            if (!item || !ref) {
                gameLogger.warn(`[read_book] no item with a book trait resolved from`, value);
                return;
            }
            // The engine's scene-reference grammar owns the parsing — the trait takes anything
            // the scene action takes (dungeon.room.scene, room.scene, full #ids, &anchors).
            const resolved = this.game.dungeonSystem.resolveSceneId(String(ref));
            if (!resolved.sceneId) {
                gameLogger.error(`[read_book] book trait "${ref}" on "${item.id}" did not resolve to a scene.`);
                return;
            }
            const dungeonId = resolved.dungeonId || this.game.dungeonSystem.currentDungeonId.value || '';
            const base = resolved.sceneId.replace(/^#/, '').split('.').slice(0, -3).join('.');
            if (!this.game.dungeonSystem.dungeonLines.get(dungeonId)?.get(`#${base}.1.1.1`)) {
                gameLogger.error(`[read_book] scene "#${base}.1.1.1" not found in dungeon "${dungeonId}" (book trait on "${item.id}").`);
                return;
            }
            const bookmarks = (this.game.getState('book_bookmarks') || {}) as Record<string, number>;
            this.playBookPage(item.id, dungeonId, base, bookmarks[item.id] || 1);
        });

        this.game.registerAction("read_page", (page: number) => {
            const reading = this.game.getState('reading_book') as { itemId: string; dungeonId: string; base: string; page: number } | null;
            if (!reading || typeof page !== 'number') {
                return;
            }
            this.playBookPage(reading.itemId, reading.dungeonId, reading.base, page);
        });

        this.game.registerAction("read_close", () => {
            this.game.setState('reading_book', null);
            this.game.dungeonSystem.playScene(null, null);
        });

        // A painting item (trait `painting` = asset id; the item id when equal/empty) opens a fake
        // scene: the registered full-size asset as background, the item's description as the scene
        // text. The scene line is synthesized into the global dungeon on first view. Viewing
        // discovers the item.
        this.game.registerAction("view_painting", (value: any) => {
            const item = resolveItemValue(value);
            const traitValue = (item?.traits as any)?.painting;
            if (!item || !traitValue) {
                gameLogger.warn(`[view_painting] no item with a painting trait resolved from`, value);
                return;
            }
            // Each painting is a one-paragraph scene in the "_paintings" SHADOW dungeon: the
            // definition accumulates a pre-parsed line per viewed painting and persists in saves
            // (so a save taken mid-view restores cleanly). Assets stage via the inline {asset}.
            const assetId = (typeof traitValue === 'string' && traitValue.length) ? traitValue : item.id;
            const lineId = `#view.${item.id}.1.1.1`;
            const shadow = this.game.dungeonSystem.shadowDungeons.value.get('_paintings');
            const existingLines = (Array.isArray(shadow?.content) ? shadow!.content : []) as { id: string; val?: string }[];
            if (!existingLines.some(line => line.id === lineId)) {
                const description = (item.traits as any)?.description || '';
                this.game.dungeonSystem.addShadowDungeon('_paintings', {
                    content: [...existingLines, { id: lineId, val: `${description}\n{asset: "${assetId}"}` }],
                });
            }
            this.game.itemSystem.discoverItem(item.id);
            this.game.dungeonSystem.playSceneResolver(`_paintings.view.${item.id}`, null);
        });

        // A usable item (trait `use_scene` = a scene reference) opens that scene from the party
        // inventory with the item as the active one, so the scene reads |item| and can spend or
        // destroy it. Deliberately dumb: no cost, no gating, no consumption — the scene owns all
        // of that, which is what makes one trait enough for every kind of usable item.
        this.game.registerAction("use_scene", (value: any) => {
            const item = resolveItemValue(value);
            const ref = (item?.traits as any)?.use_scene;
            if (!item || !ref) {
                gameLogger.warn(`[use_scene] no item with a use_scene trait resolved from`, value);
                return;
            }
            this.game.coreSystem.setState('active_item', item.uid);
            this.game.dungeonSystem.playSceneResolver(String(ref), null);
        });

        this.game.registerAction("add_item", (data: string | string[]) => {
            this.game.itemSystem.addItemsBySpec(data);
        })

        this.game.registerAction("remove_item", (data: boolean | number | string | string[]) => {
            this.game.itemSystem.removeItemsBySpec(data);
        })

        this.game.registerAction("transfer_item", (data: string | string[]) => {
            this.game.itemSystem.transferItemsBySpec(data);
        })

        // Show an item card under the dialogue text (EventItemCard on scene-content-bottom).
        // true/1 = the active item (the one whose custom choice opened the scene);
        // "item_id" = first matching stack in the party inventory; false = hide.
        // Cleared automatically on event_end.
        this.game.registerAction("item_view", (value: boolean | number | string) => {
            if (value === false) {
                this.game.coreSystem.setState('viewed_item', null);
                return;
            }
            let uid: string | null = null;
            if (typeof value === 'string') {
                const inventory = this.game.itemSystem.getInventory(PARTY_INVENTORY_ID);
                uid = inventory?.items.find(i => i.id === value)?.uid ?? null;
                if (!uid) gameLogger.warn(`[item_view] item "${value}" not found in party inventory`);
            } else {
                uid = this.game.getState('active_item');
                if (!uid) gameLogger.warn(`[item_view] no active item to show`);
            }
            this.game.coreSystem.setState('viewed_item', uid);
        });

        // Collect a collectable encounter: grant its item(s) and latch the encounter
        // hidden (with its regrow countdown stamped). The synthesized Collect choice
        // passes { spec, encounter }; author-written {collect: "id#qty"} passes a
        // string and falls back to the active encounter.
        this.game.registerAction("collect", {
            action: (value: string | { spec: string; encounter: string }) => {
                const spec = typeof value === 'string' ? value : value?.spec;
                if (!spec) {
                    gameLogger.error('[collect] missing item spec', value);
                    return;
                }
                // No scene-text flash — the notification below is the pickup's only feedback,
                // so the room description doesn't double-report when it's on screen.
                this.game.itemSystem.addItemsBySpec(spec, false);
                for (const part of spec.split(',').map(s => s.trim()).filter(Boolean)) {
                    const [itemId, rawQty] = part.split('#').map(s => s.trim());
                    const quantity = parseInt(rawQty, 10) || 1;
                    this.game.showNotification(Global.getInstance().getString('item.collected', {
                        item: this.game.itemSystem.getItemNameHtml(itemId),
                        quantity: quantity > 1 ? ` (x${quantity})` : '',
                    }));
                }

                const encounterId = typeof value === 'object' && value.encounter
                    ? value.encounter
                    : this.game.dungeonSystem.activeEncounter.value?.id;
                const encounter = encounterId
                    ? this.game.dungeonSystem.currentDungeon.value?.encounters.get(encounterId)
                    : null;
                if (encounter?.collectSpec) {
                    this.game.dungeonSystem.markEncounterCollected(encounter);
                    const dungeonId = this.game.dungeonSystem.currentDungeonId.value ?? '';
                    this.game.trigger('encounter_collected', encounter.id, spec, dungeonId);
                    gameLogger.info(`[collect] "${encounter.id}" collected (${spec})`);
                } else {
                    gameLogger.warn(`[collect] granted "${spec}" but found no collectable encounter to latch`);
                }
            }
        });

        this.game.registerAction("loot",
            {
                action: (inventoryId: string) => {
                    this.game.itemSystem.openExchange(inventoryId, 'loot');
                },
                eventDelayed: true
            }
        );

        this.game.registerAction("trade",
            {
                action: (inventoryId: string) => {
                    this.game.itemSystem.openExchange(inventoryId, 'trade');
                },
                eventDelayed: true
            }
        );

        this.game.registerAction("learn_recipe", (recipeId: string) => {
            for (const part of recipeId.split(",").map(p => p.trim())) {
                this.game.itemSystem.addLearnedRecipe(part);
            }
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
            const armorValue = char.getStat("armor") || 0;
            const lewdness = Number(this.game.getProperty("lewds")?.currentValue) || 0
            return {
                power: armorValue * 2,
                lewdness: lewdness * 2,
            };
        });
*/

    }
}
