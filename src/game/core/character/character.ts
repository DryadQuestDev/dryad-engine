import { computed, ComputedRef, reactive, Ref, ref } from "vue";
import { Status } from "./status";
import { Skip, Populate, load } from "../../../utility/save-system";
import { Game } from "../../game";
import { EntityStatObject } from "../../../schemas/entityStatSchema";
import { CharacterSkinLayerObject } from "../../../schemas/characterSkinLayerSchema";
import { EntityAttributeObject } from "../../../schemas/entityAttributeSchema";
import { ItemSlot } from "./itemSlot";
import { Item } from "./item";
import { Choice } from "../content/choice";
import { Global } from "../../../global/global";
import { gameLogger } from "../../utils/logger";
import { Inventory } from "./inventory";
import { PARTY_INVENTORY_ID } from "../../systems/itemSystem";
import ShortUniqueId from "short-unique-id";

export type learnedSkill = {
  skillTreeId: string;
  id: string; // Unique ID of the skill slot in the tree (not skill_id)
  level: number;
}

export type FinalAbility = {
  meta: Record<string, any>;
  effects: Record<string, Record<string, any>>;
};

export type FinalAbilities = Record<string, FinalAbility>;

export type ImageLayerMeta = {
  image: string;
  layerId: string;
  mask?: string;
};

export class Character {
  public id: string;
  public templateId: string = "";

  public actions: any = {};


  // Skills Logic
  public skillTrees: Set<string> = new Set();

  public addSkillTree(skillTreeId: string): void {
    this.skillTrees.add(skillTreeId);
  }

  public removeSkillTree(skillTreeId: string): void {
    this.skillTrees.delete(skillTreeId);
  }

  public learnedSkills: learnedSkill[] = [];


  public learnSkill(skillTreeId: string, id: string, level: number = 1): void {
    const game = Game.getInstance();

    const tree = game.characterSystem.skillTreesMap.get(skillTreeId);
    if (!tree) {
      throw new Error(`Skill tree ${skillTreeId} does not exist`);
    }

    // Find the skill slot by unique id (not skill_id)
    const skillSlot = tree.skills?.find(skill => skill.id === id);
    if (!skillSlot) {
      throw new Error(`Skill slot ${id} does not exist in skill tree ${skillTreeId}`);
    }

    const skillId = skillSlot.skill; // Get the skill_id for data fetching
    if (!skillId) {
      throw new Error(`Skill slot ${id} does not have a skill_id assigned`);
    }

    // Get max upgrade level for this skill
    const maxLevel = skillSlot.max_upgrade_level || 1;

    // Find existing learned skill by unique id
    const existingSkill = this.learnedSkills.find(
      skill => skill.skillTreeId === skillTreeId && skill.id === id
    );

    if (existingSkill) {
      // Update existing skill level
      const newLevel = Math.min(existingSkill.level + level, maxLevel);
      if (newLevel > existingSkill.level) {
        existingSkill.level = newLevel;

        // Update status stacks
        const skillData = game.characterSystem.skillSlotsMap.get(skillId);
        if (skillData?.status) {
          const statusId = this.getSkillStatusId(skillTreeId, id);
          const existingStatus = this.statuses.find(s => s.id === statusId);
          if (existingStatus) {
            existingStatus.currentStacks = newLevel;
          }
        }

        // Trigger skill learned event
        game.trigger('skill_learned', skillTreeId, id, newLevel);
      }
    } else {
      // Learn new skill
      const newSkill: learnedSkill = {
        skillTreeId,
        id,  // Store unique slot id
        level: Math.min(level, maxLevel)
      };
      this.learnedSkills.push(newSkill);

      // Apply skill status to character using skill_id to fetch data
      const skillData = game.characterSystem.skillSlotsMap.get(skillId);
      if (skillData?.status) {
        const status = new Status();
        status.id = this.getSkillStatusId(skillTreeId, id);
        status.setValues(skillData.status);
        status.currentStacks = newSkill.level;
        status.isHidden = true;
        this.addStatus(status);
      }

      // Trigger params actions when skill is learned
      if (skillSlot.params) {
        game.logicSystem.resolveActions(skillSlot.params);
      }

      // Trigger skill learned event
      game.trigger('skill_learned', skillTreeId, id, newSkill.level);
    }
  }

  public unlearnSkill(skillTreeId: string, id: string): void {
    const game = Game.getInstance();

    // Get skill tree to get price and inventory type
    const skillTree = game.characterSystem.skillTreesMap.get(skillTreeId);
    if (!skillTree) {
      throw new Error(`Skill tree not found: ${skillTreeId}`);
    }

    // Find skill slot by unique id (not skill_id)
    const skillSlot = skillTree.skills?.find((s: any) => s.id === id);
    if (!skillSlot) {
      throw new Error(`Skill slot not found: ${id} in skill tree: ${skillTreeId}`);
    }

    // Find learned skill by unique id
    let learnedSkill = this.learnedSkills.find(skill => skill.skillTreeId === skillTreeId && skill.id === id);
    if (!learnedSkill) {
      throw new Error(`Learned skill not found: ${id} in skill tree: ${skillTreeId}`);
    }
    this.learnedSkills.splice(this.learnedSkills.indexOf(learnedSkill), 1);

    // Remove associated status using unique id
    const statusId = this.getSkillStatusId(skillTreeId, id);
    this.removeStatus(statusId);
    game.trigger('skill_unlearned', skillTreeId, id);

    // Refund currency if skill has a price and refund_factor is set (multiply by skill level and refund_factor, rounded up)
    const refundFactor = skillTree.refund_factor || 0;
    if (refundFactor > 0 && skillSlot.price && Object.keys(skillSlot.price).length > 0) {
      const inventory = skillTree.is_private ? this.getPrivateInventory() : this.getPartyInventory();

      if (inventory) {
        const skillLevel = learnedSkill.level;
        for (const [currencyId, amount] of Object.entries(skillSlot.price)) {
          const template = game.itemSystem.itemTemplatesMap.get(currencyId);
          if (template) {
            const currencyItem = game.itemSystem.createItem(template);
            const totalRefund = Math.ceil((amount as number) * skillLevel * refundFactor);
            inventory.addItem(currencyItem, totalRefund, true);
          }
        }
      }
    }
  }

  /**
   * Generate a status ID for a skill
   * @param skillTreeId The skill tree ID
   * @param skillSlotId The skill slot ID
   * @returns Status ID in format: _skill_[skillTreeId]_[skillSlotId]
   */
  // ignore types
  public getSkillStatusId(skillTreeId: string, skillSlotId: string): string {
    return `_skill_${skillTreeId}_${skillSlotId}`;
  }



  // private inventory
  private inventoryId: string = "";

  public setPrivateInventory(inventory: string | Inventory): void {
    let inv: Inventory | null = null;
    if (typeof inventory === 'string') {
      inv = Game.getInstance().itemSystem.getInventory(inventory);
      if (!inv) {
        throw new Error(`Inventory with id "${inventory}" not found.`);
      }
    } else {
      inv = inventory;
    }
    this.inventoryId = inv.id;
  }


  public getPrivateInventory(): Inventory | null {
    if (this.inventoryId) {
      return Game.getInstance().itemSystem.getInventory(this.inventoryId);
    }
    return null;
  }

  // use these in most cases for equipping items.
  public getPartyInventory(): Inventory | null {
    if (Game.getInstance().characterSystem.partyIds.value.has(this.id)) {
      return Game.getInstance().itemSystem.getInventory(PARTY_INVENTORY_ID);
    }
    return this.getPrivateInventory();
  }

  public getEquippedItems(): Item[] {
    let inventory = this.getPartyInventory();
    if (!inventory) {
      return [];
    }
    return inventory.getEquippedItems();
  }


  @Populate(ItemSlot)
  public itemSlots: ItemSlot[] = [];

  // each trait and skin_attribute are decided by the last status added
  // if you want to have a mutable value, just put into _core character status and mutate it
  @Skip()
  private _statGetters: Map<string, ComputedRef<number>> = new Map();

  @Skip()
  private _imageLayersGetter: ComputedRef<string[]> | null = null;

  @Skip()
  private _imageLayersWithMetaGetter: ComputedRef<ImageLayerMeta[]> | null = null;

  @Populate(Status) //, {mode: 'replace'}
  public statuses: Status[] = [];

  // ignore types
  public getCoreStatus(): Status {
    return this.statuses[0];
  }

  // Helper method to build image URLs from an array of skin layer objects
  private buildImageUrlsFromLayers(layers: CharacterSkinLayerObject[]): ImageLayerMeta[] {
    const result: ImageLayerMeta[] = [];

    for (const layer of layers) {
      let imageKey = layer.id;

      // Build key with attributes
      if (layer.attributes && Array.isArray(layer.attributes)) {
        for (const attribute of layer.attributes) {
          imageKey += "_" + this.attributes[attribute];
        }
      }

      // Get layer data from skin layers map
      const layerData = Game.getInstance().characterSystem.skinLayersMap.get(layer.id);
      const layerImages = layerData?.images as Record<string, string> | undefined;
      const layerMasks = layerData?.masks as Record<string, string> | undefined;

      if (layerImages?.[imageKey]) {
        result.push({
          image: layerImages[imageKey],
          layerId: layer.id,
          mask: layerMasks?.[imageKey]  // Same key as image
        });
      }
    }

    return result;
  }

  // Public method to build image layers directly from skinLayers (for gallery/ephemeral characters)
  // ignore types
  public buildImageLayersFromSkinLayers(): ImageLayerMeta[] {
    // Build layers from skinLayers
    const skinLayerObjects: CharacterSkinLayerObject[] = [];

    for (const layerId of this.skinLayers) {
      const layerObj = Game.getInstance().characterSystem.skinLayersMap.get(layerId);
      if (layerObj) {
        skinLayerObjects.push(layerObj);
      }
    }

    // Sort by z-index
    skinLayerObjects.sort((a, b) => (a.z_index || 0) - (b.z_index || 0));

    // Build image URLs using helper
    return this.buildImageUrlsFromLayers(skinLayerObjects);
  }

  @Skip()
  public get imageLayersWithMeta(): ImageLayerMeta[] {
    if (!this._imageLayersWithMetaGetter) {
      this._imageLayersWithMetaGetter = computed(() => {
        // Use renderedLayers (already built and filtered by reevaluate() and event handlers)
        return this.buildImageUrlsFromLayers(this.renderedLayers);
      });
    }
    return this._imageLayersWithMetaGetter as unknown as ImageLayerMeta[];
  }


  private resources: Record<string, number> = {};
  public traits: Record<string, any> = {};

  public attributes: Record<string, string> = {};
  public skinLayers: Set<string> = new Set();

  public abilities: Set<string> = new Set();
  public abilityModifiers: Record<string, any> = {};

  @Skip()
  public finalAbilities: ComputedRef<FinalAbilities> = computed(() => {
    return this.computeFinalAbilities();
  });

  public getAbilities(): ComputedRef<FinalAbilities> {
    return this.finalAbilities;
  }

  public getAbility(abilityId: string): FinalAbility | undefined {
    // Call the compute function directly - avoids ref access issues in reactive contexts
    return this.computeFinalAbilities()[abilityId];
  }

  public getSkinLayers(): Set<string> {
    return this.skinLayers;
  }

  // custom css classes to apply to the skin layer
  public skinLayerStyles: Map<string, string[]> = new Map();

  // rendered layers (filtered by character_render event)
  // Mutations happen in reevaluate() (outside reactive context) so no infinite loop
  @Skip()
  public renderedLayers: CharacterSkinLayerObject[] = [];

  public getTrait(key: string): any | null {
    let trait = Game.getInstance().characterSystem.traitsMap.get(key);
    if (!trait) {
      throw new Error(`Character Trait ${key} does not exist`);
    }

    if (trait.is_persistent === true) {
      let templateTrait = this.getTemplateTrait(key);
      if (templateTrait) {
        return templateTrait;
      }
    }

    return this.traits[key] || null;
  }

  public setTrait(key: string, value: any): void {
    let trait = Game.getInstance().characterSystem.traitsMap.get(key);
    if (!trait) {
      throw new Error(`Character Trait ${key} does not exist`);
    }
    let coreStatus = this.getCoreStatus();
    coreStatus.traits[key] = value;
    this.reevaluate();
  }

  // ignore types
  public getLiveTrait(key: string): any | null {
    let isExist = Game.getInstance().characterSystem.traitsMap.has(key);
    if (!isExist) {
      throw new Error(`Character Trait ${key} does not exist`);
    }

    return this.traits[key] || null;
  }

  // retrieve trait from the template
  // ignore types
  public getTemplateTrait(key: string): any {
    const template = Game.getInstance().characterSystem.templatesMap.get(this.templateId);
    return template?.traits?.[key as keyof typeof template.traits];
  }

  public getAttribute(key: string): string | null {
    let isExist = Game.getInstance().characterSystem.attributesMap.has(key);
    if (!isExist) {
      throw new Error(`Character Attribute ${key} does not exist`);
    }
    return this.attributes[key] || null;
  }

  public setAttribute(key: string, value: string): void {
    let isExist = Game.getInstance().characterSystem.attributesMap.has(key);
    if (!isExist) {
      throw new Error(`Character Attribute ${key} does not exist`);
    }
    let coreStatus = this.getCoreStatus();
    coreStatus.attributes[key] = value;
    this.reevaluate();
  }

  // ignore types
  public reevaluate() {
    const newProperties: Record<string, any> = {};
    const newAttributes: Record<string, string> = {};
    const newSkinLayers = new Set<string>();
    const newAbilities = new Set<string>();

    for (const status of this.statuses) {
      // Properties: latest status overwrites
      if (status.traits) {
        Object.assign(newProperties, status.traits);
      }

      // Attributes: latest status overwrites
      if (status.attributes) {
        Object.assign(newAttributes, status.attributes);
      }

      // Skin Layers: accumulate
      if (status.skinLayers) {
        for (const layer of status.skinLayers) {
          newSkinLayers.add(layer);
        }
      }

      // Abilities: accumulate
      if (status.abilities) {
        for (const ability of status.abilities) {
          newAbilities.add(ability);
        }
      }
    }

    // Ability Modifiers: merge by ability_id
    const collectedModifiers: Record<string, any[]> = {};

    // Collect all modifiers grouped by ability_id
    for (const status of this.statuses) {
      if (status.abilityModifiers) {
        for (const modifier of status.abilityModifiers) {
          const abilityId = modifier.ability_id;
          if (!abilityId) continue;
          if (!collectedModifiers[abilityId]) {
            collectedModifiers[abilityId] = [];
          }
          collectedModifiers[abilityId].push(modifier);
        }
      }
    }

    // Merge modifiers for each ability
    const mergedAbilityModifiers: Record<string, any> = {};
    for (const abilityId in collectedModifiers) {
      mergedAbilityModifiers[abilityId] = this.mergeAbilityModifiers(collectedModifiers[abilityId]);
    }

    this.traits = newProperties;
    this.attributes = newAttributes;
    this.skinLayers = newSkinLayers;
    this.abilities = newAbilities;
    this.abilityModifiers = mergedAbilityModifiers;

    // Initialize skinLayerStyles for new skin layers
    for (const layerId of newSkinLayers) {
      if (!this.skinLayerStyles.has(layerId)) {
        const skinLayerSchema = Game.getInstance().characterSystem.skinLayersMap.get(layerId);
        if (skinLayerSchema?.styles) {
          this.skinLayerStyles.set(layerId, [...skinLayerSchema.styles]);
        }
      }
    }

    this.evaluateRenderedLayers();

    this.addToGallery();
    // Debug: console.warn(this.attributes);
  }

  /**
   * Generic merge function for ability objects (meta + effects)
   * Merges source into target using type-based logic
   */
  private mergeAbilityObjects(target: any, source: any): any {
    const game = Game.getInstance();

    // Normalize effects to Record format
    const normalizeEffects = (effects: any): Record<string, any> => {
      if (!effects) return {};
      if (Array.isArray(effects)) {
        const result: Record<string, any> = {};
        for (const effect of effects) {
          result[effect.id] = { ...(effect.aspects || {}) };
        }
        return result;
      }
      return effects;
    };

    const targetEffects = normalizeEffects(target.effects);
    const sourceEffects = normalizeEffects(source.effects);

    const result: any = {
      meta: { ...(target.meta || {}), ...(source.meta || {}) },  // Meta: last wins
      effects: { ...targetEffects }  // Clone target effects
    };

    // Merge source effects into result
    for (const effectId in sourceEffects) {
      const sourceAspects = sourceEffects[effectId];

      if (!result.effects[effectId]) {
        // New effect from source
        result.effects[effectId] = { ...sourceAspects };
      } else {
        // Merge with existing effect
        const targetAspects = result.effects[effectId];
        const mergedAspects: any = { ...targetAspects };

        // Merge each aspect
        for (const aspectKey in sourceAspects) {
          const definition = game.characterSystem.abilityDefinitionsMap.get(aspectKey);
          const sourceValue = sourceAspects[aspectKey];

          if (!definition) {
            // No definition, last wins
            mergedAspects[aspectKey] = sourceValue;
            continue;
          }

          // Merge based on type
          if (definition.type === 'number') {
            // Sum
            mergedAspects[aspectKey] = (targetAspects[aspectKey] || 0) + sourceValue;
          } else if (definition.type === 'chooseMany') {
            // Concatenate + dedupe
            const targetArr = Array.isArray(targetAspects[aspectKey])
              ? targetAspects[aspectKey]
              : (targetAspects[aspectKey] ? [targetAspects[aspectKey]] : []);
            const sourceArr = Array.isArray(sourceValue) ? sourceValue : [sourceValue];
            mergedAspects[aspectKey] = Array.from(new Set([...targetArr, ...sourceArr]));
          } else if (definition.type === 'array') {
            // Concatenate (keep duplicates)
            const targetArr = Array.isArray(targetAspects[aspectKey])
              ? targetAspects[aspectKey]
              : (targetAspects[aspectKey] ? [targetAspects[aspectKey]] : []);
            const sourceArr = Array.isArray(sourceValue) ? sourceValue : [sourceValue];
            mergedAspects[aspectKey] = [...targetArr, ...sourceArr];
          } else {
            // Last wins
            mergedAspects[aspectKey] = sourceValue;
          }
        }

        result.effects[effectId] = mergedAspects;
      }
    }

    return result;
  }

  /**
   * Merges multiple ability modifiers into one
   * Used in reevaluate() to merge modifiers from all statuses
   */
  private mergeAbilityModifiers(modifiers: any[]): any {
    let result = { meta: {}, effects: {} };
    for (const modifier of modifiers) {
      result = this.mergeAbilityObjects(result, modifier);
    }
    return result;
  }

  /**
   * Computes final abilities by merging base templates with modifiers
   * Called by computed property - recalculates when abilities or abilityModifiers change
   */
  private computeFinalAbilities(): FinalAbilities {
    const game = Game.getInstance();
    const result: FinalAbilities = {};

    // Iterate over all abilities this character has
    for (const abilityId of this.abilities) {
      // Get base template
      const baseTemplate = game.characterSystem.abilityTemplatesMap.get(abilityId);
      if (!baseTemplate) {
        console.warn(`Ability template "${abilityId}" not found in abilityTemplatesMap`);
        continue;
      }

      // Convert base template to merge format
      const baseAbility: any = {
        meta: { ...(baseTemplate.meta || {}) },
        effects: baseTemplate.effects || []  // Keep as array for mergeAbilityObjects
      };

      // Merge with modifier if exists (using same merge function!)
      const modifier = this.abilityModifiers[abilityId];
      if (modifier) {
        result[abilityId] = this.mergeAbilityObjects(baseAbility, modifier);
      } else {
        // No modifier, just normalize the base template
        result[abilityId] = this.mergeAbilityObjects(baseAbility, { meta: {}, effects: {} });
      }
    }

    return result;
  }

  // ignore types
  public evaluateRenderedLayers(): void {
    // Build default renderedLayers from skinLayers
    let layers: CharacterSkinLayerObject[] = [];
    for (let value of this.skinLayers) {
      let skinLayerObject = Game.getInstance().characterSystem.skinLayersMap.get(value);
      if (!skinLayerObject) {
        throw new Error(`Skin Layer ${value} does not exist`);
      }
      layers.push(skinLayerObject);
    }
    layers = layers.sort((a, b) => (a.z_index || 0) - (b.z_index || 0));

    // Set renderedLayers to default (all layers)
    this.renderedLayers = layers;

    // Trigger character_render event - listeners can reassign character.renderedLayers
    // This happens OUTSIDE reactive context, preventing infinite loops
    Game.getInstance().trigger('character_render', this);
  }

  private addToGallery(): void {
    // add to discovered characters for the gallery system
    // but only if the character is in the party
    // OR in the scene slots
    let isInParty = Game.getInstance().characterSystem.partyIds.value.has(this.id);
    let isInSceneSlots = Game.getInstance().dungeonSystem.sceneSlots.value.some(slot => slot.char === this.id);
    if (isInParty || isInSceneSlots) {
      //console.log("adding to gallery", this.id);
      Game.getInstance().coreSystem.addCharacterToGallery(this);
    }
  }

  public update(data: any): void {
    let coreStatus = this.getCoreStatus();

    // Capture all replenishable stat values before any changes (for computed stats)
    const oldReplenishableValues = this.captureReplenishableStatValues();

    if (data.stats) {
      for (let [key, value] of Object.entries(data.stats)) {
        const stat = Game.getInstance().characterSystem.statsMap.get(key);
        if (!stat) {
          throw new Error(`Stat ${key} does not exist`);
        }
        if (typeof value !== 'number') {
          throw new Error(`Stat ${key} is not a number`);
        }

        coreStatus.stats[key] = value;
      }

      // After all stat changes, adjust all replenishable resources (handles computed stats)
      this.adjustAllReplenishableResources(oldReplenishableValues, false);
    }

    if (data.traits) {
      for (let [key, value] of Object.entries(data.traits)) {
        const trait = Game.getInstance().characterSystem.traitsMap.get(key);
        if (!trait) {
          throw new Error(`Trait ${key} does not exist`);
        }
        coreStatus.traits[key] = value;
      }
    }

    if (data.attributes) {
      for (let [key, value] of Object.entries(data.attributes)) {
        const attribute = Game.getInstance().characterSystem.attributesMap.get(key);
        if (!attribute) {
          throw new Error(`Attribute ${key} does not exist`);
        }
        if (typeof value !== 'string') {
          throw new Error(`Attribute ${key} is not a string`);
        }
        coreStatus.attributes[key] = value;
      }
    }

    if (data.skin_layers) {
      for (let [key, value] of Object.entries(data.skin_layers)) {
        const skinLayer = Game.getInstance().characterSystem.skinLayersMap.get(key);
        if (!skinLayer) {
          throw new Error(`Skin Layer ${key} does not exist`);
        }
        coreStatus.skinLayers.add(key);
      }

      //this.reevaluate();
    }
    this.reevaluate();
  }

  public addSkinLayers(layers: string[]): void {
    let coreStatus = this.getCoreStatus();
    for (const layer of layers) {
      const skinLayer = Game.getInstance().characterSystem.skinLayersMap.get(layer);
      if (!skinLayer) {
        throw new Error(`Skin Layer ${layer} does not exist`);
      }
      coreStatus.skinLayers.add(layer);
    }
    this.reevaluate();
  }

  public removeSkinLayers(layers: string[]): void {
    let coreStatus = this.getCoreStatus();
    for (const layer of layers) {
      coreStatus.skinLayers.delete(layer);
    }
    this.reevaluate();
  }

  /**
   * Set (overwrite) the style classes for a specific skin layer
   * @param layerId The skin layer ID
   * @param styles Array of CSS class names or a single class name
   */
  public setSkinLayerStyle(layerId: string, styles: string | string[]): void {
    if (!this.skinLayers.has(layerId)) {
      throw new Error(`Skin layer "${layerId}" not found on character ${this.id}`);
    }
    const styleArray = Array.isArray(styles) ? styles : [styles];
    this.skinLayerStyles.set(layerId, styleArray);
    this.addToGallery();
  }

  /**
   * Add a style class to a specific skin layer (won't add duplicates)
   * @param layerId The skin layer ID
   * @param styleClass The CSS class name to add
   */
  public addSkinLayerStyle(layerId: string, styleClass: string): void {
    if (!this.skinLayers.has(layerId)) {
      throw new Error(`Skin layer "${layerId}" not found on character ${this.id}`);
    }
    const currentStyles = this.skinLayerStyles.get(layerId) || [];
    if (!currentStyles.includes(styleClass)) {
      this.skinLayerStyles.set(layerId, [...currentStyles, styleClass]);
    }
    this.addToGallery();
  }

  /**
   * Remove a style class from a specific skin layer
   * @param layerId The skin layer ID
   * @param styleClass The CSS class name to remove
   */
  public removeSkinLayerStyle(layerId: string, styleClass: string): void {
    if (!this.skinLayers.has(layerId)) {
      throw new Error(`Skin layer "${layerId}" not found on character ${this.id}`);
    }
    const currentStyles = this.skinLayerStyles.get(layerId) || [];
    const updatedStyles = currentStyles.filter(style => style !== styleClass);
    this.skinLayerStyles.set(layerId, updatedStyles);
  }


  // TODO: remove this
  /*
  public addStatToStatus(id: string, statName: string, value: number): void {
    let status = this.getStatus(id);
    status.addStat(statName, value);
    this._updateAndSetResources(status);
  }
*/


  public addStatus(status: Status) {
    // Check if status with this id already exists
    const existingStatus = this.statuses.find(s => s.id === status.id);

    if (existingStatus) {
      // Debug: console.log(`Found existing status: ${status.id}`, {...});

      // If it exists and is stackable, try to add stacks
      if (existingStatus.isStackable() && status.isStackable()) {
        const stacksToAdd = status.currentStacks;
        const success = existingStatus.addStacks(stacksToAdd);
        gameLogger.info(`Added ${stacksToAdd} stacks to status "${status.id}". New count: ${existingStatus.currentStacks}`);
        this.reevaluate();
        return;
      }

      // If not stackable, don't add duplicate - just ignore or log warning
      gameLogger.info(`Status "${status.id}" already exists and is not stackable - ignoring duplicate`);
      return;
    } else {
      // Debug: console.log(`Adding new status: ${status.id}`, {...});
    }

    // Capture all replenishable stat values before adding status (for computed stats)
    const oldReplenishableValues = this.captureReplenishableStatValues();

    // Add as a new status
    this.statuses.push(status);
    this.reevaluate();
    this._updateAndSetResources(status);

    // Adjust all replenishable resources (handles both direct and computed stats)
    this.adjustAllReplenishableResources(oldReplenishableValues, true);
  }


  public removeStatus(id: string): void {
    let statusToRemove = this.statuses.find(status => status.id === id);
    if (!statusToRemove) {
      gameLogger.warn(`Failed to remove status "${id}" - status does not exist`);
      return;
    }

    // Capture all replenishable stat values before removing status (for computed stats)
    const oldReplenishableValues = this.captureReplenishableStatValues();

    this.statuses = this.statuses.filter(status => status !== statusToRemove);

    if (statusToRemove) {
      this._updateAndSetResources(statusToRemove);
      this.reevaluate();

      // Adjust all replenishable resources (handles both direct and computed stats)
      this.adjustAllReplenishableResources(oldReplenishableValues, true);
    }
  }



  /**
   * Captures current values of all replenishable resource stats.
   * Used to detect changes in computed stats.
   * @returns Record of stat names to their current values
   */
  private captureReplenishableStatValues(): Record<string, number> {
    const values: Record<string, number> = {};
    const statsMap = Game.getInstance().characterSystem.statsMap;

    for (const [statName, stat] of statsMap) {
      if (stat.is_resource && stat.is_replenishable) {
        values[statName] = this.getStat(statName).value;
      }
    }

    return values;
  }

  /**
   * Compares old and new stat values and adjusts resources for any that changed.
   * Handles computed stats that may change due to dependency changes.
   * @param oldValues Previous stat values
   * @param fromStatusChange If true, applies is_safe_removal logic
   */
  private adjustAllReplenishableResources(oldValues: Record<string, number>, fromStatusChange: boolean = false): void {
    for (const statName in oldValues) {
      const newValue = this.getStat(statName).value;
      this.adjustResourceForStatChange(statName, oldValues[statName], newValue, fromStatusChange);
    }
  }

  /**
   * Adjusts a replenishable resource when its max stat value changes
   * @param statName The stat/resource name
   * @param oldStatValue The old max stat value
   * @param newStatValue The new max stat value
   * @param fromStatusChange If true, applies is_safe_removal logic (default: false)
   */
  private adjustResourceForStatChange(statName: string, oldStatValue: number, newStatValue: number, fromStatusChange: boolean = false): void {
    const stat = Game.getInstance().characterSystem.statsMap.get(statName);
    if (!stat || !stat.is_resource || !stat.is_replenishable) {
      return;
    }

    const delta = newStatValue - oldStatValue;
    if (delta !== 0) {
      const currentResource = this.getResource(statName);
      const newResourceValue = currentResource + delta;

      // Apply safe removal floor (1) if this is from a status change and stat has is_safe_removal
      const minFloor = (fromStatusChange && stat.is_safe_removal) ? 1 : 0;
      const clampedValue = Math.max(minFloor, newResourceValue);

      this.setResource(statName, clampedValue);
    }
  }

  // TODO: implement can_overflow
  private _updateAndSetResources(status: Status): void {
    for (let stat in status?.stats) {
      let mappedStat = Game.getInstance().characterSystem.statsMap.get(stat);
      if (mappedStat?.is_resource) {
        // Only initialize if resource doesn't exist yet
        if (this.resources[stat] === undefined) {
          let newVal = mappedStat.is_replenishable ? status.stats[stat] : 0;
          let precisionValue = this.applyPrecision(newVal, mappedStat);
          this.resources[stat] = this.clampValue(stat, precisionValue, mappedStat);
        }
      }
    }
  }


  public getResource(name: string): number {
    let stat = Game.getInstance().characterSystem.statsMap.get(name);
    if (!stat) {
      throw new Error(`Stat ${name} does not exist`);
    }
    if (!stat.is_resource) {
      throw new Error(`Stat ${name} is not a resource`);
    }
    return this.resources[name] || 0;
  }

  public getStatus(id: string): Status {
    let status = this.statuses.find(status => status.id === id);
    if (!status) {
      throw new Error(`Status ${id} does not exist`);
    }
    return status;
  }

  public getResourceRatio(name: string): number {
    let stat = Game.getInstance().characterSystem.statsMap.get(name);
    if (!stat) {
      throw new Error(`Stat ${name} does not exist`);
    }
    if (!stat.is_resource) {
      throw new Error(`Stat ${name} is not a resource`);
    }
    const currentVal = this.getResource(name);
    const maxVal = this.getStat(name).value;
    if (maxVal) {
      return currentVal / maxVal;
    }
    return 0;

  }

  public addResource(name: string, value: number): void {
    let stat = Game.getInstance().characterSystem.statsMap.get(name);
    if (!stat) {
      throw new Error(`Stat ${name} does not exist`);
    }
    if (!stat.is_resource) {
      throw new Error(`Stat ${name} is not a resource`);
    }

    const currentVal = this.resources[name] || 0;
    const newVal = currentVal + value;

    // Reuse setResource to avoid code duplication
    this.setResource(name, newVal);
  }

  public setResource(name: string, value: number): void {
    let stat = Game.getInstance().characterSystem.statsMap.get(name);
    if (!stat) {
      throw new Error(`Stat ${name} does not exist`);
    }
    if (!stat.is_resource) {
      throw new Error(`Stat ${name} is not a resource`);
    }

    const currentVal = this.resources[name] || 0;
    const clampedValue = this.clampValue(name, value, stat);
    const precisionValue = this.applyPrecision(clampedValue, stat);

    this.resources[name] = precisionValue;
    Game.getInstance().trigger('character_resource_change', this, name, currentVal, precisionValue);
  }



  private applyPrecision(value: number, stat: EntityStatObject): number {
    const precision = stat.precision; // Read config from instance
    if (precision === undefined || precision === null) {
      return value;
    }
    const factor = Math.pow(10, precision);
    return Math.round(value * factor) / factor;
  }
  private clampValue(name: string, value: number, stat: EntityStatObject): number {
    const minVal = 0;
    const maxVal = this.getStat(name).value;
    const canOvflw = stat.can_overflow;
    let clampedValue = value;

    // Always enforce minimum value of 0
    if (clampedValue < minVal) {
      clampedValue = minVal;
    }

    // Only enforce max value if can_overflow is not set
    if (!canOvflw) {
      if (maxVal !== undefined && clampedValue > maxVal) {
        clampedValue = maxVal;
      }
    }

    return clampedValue;
  }




  public getStat(name: string): ComputedRef<number> {
    let stat = Game.getInstance().characterSystem.statsMap.get(name);
    if (!stat) {
      throw new Error(`Stat "${name}" does not exist in characterStatsMap.`);
    }

    if (!this._statGetters.has(name)) {
      const newComputedGetter = computed(() => {
        let statValue = 0;
        const game = Game.getInstance();

        for (const status of this.statuses) {
          // Multiply stat value by currentStacks
          const multiplier = status.currentStacks || 1;

          // Add base stat from status
          if (status.stats && typeof status.stats[name] === 'number') {
            statValue += status.stats[name] * multiplier;
          }

          // Add computed stats from status
          if (status.computedStatsKey) {
            const computer = game.characterSystem.getStatComputer(status.computedStatsKey);
            if (computer) {
              const computedValues = computer(this); // Pass current character instance
              if (typeof computedValues[name] === 'number') {
                statValue += computedValues[name] * multiplier;
              }
            }
          }
        }

        return this.applyPrecision(statValue, stat);
      });
      this._statGetters.set(name, newComputedGetter);
    }
    return this._statGetters.get(name)!;
  }
  /*
    public get statMap(): Record<string, number> {
      const result: Record<string, number> = {};
      for (const status of this.statuses) {
        if (status && status.stats) {
          Object.entries(status.stats).forEach(([key, value]) => {
            if (typeof value === 'number') {
              // Multiply stat value by currentStacks for stackable statuses
              const multiplier = status.currentStacks || 1;
              result[key] = (result[key] || 0) + (value * multiplier);
            }
          });
        }
      }
      return result;
    }
  */
  // items logic
  public addItemSlot(id: string, slotId: string, x: number, y: number): ItemSlot {
    let slotObject = Game.getInstance().itemSystem.itemSlotsMap.get(slotId);
    if (!slotObject) {
      throw new Error(`Item slot ${slotId} does not exist`);
    }

    let slot = new ItemSlot();
    slot.id = id;
    slot.slotId = slotId;
    slot.x = x;
    slot.y = y;
    this.itemSlots.push(slot);
    return slot;
  }


  public getItemSlotById(id: string): ItemSlot | null {
    return this.itemSlots.find(s => s.id === id) || null;
  }

  public getItemSlots(): ItemSlot[] {
    return this.itemSlots;
  }

  public removeItemSlot(slot: ItemSlot): void {
    this.itemSlots = this.itemSlots.filter(s => s !== slot);
  }

  public getItemSlotsBySlotId(slotId: string): ItemSlot[] {
    return this.itemSlots.filter(s => s.slotId === slotId);
  }

  // slot index starts from 0
  // ignore types
  public getItemSlotByIdandIndex(slotId: string, index: number): ItemSlot | null {
    let slots = this.getItemSlotsBySlotId(slotId);
    if (slots.length > index) {
      return slots[index];
    }
    return null;
  }

  // get the first empty slot with the given id. If no empty slots then get the first slot that can fit.
  // ignore types
  public getRelevantItemSlotById(slotId: string): ItemSlot | null {
    let slots = this.getItemSlotsBySlotId(slotId);
    for (let slot of slots) {
      if (slot.itemUid === "") {
        return slot;
      }
    }
    return slots[0] || null;
  }

  public getAvailableSlotsForItem(item: Item): ItemSlot[] {
    const availableSlots: ItemSlot[] = [];
    const itemSlotIds = item.slots; // Item's compatible slot IDs

    // For each slot ID the item can be equipped in
    itemSlotIds.forEach(itemSlotId => {
      // Find all character slots that match this slot ID
      const characterSlots = this.getItemSlotsBySlotId(itemSlotId);
      availableSlots.push(...characterSlots);
    });
    return availableSlots;
  }

  // get first empty slot to fit. If no empty slots then get the first slot that can fit.
  // ignore types
  public getRelevantSlotForItem(item: Item): ItemSlot | null {
    let slots = this.getAvailableSlotsForItem(item);
    for (let slot of slots) {
      if (slot.itemUid === "") {
        return slot;
      }
    }
    return slots[0] || null;
  }

  // get the slot that has the given item uid
  // ignore types
  public getItemSlotByItemUid(itemUid: string): ItemSlot | null {
    return this.itemSlots.find(s => s.itemUid === itemUid) || null;
  }

  /**
   * Equip an item to this character
   * @param item The item to equip (Item instance or uid string)
   * @param slotId Optional: specific slot type to equip to
   * @param slotIndex Optional: specific slot index (when multiple slots of same type exist)
   */
  public equipItem(item: Item | string, slotId?: string, slotIndex?: number): void {
    const inventory = this.getPartyInventory();
    if (!inventory) {
      throw new Error(`No inventory found for character "${this.id}"`);
    }

    // Resolve item from uid if string provided
    let resolvedItem: Item | null;
    if (typeof item === 'string') {
      resolvedItem = inventory.getItemByUid(item);
      if (!resolvedItem) {
        throw new Error(`Item with uid "${item}" not found in inventory`);
      }
    } else {
      resolvedItem = item;
    }

    let slot: ItemSlot | null = null;
    if (slotIndex !== undefined && slotId) {
      slot = this.getItemSlotByIdandIndex(slotId, slotIndex);
    } else if (slotId) {
      slot = this.getRelevantItemSlotById(slotId);
    } else {
      slot = this.getRelevantSlotForItem(resolvedItem);
    }

    if (!slot) {
      throw new Error(`No slot found to equip item "${resolvedItem.id}" on character "${this.id}"`);
    }

    inventory.equipSlot(slot, resolvedItem, this);
  }

  /**
   * Unequip an item from this character
   * @param item The item to unequip (Item instance or uid string)
   */
  public unequipItem(item: Item | string): void {
    const inventory = this.getPartyInventory();
    if (!inventory) {
      throw new Error(`No inventory found for character "${this.id}"`);
    }

    const itemUid = typeof item === 'string' ? item : item.uid;
    const slot = this.getItemSlotByItemUid(itemUid);
    if (!slot) {
      throw new Error(`No slot found with item uid "${itemUid}" on character "${this.id}"`);
    }

    inventory.unequipSlot(slot, this);
  }

  // ignore types
  public getItemChoices(item: Item): Choice[] {
    const choices: Choice[] = [];



    // custom choices
    for (let choice of item.choices) {
      let customChoice = Game.getInstance().logicSystem.customChoiceMap.get(choice);
      if (customChoice) {
        let choice = Game.getInstance().logicSystem.createCustomChoice(customChoice);
        choices.push(choice);
      }
    }


    // to equip item choices
    if (!item.isEquipped) {
      let slots = this.getAvailableSlotsForItem(item);

      // Count occurrences of each slot id
      const slotIdCounts = new Map<string, number>();
      const slotIdIndexes = new Map<string, number>();

      for (let slot of slots) {
        slotIdCounts.set(slot.slotId, (slotIdCounts.get(slot.slotId) || 0) + 1);
      }

      for (let slot of slots) {
        let slotObject = slot.getSlotObject();
        const choiceId = "equip_item_" + slotObject.id;

        // Only add index if there are multiple slots with the same id
        const count = slotIdCounts.get(slot.slotId) || 1;
        let slotName = slotObject.name || slot.slotId;
        let slotIndex = 0;
        if (count > 1) {
          slotIndex = (slotIdIndexes.get(slot.slotId) || 0);
          const currentIndex = slotIndex + 1;
          slotIdIndexes.set(slot.slotId, currentIndex);
          slotName += " " + currentIndex;
        }

        const choiceName = Global.getInstance().getString("equip_item_in_slot", { slot: slotName });
        const params = {
          equipItem: {
            itemUid: item.uid,
            slotId: slot.slotId,
            slotIndex: slotIndex,
            characterId: this.id,
          }
        };

        let choice = Game.getInstance().logicSystem.createCustomChoice({
          id: choiceId,
          name: choiceName,
          params: params
        });
        choices.push(choice);
      }
    } else {
      const params = {
        unequipItem: {
          itemUid: item.uid,
          characterId: this.id,
        }
      };

      let choice = Game.getInstance().logicSystem.createCustomChoice({
        id: "unequip_item",
        name: Global.getInstance().getString("unequip_item"),
        params: params
      });
      choices.push(choice);
    }

    // if items cannot be used, disable all choices
    if (!Game.getInstance().itemSystem.canUseItems()) {
      for (let choice of choices) {
        choice.isAvailable = computed(() => false);
      }
    }

    // Debug: console.warn("getItemChoices for character", this.id);
    // Debug: console.warn(choices);
    return choices;
  }

  public getName(): string {
    return this.getTrait('name') || "undefined";
  }


}