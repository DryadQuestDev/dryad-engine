import { Game } from "../game";

import { computed, reactive, ref } from "vue";
import { Populate } from "../../utility/save-system";
import { Ref, ComputedRef } from "vue";
import { EntityStatObject } from "../../schemas/entityStatSchema";
import { EntityAttributeObject } from "../../schemas/entityAttributeSchema";
import { EntityTraitObject } from "../../schemas/entityTraitSchema";
import { Skip } from "../../utility/save-system";
import { Character } from "../core/character/character";
import { Property } from "../property";
import { CharacterTemplateObject } from "../../schemas/characterTemplateSchema";
import { CharacterStatusObject } from "../../schemas/characterStatusSchema";
import { CharacterSkinLayerObject } from "../../schemas/characterSkinLayerSchema";
import { Status } from "../core/character/status";
import { PARTY_INVENTORY_ID } from "./itemSystem";
import { Item } from "../core/character/item";
import { Inventory } from "../core/character/inventory";
import { gameLogger } from "../utils/logger";
import { SkillSlotObject } from "../../schemas/skillSlotSchema";
import { SkillTreeObject } from "../../schemas/skillTreeSchema";
import { AbilityDefinitionObject } from "../../schemas/abilityDefinitionSchema";
import { AbilityTemplateObject } from "../../schemas/abilityTemplateSchema";

// Type for the function that computes stats
export type StatComputerFunction = (character: Character) => Record<string, number>;


export class CharacterSystem {

  //public usedCharacterId: Ref<string | null> = ref(null);

  public partyIds: Ref<Set<string>> = ref(new Set());

  @Skip()
  public party: ComputedRef<Character[]> = computed(() => {
    return Array.from(this.partyIds.value)
      .map(id => this.characters.value.get(id))
      .filter((char): char is Character => char !== undefined);
  });

  @Skip()
  public selectedCharacter: ComputedRef<Character | null> = computed(() => {
    const selectedId = this.game.coreSystem.getState<string | null>('selected_character');
    if (!selectedId) {
      return this.party.value[0] || null;
    }
    return this.characters.value.get(selectedId) || null;
  });

  @Skip()
  public usedCharacterId: ComputedRef<string | null> = computed(() => {
    const activeCharacterId = this.game.coreSystem.getState<string | null>('active_character');
    const selectedId = this.game.coreSystem.getState<string | null>('selected_character');
    return activeCharacterId || selectedId || null;
  });

  @Skip()
  public usedCharacter: ComputedRef<Character | null> = computed(() => {
    return this.characters.value.get(this.usedCharacterId.value || "") || null;
  });



  get game() {
    return Game.getInstance();
  }

  // Init Data
  @Skip()
  public statsMap!: Map<string, EntityStatObject>;
  @Skip()
  public statsVisibleMap!: Map<string, EntityStatObject>;
  @Skip()
  public attributesMap!: Map<string, EntityAttributeObject>;
  @Skip()
  public skinLayersMap!: Map<string, CharacterSkinLayerObject>;
  @Skip()
  public traitsMap!: Map<string, EntityTraitObject>;
  @Skip()
  public templatesMap!: Map<string, CharacterTemplateObject>;
  @Skip()
  public statusesMap!: Map<string, CharacterStatusObject>;

  @Skip()
  public skillSlotsMap!: Map<string, SkillSlotObject>;
  @Skip()
  public skillTreesMap!: Map<string, SkillTreeObject>;

  @Skip()
  public abilityDefinitionsMap!: Map<string, AbilityDefinitionObject>;
  @Skip()
  public abilityTemplatesMap!: Map<string, AbilityTemplateObject>;


  @Skip()
  public statComputersRegistry = new Map<string, StatComputerFunction>();

  // Populated Data
  @Populate(Character, { mode: 'merge' })
  public characters: Ref<Map<string, Character>> = ref(new Map());







  public createCharacter(characterId: string, template: CharacterTemplateObject | string, skipEvents: boolean = false): Character {
    // console.log("createCharacter", characterId, template);

    // If template is a string, look it up from the templates map
    let templateId: string | undefined;
    let obj: CharacterTemplateObject;
    if (typeof template === 'string') {
      templateId = template;
      const found = this.templatesMap.get(template);
      if (!found) {
        throw new Error(`CharacterTemplate with id "${template}" not found.`);
      }
      obj = found;
    } else {
      obj = template;
      templateId = obj.id;
    }

    // deep clone template to avoid mutating the original object
    let deepClone = JSON.parse(JSON.stringify(obj));

    let character = reactive(new Character());
    character.id = characterId;
    character.actions = deepClone.actions || {};
    character.tags = deepClone.tags || [];

    let coreStatus = reactive(new Status());
    coreStatus.id = "_core_status";
    coreStatus.isHidden = true;
    coreStatus.setValues(deepClone);
    character.addStatus(coreStatus);
    // Debug: console.log(character);


    if (templateId) {
      character.templateId = templateId;
    }

    if (!skipEvents) {
      // create private inventory
      let uid = "_character_" + character.id;
      let inv = Game.getInstance().itemSystem.createInventory(uid);
      character.setPrivateInventory(inv);


      // add skill trees
      for (let skillTreeId of deepClone.skill_trees || []) {
        character.addSkillTree(skillTreeId);
      }

      // create item slots
      for (let slot of deepClone.item_slots || []) {
        let itemSlot = character.addItemSlot(slot.id || "", slot.slot || "", slot.x || 0, slot.y || 0);

        // create and equip item in slot if item_default is set
        if (slot.item_default) {
          let item = Game.getInstance().itemSystem.createItem(slot.item_default);
          let inventory = character.getPrivateInventory();
          if (inventory) {
            let addedItem = inventory.addItem(item, 1, true)[0];
            inventory.equipSlot(itemSlot, addedItem, character as unknown as Character);
          }
        }
      }

      // add default statuses
      for (let statusId of deepClone.starting_statuses || []) {
        let status = this.createStatus(statusId);
        character.addStatus(status);
      }

      //this.characters.value.set(characterId, character);

      // call actions
      // Debug: console.log("character actions!", character.actions);
      if (character.actions?.character_create) {
        this.game.logicSystem.resolveActions(character.actions.character_create);
      }

      this.game.trigger('character_create', character as unknown as Character);
      console.log('character_create event triggered');
    }

    return character as unknown as Character;
  }

  public addCharacter(character: Character, isParty: boolean = false) {

    if (this.characters.value.has(character.id)) {
      throw new Error(`Character with id "${character.id}" already exists.`);
    }

    this.characters.value.set(character.id, character);
    if (isParty == true) {
      this.addToParty(character);
    }

  }

  public createStatus(template: any | string): Status {
    let statusObject: any;
    if (typeof template === 'string') {
      statusObject = Game.getInstance().characterSystem.statusesMap.get(template);
      if (!statusObject) {
        throw new Error(`Status with id "${template}" not found.`);
      }
    } else {
      statusObject = template;
    }
    let status = reactive(new Status());
    status.id = statusObject.id;
    status.setValues(statusObject);
    return status;
  }

  /**
   * Transfers all equipped items from source inventory to target inventory for a character.
   * Items remain equipped throughout the transfer - we just move them between inventory arrays.
   * Status effects, slot references, and character stats remain unchanged.
   * @param character - The character whose equipped items to transfer
   * @param sourceInventory - The inventory to transfer items from
   * @param targetInventory - The inventory to transfer items to
   */
  private transferEquippedItems(character: Character, sourceInventory: Inventory, targetInventory: Inventory): void {
    // Get all equipped items for this specific character
    const equippedItems = sourceInventory.getEquippedItems();
    const characterSlots = character.getItemSlots();
    const characterItemUids = new Set(characterSlots.map(slot => slot.itemUid).filter(uid => uid));
    const characterEquippedItems = equippedItems.filter(item => characterItemUids.has(item.uid));

    // Transfer items between inventory arrays
    // Items stay equipped (isEquipped=true), slots unchanged, status effects persist in character
    for (const item of characterEquippedItems) {
      sourceInventory.removeItem(item);
      targetInventory.items.push(item);
    }
  }

  public isCharacterInParty(character: Character | string): boolean {
    let charId: string;
    if (typeof character === 'string') {
      charId = character;
    } else {
      charId = character.id;
    }
    return this.partyIds.value.has(charId);
  }

  public addToParty(character: Character | string) {
    if (typeof character === 'string') {
      const found = this.characters.value.get(character);
      if (!found) {
        throw new Error(`Character with id "${character}" not found.`);
      }
      character = found;
    }

    let isCharacterInParty = this.isCharacterInParty(character);
    if (isCharacterInParty) {
      return;
    }
    this.partyIds.value.add(character.id);
    // character.inventoryId = PARTY_INVENTORY_ID; 

    if (character.actions?.character_join_party) {
      this.game.logicSystem.resolveActions(character.actions.character_join_party);
    }

    // add to discovered characters for the gallery system
    this.game.coreSystem.addCharacterToGallery(character);

    // Transfer equipped items from private inventory to party inventory
    const privateInventory = character.getPrivateInventory();
    const partyInventory = Game.getInstance().itemSystem.getInventory(PARTY_INVENTORY_ID);

    if (privateInventory && partyInventory) {
      this.transferEquippedItems(character, privateInventory, partyInventory);
    }

    this.game.trigger('character_join_party', character);

    // if no character is selected, select the new character
    if (!this.game.getState("selected_character")) {
      this.game.setState("selected_character", character.id);
    }
  }

  public deleteCharacter(character: Character | string) {
    if (typeof character === 'string') {
      const found = this.characters.value.get(character);
      if (!found) {
        throw new Error(`Character with id "${character}" not found.`);
      }
      character = found;
    }

    // delete private inventory
    let inv = character.getPrivateInventory();
    if (inv) {
      this.game.itemSystem.removeInventory(inv);
    }

    // remove character from party
    this.partyIds.value.delete(character.id);

    // delete character
    this.characters.value.delete(character.id);

    this.game.trigger('character_delete', character);
  }


  public removeFromParty(character: Character | string) {
    if (typeof character === 'string') {
      const found = this.characters.value.get(character);
      if (!found) {
        throw new Error(`Character with id "${character}" not found.`);
      }
      character = found;
    }

    // Transfer equipped items from party inventory back to private inventory
    const partyInventory = Game.getInstance().itemSystem.getInventory(PARTY_INVENTORY_ID);
    const privateInventory = character.getPrivateInventory();

    if (partyInventory && privateInventory) {
      this.transferEquippedItems(character, partyInventory, privateInventory);
    }

    this.partyIds.value.delete(character.id);
    //character.inventoryId = "";

    // if the character that is leaving the party is the selected character, select the first party member
    if (character.id === this.game.coreSystem.getState<string | null>('selected_character')) {
      this.game.coreSystem.setState('selected_character', this.party.value[0]?.id || null);
    }


    if (character.actions?.character_leave_party) {
      this.game.logicSystem.resolveActions(character.actions.character_leave_party);
    }

    this.game.trigger('character_leave_party', character);
  }

  public getCharacter(id: string): Character | null {
    return this.characters.value.get(id) || null;
  }


  public registerStatComputer(key: string, computer: StatComputerFunction): void {
    if (this.statComputersRegistry.has(key)) {
      gameLogger.overwrite(`Stat computer with key "${key}" is already registered - overwriting`);
    }
    this.statComputersRegistry.set(key, computer);
    gameLogger.success(`Stat computer "${key}" registered`);
  }

  public getStatComputer(key: string): StatComputerFunction | undefined {
    return this.statComputersRegistry.get(key);
  }


  /**
   * Process character modifications from string or object format.
   * Supports operations: = (set), < (reduce), > (increase)
   *
   * @param data String format: "alice.trait.name=New Name, eleanor.resource.health<25.5, alice.skinStyle.hat>class1, alice.skinStyle.hat=[class1, class2]"
   *             Object format: { "alice.trait.name": "New Name", "eleanor.resource.health": -25.5 }
   * @param mode Operation mode: 'set', 'add', or 'subtract'
   */
  // ignore types
  public processCharAction(data: string | Record<string, any>): void {
    let operations: Array<{ charId: string; type: string; key: string; operator: string; value: any }> = [];

    if (typeof data === 'string') {
      // Parse "alice.trait.name=New Name, eleanor.resource.health<25.5" format
      const specs = data.split(',').map(s => s.trim());
      for (const spec of specs) {
        // Match pattern: charId.type.key[operator]value
        const match = spec.match(/^([^.]+)\.([^.]+)\.([^=<>\s]+)\s*([=<>])\s*(.+)$/);
        if (!match) {
          gameLogger.error(`Invalid char format: "${spec}". Use "charId.type.key[=<>]value"`);
          continue;
        }

        const [, charId, type, key, operator, rawValue] = match;

        // Parse value based on type
        let value: any = rawValue.trim();
        if (type === 'stat' || type === 'resource') {
          value = Number(value);
          if (isNaN(value)) {
            gameLogger.error(`Invalid numeric value: "${rawValue}" for ${spec}`);
            continue;
          }
        } else if (type === 'skinStyle') {
          // For skinStyle with =, parse as array if it looks like [item1, item2]
          if (operator === '=' && value.startsWith('[') && value.endsWith(']')) {
            // Parse array format: [class1, class2]
            const arrayContent = value.slice(1, -1);
            value = arrayContent.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
          }
          // For > and < operators, keep as string (single value)
        }

        operations.push({ charId, type, key, operator, value });
      }
    } else {
      // Object format: { "alice.trait.name": "New Name" }
      for (const [path, value] of Object.entries(data)) {
        const parts = path.split('.');
        if (parts.length !== 3) {
          gameLogger.error(`Invalid char path: "${path}". Use "charId.type.key"`);
          continue;
        }

        const [charId, type, key] = parts;
        // Infer operator: negative numbers mean subtract, positive mean add (for stats/resources)
        let operator = '=';
        let finalValue = value;

        if ((type === 'stat' || type === 'resource') && typeof value === 'number') {
          if (value < 0) {
            operator = '<';
            finalValue = Math.abs(value);
          } else if (value > 0) {
            operator = '>';
          }
        }

        operations.push({ charId, type, key, operator, value: finalValue });
      }
    }

    // Execute operations
    for (const op of operations) {
      const character = this.getCharacter(op.charId);
      if (!character) {
        gameLogger.error(`Character "${op.charId}" not found`);
        continue;
      }

      try {
        switch (op.type) {
          case 'trait':
            if (op.operator !== '=') {
              gameLogger.error(`Traits only support "=" operator. Got "${op.operator}" for ${op.charId}.trait.${op.key}`);
              continue;
            }
            character.setTrait(op.key, op.value);
            break;

          case 'attribute':
            if (op.operator !== '=') {
              gameLogger.error(`Attributes only support "=" operator. Got "${op.operator}" for ${op.charId}.attribute.${op.key}`);
              continue;
            }
            character.setAttribute(op.key, String(op.value));
            break;

          case 'stat':
            if (op.operator === '=') {
              character.update({ stats: { [op.key]: op.value } });
            } else if (op.operator === '>') {
              const coreStatus = character.getCoreStatus();
              const currentValue = coreStatus.stats[op.key] || 0;
              character.update({ stats: { [op.key]: currentValue + op.value } });
            } else if (op.operator === '<') {
              const coreStatus = character.getCoreStatus();
              const currentValue = coreStatus.stats[op.key] || 0;
              character.update({ stats: { [op.key]: currentValue - op.value } });
            }
            break;

          case 'resource':
            if (op.operator === '=') {
              // Set resource to exact value
              character.setResource(op.key, op.value);
            } else if (op.operator === '>') {
              // Increase resource
              character.addResource(op.key, op.value);
            } else if (op.operator === '<') {
              // Decrease resource
              character.addResource(op.key, -op.value);
            }
            break;

          case 'skinStyle':
            if (op.operator === '=') {
              // Overwrite: set styles to new value(s)
              character.setSkinLayerStyle(op.key, op.value);
            } else if (op.operator === '>') {
              // Add: append a new style class
              character.addSkinLayerStyle(op.key, op.value);
            } else if (op.operator === '<') {
              // Remove: remove a style class
              character.removeSkinLayerStyle(op.key, op.value);
            }
            break;

          default:
            gameLogger.error(`Unknown type "${op.type}" for character modification`);
        }
      } catch (error) {
        gameLogger.error(`Error processing char action for ${op.charId}.${op.type}.${op.key}: ${error}`);
      }
    }
  }

  /**
   * Process addSkinLayer action
   * Format: "alice.fancy_hat, eleanor.fancy_gloves"
   */
  // ignore types
  public processAddSkinLayerAction(data: string): void {
    const specs = data.split(',').map(s => s.trim());

    for (const spec of specs) {
      // Match pattern: charId.skinLayerId
      const match = spec.match(/^([^.]+)\.(.+)$/);
      if (!match) {
        gameLogger.error(`Invalid addSkinLayer format: "${spec}". Use "charId.skinLayerId"`);
        continue;
      }

      const [, charId, skinLayerId] = match;
      const character = this.getCharacter(charId);

      if (!character) {
        gameLogger.error(`Character "${charId}" not found`);
        continue;
      }

      try {
        character.addSkinLayers([skinLayerId]);
      } catch (error) {
        gameLogger.error(`Error adding skin layer: ${error}`);
      }
    }
  }

  /**
   * Process removeSkinLayer action
   * Format: "alice.fancy_hat, eleanor.fancy_gloves"
   */
  // ignore types
  public processRemoveSkinLayerAction(data: string): void {
    const specs = data.split(',').map(s => s.trim());

    for (const spec of specs) {
      // Match pattern: charId.skinLayerId
      const match = spec.match(/^([^.]+)\.(.+)$/);
      if (!match) {
        gameLogger.error(`Invalid removeSkinLayer format: "${spec}". Use "charId.skinLayerId"`);
        continue;
      }

      const [, charId, skinLayerId] = match;
      const character = this.getCharacter(charId);

      if (!character) {
        gameLogger.error(`Character "${charId}" not found`);
        continue;
      }

      try {
        character.removeSkinLayers([skinLayerId]);
      } catch (error) {
        gameLogger.error(`Error removing skin layer: ${error}`);
      }
    }
  }

  /**
   * Process addItemSlot action
   * Format: "alice.hat[20, 40], eleanor.gloves[30, 60]"
   * Coordinates are required (percentage of the character width and height)
   */
  // ignore types
  public processAddItemSlotAction(data: string): void {
    // Split by comma, but not commas inside brackets
    const specs: string[] = [];
    let current = '';
    let bracketDepth = 0;

    for (let i = 0; i < data.length; i++) {
      const char = data[i];
      if (char === '[') {
        bracketDepth++;
        current += char;
      } else if (char === ']') {
        bracketDepth--;
        current += char;
      } else if (char === ',' && bracketDepth === 0) {
        specs.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current.trim()) {
      specs.push(current.trim());
    }

    for (const spec of specs) {
      // Match pattern: charId.slotId[x, y]
      const match = spec.match(/^([^.]+)\.([^\[]+)\[([^\]]+)\]$/);
      if (!match) {
        gameLogger.error(`Invalid addItemSlot format: "${spec}". Use "charId.slotId[x, y]"`);
        continue;
      }

      const [, charId, slotId, coordsStr] = match;
      const character = this.getCharacter(charId);

      if (!character) {
        gameLogger.error(`Character "${charId}" not found`);
        continue;
      }

      // Parse coordinates
      const coords = coordsStr.split(',').map(s => s.trim());
      if (coords.length !== 2) {
        gameLogger.error(`Invalid coordinates format: "${coordsStr}". Use "[x, y]"`);
        continue;
      }

      const x = Number(coords[0]);
      const y = Number(coords[1]);
      if (isNaN(x) || isNaN(y)) {
        gameLogger.error(`Invalid coordinate values: "${coordsStr}". Both x and y must be numbers.`);
        continue;
      }

      try {
        character.addItemSlot(Game.getInstance().createUid(), slotId.trim(), x, y);
      } catch (error) {
        gameLogger.error(`Error adding item slot: ${error}`);
      }
    }
  }

  /**
   * Process removeItemSlot action
   * Format: "alice.hat, eleanor.gloves"
   */
  // ignore types
  public processRemoveItemSlotAction(data: string): void {
    const specs = data.split(',').map(s => s.trim());

    for (const spec of specs) {
      // Match pattern: charId.slotId
      const match = spec.match(/^([^.]+)\.(.+)$/);
      if (!match) {
        gameLogger.error(`Invalid removeItemSlot format: "${spec}". Use "charId.slotId"`);
        continue;
      }

      const [, charId, slotId] = match;
      const character = this.getCharacter(charId);

      if (!character) {
        gameLogger.error(`Character "${charId}" not found`);
        continue;
      }

      try {
        const slots = character.getItemSlotsBySlotId(slotId);
        if (slots.length > 0) {
          // Remove the first slot with this ID
          character.removeItemSlot(slots[0]);
        } else {
          gameLogger.warn(`No item slot "${slotId}" found for character ${charId}`);
        }
      } catch (error) {
        gameLogger.error(`Error removing item slot: ${error}`);
      }
    }
  }

}