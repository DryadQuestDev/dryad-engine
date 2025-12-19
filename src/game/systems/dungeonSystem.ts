import { ref, Ref, computed, type ComputedRef } from "vue";
import gsap from 'gsap';

import { DungeonData } from "../core/dungeon/dungeonData";
import { Skip } from "../../utility/save-system";
import { ChoiceType, DungeonLine } from "../types";
import { Dungeon } from "../core/dungeon/dungeon";
import { Populate } from "../../utility/save-system";
import { Observable, Subscription } from 'rxjs';
import { of, from } from 'rxjs';
import { concatMap, delay, tap } from 'rxjs/operators';
import { SettingsObject } from "../../schemas/settingsSchema";
import { DungeonRoom } from "../core/dungeon/dungeonRoom";
import { Game } from "../game";
import { DungeonFabric } from "../core/dungeon/dungeonFabric";
import { Global } from "../../global/global";
import { DungeonEncounter } from "../core/dungeon/dungeonEncounter";
import { Choice } from "../core/content/choice";
import { Character } from "../core/character/character";
import { AssetObject } from "../../schemas/assetSchema";
import { gameLogger } from "../utils/logger";
import { CharacterSceneSlotObject } from "../../schemas/characterSceneSlotSchema";
import { DungeonRoomObject } from "../../schemas/dungeonRoomSchema";
import { DungeonEncounterObject } from "../../schemas/dungeonEncounterSchema";
import { DungeonConfigParsed } from "../../editor/editor";
export type LogObject = {
  content: string;
  isChoice: boolean;
  character?: string;
  flash?: string[];
}

export type ReplaySceneObject = {
  dungeons?: {
    id: string,
    name: string,
    order: number,
    scenes?: {
      id: string,
      name: string,
      unlocked: boolean
    }[]
  }[]
}

type QueueLoc = {
  node: DungeonRoom;
  path: DungeonRoom[];
}

export type QuestObject = {
  id: string;
  dungeonId: string;
  lastUpdated: number; // timestamp for sorting
  goals: {
    id: string;
    logs: string[];
    isCompleted: boolean;
  }[]
}

export type SceneSlot = CharacterSceneSlotObject & {
  char: string; // character ID (renamed from characterId)
  isRemoving?: boolean; // Flag to trigger exit animation before removal
}

export type SceneAsset = AssetObject & {
  isRemoving?: boolean; // Flag to trigger exit animation before removal
}

export class DungeonSystem {

  // Toolbar state
  @Skip()
  public showLocationCircles: Ref<boolean> = ref(true);
  @Skip()
  public toolbarMinimized: Ref<boolean> = ref(false);

  // Computed property to check if there are visible encounters in current room
  @Skip()
  public hasVisibleEncounters: ComputedRef<boolean> = computed(() => {
    if (!this.currentRoom.value || !this.currentDungeon.value) {
      return false;
    }

    const currentRoom = this.currentRoom.value;

    // Iterate through all encounters in the dungeon
    for (const encounter of this.currentDungeon.value.encounters.values()) {
      const isVisible = encounter.getVisibilityState();
      const isHere = encounter.isHere(currentRoom);
      const isDescription = encounter === currentRoom.descriptionEncounter;
      const isProp = encounter.isProp();

      // Check if encounter is visible, in the current room, not description, and not a prop
      if (isVisible && isHere && !isDescription && !isProp) {
        return true; // Found at least one visible selectable encounter
      }
    }

    return false;
  });







  get game() {
    return Game.getInstance();
  }

  // Method to handle asset adding logic
  public addAssets(data: string[] | string | (Partial<AssetObject> & { id: string })): void {
    let assetIds: string[] = [];

    // Handle string input (comma-separated asset IDs)
    if (typeof data === 'string') {
      assetIds = data.split(',').map(id => id.trim()).filter(id => id);
    } else if (Array.isArray(data)) {
      assetIds = data;
    }

    if (assetIds.length > 0) {

      for (const assetId of assetIds) {
        const template = this.assetsMap.get(assetId);

        if (!template) {
          gameLogger.error(`Asset template with id "${assetId}" not found in assetsMap. Skipping.`);
          continue;
        }

        // Check if asset already exists - skip if it does (prevents duplicates)
        const existingAsset = this.assets.value.find(a => a.id === assetId);
        if (existingAsset) {
          //gameLogger.info(`[addAsset] Asset "${assetId}" already exists in scene, skipping.`);
          continue;
        }

        // Create asset from template
        const asset: AssetObject = { ...template };

        // Allow final mutations before adding
        this.game.trigger('asset_render', asset);

        this.assets.value.push(asset);

        // add to discovered assets for the gallery system
        this.game.coreSystem.addAssetToGallery(asset);
        gameLogger.info(`[addAsset] Added asset: "${assetId}"`);
      }
      return;
    }

    if (data && typeof data === 'object' && 'id' in data) {

      // Handle object input (original behavior)
      const template = this.assetsMap.get(data.id);

      if (!template) {
        throw new Error(`Asset template with id "${data.id}" not found in assetsMap.`);
      }

      // Check if asset already exists
      const existingAsset = this.assets.value.find(a => a.id === data.id);
      if (existingAsset) {
        // Update existing asset with new properties
        Object.assign(existingAsset, data);
        // Allow final mutations after update
        this.game.trigger('asset_render', existingAsset);
        // add to discovered assets for the gallery system
        this.game.coreSystem.addAssetToGallery(existingAsset);
        gameLogger.info(`[addAsset] Updated existing asset: "${data.id}"`);
        return;
      }

      // Create a new asset by merging template with user-provided properties
      // User-provided properties override template properties
      const asset: AssetObject = {
        ...template,
        ...data
      };

      // Allow final mutations before adding
      this.game.trigger('asset_render', asset);

      this.assets.value.push(asset);

      // add to discovered assets for the gallery system
      this.game.coreSystem.addAssetToGallery(asset);
      gameLogger.info(`[addAsset] Added asset: "${data.id}"`);
    }
    else {
      gameLogger.error(`Invalid asset data: ${data}`);
    }
  }

  // Method to handle asset removal logic with exit animation support
  public removeAssets(data: string[] | string): void {
    let assetIds: string[] = [];

    // Handle string input (comma-separated asset IDs)
    if (typeof data === 'string') {
      assetIds = data.split(',').map(id => id.trim()).filter(id => id);
    } else if (Array.isArray(data)) {
      assetIds = data;
    }

    for (const assetId of assetIds) {
      const asset = this.assets.value.find(a => a.id === assetId);
      if (!asset) {
        gameLogger.warn(`[removeAsset] Asset "${assetId}" not found in scene, skipping.`);
        continue;
      }

      // Check if asset has exit animation
      const exitType = asset.exit;
      if (exitType && exitType !== 'none') {
        // Mark asset for removal to trigger exit animation
        asset.isRemoving = true;

        // Schedule actual removal after exit animation completes
        const exitDuration = asset.exit_duration ?? 0.5;
        const delay = exitDuration * 1000 + 100; // Add buffer for animation

        setTimeout(() => {
          if (asset.isRemoving) {
            this.assets.value = this.assets.value.filter(a => a.id !== assetId);
            gameLogger.info(`[removeAsset] Removed asset after exit animation: "${assetId}"`);
          }
        }, delay);
      } else {
        // No exit animation, remove immediately
        this.assets.value = this.assets.value.filter(a => a.id !== assetId);
        gameLogger.info(`[removeAsset] Removed asset: "${assetId}"`);
      }
    }
  }

  get global() {
    return Global.getInstance();
  }

  // ignore types
  public _loadAndSetDungeonActual(dungeonId: string) {

    if (this.game.coreSystem.stateLoading.value && this.currentDungeon.value?.id === dungeonId) {
      gameLogger.warn(`Dungeon ${dungeonId} is already loading or loaded.`);
      return;
    }
    const dungeonFabric = new DungeonFabric();
    this.currentDungeon.value = dungeonFabric.createDungeon(dungeonId);

  }


  // ID of the currently active dungeon, part of saved state
  public currentDungeonId: Ref<string | null> = ref(null);
  // ID of the current room in the active dungeon, part of saved state
  public currentRoomId: Ref<string | null> = ref(null);

  // if it's the first scene in the event.
  public isRootScene: Ref<boolean> = ref(false);

  // events
  public currentSceneId: Ref<string | null> = ref(null);
  public currentSceneIdAnimated: Ref<string | null> = ref(null);
  public talkingCharacterId: Ref<string | null> = ref(null);
  public sceneSlots: Ref<SceneSlot[]> = ref([]);

  // Flag to skip enter animations when loading a save
  @Skip()
  public isLoadingSave: Ref<boolean> = ref(false);


  // Slot templates storage (defined slots that can be referenced by id)
  @Skip()
  public characterSlotTemplates: Map<string, Partial<CharacterSceneSlotObject>> = new Map();

  @Skip()
  public talkingCharacter: ComputedRef<Character | null> = computed(() => {
    if (!this.talkingCharacterId.value) {
      return null;
    }
    let character = this.game.characterSystem.characters.value.get(this.talkingCharacterId.value);
    if (!character) {
      throw new Error(`Character with id "${this.talkingCharacterId.value}" not found.`);
    }
    return character;
  });

  public cachedText: Ref<string | null> = ref("");
  public cachedFlashArray: Ref<string[]> = ref([]);
  public delayedActionObject: Record<string, any> = {};
  public reloadActionObject: Record<string, any> = {};
  public activeDungeonId: Ref<string | null> = ref(null);
  public activeRoomId: Ref<string | null> = ref(null);

  public addFlash(flash: string) {
    this.cachedFlashArray.value.push(flash);
  }

  // assets
  public assets: Ref<SceneAsset[]> = ref([]);

  @Skip()
  public assetsMap: Map<string, AssetObject> = new Map();


  @Skip()
  public choiceType: ComputedRef<ChoiceType> = computed(() => {
    if (this.currentSceneId.value) {
      return "scene";
    }
    return "encounter";
  });
  @Skip()
  public relevantChoices: ComputedRef<Choice[] | Choice | null> = computed(() => {
    if (this.currentSceneId.value) {
      return this.eventChoices.value;
    }
    return this.encounterChoices.value;
  });

  @Skip()
  public encounterChoices: ComputedRef<Choice[]> = computed(() => {
    return this.activeEncounter.value?.choices || [];
  });

  @Skip()
  eventChoices: Ref<Choice | Choice[] | null> = ref(null);






  public resolveSceneId(value: string): { sceneId: string | null, dungeonId: string | null } {
    let anchor = "";
    let sceneId;
    let realSceneId = "";
    let dungeonId = null;

    // Special case: "next" - get next scene from current scene
    if (value === "next") {
      const currentSceneId = this.currentSceneId.value;
      if (!currentSceneId) {
        gameLogger.warn("Cannot resolve 'next' - no current scene");
        return { sceneId: null, dungeonId: null };
      }
      const nextSceneId = this.getNextSceneId(currentSceneId);
      if (!nextSceneId) {
        return { sceneId: null, dungeonId: null };
      }
      return { sceneId: nextSceneId, dungeonId: null };
    }

    // Special case: "shift:x" - get block shifted by x from current scene
    if (value.startsWith("shift:")) {
      const shiftValue = value.substring(6); // Remove "shift:" prefix
      const shift = parseInt(shiftValue);
      if (isNaN(shift)) {
        gameLogger.error(`Invalid shift value: ${shiftValue}`);
        return { sceneId: null, dungeonId: null };
      }
      const currentSceneId = this.currentSceneId.value;
      if (!currentSceneId) {
        gameLogger.warn("Cannot resolve shift - no current scene");
        return { sceneId: null, dungeonId: null };
      }
      const blockId = this.getBlockId(currentSceneId, shift);
      if (!blockId) {
        return { sceneId: null, dungeonId: null };
      }
      return { sceneId: blockId, dungeonId: null };
    }

    let parts = value.split(".");

    let firstChar = value.charAt(0);
    if (firstChar == "&") {
      // case 1a: anchor without dungeon: &my_anchor
      if (parts.length == 1) {
        anchor = value.slice(1);
        dungeonId = this.activeDungeonId.value!;
        // case 1b: anchor with dungeon: &my_dungeon.my_anchor
      } else if (parts.length == 2) {
        anchor = parts[1];
        dungeonId = parts[0].slice(1);
      } else {
        throw new Error(`Invalid anchor: ${value}`);
      }
      let lines = this.dungeonLines.get(dungeonId);
      if (lines) {
        for (let [id, line] of lines) {
          if (line.anchor == anchor) {
            return { sceneId: id, dungeonId: dungeonId };
          }
        }
      } else {
        throw new Error(`Dungeon lines not found for dungeon ${dungeonId}`);
      }
    }


    // case 2: just scene without room or dungeon: my_scene
    if (parts.length == 1) {
      realSceneId = value;
      if (firstChar == "#") {
        realSceneId = realSceneId.slice(1);
      }
      let roomId = Game.getInstance().dungeonSystem.activeRoomId.value || Game.getInstance().dungeonSystem.currentRoomId.value;
      realSceneId = "#" + roomId + "." + realSceneId + ".1.1.1";
      return { sceneId: realSceneId, dungeonId: null };
    }


    // case 3a: full scene id without dungeon: #my_room.my_scene.1.1.2
    if (parts.length == 5) {
      // Check if value already starts with #
      realSceneId = value.startsWith("#") ? value : "#" + value;
      dungeonId = null;
      // case 3b: full scene id with dungeon: #my_dungeon.my_room.my_scene.1.1.2
    } else if (parts.length == 6) {
      // Check if parts[0] already starts with #
      const firstPart = parts[0].startsWith("#") ? parts[0].slice(1) : parts[0];
      realSceneId = "#" + parts[1] + "." + parts[2] + "." + parts[3] + "." + parts[4] + "." + parts[5];
      dungeonId = firstPart;
    }
    // case 4a: scene name without dungeon: my_room.my_scene
    else if (parts.length == 2) {
      sceneId = parts[0] + "." + parts[1];
      dungeonId = null;
      // case 4b: scene name with dungeon: my_dungeon.my_room.my_scene
    } else if (parts.length == 3) {
      sceneId = parts[1] + "." + parts[2];
      dungeonId = parts[0];
    }
    if (!realSceneId) {
      realSceneId = "#" + sceneId + ".1.1.1";
    }
    return { sceneId: realSceneId, dungeonId: dungeonId };
  }


  // 0 - no choices, 1 - choices, 2 - choices over
  isChoices: number = 0;
  public playScene(sceneId: string | null, dungeonId: string | null) {

    this.cancelPathMovement();

    if (!sceneId) {
      this.exitScene();
      return;
    }

    let isRootScene = this.isRootScene.value;
    //console.warn("isRootScene", isRootScene);

    this.isChoices = 0;
    this.cachedFlashArray.value = [];



    // Reset animated scene ID when starting a new scene
    this.currentSceneIdAnimated.value = null;

    // Reset the isLoadingSave flag to ensure enter animations play for new scenes
    // (only the initially loaded scene should skip enter animations)
    this.isLoadingSave.value = false;

    // Complete all ongoing character animations immediately to prevent animations
    // carrying over into the new scene
    this.completeAllCharacterAnimations();

    let parts = sceneId.split(".");

    let dungeonUsedId = this.getDungeonId(dungeonId);


    // check if dungeon actually exists
    if (!this.dungeonDatas.value.has(dungeonUsedId)) {
      gameLogger.error(`Dungeon '${dungeonUsedId}' does not exist. Skipping scene '${sceneId}'.`);
      return;
    }

    let line = this.getLineByDungeonId(sceneId, dungeonUsedId);
    // check if scene actually exists
    if (!line) {
      gameLogger.error(`Scene '${sceneId}' does not exist in dungeon '${dungeonUsedId}'. Skipping scene '${sceneId}'.`);
      return;
    }

    gameLogger.info(`Playing scene: ${sceneId}`);
    let proceed = this.game.trigger('scene_play_before', sceneId, dungeonUsedId, isRootScene);
    if (!proceed) {
      return;
    }

    // put game state change after here
    this.game.coreSystem.setState('block_party_inventory', true);

    // close progression window
    this.game.coreSystem.setState('progression_state', null);

    //this.talkingCharacterId.value = null;
    this.currentSceneId.value = sceneId;
    this.activeRoomId.value = parts[0].slice(1);
    this.activeDungeonId.value = dungeonUsedId;

    let { output, actions } = this.game.logicSystem.resolveString(line.val, true);


    // Check for {redirect} first. If there's then resolve and return immediately.
    if (actions["redirect"]) {
      gameLogger.info("Redirecting to scene:", actions["redirect"]);
      this.game.logicSystem.resolveActions(actions);
      return;
    }

    if (this.isRootScene.value) {

      // real scene
      if (!this.game.getState('replay_mode')) {

        // load default room assets
        if (this.currentRoom.value?.defaultAssets && this.currentRoom.value?.defaultAssets.length > 0) {
          this.addAssets(this.currentRoom.value.defaultAssets);
        }

      }

      // replay mode
      else {
        // load from the actual dungeon room
        let roomObject = this.dungeonRooms.get(dungeonUsedId)?.get(this.activeRoomId.value) || null;
        if (roomObject && roomObject.default_assets && roomObject.default_assets.length > 0) {
          this.addAssets(roomObject.default_assets);
        }

        let config = this.dungeonLines.get(dungeonUsedId)?.get('_config_')?.params as DungeonConfigParsed;

        // load default dungeon music
        if (config?.music) {
          this.game.setMusic(config.music);
        }
      }
    }

    this.isRootScene.value = false;
    //console.warn("setting isRootScene to false", this.isRootScene.value);

    // execute actions
    this.game.logicSystem.resolveActions(actions);

    this.cachedText.value = output;

    this.delayedActionObject = this.game.logicSystem.getDelayedActions(actions);
    //console.log("delayedActionObject is set to: ", this.delayedActionObject);
    this.reloadActionObject = this.game.logicSystem.getReloadActions(actions);

    this.loadDocChoices();


    // if replay mode is enabled and choices are not unlocked, set the choices to not available
    if (this.game.getState('replay_mode') && !this.game.getState('replay_mode_unlock_choices') && Array.isArray(this.eventChoices.value)) {
      for (let choice of this.eventChoices.value) {
        const isVisited = this.game.dungeonSystem.usedDungeonData.value.visitedChoices.has(choice.id);
        if (!isVisited) {
          choice.isAvailable = computed(() => false);
        }
      }
    }





    // if ends with .1.1.1 then it's a scene event
    if (sceneId.endsWith(".1.1.1")) {
      this.usedDungeonData.value.addVisitedEvent(sceneId);
    }

    this.game.trigger('scene_play_after', sceneId, dungeonUsedId, isRootScene);

    // add log for the scene
    this.addLog(output, false);
  }

  // ignore types
  public loadDocChoices() {
    // create choices for scene 
    if (this.isChoices == 0) {
      this.eventChoices.value = this.createChoices(this.currentSceneId.value);
    } else if (this.isChoices == 1) {
      // merge choices
      let docChoices = this.createChoices(this.currentSceneId.value);
      if (docChoices && Array.isArray(docChoices)) {
        this.eventChoices.value = [...(this.eventChoices.value as Choice[]), ...(docChoices as Choice[])];
      }
    }
    // if isChoices = 2(choices over) then we already have choices, don't create new ones based on the doc
  }

  // ignore types
  public triggerEvent() {
    let room = this.currentRoom.value;
    if (!room) {
      return;
    }
    for (let event of room.events) {
      let isExhausted = false;
      if (!event.repeatable) {
        isExhausted = this.usedDungeonData.value.isEventVisited(event.id);
      }

      if (isExhausted) {
        continue;
      }

      let isViable = this.game.logicSystem.performConditionalEvaluation(event.object);
      if (!isViable) {
        continue;
      }

      this.playScene(event.id, this.currentDungeonId.value);
      break;
    }
  }

  public resetScene() {
    this.talkingCharacterId.value = null;
    this.currentSceneId.value = null;
    this.currentSceneIdAnimated.value = null;
    this.cachedText.value = "";
    this.cachedFlashArray.value = [];
    this.delayedActionObject = {};
    this.reloadActionObject = {};
    this.activeDungeonId.value = null;
    this.activeRoomId.value = null;
    this.eventChoices.value = null;
    this.sceneSlots.value = [];
    this.assets.value = [];
    // reset dungeon music
    this.game.setMusic(false);

    if (this.game.coreSystem.getState('game_state') === "exploration") {
      this.game.coreSystem.setState('overlay_state', 'overlay-navigation');
    }

    this.game.coreSystem.setState('block_party_inventory', false);



    this.isRootScene.value = true;
    //console.warn("setting isRootScene to true", this.isRootScene.value);
    this.game.trigger('event_end');
  }

  // Scene Slot Helper Methods

  /**
   * Complete all ongoing character transition animations immediately.
   * This is called when a new scene starts to prevent animations from carrying over.
   * Note: Idle animations (loops) are NOT killed, only transitions (enter/exit/move).
   */
  private completeAllCharacterAnimations(): void {
    // Get only top-level animations from global timeline (nested=false)
    // This prevents killing individual tweens inside repeating timelines
    // Parameters: getChildren(nested, tweens, timelines)
    gsap.globalTimeline.getChildren(false, true, true).forEach((anim: any) => {
      // Skip repeating animations (idle loops) - only kill one-time transitions
      // Idle animations have repeat: -1, transitions have no repeat or finite repeat
      // Check both tweens and timelines (timelines use _repeat, tweens use repeat())
      const repeatValue = typeof anim.repeat === 'function' ? anim.repeat() : anim._repeat;
      if (repeatValue === -1) {
        // This is an idle loop animation (either tween or timeline), keep it running
        return;
      }

      // Kill one-time transition animations (enter/exit/move)
      anim.progress(1);  // Jump to end state
      anim.kill();       // Remove the animation
    });
  }

  /**
   * Cancel scheduled removal for a slot
   */
  private cancelScheduledRemoval(slot: SceneSlot): void {
    if (slot.isRemoving) {
      delete slot.isRemoving;

      // Cancel the scheduled removal timeout
      // if (slot.removalTimeoutId !== undefined) {
      //    clearTimeout(slot.removalTimeoutId);
      //    delete slot.removalTimeoutId;
      //  }
    }
  }

  /**
   * Parse actor string syntax: "character1->slot1(x=30, transition=fade)"
   * Supports: "char->slotId" or "char->slotId(prop=value, prop=value)"
   */
  // ignore types
  public parseActorString(spec: string): SceneSlot | null {
    const arrowMatch = spec.match(/^(.+?)->(.+)$/);
    if (!arrowMatch) {
      gameLogger.error(`Invalid actor spec format: ${spec}`);
      return null;
    }

    const charId = arrowMatch[1].trim();
    const slotPart = arrowMatch[2].trim();

    // Check if there are inline properties: "slotId(prop=value, ...)"
    const bracketMatch = slotPart.match(/^([^\(]+)(?:\(([^\)]+)\))?$/);
    if (!bracketMatch) {
      gameLogger.error(`Invalid slot format: ${slotPart}`);
      return null;
    }

    const slotId = bracketMatch[1].trim();
    const propsString = bracketMatch[2];

    // Start with default values
    let slotData: any = {};

    // Load template slot if exists
    const template = this.characterSlotTemplates.get(slotId);
    if (template) {
      slotData = { ...template };
    }

    // Parse inline properties if present
    if (propsString) {
      const props = this.parseInlineProperties(propsString);
      slotData = { ...slotData, ...props };
    }

    // Ensure required fields have defaults
    return {
      char: charId,
      id: slotId,
      x: slotData.x ?? 50,
      y: slotData.y ?? 50,
      scale: slotData.scale ?? 1,
      ...slotData
    } as SceneSlot;
  }

  /**
   * Parse inline properties from string: "x=30, transition=fade, scale=1.5"
   */
  // ignore types
  public parseInlineProperties(propsString: string): Partial<CharacterSceneSlotObject> {
    const props: any = {};

    // Split by comma, but not commas inside brackets (for array syntax)
    const propPairs: string[] = [];
    let current = '';
    let bracketDepth = 0;

    for (const char of propsString) {
      if (char === '[') bracketDepth++;
      else if (char === ']') bracketDepth--;

      if (char === ',' && bracketDepth === 0) {
        propPairs.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) propPairs.push(current.trim());

    for (const pair of propPairs) {
      const colonMatch = pair.match(/^(\w+)\s*=\s*(.+)$/);
      if (!colonMatch) continue;

      const key = colonMatch[1].trim();
      const value = colonMatch[2].trim();

      // Check for array syntax: key=[val1, val2, val3]
      if (value.startsWith('[') && value.endsWith(']')) {
        const arrayContent = value.slice(1, -1); // Remove [ and ]
        const arrayValues = arrayContent.split(',').map(v => {
          const trimmed = v.trim().replace(/^["']|["']$/g, '');
          if (trimmed === 'true') return true;
          if (trimmed === 'false') return false;
          if (!isNaN(Number(trimmed)) && trimmed !== '') return Number(trimmed);
          return trimmed;
        });
        props[key] = arrayValues;
      } else if (value === 'true') {
        props[key] = true;
      } else if (value === 'false') {
        props[key] = false;
      } else if (!isNaN(Number(value))) {
        props[key] = Number(value);
      } else {
        // String value (remove quotes if present)
        props[key] = value.replace(/^["']|["']$/g, '');
      }
    }

    return props as Partial<CharacterSceneSlotObject>;
  }

  /**
   * Create slot from object data: { char: "character1", id: "slot1", x: 40, ... }
   * If id is provided, loads template first then overwrites with provided values
   */
  // ignore types
  public createSlotFromData(data: Partial<CharacterSceneSlotObject> & { char: string }): SceneSlot | null {
    if (!data.char) {
      gameLogger.warn('addActor requires "char" property');
      return null;
    }

    let slotData: any = {};

    // Load template if id is provided
    if (data.id) {
      const template = this.characterSlotTemplates.get(data.id);
      if (template) {
        slotData = { ...template };
      }
    }

    // Overwrite with provided data (except char which is handled separately)
    const { char, ...restData } = data;
    slotData = { ...slotData, ...restData };



    // Ensure required fields have defaults
    return {
      char: char,
      id: slotData.id || `slot_${Date.now()}`,
      x: slotData.x ?? 50,
      y: slotData.y ?? 50,
      scale: slotData.scale ?? 1,
      ...slotData
    } as SceneSlot;
  }

  /**
   * Find a slot by character ID
   */
  public findSlotByChar(charId: string): SceneSlot | undefined {
    return this.sceneSlots.value.find(slot => slot.char === charId);
  }

  /**
   * Add a new actor to the scene with enter animation
   */
  public addActorToScene(slot: SceneSlot | null): boolean {
    if (!slot) return false;

    const character = this.game.characterSystem.getCharacter(slot.char || "");
    if (!character) {
      gameLogger.error(`[actor] Character ${slot.char} not found`);
      return false;
    }

    // Check if character already exists in scene
    const existingSlot = this.findSlotByChar(slot.char);
    if (existingSlot) {
      // If character is being removed, cancel the removal
      this.cancelScheduledRemoval(existingSlot);

      // Remove the old slot from the array
      this.sceneSlots.value = this.sceneSlots.value.filter(s => s.char !== slot.char);
      gameLogger.info(`[actor] Removed existing "${slot.char}" from scene before re-adding`);
    }

    // Add new slot to scene
    this.sceneSlots.value.push(slot);

    // Add to discovered characters for the gallery system
    this.game.coreSystem.addCharacterToGallery(character);
    gameLogger.info(`[actor] Added "${slot.char}" to scene`);
    return true;
  }

  /**
   * Remove actor from scene with exit animation
   */
  public removeActorFromScene(charId: string, exitProps?: Record<string, any>): boolean {
    const slot = this.findSlotByChar(charId);
    if (!slot) {
      gameLogger.warn(`[actor] Character "${charId}" not found in scene for removal`);
      return false;
    }

    // Apply custom exit properties if specified
    if (exitProps) {
      Object.assign(slot, exitProps);
    }

    // Mark slot for removal to trigger exit animation
    slot.isRemoving = true;

    // Schedule actual removal after exit animation completes
    const exitDuration = slot.exit_duration ?? 0.5;
    const exitType = slot.exit;
    const delay = (exitType && exitType !== 'none') ? exitDuration * 1000 : 0;

    // Store timeout ID so it can be cancelled if character re-enters
    setTimeout(() => {
      if (slot.isRemoving) {
        this.sceneSlots.value = this.sceneSlots.value.filter(s => s.char !== charId);
      }
    }, delay) as unknown as number;

    gameLogger.info(`[actor] Removed "${charId}" from scene`);
    return true;
  }

  /**
   * Update existing actor's properties
   */
  public updateActorProperties(charId: string, updates: Record<string, any>): boolean {
    const existingSlot = this.sceneSlots.value.find(s => s.char === charId);
    if (!existingSlot) {
      gameLogger.warn(`[actor] Character "${charId}" not found in scene for update`);
      return false;
    }

    // If character is being removed, cancel the removal
    this.cancelScheduledRemoval(existingSlot);

    // Update properties directly on the existing reactive object
    Object.assign(existingSlot, updates);
    gameLogger.info(`[actor] Updated properties for "${charId}":`, updates);
    return true;
  }

  /**
   * Move existing actor to new slot with smooth animation
   */
  public moveActorToSlot(charId: string, newSlotId: string, inlineProps?: Record<string, any>): boolean {
    const existingSlot = this.sceneSlots.value.find(s => s.char === charId);
    if (!existingSlot) {
      gameLogger.warn(`[actor] Character "${charId}" not found in scene for move`);
      return false;
    }

    // If character is being removed, cancel the removal
    this.cancelScheduledRemoval(existingSlot);

    // Get target slot template
    const targetTemplate = this.characterSlotTemplates.get(newSlotId);
    if (!targetTemplate) {
      gameLogger.warn(`[actor] Slot template "${newSlotId}" not found`);
      return false;
    }

    // Prepare new slot data (template + inline properties)
    const newSlotData = { ...targetTemplate, ...inlineProps };

    // Strip enter animations to avoid playing them during slot change
    // But preserve exit animations so the character has correct exit for new slot
    const { enter, enter_duration, enter_delay, enter_ease, ...updates } = newSlotData;

    // Update the slot by mutating the existing object to preserve reactivity
    Object.assign(existingSlot, updates, { id: newSlotId });

    gameLogger.info(`[actor] Moved "${charId}" to slot "${newSlotId}"`);
    return true;
  }


  public exitScene(skipEvents: boolean = false) {

    // if (!this.currentSceneId.value) return;


    if (this.game.getState('replay_mode')) {
      this.game.setState('progression_state', 'gallery');
      this.game.setState('gallery_tab', 'scenes');
      return;
    }


    this.resetScene();
    // restore encounter content and redo actions
    // TODO: maybe don't run actions again???

    if (!skipEvents) {
      this.triggerEvent();
    }
  }

  public getDataByDungeonId(dungeonId: string | null): DungeonData {
    if (!dungeonId) {
      return this.usedDungeonData.value;
    }
    return this.dungeonDatas.value.get(dungeonId)!;
  }

  // ignore types
  public createChoices(sceneIdInput?: string | null): Choice | Choice[] | null {
    //let isAnySceneActions = this.delayedActionObject && Object.keys(this.delayedActionObject).length > 0;
    let choices: Choice | Choice[] | null = null;


    //console.log("isAnySceneActions", isAnySceneActions);
    // look for scene, enter, and exit(eventDelayed actions) first
    // if (isAnySceneActions) {
    //   choices = new Choice();
    //   choices.setParams(this.delayedActionObject);
    //   return choices;
    // }



    let sceneId = sceneIdInput || this.currentSceneId.value;

    // event choices
    if (sceneId) {
      let dungeonId: string = "";

      if (this.currentDungeonId.value) {
        dungeonId = this.currentDungeonId.value;
      }

      if (this.activeDungeonId.value) {
        dungeonId = this.activeDungeonId.value;
      }

      let lines = this.dungeonLines.get(dungeonId);
      if (!lines) {
        throw new Error(`Dungeon lines not found for dungeon ${dungeonId}`);
      }

      // console.log(lines);

      let vals = sceneId.split('.');
      let lastThree = vals.slice(-3);
      let scene_row = parseInt(lastThree[0]);
      let scene_block = parseInt(lastThree[1]);
      let scene_paragraph = parseInt(lastThree[2]);
      let firstN = vals.slice(0, vals.length - 3);
      let scene_name = firstN.join(".").slice(1);

      let nextParagraphId = scene_paragraph + 1;
      let nextRow = scene_row + 1;
      //console.warn(scene_name, scene_row, scene_block, scene_paragraph, nextRow);


      // console.warn(sceneIdInput);
      //if(!sceneIdInput){

      //console.log("delayedActionObject", this.delayedActionObject);
      // check if there's any delayed actions
      let areThereDelayedActions = this.delayedActionObject && Object.keys(this.delayedActionObject).length > 0;

      if (areThereDelayedActions) {
        choices = this.game.logicSystem.createCustomChoice({
          id: 'delayed_action',
          name: '',
          params: this.delayedActionObject
        });
        return choices!;
      }

      // Look for the next paragraph next
      let searchId = this.compileSceneId(scene_name, scene_row, scene_block, nextParagraphId);

      let nextSceneLine = lines.get(searchId);
      if (nextSceneLine) {
        choices = this.game.logicSystem.createCustomChoice({
          id: nextSceneLine.id,
          name: '',
          params: { scene: nextSceneLine.id }
        });
        return choices;
      }
      // }



      // look for the choices
      let pattern1 = "^>" + scene_name + "." + scene_row + "." + scene_block + "." + scene_paragraph;
      let pattern2 = "^~" + scene_name + "." + nextRow + ".";
      let re1 = new RegExp(pattern1);
      let re2 = new RegExp(pattern2);
      //console.warn(re2);


      choices = [];
      if (lines) {
        for (let [id, line] of lines) {
          let firstChar = id.charAt(0);
          if (re1.test(id) || re2.test(id)) {
            //console.warn(id);

            let params: Record<string, any> = {};
            if (line.params) {
              params = JSON.parse(JSON.stringify(line.params));
            }
            if (firstChar == "~") {
              let delayedActions = this.getDelayedActions(line.params);
              if (!Object.keys(delayedActions).length) {
                // set scene only if there's no event actions
                params['scene'] = "#" + id.slice(1) + ".1"
              }

            }

            let choice = this.game.logicSystem.createCustomChoice({
              id: id,
              name: line.val,
              params: params
            });
            choices.push(choice);
          }
        }


      } else {
        throw new Error(`Dungeon lines not found for dungeon ${dungeonId}`);
      }

      if (choices.length == 0) {
        // look for the next row if there's no choices
        let searchId = this.compileSceneId(scene_name, nextRow, 1, 1);
        let nextSceneLine = lines.get(searchId);

        if (nextSceneLine) {
          choices = this.game.logicSystem.createCustomChoice({
            id: nextSceneLine.id,
            name: '',
            params: { scene: nextSceneLine.id }
          });
          return choices;
        }

        // finally if there's no next scene then exit event
        choices = this.game.logicSystem.createCustomChoice({
          id: 'exit_event',
          name: '',
          params: { exit: true }
        });
        return choices;

      }

    }
    return choices;
  }

  // ignore types
  public compileSceneId(scene_name: string, scene_row: number, scene_block: number, paragraph?: number): string {
    if (!paragraph) {
      paragraph = 1;
    }
    return "#" + scene_name + "." + scene_row + "." + scene_block + "." + paragraph;
  }

  // ignore types
  public getDelayedActions(actionRecord: Record<string, any> | undefined): Record<string, any> {
    if (!actionRecord) {
      return {};
    }
    let result: Record<string, any> = {};
    for (let actionObject of Object.keys(actionRecord)) {
      let action = this.game.logicSystem.actionRegistry.get(actionObject);
      if (action?.eventDelayed) {
        result[actionObject] = actionRecord[actionObject];
      }
    }
    return result;
  }


  public selectedEncounterId: Ref<string | null> = ref(null);

  @Skip()
  public selectedEncounter: ComputedRef<DungeonEncounter | null | undefined> = computed(() => {
    if (this.selectedEncounterId.value) {
      return this.currentDungeon.value?.encounters.get(this.selectedEncounterId.value);
    }
    return null;
  });

  @Skip()
  public activeEncounter = computed(() => {
    if (this.selectedEncounterId.value && this.currentDungeon.value?.encounters.get(this.selectedEncounterId.value)?.getVisibilityState()) {
      return this.selectedEncounter.value;
    }
    if (this.currentRoom.value) {
      return this.currentRoom.value.descriptionEncounter;
    }
    return null;
  });

  // ignore types
  public selectEncounter(encounter: DungeonEncounter) {
    this.selectedEncounterId.value = encounter.id;
    this.centerToActiveEncounter(true);
  }

  /**
   * Get all visible encounters in the current room (excludes props)
   */
  // ignore types
  public getVisibleEncountersInCurrentRoom(): DungeonEncounter[] {
    if (!this.currentRoom.value || !this.currentDungeon.value) {
      return [];
    }

    const encounters: DungeonEncounter[] = [];
    const currentRoom = this.currentRoom.value;

    // Iterate through all encounters in the dungeon
    for (const encounter of this.currentDungeon.value.encounters.values()) {
      const isVisible = encounter.getVisibilityState();

      // Check if encounter is visible, in the current room, not during a scene, and not a prop
      if (isVisible &&
        encounter.isHere(currentRoom) &&
        !this.currentSceneId.value &&
        !encounter.isProp()) {
        // Exclude the description encounter (room description)
        if (encounter !== currentRoom.descriptionEncounter) {
          encounters.push(encounter);
        }
      }
    }
    // console.log("visible encounters", encounters);
    return encounters;
  }

  /**
   * Get the text for the encounter counter (e.g., "1/3")
   */
  // ignore types
  public getEncounterCounterText(): string {
    const visibleEncounters = this.getVisibleEncountersInCurrentRoom();

    if (visibleEncounters.length === 0) {
      return "0/0";
    }

    // Find the index of the currently selected encounter
    const currentIndex = visibleEncounters.findIndex(
      enc => enc === this.selectedEncounter.value
    );

    // If no encounter is selected, show "-/total"
    if (currentIndex === -1) {
      return `-/${visibleEncounters.length}`;
    }

    // Show current (1-indexed) / total
    return `${currentIndex + 1}/${visibleEncounters.length}`;
  }


  /**
   * Cycle to the next encounter in the current room
   */
  // ignore types
  public cycleToNextEncounter(): void {
    const visibleEncounters = this.getVisibleEncountersInCurrentRoom();

    if (visibleEncounters.length === 0) {
      return;
    }

    // Find the index of the currently selected encounter
    const currentIndex = visibleEncounters.findIndex(
      enc => enc === this.selectedEncounter.value
    );

    // If no encounter is selected or it's the last one, select the first encounter
    // Otherwise, select the next encounter
    let nextIndex: number;
    if (currentIndex === -1 || currentIndex === visibleEncounters.length - 1) {
      nextIndex = 0;
    } else {
      nextIndex = currentIndex + 1;
    }

    // Select the next encounter
    this.selectEncounter(visibleEncounters[nextIndex]);
  }


  @Skip()
  public currentRoom: ComputedRef<DungeonRoom | undefined> = computed(() => {
    if (!this.currentDungeon.value || !this.currentRoomId.value) {
      return undefined;
    }
    return this.currentDungeon.value.getRoomById(this.currentRoomId.value)!;
  });

  // List of Dungeon Data
  @Populate(DungeonData, { mode: 'merge' })
  public dungeonDatas: Ref<Map<string, DungeonData>> = ref(new Map());

  // ignore types
  public getDungeonId(dungeonId: string | null): string {
    if (dungeonId) {
      return dungeonId;
    }
    if (this.activeDungeonId.value) {
      return this.activeDungeonId.value;
    }
    if (this.currentDungeonId.value) {
      return this.currentDungeonId.value;
    }
    throw new Error("No dungeon id");
  }
  public getLineByDungeonId(lineId: string, dungeonId: string | null): DungeonLine {
    let id = this.getDungeonId(dungeonId);
    return this.dungeonLines.get(id)!.get(lineId)!;
  }

  // ignore types
  public getDungeonDataById(id: string): DungeonData {
    let data = this.dungeonDatas.value.get(id);
    if (!data) {
      throw new Error(`Dungeon data for ${id} not found`);
    }
    return data;
  }

  @Skip()
  public usedRoomId: ComputedRef<string> = computed(() => {
    if (this.activeRoomId.value) {
      return this.activeRoomId.value;
    } else {
      return this.currentRoomId.value!;
    }
  });

  @Skip()
  public usedDungeonData: ComputedRef<DungeonData> = computed(() => {
    if (this.activeDungeonId.value) {
      return this.dungeonDatas.value.get(this.activeDungeonId.value)!;
    } else {
      return this.dungeonDatas.value.get(this.currentDungeonId.value!)!;
    }
  });

  @Skip()
  public currentDungeonData: ComputedRef<DungeonData> = computed(() => {
    return this.dungeonDatas.value.get(this.currentDungeonId.value!)!;
  });

  /**
   * Process flag actions with operators.
   * Handles both simple flag names and dungeon-scoped flags (dungeonId.flagName).
   * Supports both object format {a: 1, b: 3} and string format with operators:
   * - "key=value" - set the flag to value
   * - "key>value" - add value to the flag
   * - "key<value" - subtract value from the flag
   * Note: Flags can only be numbers.
   */
  // ignore types
  public processFlagAction(data: string | Record<string, any>): void {
    type FlagOperation = { key: string; operator: '=' | '>' | '<'; value: number };
    let operations: FlagOperation[] = [];

    if (typeof data === 'string') {
      // Parse "key=value, key2>value2" format with operators
      const pairs = data.split(',').map(s => s.trim());
      for (const pair of pairs) {
        // Find the operator and split
        let operator: '=' | '>' | '<' | null = null;
        let key: string = '';
        let rawValue: string = '';

        if (pair.includes('=')) {
          operator = '=';
          [key, rawValue] = pair.split('=').map(s => s.trim());
        } else if (pair.includes('>')) {
          operator = '>';
          [key, rawValue] = pair.split('>').map(s => s.trim());
        } else if (pair.includes('<')) {
          operator = '<';
          [key, rawValue] = pair.split('<').map(s => s.trim());
        }

        if (!operator || !key || rawValue === undefined) {
          gameLogger.error(`Invalid flag format: "${pair}". Use "key=value", "key>value", or "key<value"`);
          continue;
        }

        // Parse numeric value
        const value = Number(rawValue);
        if (isNaN(value)) {
          gameLogger.error(`Invalid flag value: "${rawValue}" for key "${key}". Flags must be numbers.`);
          continue;
        }

        operations.push({ key, operator, value });
      }
    } else {
      // Object format - assume '=' operator for all
      for (const [key, value] of Object.entries(data)) {
        operations.push({ key, operator: '=', value: value as number });
      }
    }

    // Process each flag operation
    for (const { key: varName, operator, value: varValue } of operations) {
      let parts = varName.split(".");
      let name: string;
      let value = varValue;
      let dungeonData: DungeonData;

      if (parts.length == 1) {
        // Simple flag name - use current dungeon data
        name = varName;
        dungeonData = this.usedDungeonData.value;
      } else {
        // Scoped flag name (dungeonId.flagName)
        name = parts[1];
        dungeonData = this.getDungeonDataById(parts[0]);
      }

      // Apply the operation based on operator
      if (operator === '=') {
        dungeonData.setFlag(name, value);
      } else if (operator === '>') {
        dungeonData.addFlag(name, value);
      } else if (operator === '<') {
        dungeonData.addFlag(name, -value);
      }
    }
  }

  public getFlag(id: string): number {
    let parts = id.split(".");

    let dungeonId: string;
    let flagId: string;

    if (parts.length == 2) {
      dungeonId = parts[0];
      flagId = parts[1];
    }
    else {
      flagId = id;
      if (this.activeDungeonId.value) {
        dungeonId = this.activeDungeonId.value;
      } else {
        dungeonId = this.currentDungeonId.value || "";
      }
    }

    return this.dungeonDatas.value.get(dungeonId)!.getFlag(flagId);
  }



  @Skip()
  public dungeonLines: Map<string, Map<string, DungeonLine>> = new Map();
  @Skip()
  public dungeonRooms: Map<string, Map<string, DungeonRoomObject>> = new Map();
  @Skip()
  public dungeonEncounters: Map<string, Map<string, DungeonEncounterObject>> = new Map();

  public setMapZoomFactor(factor: number) {
    this.game.coreSystem.setState('map_zoom_factor', Math.max(0.3, Math.min(factor, 2.0)));
  }

  // Holds the current dungeon
  @Skip()
  public currentDungeon = ref<Dungeon>();


  @Skip()
  public moveSubscription: Subscription;


  public enter(val: string) {
    let parts = val.split(".");
    if (parts.length == 2) {
      this.enterDungeon(parts[0], parts[1]);
    } else {
      this.enterRoom(val);
    }
  }

  // ignore types
  public enterDungeon(dungeonId: string, roomId: string) {
    //this.setGameState('Exploration');


    if (this.currentDungeonId.value === dungeonId) {
      this.enterRoom(roomId);
      return;
    }

    this.currentDungeonId.value = dungeonId;
    // Directly load the dungeon. The watchEffect will see currentDungeon match activeDungeonId.
    this._loadAndSetDungeonActual(dungeonId);

    this.enterRoom(roomId);


    gameLogger.info(`Dungeon ${dungeonId} loaded and set.`);


    // play dungeon music
    this.game.setMusic(this.currentDungeon.value?.music || false);

    // after entering dungeon
    if (this.currentDungeon.value?.actions?.dungeon_enter) {
      this.game.logicSystem.resolveActions(this.currentDungeon.value.actions.dungeon_enter);
      console.log("dungeon_enter actions resolved");
    }
    this.game.trigger('dungeon_enter', dungeonId, roomId);
  }

  // ignore types
  public enterRoom(roomId: string): Boolean {

    let dungeon = this.currentDungeon.value!;
    let room = dungeon.getRoomById(roomId)!;
    if (room.actions?.room_enter_before) {
      this.game.logicSystem.resolveActions(room.actions.room_enter_before);
    }

    let proceed = this.game.trigger('room_enter_before', roomId);
    if (!proceed) {
      return false;
    }

    this.resetScene();

    this.currentRoomId.value = roomId;
    this.usedDungeonData.value.addVisitedRoom(roomId);
    this.usedDungeonData.value.addVisibleRoom(roomId);
    if (this.currentRoom.value) {
      for (let neighbor of this.currentRoom.value.neighbors) {
        this.usedDungeonData.value.addVisibleRoom(neighbor.id);
      }
    }

    setTimeout(() => {
      this.centerToActiveLocation(true);
    }, 0);
    this.selectedEncounterId.value = null;

    if (room.actions?.room_enter_after) {
      this.game.logicSystem.resolveActions(room.actions.room_enter_after);
    }
    this.game.trigger('room_enter_after', roomId);
    gameLogger.info(`Room ${roomId} entered`);

    this.triggerEvent();
    return true; // room can be entered
  }


  // ignore types
  public movePath(end: DungeonRoom) {
    this.cancelPathMovement();
    if (!this.currentRoom.value) {
      return;
    }
    let locs = this.findPath(this.currentRoom.value, end);

    if (!locs) {
      this.global.addNotificationId("cant_reach");
      return;
    }

    locs.shift();

    type TaskFunction = () => Observable<DungeonRoom>;

    const tasks: TaskFunction[] = locs.map(item => {
      return () => of(item).pipe(tap(taskObj => {
        // Access properties of the object here
        if (this.game.coreSystem.getState('game_state') == "exploration") {

          let isEntered = this.enterRoom(taskObj.id);
          if (!isEntered) {
            this.cancelPathMovement();
            return;
          }
        } else {
          this.cancelPathMovement();
        }

      }));
    });

    const delayInMilliseconds: number = 500; // movement delay mc

    // Create a queue of tasks using the `from` operator.
    // Using `concatMap` to ensure each task is executed sequentially with a delay in between.
    // Initial delay(0) ensures subscription is assigned before first task executes
    // (prevents race condition when enterRoom triggers a scene synchronously)
    const taskQueue$: Observable<DungeonRoom> = from(tasks).pipe(
      delay(0),
      concatMap((task: TaskFunction) => task().pipe(delay(delayInMilliseconds)))
    );

    // Subscription to manage the active task queue execution
    this.moveSubscription = taskQueue$.subscribe(
      {
        //complete: () => console.log('All tasks completed!')  // Callback when all tasks complete
      }
    );

  }

  // ignore types
  public cancelPathMovement() {
    if (this.moveSubscription) {
      //console.log("cancelling path movement");
      this.moveSubscription.unsubscribe();  // Unsubscribe to stop the task execution
      //console.log('All tasks canceled!');
    }
  }

  // ignore types
  public findPath(start: DungeonRoom, end: DungeonRoom): DungeonRoom[] | null {

    let visited: Set<string> = new Set();

    // Initialize queue with the start node and its path
    let queue: QueueLoc[] = [{
      node: start,
      path: [start]
    }];

    while (queue.length > 0) {
      let currentItem = queue.shift();

      if (!currentItem) continue;

      let { node, path } = currentItem;

      // If we reach the end node, return the path
      if (node.id === end.id) {
        return path;
      }

      // If we have visited this node before, skip
      if (visited.has(node.id)) {
        continue;
      }

      visited.add(node.id);

      for (let neighbor of node.neighbors) {
        if (!visited.has(neighbor.id)) {
          // For each neighbor, push to queue with extended path
          queue.push({
            node: neighbor,
            path: [...path, neighbor]
          });
        }
      }
    }
    return null; // Return null if no path is found
  }


  @Skip()
  public gameMapContainer = ref<HTMLElement | null>(null);

  // ignore types
  public centerToActiveLocation(smooth = false) {

    if (this.currentDungeon.value?.dungeon_type === 'screen' || this.currentDungeon.value?.dungeon_type !== 'map') {
      return;
    }

    //console.error("activeLoc");
    let el = this.gameMapContainer.value;
    if (!el) {
      // console.error("No game map container found");
      return;
    }

    let behavior;
    if (smooth) {
      behavior = 'smooth';
    } else {
      behavior = 'auto';
    }
    if (!this.currentRoom.value) {
      return;
    }
    const zoomFactor = this.game.coreSystem.getState<number>('map_zoom_factor');
    const padding = this.currentDungeon.value?.padding || 0;

    // Room coordinates are in the content space (without padding)
    // Account for padding and zoom (zoom is applied via CSS transform)
    const targetX = (this.currentRoom.value.xCenter + padding) * zoomFactor;
    const targetY = (this.currentRoom.value.yCenter + padding) * zoomFactor;

    el.scrollTo({
      left: targetX - el.clientWidth / 2,
      top: targetY - el.clientHeight / 2,
      behavior: behavior as ScrollBehavior
      //behavior: 'auto'
    });

    //console.warn(this.getCurrentLocation().y);
  }

  // ignore types
  public centerToActiveEncounter(smooth = false) {

    if (this.currentDungeon.value?.dungeon_type === 'screen') {
      return;
    }

    if (!this.selectedEncounter.value) {
      return;
    }

    const el = this.gameMapContainer.value;
    if (!el) {
      return;
    }

    let behavior;
    if (smooth) {
      behavior = 'smooth';
    } else {
      behavior = 'auto';
    }

    const zoomFactor = this.game.coreSystem.getState<number>('map_zoom_factor');
    const padding = this.currentDungeon.value?.padding || 0;

    // Encounter coordinates are in the content space (without padding)
    // Account for padding and zoom (zoom is applied via CSS transform)
    const encounter = this.selectedEncounter.value;
    const targetX = (encounter.x + padding) * zoomFactor;
    const targetY = (encounter.y + padding) * zoomFactor;

    el.scrollTo({
      left: targetX - el.clientWidth / 2,
      top: targetY - el.clientHeight / 2,
      behavior: behavior as ScrollBehavior
    });
  }

  public nextScene() {
    let sceneId = this.currentSceneId.value;
    this.game.coreSystem.setState('overlay_state', 'overlay-navigation');

    if (!sceneId) {
      this.exitScene();
      return;
    }

    let dungeonId = this.activeDungeonId.value || this.currentDungeonId.value;
    if (!dungeonId) {
      gameLogger.warn("No active dungeon ID, cannot navigate to next scene");
      return;
    }

    // Use getNextSceneId to find the next scene
    const nextSceneId = this.getNextSceneId(sceneId);

    if (nextSceneId) {
      this.playScene(nextSceneId, dungeonId);
    } else {
      // No next scene found, exit the scene
      this.exitScene();
    }
  }

  public getNextSceneId(sceneId: string): string | null {
    if (!sceneId) {
      return null;
    }

    let dungeonId = this.activeDungeonId.value || this.currentDungeonId.value;
    if (!dungeonId) {
      gameLogger.warn("No active dungeon ID, cannot determine next scene");
      return null;
    }

    let lines = this.dungeonLines.get(dungeonId);
    if (!lines) {
      gameLogger.error(`Dungeon lines not found for dungeon ${dungeonId}`);
      return null;
    }

    // Parse the current scene ID: #scene_name.row.block.paragraph
    let vals = sceneId.split('.');
    let lastThree = vals.slice(-3);
    let scene_row = parseInt(lastThree[0]);
    let scene_block = parseInt(lastThree[1]);
    let scene_paragraph = parseInt(lastThree[2]);
    let firstN = vals.slice(0, vals.length - 3);
    let scene_name = firstN.join(".").slice(1);

    // 1. Try to find the next paragraph (same row, same block, paragraph + 1)
    let nextParagraphId = this.compileSceneId(scene_name, scene_row, scene_block, scene_paragraph + 1);
    if (lines.has(nextParagraphId)) {
      return nextParagraphId;
    }

    // 2. Try to find the next block (same row, block + 1, paragraph 1)
    let nextBlockId = this.compileSceneId(scene_name, scene_row, scene_block + 1, 1);
    if (lines.has(nextBlockId)) {
      return nextBlockId;
    }

    // 3. Try to find the next row (row + 1, block 1, paragraph 1)
    let nextRowId = this.compileSceneId(scene_name, scene_row + 1, 1, 1);
    if (lines.has(nextRowId)) {
      return nextRowId;
    }

    // 4. Try to find the next 2 rows (row + 2, block 1, paragraph 1). Need it to work with choices.
    let nextRow2Id = this.compileSceneId(scene_name, scene_row + 2, 1, 1);
    if (lines.has(nextRow2Id)) {
      return nextRow2Id;
    }

    // 5. No next scene found
    return null;
  }

  // ignore types
  public getBlockId(sceneId: string, shift: number): string | null {
    if (!sceneId) {
      return null;
    }

    let dungeonId = this.activeDungeonId.value || this.currentDungeonId.value;
    if (!dungeonId) {
      gameLogger.warn("No active dungeon ID, cannot determine block");
      return null;
    }

    let lines = this.dungeonLines.get(dungeonId);
    if (!lines) {
      gameLogger.error(`Dungeon lines not found for dungeon ${dungeonId}`);
      return null;
    }

    // Parse the current scene ID: #scene_name.row.block.paragraph
    let vals = sceneId.split('.');
    let lastThree = vals.slice(-3);
    let scene_row = parseInt(lastThree[0]);
    let scene_block = parseInt(lastThree[1]);
    let firstN = vals.slice(0, vals.length - 3);
    let scene_name = firstN.join(".").slice(1);

    // Calculate target block
    let targetBlock = scene_block + shift;

    // Block must be positive
    if (targetBlock < 1) {
      return null;
    }

    // Try to find the target block (same row, target block, paragraph 1)
    let targetBlockId = this.compileSceneId(scene_name, scene_row, targetBlock, 1);
    if (lines.has(targetBlockId)) {
      return targetBlockId;
    }

    return null;
  }


  // Quest System Start
  public quests: Ref<Map<string, QuestObject>> = ref(new Map());

  @Skip()
  public questsByDungeon: ComputedRef<Map<string, QuestObject[]>> = computed(() => {
    const allQuests = Array.from(this.quests.value.values());

    // Filter out completed quests if toggle is off
    const questsToShow = this.game.coreSystem.getState<boolean>('is_show_completed_quests')
      ? allQuests
      : allQuests.filter(q => !this.isQuestCompleted(q));

    // Sort quests by lastUpdated (most recent first)
    questsToShow.sort((a, b) => b.lastUpdated - a.lastUpdated);

    const grouped = new Map<string, QuestObject[]>();

    for (const quest of questsToShow) {
      if (!grouped.has(quest.dungeonId)) {
        grouped.set(quest.dungeonId, []);
      }
      grouped.get(quest.dungeonId)!.push(quest);
    }

    // Convert to array, sort dungeons by most recent quest, then back to Map
    const sortedEntries = Array.from(grouped.entries()).sort((a, b) => {
      // Get the most recent quest from each dungeon
      const mostRecentA = Math.max(...a[1].map(q => q.lastUpdated));
      const mostRecentB = Math.max(...b[1].map(q => q.lastUpdated));
      return mostRecentB - mostRecentA;
    });

    return new Map(sortedEntries);
  });

  // ignore types
  public isQuestCompleted(quest: QuestObject): boolean {
    // Check if any log in any goal has progress: 2
    for (const goal of quest.goals) {
      for (const logId of goal.logs) {
        const line = this.getQuestLine(quest.dungeonId, quest.id, goal.id, logId);
        if (line?.params?.progress === 2) {
          return true;
        }
      }
    }
    return false;
  }

  // ignore types
  public isGoalCompleted(quest: QuestObject, goalId: string): boolean {
    const goal = quest.goals.find(g => g.id === goalId);
    if (!goal) return false;

    // Check if any log in this goal has progress >= 1
    for (const logId of goal.logs) {
      const line = this.getQuestLine(quest.dungeonId, quest.id, goalId, logId);
      if (line && line.params) {
        // Warn if params exist but progress is missing
        if (line.params.progress === undefined) {
          const otherParams = Object.keys(line.params);
          if (otherParams.length > 0) {
            gameLogger.warn(`Quest line ${line.id} has params but missing 'progress'. Found: ${otherParams.join(', ')}`);
          }
        }
      }
      if (line && line.params && (line.params.progress === 1 || line.params.progress === 2)) {
        return true;
      }
    }
    return false;
  }

  // ignore types
  public getQuestLine(dungeonId: string, questId: string, goalId: string, logId: string): DungeonLine | null {
    const lines = this.dungeonLines.get(dungeonId);
    if (!lines) return null;

    const lineKey = `$${questId}.${goalId}.${logId}`;
    return lines.get(lineKey) || null;
  }

  public getDungeonName(dungeonId: string): string {
    const lines = this.dungeonLines.get(dungeonId);
    if (!lines) return dungeonId;

    const nameLine = lines.get('$dungeon_name');
    return nameLine?.val || dungeonId;
  }

  public getQuestTitle(dungeonId: string, questId: string): string {
    const line = this.getQuestLine(dungeonId, questId, 'main', '');
    if (!line) {
      // Try without the trailing part
      const lines = this.dungeonLines.get(dungeonId);
      if (!lines) return questId;
      const titleLine = lines.get(`$${questId}.main`);
      return titleLine?.val || questId;
    }
    return line.val;
  }

  public getGoalTitle(dungeonId: string, questId: string, goalId: string): string {
    const lines = this.dungeonLines.get(dungeonId);
    if (!lines) return goalId;

    const goalLine = lines.get(`$${questId}.${goalId}`);
    return goalLine?.val || goalId;
  }

  public addQuestLog(dungeonId: string, questId: string, goalId: string, logId: string) {
    const questKey = `${dungeonId}.${questId}`;

    let quest = this.quests.value.get(questKey);
    const isNewQuest = !quest;
    let wasQuestCompleted = false;

    if (!quest) {
      quest = {
        id: questId,
        dungeonId: dungeonId,
        lastUpdated: Date.now(),
        goals: []
      };
      this.quests.value.set(questKey, quest);
    } else {
      // Check if quest was already completed before adding this log
      wasQuestCompleted = this.isQuestCompleted(quest);
    }

    let goal = quest.goals.find(g => g.id === goalId);

    // Check if log already exists - if so, do nothing
    if (goal && goal.logs.includes(logId)) {
      return;
    }

    if (!goal) {
      goal = {
        id: goalId,
        logs: [],
        isCompleted: false
      };
    } else {
      // If goal exists, remove it from current position (we'll add it to the correct top position)
      const goalIndex = quest.goals.findIndex(g => g.id === goalId);
      if (goalIndex > -1) {
        quest.goals.splice(goalIndex, 1);
      }
    }

    // Add log (we know it doesn't exist because we checked above)
    goal.logs.push(logId);

    // Update goal completion status
    goal.isCompleted = this.isGoalCompleted(quest, goalId);

    // Add the goal to the correct position in the array
    if (goalId === 'main') {
      // Main goal always at the beginning
      quest.goals.unshift(goal);
    } else {
      // Check if 'main' goal exists
      const mainGoalIndex = quest.goals.findIndex(g => g.id === 'main');
      if (mainGoalIndex >= 0) {
        // Insert after main goal
        quest.goals.splice(1, 0, goal);
      } else {
        // No main goal, add to top
        quest.goals.unshift(goal);
      }
    }

    // Update quest timestamp to move it to top of list
    quest.lastUpdated = Date.now();

    // Trigger reactivity
    this.quests.value = new Map(this.quests.value);

    // Return quest state info for caller to handle flash notifications
    return {
      isNewQuest,
      wasQuestCompleted,
      isQuestCompletedNow: this.isQuestCompleted(quest),
      questTitle: this.getQuestTitle(dungeonId, questId)
    };
  }

  // Quest System End

  // Replay Gallery Scene System Start

  @Skip()
  replaySceneObject: ReplaySceneObject | null = null;

  // ignore types
  public getReplaySceneObject(): ReplaySceneObject {
    if (this.replaySceneObject) {
      return this.replaySceneObject;
    }

    // Build the replay scene object from dungeon lines
    let result: ReplaySceneObject = { dungeons: [] };



    for (const [dungeonId, lines] of this.dungeonLines) {

      // get the order of the dungeon
      let config = lines.get('_config_');
      let order = config?.params?.order ?? 0;

      const scenes: { id: string; name: string; unlocked: boolean }[] = [];
      let dungeonName = dungeonId;

      // Get dungeon name from $dungeon_name line
      const nameLine = lines.get('$dungeon_name');
      if (nameLine) {
        dungeonName = nameLine.val;
      }

      // Find all scenes with line.params?.view (gallery scenes)
      for (const [lineId, line] of lines) {
        if (line.params?.view) {
          scenes.push({
            id: lineId,
            name: line.params.view,
            unlocked: false  // Will be updated on each mount by the component
          });
        }
      }

      // Only add dungeon if it has gallery scenes
      if (scenes.length > 0) {
        result.dungeons!.push({
          id: dungeonId,
          name: dungeonName,
          scenes,
          order
        });
      }
    }

    // sort the dungeons by order
    if (result.dungeons) {
      result.dungeons = result.dungeons.sort((a, b) => a.order - b.order);
    }

    this.replaySceneObject = result;
    return result;
  }

  // ignore types
  public async replayScene(sceneId: string, dungeonId: string, unlocked: boolean): Promise<void> {
    if (!unlocked) {
      Global.getInstance().addNotificationId("error_replay_scene_locked");
      return;
    }

    if (!this.game.getState('replay_mode')) {
      if (this.game.getState('disable_saves')) {
        Global.getInstance().addNotificationId("error_replay_save_disabled");
        return;
      } else {
        // save the game first (hidden so it doesn't show in save list)
        await this.game.saveGame("__replay_scene__", { hidden: true });
        this.game.coreSystem.setState('replay_mode', true);
      }
    }

    this.resetScene();
    this.playScene(sceneId, dungeonId);
  }


  // Log System

  public logs: LogObject[] = [];
  public isLogsPopupOpen: Ref<boolean> = ref(false);

  // ignore types
  public addLog(content: string, isChoice: boolean): void {

    let log: LogObject = {
      content: content,
      isChoice: isChoice,
    };

    if (!isChoice) {
      log.flash = this.cachedFlashArray.value;
      log.character = this.game.getCharacter(this.talkingCharacterId.value || '')?.getName() || '';
    }

    this.logs.push(log);

    // Trim logs from beginning if exceeding max_log
    const maxLog = this.game.coreSystem.getState('max_log') as number;
    if (maxLog && this.logs.length > maxLog) {
      this.logs.splice(0, this.logs.length - maxLog);
    }
  }

}
