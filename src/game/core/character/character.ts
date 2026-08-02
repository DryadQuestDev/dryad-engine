import { computed, ComputedRef, reactive, Ref, ref } from "vue";
import { Status, SpineViewConfig, StaticArtViewConfig } from "./status";
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
import { mergeTrait } from "../../../functions/mergeTrait";
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

  getId(): string {
    return this.id;
  }

  setId(id: string): void {
    const oldId = this.id;
    this.id = id;

    // Update partyIds if this character is in the party
    const game = Game.getInstance();
    if (game.characterSystem.partyIds.value.has(oldId)) {
      game.characterSystem.partyIds.value.delete(oldId);
      game.characterSystem.partyIds.value.add(id);
    }

    // Update characters map
    if (game.characterSystem.characters.value.has(oldId)) {
      game.characterSystem.characters.value.delete(oldId);
      game.characterSystem.characters.value.set(id, this);
    }

    let inv = this.getPrivateInventory();
    if (inv) {
      const oldInvId = inv.id;
      inv.id = "_character_" + id;
      const inventories = game.itemSystem.inventories.value;
      if (inventories.has(oldInvId)) {
        inventories.delete(oldInvId);
        inventories.set(inv.id, inv);
      }
    }
  }


  public templateId: string = "";

  public tags: string[] = [];

  public actions: any = {};

  // Spine configs keyed by view ('' = default, 'back' = back view, etc.). _default normalizes to ''.
  public spineViews: Map<string, SpineViewConfig> = new Map();

  // Static (non-spine) art placement keyed by view, same key scheme as spineViews.
  public staticArtViews: Map<string, StaticArtViewConfig> = new Map();


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
          const existingStatus = this.statuses.get(statusId);
          if (existingStatus) {
            this.setStatusStacks(statusId, newLevel);
          }
        }

        gameLogger.info(`[skill] "${this.id}" upgraded ${skillTreeId}.${id} to level ${newLevel}`);
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

      gameLogger.info(`[skill] "${this.id}" learned ${skillTreeId}.${id}${newSkill.level > 1 ? ` at level ${newSkill.level}` : ''}`);
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
  public statuses: Map<string, Status> = new Map();

  // ignore types
  public getCoreStatus(): Status {
    return this.statuses.values().next().value!;
  }

  // Build the attribute-suffixed lookup key for a layer (matches the editor's
  // build_images key construction). No attributes → key = layer.id alone.
  private buildLayerLookupKey(layer: CharacterSkinLayerObject): string {
    let key = layer.id;
    if (layer.attributes && Array.isArray(layer.attributes)) {
      for (const attribute of layer.attributes) {
        key += "_" + this.attributes[attribute];
      }
    }
    return key;
  }

  // Helper method to build image URLs from an array of skin layer objects.
  // Skips spine-type layers — those are consumed by buildSpineTrackMapForView.
  private buildImageUrlsFromLayers(layers: CharacterSkinLayerObject[]): ImageLayerMeta[] {
    const result: ImageLayerMeta[] = [];

    for (const layer of layers) {
      if ((layer as any).type === 'spine') continue;

      const imageKey = this.buildLayerLookupKey(layer);

      // Get layer data from skin layers map
      const layerData = Game.getInstance().characterSystem.skinLayersMap.get(layer.id);
      const layerImages = layerData?.images as Record<string, string> | undefined;
      const layerMasks = layerData?.masks as Record<string, string> | undefined;

      if (layerImages?.[imageKey]) {
        result.push({
          image: layerImages[imageKey],
          layerId: layer.id,
          mask: layerMasks?.[imageKey],  // Same key as image
        });
      }
    }

    return result;
  }

  // Public method to build image layers directly from skinLayers (for gallery/ephemeral characters)
  // ignore types
  public buildImageLayersFromSkinLayers(): ImageLayerMeta[] {
    // Build layers from skinLayers (exclude view-tagged layers)
    const skinLayerObjects: CharacterSkinLayerObject[] = [];

    for (const layerId of this.skinLayers) {
      const layerObj = Game.getInstance().characterSystem.skinLayersMap.get(layerId);
      if (layerObj) {
        // Skip view-tagged layers — they only render when explicitly requested.
        // _default and empty are equivalent (both = base layer).
        const layerView = this.normalizeView((layerObj as any).view as string | undefined);
        if (layerView) continue;
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
  public statIds: Set<string> = new Set();
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

  /**
   * Returns abilities organized by ability_groups.
   * If no abilities have a group assigned, returns useGroups: false with all ability IDs flat.
   * If any ability has a group, returns useGroups: true with sorted groups + their ability IDs.
   * Ungrouped abilities are logged as warnings and excluded.
   */
  public getGroupedAbilities(): { useGroups: boolean; groups: { id: string; name: string; abilityIds: string[] }[] } {
    const game = Game.getInstance();
    const abilities = this.computeFinalAbilities();
    const abilityIds = Object.keys(abilities).filter(id => !abilities[id]?.meta?.is_hidden);

    // Check if any ability has a group
    const hasAnyGroup = abilityIds.some(id => abilities[id]?.meta?.group);
    if (!hasAnyGroup) {
      return { useGroups: false, groups: [{ id: '_all', name: '', abilityIds }] };
    }

    // Load group definitions from characterSystem (pre-loaded, sorted by order)
    const groupsMap = game.characterSystem.abilityGroupsMap;
    const groupDefs: { id: string; name: string }[] = [];
    if (groupsMap) {
      for (const [id, def] of groupsMap) {
        groupDefs.push({ id, name: def.name || id });
      }
    }

    // Build groups with their ability IDs
    const groups = groupDefs
      .map(g => ({
        id: g.id,
        name: g.name,
        abilityIds: abilityIds.filter(aId => abilities[aId]?.meta?.group === g.id),
      }))
      .filter(g => g.abilityIds.length > 0);

    // Warn about ungrouped abilities
    for (const id of abilityIds) {
      if (!abilities[id]?.meta?.group) {
        console.warn(`[ability_groups] Ability '${id}' has no group assigned`);
      }
    }

    return { useGroups: true, groups };
  }

  public getSkinLayers(): Set<string> {
    return this.skinLayers;
  }

  // custom css classes to apply to the skin layer
  public skinLayerStyles: Map<string, string[]> = new Map();

  // runtime clip-path polygon per layer id (e.g. hair trimmed under a hat). @Skip: re-derived
  // from data on every character_render, so it must not linger in saves.
  @Skip()
  public skinLayerClips: Map<string, string> = new Map();

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

  /** Normalize a view id: _default and undefined/empty all become ''. */
  private normalizeView(view?: string | null): string {
    if (!view || view === '_default') return '';
    return view;
  }

  /** Whether this character has a default spine config (no view). */
  public isSpineCharacter(): boolean {
    return this.spineViews.has('');
  }

  /** Whether this character has any renderable art (static face, spine, or skin layers). */
  public hasArt(): boolean {
    if (this.getTrait('face_static')) return true;
    if (this.isSpineCharacter()) return true;
    if (this.skinLayers.size > 0) return true;
    return false;
  }

  /** Get the default spine config (no view). Returns null if not defined. */
  public getDefaultSpine(): SpineViewConfig | null {
    return this.spineViews.get('') || null;
  }

  /**
   * Get spine config for a specific view (e.g. "back", "side").
   * Returns null if no spine view is defined for that view.
   */
  public getSpineForView(view: string): SpineViewConfig | null {
    return this.spineViews.get(this.normalizeView(view)) || null;
  }

  /**
   * Check if a spine view exists for the given view name.
   */
  public isSpineForView(view: string): boolean {
    return this.spineViews.has(this.normalizeView(view));
  }

  /**
   * Get art offset (dx/dy/scale) for the spine entry at the given view.
   * Returns 0/0/1 if no spine entry exists, or for fields the override chain
   * never set. No fallback to character traits — spine is tuned exclusively
   * per spine entry.
   */
  public getSpineArtOffset(view?: string): { dx: number, dy: number, scale: number } {
    const config = this.spineViews.get(this.normalizeView(view));
    if (!config) return { dx: 0, dy: 0, scale: 1 };
    return {
      dx: config.artDx ?? 0,
      dy: config.artDy ?? 0,
      scale: config.artScale ?? 1,
    };
  }

  /**
   * Get static (non-spine) art offset for the given view, from the merged
   * static_art entries. No cross-view fallback — a view without an entry
   * renders neutral (0/0/1), so tuning one view never moves another.
   */
  public getStaticArtOffset(view?: string): { dx: number, dy: number, scale: number } {
    const config = this.staticArtViews.get(this.normalizeView(view));
    if (!config) return { dx: 0, dy: 0, scale: 1 };
    return {
      dx: config.artDx ?? 0,
      dy: config.artDy ?? 0,
      scale: config.artScale ?? 1,
    };
  }

  /**
   * Set/patch the static art placement for a view at runtime. Unset fields
   * keep their current core-status value. Writes to the core status, so the
   * change persists in saves and later statuses can still override per view.
   */
  public setStaticArtOffset(offset: { dx?: number; dy?: number; scale?: number }, view?: string): void {
    const key = this.normalizeView(view);
    const coreStatus = this.getCoreStatus();
    const existing = coreStatus.staticArtViews.get(key);
    coreStatus.staticArtViews.set(key, {
      artDx: offset.dx ?? existing?.artDx,
      artDy: offset.dy ?? existing?.artDy,
      artScale: offset.scale ?? existing?.artScale,
    });
    this.reevaluate();
  }

  /** Get all available view names for this character (excludes '' default). */
  public getAvailableViews(): string[] {
    const views = new Set<string>();
    const game = Game.getInstance();

    for (const viewKey of this.spineViews.keys()) {
      if (viewKey !== '') views.add(viewKey);
    }

    for (const layerId of this.skinLayers) {
      const layerObj = game.characterSystem.skinLayersMap.get(layerId);
      if (layerObj) {
        const layerView = this.normalizeView((layerObj as any).view as string | undefined);
        if (layerView) views.add(layerView);
      }
    }

    return Array.from(views).sort();
  }

  /**
   * Get image layers filtered by requested views.
   * - No views: returns layers with no `view` field + layers with `is_base: true`
   * - With views: returns layers matching requested views + layers with `is_base: true`
   */
  public getImageLayersForView(view?: string): ImageLayerMeta[] {
    const game = Game.getInstance();
    const skinLayerObjects: CharacterSkinLayerObject[] = [];
    const requestedView = this.normalizeView(view);

    for (const layerId of this.skinLayers) {
      const layerObj = game.characterSystem.skinLayersMap.get(layerId);
      if (!layerObj) continue;

      const layerView = this.normalizeView((layerObj as any).view as string | undefined);

      if (layerView === requestedView) {
        skinLayerObjects.push(layerObj);
      }
    }

    skinLayerObjects.sort((a, b) => (a.z_index || 0) - (b.z_index || 0));
    return this.buildImageUrlsFromLayers(skinLayerObjects);
  }

  /**
   * Collects Spine skin name strings from active skin layers of `type: 'spine'`
   * matching the given view. Each layer's `spine_skins[key]` is looked up using
   * the same combo-key construction as static images / spine_animations. Result
   * is the input to `spineRenderer.applySkins()`, which combines them via
   * `Skin.addSkin()`.
   */
  public getSpineSkinsForView(view: string = ''): string[] {
    const game = Game.getInstance();
    const requestedView = this.normalizeView(view);
    const skins: string[] = [];

    for (const layerId of this.skinLayers) {
      const layerObj = game.characterSystem.skinLayersMap.get(layerId);
      if (!layerObj) continue;
      if ((layerObj as any).type !== 'spine') continue;
      const layerView = this.normalizeView((layerObj as any).view as string | undefined);
      if (layerView !== requestedView) continue;

      const key = this.buildLayerLookupKey(layerObj);
      const skinName = (layerObj as any).spine_skins?.[key];
      if (skinName) skins.push(skinName);
    }
    return skins;
  }

  /** Backwards-compatible no-view-arg variant — delegates to default view. */
  public getSpineSkins(): string[] {
    return this.getSpineSkinsForView('');
  }

  /**
   * Build the track-to-animation map for a view from skin layers of type 'spine'.
   * - Filters skin layers to type='spine' AND matching view (`_default` / empty equivalent).
   * - Sorts by z_index ascending (undefined → 0); track index = sort position.
   * - For each layer, looks up `layer.spine_animations[key]` where `key` is built
   *   the same way as static `images` (`layer.id + '_' + attr_values…`, or just
   *   `layer.id` when no attributes).
   * - Layers whose resolved animation value is missing or empty string get no
   *   track entry (the renderer skips them; other tracks aren't shifted).
   */
  public buildSpineTrackMapForView(view: string = ''): Map<number, string> {
    const game = Game.getInstance();
    const requestedView = this.normalizeView(view);
    const layers: CharacterSkinLayerObject[] = [];

    for (const layerId of this.skinLayers) {
      const layerObj = game.characterSystem.skinLayersMap.get(layerId);
      if (!layerObj) continue;
      if ((layerObj as any).type !== 'spine') continue;
      const layerView = this.normalizeView((layerObj as any).view as string | undefined);
      if (layerView !== requestedView) continue;
      layers.push(layerObj);
    }

    layers.sort((a, b) => (a.z_index || 0) - (b.z_index || 0));

    const map = new Map<number, string>();
    layers.forEach((layer, trackIndex) => {
      const key = this.buildLayerLookupKey(layer);
      const animations = (layer as any).spine_animations as Record<string, string> | undefined;
      const animName = animations?.[key];
      if (animName) map.set(trackIndex, animName);
    });
    return map;
  }

  /**
   * Get the current track-to-animation mapping for the given view. Driven
   * entirely by skin layers of type 'spine' (see buildSpineTrackMapForView).
   */
  public getSpineTrackAnimations(view: string = ''): Map<number, string> {
    return this.buildSpineTrackMapForView(view);
  }

  // ignore types
  public reevaluate() {
    const game = Game.getInstance();
    const newProperties: Record<string, any> = {};
    const newAttributes: Record<string, string> = {};
    const newSkinLayers = new Set<string>();
    const newAbilities = new Set<string>();
    const newStatIds = new Set<string>();
    const newSpineViews = new Map<string, SpineViewConfig>();
    const newStaticArtViews = new Map<string, StaticArtViewConfig>();

    for (const status of this.statuses.values()) {
      // Properties: latest status overwrites (unless is_merge)
      if (status.traits) {
        for (const key in status.traits) {
          const value = status.traits[key];
          const traitDef = game.characterSystem.traitsMap.get(key);

          if (traitDef?.is_merge && key in newProperties) {
            newProperties[key] = mergeTrait(newProperties[key], value, traitDef.type ?? '');
          } else {
            // Clone arrays/objects to avoid sharing references with status data
            newProperties[key] = Array.isArray(value) ? [...value]
              : (value && typeof value === 'object') ? { ...value }
                : value;
          }
        }
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

      // Abilities: accumulate. Status-gating happens later, in computeFinalAbilities, off the
      // merged meta.require_status — the post-merge check is what lets modifiers inject gates.
      if (status.abilities) {
        for (const abilityId of status.abilities) {
          newAbilities.add(abilityId);
        }
      }

      // Stats: accumulate stat IDs for O(1) hasStat() lookup
      if (status.stats) {
        for (const statId in status.stats) {
          newStatIds.add(statId);
        }
      }

      // Spine: per-view partial-override. Atlas/skeleton come from the latest
      // status that sets them (full replacement). art_dx/dy/scale fall through
      // to the previous layer when the override doesn't specify them — so a
      // costume swap that re-uses the same skeleton inherits the core's
      // calibrated offsets instead of resetting to 0.
      if (status.spineViews.size > 0) {
        for (const [viewKey, config] of status.spineViews) {
          const existing = newSpineViews.get(viewKey);
          newSpineViews.set(viewKey, {
            ...config,
            artDx: config.artDx ?? existing?.artDx,
            artDy: config.artDy ?? existing?.artDy,
            artScale: config.artScale ?? existing?.artScale,
          });
        }
      }

      // Static art: same per-view partial-override as spine.
      if (status.staticArtViews.size > 0) {
        for (const [viewKey, config] of status.staticArtViews) {
          const existing = newStaticArtViews.get(viewKey);
          newStaticArtViews.set(viewKey, {
            artDx: config.artDx ?? existing?.artDx,
            artDy: config.artDy ?? existing?.artDy,
            artScale: config.artScale ?? existing?.artScale,
          });
        }
      }
    }

    // Ability Modifiers: merge by ability_id
    const collectedModifiers: Record<string, any[]> = {};

    // Collect all modifiers grouped by ability_id
    for (const status of this.statuses.values()) {
      if (status.abilityModifiers) {
        for (const modifier of status.abilityModifiers) {
          const abilityId = modifier.ability_id;
          if (!abilityId) continue;
          // Skip if requires_status is set but the character doesn't have it
          if (modifier.requires_status && !this.statuses.has(modifier.requires_status)) continue;
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
    // Sort abilities by cooldown ascending so iteration order is consistent
    const abilityTemplates = Game.getInstance().characterSystem.abilityTemplatesMap;
    const sortedAbilities = [...newAbilities].sort((a, b) =>
      ((abilityTemplates.get(a)?.meta as any)?.cooldown || 0) - ((abilityTemplates.get(b)?.meta as any)?.cooldown || 0)
    );
    this.abilities = new Set(sortedAbilities);
    this.statIds = newStatIds;
    this.abilityModifiers = mergedAbilityModifiers;

    // Spine: unified map ('' = default, 'back' = back view, etc.)
    this.spineViews = newSpineViews;
    this.staticArtViews = newStaticArtViews;

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
   * Delegates to CharacterSystem.mergeAbilityData
   */
  private mergeAbilityData(target: any, source: any): any {
    return Game.getInstance().characterSystem.mergeAbilityData(target, source);
  }

  /**
   * Merges multiple ability modifiers into one
   * Used in reevaluate() to merge modifiers from all statuses
   */
  private mergeAbilityModifiers(modifiers: any[]): any {
    let result = { meta: {}, effects: {} };
    for (const modifier of modifiers) {
      result = this.mergeAbilityData(result, modifier);
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
      const merged = modifier
        ? this.mergeAbilityData(baseAbility, modifier)
        : this.mergeAbilityData(baseAbility, { meta: {}, effects: {} });

      // meta.require_status: the ability exists only while the character holds ANY listed
      // status — otherwise it is filtered here, which hides it from every consumer (panel,
      // sheet, battle, AI). Checked post-merge so modifiers (e.g. equipped items) can inject it.
      const gates = merged.meta.require_status;
      if (gates) {
        const list = Array.isArray(gates) ? gates : [gates];
        if (list.length && !list.some((id: string) => this.statuses.has(id))) continue;
      }

      result[abilityId] = merged;
    }

    // Sort by order, then cooldown
    const sorted = Object.entries(result).sort(([, a], [, b]) => {
      const orderDiff = (a.meta.order ?? 0) - (b.meta.order ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return (a.meta.cooldown ?? 0) - (b.meta.cooldown ?? 0);
    });
    const sortedResult: FinalAbilities = {};
    for (const [id, ab] of sorted) sortedResult[id] = ab;
    return sortedResult;
  }

  // ignore types
  public evaluateRenderedLayers(): void {
    // Build default renderedLayers from skinLayers (exclude view-tagged layers)
    let layers: CharacterSkinLayerObject[] = [];
    for (let value of this.skinLayers) {
      let skinLayerObject = Game.getInstance().characterSystem.skinLayersMap.get(value);
      if (!skinLayerObject) {
        throw new Error(`Skin Layer ${value} does not exist`);
      }
      // Skip view-tagged layers — they only render when explicitly requested.
      // _default and empty are equivalent (both = base layer).
      const layerView = this.normalizeView((skinLayerObject as any).view as string | undefined);
      if (layerView) continue;
      layers.push(skinLayerObject);
    }
    layers = layers.sort((a, b) => (a.z_index || 0) - (b.z_index || 0));

    // Set renderedLayers to default (viewless layers only)
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
    const oldReplenishableValues = this.captureResourceStatValues();

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
      this.adjustAllResources(oldReplenishableValues, false);
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

  public addAbility(abilityId: string): void {
    const template = Game.getInstance().characterSystem.abilityTemplatesMap.get(abilityId);
    if (!template) {
      throw new Error(`Ability Template ${abilityId} does not exist`);
    }
    this.getCoreStatus().abilities.add(abilityId);
    this.reevaluate();
  }

  public removeAbility(abilityId: string): void {
    this.getCoreStatus().abilities.delete(abilityId);
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

  /**
   * Clip a skin layer to a polygon at render time (keep-inside clip-path, image-space
   * coordinates — same contract as skin-layer keep masks). Typically set from a
   * character_render listener; the reactive map re-renders the doll with no reevaluate().
   * @param layerId The skin layer ID (e.g. 'hair_front')
   * @param polygon A CSS polygon string, e.g. "polygon(10% 10%, ...)"
   */
  public setSkinLayerClip(layerId: string, polygon: string): void {
    if (!this.skinLayers.has(layerId)) {
      throw new Error(`Skin layer "${layerId}" not found on character ${this.id}`);
    }
    this.skinLayerClips.set(layerId, polygon);
  }

  /** Remove a layer's runtime clip. */
  public clearSkinLayerClip(layerId: string): void {
    this.skinLayerClips.delete(layerId);
  }


  // TODO: remove this
  /*
  public addStatToStatus(id: string, statName: string, value: number): void {
    let status = this.getStatus(id);
    status.addStat(statName, value);
    this._updateAndSetResources(status);
  }
*/


  public addStatus(status: Status, applyArgs?: { stacks?: number; duration?: number; source?: string }) {
    // Mutual-exclusion group: a status with a group_id supersedes any OTHER status in the same group
    // (e.g. big_blessing replaces small_blessing). Same-id reapply is left to the merge path below.
    // This is the single choke point for every application (status action, consumable, battle effect).
    if (status.groupId) {
      const supersededIds: string[] = [];
      for (const [id, existing] of this.statuses) {
        if (id !== status.id && existing.groupId === status.groupId) supersededIds.push(id);
      }
      for (const id of supersededIds) this.removeStatus(id);
    }

    // Check if status with this id already exists
    const existingStatus = this.statuses.get(status.id);

    if (existingStatus) {
      const oldReplenishableValues = this.captureResourceStatValues();
      // Reapply path — refresh duration + add stacks (single-stack) or append instance (multi-stack)
      const stacks = applyArgs?.stacks ?? status.currentStacks;
      const duration = applyArgs?.duration ?? status.duration;
      const source = applyArgs?.source;
      existingStatus.applyInstance({ stacks, duration, source });
      this.reevaluate();
      this.adjustAllResources(oldReplenishableValues, true);
      return;
    }

    // Capture all replenishable stat values before adding status (for computed stats)
    const oldReplenishableValues = this.captureResourceStatValues();

    // If applyArgs are provided, seed the fresh status's first instance from them
    if (applyArgs) {
      const stacks = applyArgs.stacks ?? status.currentStacks;
      const duration = applyArgs.duration ?? status.duration;
      const source = applyArgs.source;
      status._instances = [{ stacks, duration, source }];
    }

    // Add as a new status
    this.statuses.set(status.id, status);
    this.reevaluate();
    this._updateAndSetResources(status);

    // Adjust all replenishable resources (handles both direct and computed stats)
    this.adjustAllResources(oldReplenishableValues, true);
    Game.getInstance().trigger('status_added', this, status);
  }


  public removeStatus(id: string): void {
    const statusToRemove = this.statuses.get(id);
    if (!statusToRemove) {
      gameLogger.warn(`Failed to remove status "${id}" - status does not exist`);
      return;
    }

    // Capture all replenishable stat values before removing status (for computed stats)
    const oldReplenishableValues = this.captureResourceStatValues();

    this.statuses.delete(id);

    if (statusToRemove) {
      this._updateAndSetResources(statusToRemove);
      this.reevaluate();

      // Adjust all replenishable resources (handles both direct and computed stats)
      this.adjustAllResources(oldReplenishableValues, true);
      Game.getInstance().trigger('status_removed', this, statusToRemove);
    }
  }

  /**
   * Tick a single status's duration by `amount`. Drops expired instances.
   * If the status has no instances left, removes the status from the character.
   * Fires `status_expired` per expired instance.
   */
  public tickStatusDuration(id: string, amount: number = 1): void {
    const status = this.statuses.get(id);
    if (!status) return;
    const expired = status.tickDuration(amount);
    if (expired.length > 0) {
      const game = Game.getInstance();
      for (const inst of expired) game.trigger('status_expired', this, status, inst);
    }
    if (status.getInstances().length === 0) {
      this.removeStatus(id);
    }
  }

  /**
   * Set status stacks with proper resource adjustment for replenishable stats
   */
  public setStatusStacks(statusId: string, newStacks: number): void {
    const status = this.statuses.get(statusId);
    if (!status) {
      throw new Error(`Status "${statusId}" not found on character "${this.id}"`);
    }
    if (status.currentStacks === newStacks) return;

    const oldValues = this.captureResourceStatValues();
    status.currentStacks = newStacks;
    this.reevaluate();
    this.adjustAllResources(oldValues, true);
  }

  /**
   * Add stacks to status with proper resource adjustment for replenishable stats
   */
  public addStatusStacks(statusId: string, amount: number = 1): boolean {
    const status = this.statuses.get(statusId);
    if (!status) {
      throw new Error(`Status "${statusId}" not found on character "${this.id}"`);
    }

    const oldValues = this.captureResourceStatValues();
    const success = status.addStacks(amount);
    this.reevaluate();
    this.adjustAllResources(oldValues, true);
    return success;
  }

  /**
   * Remove stacks from a status (oldest instances first) with proper resource adjustment.
   * Removes the status entirely if it drops to 0 stacks. Returns the number actually removed.
   */
  public removeStatusStacks(statusId: string, amount: number = 1): number {
    const status = this.statuses.get(statusId);
    if (!status) return 0;

    const oldValues = this.captureResourceStatValues();
    const removed = status.removeStacks(amount);
    if (status.getInstances().length === 0) {
      this.removeStatus(statusId);
    } else {
      this.reevaluate();
      this.adjustAllResources(oldValues, true);
    }
    return removed;
  }


  /**
   * Captures current max values of all resource stats.
   * Used to detect changes in computed stats.
   * @returns Record of stat names to their current max values
   */
  private captureResourceStatValues(): Record<string, number> {
    const values: Record<string, number> = {};
    const statsMap = Game.getInstance().characterSystem.statsMap;

    for (const [statName, stat] of statsMap) {
      if (stat.is_resource) {
        values[statName] = this.getStatRef(statName).value;
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
  private adjustAllResources(oldValues: Record<string, number>, fromStatusChange: boolean = false): void {
    for (const statName in oldValues) {
      const newValue = this.getStatRef(statName).value;
      this.adjustResourceForStatChange(statName, oldValues[statName], newValue, fromStatusChange);
    }
  }

  /**
   * Adjusts a resource when its max stat value changes.
   * For replenishable resources: adjusts current value by the delta.
   * For all resources: clamps to new max if can_overflow is false.
   * @param statName The stat/resource name
   * @param oldStatValue The old max stat value
   * @param newStatValue The new max stat value
   * @param fromStatusChange If true, applies is_safe_removal logic (default: false)
   */
  private adjustResourceForStatChange(statName: string, oldStatValue: number, newStatValue: number, fromStatusChange: boolean = false): void {
    const stat = Game.getInstance().characterSystem.statsMap.get(statName);
    if (!stat || !stat.is_resource) {
      return;
    }

    const currentResource = this.getResource(statName);
    let newResourceValue = currentResource;

    // For replenishable resources, adjust by delta
    if (stat.is_replenishable) {
      const delta = newStatValue - oldStatValue;
      if (delta !== 0) {
        newResourceValue = currentResource + delta;

        // Apply safe removal floor (1) if this is from a status change and stat has is_safe_removal
        const minFloor = (fromStatusChange && stat.is_safe_removal) ? 1 : 0;
        newResourceValue = Math.max(minFloor, newResourceValue);
      }
    }

    // For all resources: clamp to new max if can_overflow is false
    if (!stat.can_overflow && newResourceValue > newStatValue) {
      newResourceValue = newStatValue;
    }

    // Only update if value changed
    if (newResourceValue !== currentResource) {
      this.setResource(statName, newResourceValue);
    }
  }

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


  /** Raw copy of current resource pools. Save-owned state — see restoreResources. */
  public snapshotResources(): Record<string, number> {
    return { ...this.resources };
  }

  /**
   * Raw-restore pools from snapshotResources, bypassing clamp/delta logic and resource-change
   * events. Save-migration internal: status remove/re-add would otherwise clamp non-replenishable
   * pools against a transiently-0 max and delta-refill replenishable ones. Resources initialized
   * after the snapshot (e.g. a brand-new resource stat) keep their init value.
   */
  public restoreResources(snapshot: Record<string, number>): void {
    Object.assign(this.resources, snapshot);
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

  public getStatus(id: string): Status | undefined {
    return this.statuses.get(id);
  }

  /**
   * The live status an equipped item is granting this character (see Inventory.applyEquipStatus),
   * or undefined when the item grants none or is not equipped. Mutating it is allowed — call
   * reevaluate() afterwards.
   */
  public getItemStatus(item: Item | string): Status | undefined {
    const uid = typeof item === 'string' ? item : item.uid;
    return this.statuses.get("item_" + uid);
  }

  public hasStatus(id: string): boolean {
    return this.statuses.has(id);
  }

  public getStatuses(): Status[] {
    return [...this.statuses.values()];
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
    const maxVal = this.getStatRef(name).value;
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
    const precision = stat.precision ?? 0;
    const factor = Math.pow(10, precision);
    return Math.round(value * factor) / factor;
  }
  private clampValue(name: string, value: number, stat: EntityStatObject): number {
    const minVal = 0;
    const maxVal = this.getStatRef(name).value;
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




  /**
   * Check if character has a stat defined in any of their statuses.
   * Uses cached statIds set for O(1) lookup (populated during reevaluate).
   * @param statId - The stat ID to check
   * @returns True if the character has this stat
   */
  public hasStat(statId: string): boolean {
    return this.statIds.has(statId);
  }

  /**
   * Get a stat's computed value directly as a number.
   * Works reactively in Vue templates and computed properties.
   * @param name - The stat name
   * @returns The stat value as a number
   * @throws Error if stat doesn't exist in schema
   * @example
   * const maxHealth = character.getStat('health');
   */
  public getStat(name: string): number {
    return this.getStatRef(name).value;
  }

  /**
   * Set the base value of a stat on the character's core status.
   * Convenience wrapper around update({ stats: { [name]: value } }).
   * @param name - The stat name
   * @param value - The value to set
   * @throws Error if stat doesn't exist in schema
   */
  public setStat(name: string, value: number): void {
    this.update({ stats: { [name]: value } });
  }

  /**
   * Get a stat's reactive ComputedRef.
   * Use when you need the ref itself (e.g., for watch() or storing).
   * @param name - The stat name
   * @returns ComputedRef that updates when stat changes
   * @throws Error if stat doesn't exist in schema
   * @example
   * const healthRef = character.getStatRef('health');
   * watch(healthRef, (newVal) => console.log('Health changed:', newVal));
   */
  public getStatRef(name: string): ComputedRef<number> {
    let stat = Game.getInstance().characterSystem.statsMap.get(name);
    if (!stat) {
      throw new Error(`Stat "${name}" does not exist in characterStatsMap.`);
    }

    if (!this._statGetters.has(name)) {
      const newComputedGetter = computed(() => {
        let statValue = 0;
        const game = Game.getInstance();

        for (const status of this.statuses.values()) {
          // Multiply stat value by currentStacks
          const multiplier = status.currentStacks || 1;

          // Add base stat from status
          if (status.stats && typeof status.stats[name] === 'number') {
            statValue += status.stats[name] * multiplier;
          }

          // Add computed stats from status (one computer per key in computedStatsKeys)
          for (const key of status.computedStatsKeys) {
            const computer = game.characterSystem.getStatComputer(key);
            if (!computer) continue;
            const computedValues = computer(this);
            if (typeof computedValues[name] === 'number') {
              statValue += computedValues[name] * multiplier;
            }
          }
        }

        if (stat.is_binary) {
          statValue = statValue > 0 ? 1 : 0;
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
      for (const status of this.statuses.values()) {
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

  /** The item equipped in this slot instance, or null when the slot is empty. */
  public getItemInSlot(slotId: string): Item | null {
    const itemUid = this.getItemSlotById(slotId)?.itemUid;
    if (!itemUid) return null;
    return this.getPartyInventory()?.getItemByUid(itemUid) || null;
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
    return this.itemSlots.filter(slot => {
      const tokens = [slot.slotId, ...(slot.getSlotObject()?.accepts ?? [])];
      return tokens.some(t => item.slots.includes(t));
    });
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

    // Guard: if already equipped, don't equip again
    if (resolvedItem.isEquipped) {
      gameLogger.error(`Item "${resolvedItem.id}" (${resolvedItem.uid}) is already equipped`);
      return;
    }

    // Auto-add to inventory if not already present (addItem clones, so use the clone)
    if (!inventory.getItemByUid(resolvedItem.uid)) {
      const [addedItem] = inventory.addItem(resolvedItem, 1, true);
      resolvedItem = addedItem;
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

    if (slotId && !this.getAvailableSlotsForItem(resolvedItem).includes(slot)) {
      gameLogger.warn(`Item "${resolvedItem.id}" is not compatible with slot "${slot.slotId}" on character "${this.id}"`);
      return;
    }

    inventory.equipSlot(slot, resolvedItem, this);
    gameLogger.info(`[equip] Equipped "${resolvedItem.id}" on "${this.id}"`);
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

    const equippedItem = inventory.getItemByUid(itemUid);
    inventory.unequipSlot(slot, this);
    gameLogger.info(`[equip] Unequipped "${equippedItem?.id ?? itemUid}" from "${this.id}"`);
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

    // consume choice
    if (item.isConsumable() && !item.isEquipped) {
      const params = {
        consume_item: {
          itemUid: item.uid,
          characterId: this.id,
        }
      };
      let choice = Game.getInstance().logicSystem.createCustomChoice({
        id: "consume_item",
        name: Global.getInstance().getString("consume_item"),
        params: params
      });
      choices.push(choice);
    }

    // learn-recipe choice (recipe scrolls) — grayed out once the recipe is known
    if (item.learn_recipe && !item.isEquipped) {
      const recipeId = item.learn_recipe;
      const params = {
        learn_recipe_item: {
          itemUid: item.uid,
          characterId: this.id,
        }
      };
      let choice = Game.getInstance().logicSystem.createCustomChoice({
        id: "learn_recipe_item",
        name: Global.getInstance().getString("learn_recipe"),
        params: params
      });
      choice.isAvailable = computed(() => !Game.getInstance().itemSystem.learnedRecipes.value.has(recipeId));
      choices.push(choice);
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
          equip_item: {
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
        unequip_item: {
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