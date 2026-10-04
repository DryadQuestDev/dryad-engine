import { save, Skip, Populate } from '../../utility/save-system';
import { parseAudioSpec, rampVolume, type AudioOverrides } from '../../services/audioFade';
import { ManifestObject } from '../../schemas/manifestSchema';
import { Global } from '../../global/global';
import { IndexedDbSaveService, DEV_REPLAY_SCENE_KEY } from '../../services/indexeddb-save.service';
import { Ref, ref, markRaw, type Component, computed, watch, ComputedRef } from 'vue';
import { useIdle, type UseIdleReturn } from '@vueuse/core';
import { DebugSettingsType } from '../data/debugSettings';
import { SettingsObject } from '../../schemas/settingsSchema';
import { Property } from '../property';
import { SoundObject } from '../../schemas/soundSchema';
import { getFileExtensions } from '../../utility/schema';
import { MusicObject } from '../../schemas/musicSchema';
import { Character } from '../core/character/character';
import { Status } from '../core/character/status';
import { Inventory } from '../core/character/inventory';
import type { Identifiable } from '../../functions/mergeById';
import { Game } from '../game';
import { gameLogger, captureCallerInfo } from '../utils/logger';
import { GalleryObject } from '../../schemas/gallerySchema';
import { DiscoveredCharacter } from '../core/character/discoveredCharacter';
import { DiscoveredAsset } from '../core/asset/discoveredAsset';
import { AssetObject } from '../../schemas/assetSchema';
import { InitSystem, CORE_EMITTER_SIGNATURES } from './initSystem';
import { MusicPlayer } from '../../services/musicPlayer';
import ShortUniqueId from 'short-unique-id';
import { PropertyObject } from '../../schemas/propertySchema';
import { LocaleObject } from '../../schemas/localeSchema';

export type CustomComponent = {
  id: string;
  slot: string;
  component: Component;
  title?: string; // Tab label: a locale key when one exists, otherwise the literal text to show
  order?: number;
  props?: Record<string, any>; // Optional props
  mask?: string | boolean; // Popup slot only: backdrop. omit = default dim, false = none, or a CSS color
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

export type SaveOptions = {
  hidden?: boolean;
  forceSave?: boolean;
  noNotification?: boolean;
}

export type StopSoundOptions = {
  /** Leave looping sounds alone; stop only the one-shots. */
  keepLooping?: boolean;
  /** Leave the loops started outside a scene playing — room and dungeon ambience — and stop the rest. */
  keepMapLoops?: boolean;
  /** Seconds to fade out, over each sound's own `fade_out`. An id's inline `(fade_out=N)` wins over both. */
  fadeOut?: number;
}

/** One in-flight `playSounds` call: the audio elements for a sound's `files`, kept so it can be stopped. */
export type SoundPlayback = {
  id: string;
  loop: boolean;
  /** The sound's `channel`; '' when it has none. */
  channel: string;
  /** Set by stopSounds. Guards the load callbacks, which fire after a stop if the files were still loading. */
  stopped: boolean;
  elements: HTMLAudioElement[];
  /** The sound's gain 0–1; the slider multiplies onto it. */
  gain: number;
  /** Seconds to fade when stopped, unless the stop says otherwise. */
  fadeOut: number;
  /** Pending `delay` before the first file starts. */
  delayTimer: number | null;
  /** The running fade-in, if any. */
  cancelRamp: (() => void) | null;
  /** Started while a scene played: a loop like this ends with the scene; one started on the map plays on. */
  fromScene: boolean;
}

// EmitterMap is derived from CORE_EMITTER_SIGNATURES for strict type checking.
// It ensures that EmitterMap perfectly reflects the defined core emitters.
// CORE_EMITTER_SIGNATURES is now defined in initSystem.ts
export type EmitterMap = typeof CORE_EMITTER_SIGNATURES;

/**
 * One save-migration section: `true` = the whole section, `false` = skip it entirely,
 * `{ only }` = the only keys to sync, `{ skip }` = keys to leave as the save has them.
 * Both lists can appear together — allowed keys are `only` minus `skip`.
 */
export type MigrationScope = boolean | { only?: string[]; skip?: string[] };

/** Options for one save-migration declaration. Every mutating section has its own key. */
export interface SaveMigrationOptions {
  /**
   * What sections nobody mentions do — `opt-out` (default) syncs them, `opt-in` skips them.
   * Only honored on the `_core` declaration: a mod can't flip the game's global default.
   */
  mode?: 'opt-in' | 'opt-out';
  /** Stat ids. */
  stats?: MigrationScope;
  /** Trait ids. */
  traits?: MigrationScope;
  /** Attribute ids. */
  attributes?: MigrationScope;
  /** Ability ids. */
  abilities?: MigrationScope;
  /** Skin layer ids. */
  skinLayers?: MigrationScope;
  /** View ids (`_default` for the default view) — spine atlas/skeleton and their placement. */
  spine?: MigrationScope;
  /** View ids (`_default` for the default view) — static (non-spine) art_dx / art_dy / art_scale placement. */
  staticArt?: MigrationScope;
  /** Template item-slot ids. Backfills missing slots and repositions existing ones — never removes. */
  itemSlots?: MigrationScope;
  /** Skill tree ids. */
  skillTrees?: MigrationScope;
  /** Learned-skill (tree slot) ids. */
  learnedSkills?: MigrationScope;
  /** Status ids. */
  statuses?: MigrationScope;
  /** Item trait ids — reset every inventory item's traits to its template, purge stale ids. */
  itemTraits?: MigrationScope;
  /**
   * Item template ids — rebuild every other template-owned field of each inventory item from its
   * template: equip-status object, price, consume payloads, slots, category, tags, actions, choices.
   * Identity, quantity, the equipped flag and trade prices are the instance's own and never move.
   */
  items?: MigrationScope;
}

/** One declaration plus who contributed it — `_core` for the game, otherwise a mod or plugin id. */
export type SaveMigrationRegistration = { source: string; options: SaveMigrationOptions };

/** Every mutating section of `SaveMigrationOptions`, i.e. its keys minus `mode`. */
const MIGRATION_SECTIONS = [
  'stats', 'traits', 'attributes', 'abilities', 'skinLayers', 'spine', 'staticArt', 'itemSlots',
  'skillTrees', 'learnedSkills', 'statuses', 'itemTraits', 'items',
] as const;
type MigrationSection = typeof MIGRATION_SECTIONS[number];

/** Resolved section gate: `enabled` short-circuits the whole section, `allows` filters per key. */
type ScopeFilter = { enabled: boolean; allows(key: string): boolean };

/** Every section's resolved gate, ready to run a pass against. */
type MigrationScopes = Record<MigrationSection, ScopeFilter>;

const ALLOW_ALL: ScopeFilter = { enabled: true, allows: () => true };
const DENY_ALL: ScopeFilter = { enabled: false, allows: () => false };

/**
 * Sync one core-status view map (spine or static art) against the template's.
 * The internal key for the default view is `''`; devs list it as `_default`.
 */
function syncViewMap<T>(current: Map<string, T>, fromTemplate: Map<string, T>, scope: ScopeFilter): void {
  for (const view of [...current.keys()]) {
    if (scope.allows(view || '_default') && !fromTemplate.has(view)) current.delete(view);
  }
  for (const [view, config] of fromTemplate) {
    if (scope.allows(view || '_default')) current.set(view, config);
  }
}

/** See the `MigrationScope` table in `Game.registerSaveMigration()`. Omitted follows the mode. */
function resolveScope(value: MigrationScope | undefined, optIn: boolean): ScopeFilter {
  if (value === true) return ALLOW_ALL;
  if (value === false) return DENY_ALL;
  if (value) {
    const only = value.only ? new Set(value.only) : null;
    const skip = new Set(value.skip ?? []);
    if (only && only.size === 0) return DENY_ALL;
    return { enabled: true, allows: k => (!only || only.has(k)) && !skip.has(k) };
  }
  return optIn ? DENY_ALL : ALLOW_ALL;
}

/** Resolve one declaration on its own — the manual `runDefaultSaveMigration(options)` path. */
function resolveScopes(options: SaveMigrationOptions): MigrationScopes {
  const optIn = options.mode === 'opt-in';
  const scopes = {} as MigrationScopes;
  for (const key of MIGRATION_SECTIONS) scopes[key] = resolveScope(options[key], optIn);
  return scopes;
}

/**
 * Merge every registered declaration into one gate per section. Restrictive wins, so the merge
 * is order-independent and a mod can only ever make the pass do LESS — never resurrect state
 * another source meant to keep:
 * - `false` from any source disables the section outright.
 * - `skip` entries from every source union, and always subtract last.
 * - `only` lists union (a mod extends coverage); `true` from any source widens it to every key.
 * - `mode` comes from the `_core` declaration alone; elsewhere it's ignored with a warning.
 */
function mergeScopes(registrations: SaveMigrationRegistration[]): MigrationScopes {
  const optIn = registrations.find(r => r.source === '_core')?.options.mode === 'opt-in';
  for (const reg of registrations) {
    if (reg.source !== '_core' && reg.options.mode) {
      gameLogger.warn(`[save-migration] "${reg.source}" set mode: '${reg.options.mode}' — ignored, only _core owns the default`);
    }
  }

  const scopes = {} as MigrationScopes;
  for (const key of MIGRATION_SECTIONS) {
    let mentioned = false, denied = false, widened = false, narrowed = false;
    const only = new Set<string>();
    const skip = new Set<string>();
    for (const { options } of registrations) {
      const value = options[key];
      if (value === undefined) continue;
      mentioned = true;
      if (value === false) { denied = true; continue; }
      if (value === true) { widened = true; continue; }
      if (value.only) { narrowed = true; for (const k of value.only) only.add(k); }
      if (value.skip) for (const k of value.skip) skip.add(k);
    }

    if (denied || (!mentioned && optIn)) { scopes[key] = DENY_ALL; continue; }
    const all = widened || !narrowed;                 // nobody narrowed it → every key
    if (!all && only.size === 0) { scopes[key] = DENY_ALL; continue; }
    scopes[key] = { enabled: true, allows: k => (all || only.has(k)) && !skip.has(k) };
  }
  return scopes;
}

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

  /** Entry cap for imageCache. Entries, not bytes — the corpus varies ~100x per file. */
  private static readonly IMAGE_CACHE_LIMIT = 600;

  /**
   * Canonical cache key. The two writers disagree on spelling: the preloader passes the raw
   * data path ("assets/games_assets/…/body.webp") while the v-persist directive passes el.src,
   * which the DOM has already resolved to an absolute URL. Unresolved, the same file occupies
   * two entries, each invisible to the other — so warming can never see what the renderer
   * already holds, and either copy can evict the other. Resolve both to the absolute form.
   */
  private imageCacheKey(src: string): string {
    try {
      return new URL(src, document.baseURI).href;
    } catch {
      return src;
    }
  }

  /**
   * True when the image already has an element in the cache. Note this means "someone has
   * started fetching this", not "this is paint-ready" — the element is inserted synchronously,
   * before load. Callers use it to skip redundant decode work, not to assert readiness.
   */
  public hasImage(src: string): boolean {
    return !!src && this.imageCache.has(this.imageCacheKey(src));
  }

  /**
   * Holds a reference to an image so the browser keeps its encoded data around, and hands the
   * element back so callers can await its load/decode. Capped at IMAGE_CACHE_LIMIT entries,
   * evicting least-recently-used.
   */
  public persistImage(src: string): HTMLImageElement | undefined {
    if (!src) return undefined;
    const key = this.imageCacheKey(src);
    const existing = this.imageCache.get(key);
    if (existing) {
      // A hit is a use: re-insert so it moves to the young end. Under plain insertion order a
      // layer that is still on screen ages out behind whatever icons happened to stream past
      // it, because v-persist only fires on mount — re-touching happens when layers remount
      // (the doll's TransitionGroup is keyed by image), not on every render.
      this.imageCache.delete(key);
      this.imageCache.set(key, existing);
      return existing;
    }
    if (this.imageCache.size >= CoreSystem.IMAGE_CACHE_LIMIT) {
      this.imageCache.delete(this.imageCache.keys().next().value!);
    }
    const img = new Image();
    img.src = src;
    this.imageCache.set(key, img);
    return img;
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

  // True only while a save migration runs. Migration snapshots every resource pool, churns
  // statuses/items (remove + re-add) and raw-restores the pools, so its intermediate values are
  // never meant to be observed — but the churn goes through the ordinary setters and would emit
  // them (a status that raises a resource's max, removed then re-added, reads as that resource
  // being spent). Migrations run after stateLoading clears, so they need their own gate.
  // Not a ref: read synchronously.
  @Skip()
  private migratingSave = false;

  /**
   * Full-screen "Loading" overlay (same visual as the initial game load) that
   * covers the game WITHOUT unmounting it — used by scripts/plugins to hide
   * asset preloading (see game.setScreenLoading).
   */
  @Skip()
  public screenLoading = ref(false);

  /**
   * Versions map stamped on the save that was just loaded — keyed by data-source id.
   * `_core` is the game itself; remaining keys are mod ids. Each entry carries the manifest's
   * display name alongside the version. null for a new game.
   */
  @Skip()
  public loadedSaveVersions: Record<string, { name: string; version: string }> | null = null;

  /** Returns the current `(game + mods)` versions map. Same shape as `loadedSaveVersions` / `saveMeta.versions`. */
  public getVersions(): Record<string, { name: string; version: string }> {
    const versions: Record<string, { name: string; version: string }> = {
      _core: { name: this.gameManifest?.name || '', version: this.gameManifest?.version || '0' },
    };
    for (const mod of this.modsManifests || []) {
      if (mod?.id) versions[mod.id] = { name: mod.name || mod.id, version: mod.version || '0' };
    }
    return versions;
  }

  /**
   * Returns true when a save was loaded and its `(game + mods)` version signature
   * differs from the current one. Returns false for new games or when the loaded
   * save's versions match the current versions exactly. Same signature comparison
   * `runDefaultSaveMigration` uses internally.
   *
   * A missing or empty `loadedSaveVersions` counts as its own (empty) signature —
   * any current `_core` version mismatches it, so this returns true.
   */
  public isOldSave(): boolean {
    const game = Game.getInstance();
    if (game.isNewGame) return false;
    const stringify = (m: Record<string, { version: string }>) =>
      Object.keys(m).sort().map(k => `${k}=${m[k].version}`).join(',');
    return stringify(this.loadedSaveVersions ?? {}) !== stringify(this.getVersions());
  }

  /**
   * Save-migration declarations in registration order, one per source. Filled at script-load
   * time by `game.registerSaveMigration()` — the game, its mods and plugins each contribute
   * their own — and executed by the engine on save load, just before `game_initiated`.
   */
  @Skip()
  public saveMigrations: SaveMigrationRegistration[] = [];

  /**
   * Declare how `source` wants old saves restored. Re-registering the same source replaces
   * its previous declaration. See `Game.registerSaveMigration()` for the full docs.
   */
  public registerSaveMigration(source: string, options: SaveMigrationOptions): void {
    const existing = this.saveMigrations.findIndex(r => r.source === source);
    if (existing >= 0) this.saveMigrations[existing] = { source, options };
    else this.saveMigrations.push({ source, options });
  }

  /**
   * Merge every registered declaration and run the pass. Called by the engine on save load.
   * `save_migrated` fires under the same gate as the pass (an old save, or any load in dev mode)
   * even when nothing was declared or every section is disabled.
   */
  public runRegisteredSaveMigrations(): void {
    const game = Game.getInstance();
    if (game.isNewGame) return;
    if (!this.isOldSave() && !game.isDevMode()) return;
    let fired = false;
    if (this.saveMigrations.length > 0) {
      const sources = this.saveMigrations.map(r => r.source).join(' + ');
      this.migratingSave = true;
      try { fired = this.applySaveMigration(mergeScopes(this.saveMigrations), sources); }
      finally { this.migratingSave = false; }
    }
    if (!fired) this.trigger('save_migrated');
  }

  /**
   * Run a one-off pass from an explicit options object, ignoring the registry.
   * See `Game.runDefaultSaveMigration()` for the public-facing wrapper.
   */
  public runDefaultSaveMigration(options: SaveMigrationOptions = {}): void {
    this.migratingSave = true;
    try { this.applySaveMigration(resolveScopes(options), 'manual'); }
    finally { this.migratingSave = false; }
  }

  /**
   * Rebuild every character's state from current definitions (template + statuses + traits).
   * Resource pools are never touched — snapshot at the start, restored verbatim at the end.
   * No-op for new games or when the loaded versions match the current ones —
   * except in dev mode, where it runs on every load regardless of versions.
   * Returns whether the pass ran (and so fired `save_migrated` itself).
   */
  private applySaveMigration(scopes: MigrationScopes, label: string): boolean {
    const game = Game.getInstance();
    if (game.isNewGame) return false;
    const sameVersion = !this.isOldSave();
    if (sameVersion && !game.isDevMode()) return false;

    if (!Object.values(scopes).some(s => s.enabled)) {
      console.log(`[save-migration] ${label}: nothing enabled, skipped`);
      return false;
    }

    const stringify = (m: Record<string, { version: string }>) =>
      Object.keys(m).sort().map(k => `${k}=${m[k].version}`).join(',');
    const oldSig = stringify(this.loadedSaveVersions ?? {});
    const newSig = stringify(this.getVersions());

    console.log(`[save-migration] ${label} · ${oldSig || '(none)'} → ${newSig}${sameVersion ? ' (dev mode, no version bump)' : ''}`);
    const migrationStart = performance.now();

    // Resource pools are save-owned. The status remove/re-add below clamps non-replenishable
    // pools against a transiently-0 max and delta-refills replenishable ones — snapshot every
    // pool now, raw-restore at the very end so migration never moves them.
    const resourceSnapshots = new Map<Character, Record<string, number>>();
    for (const char of game.getAllCharacters()) {
      resourceSnapshots.set(char, char.snapshotResources());
    }

    const statsMap = game.characterSystem.statsMap;
    const statusesMap = game.characterSystem.statusesMap;
    const traitsMap = game.characterSystem.traitsMap;
    const attributesMap = game.characterSystem.attributesMap;
    const templatesMap = game.characterSystem.templatesMap;
    const abilityTemplatesMap = game.characterSystem.abilityTemplatesMap;
    const skinLayersMap = game.characterSystem.skinLayersMap;
    const skillTreesMap = game.characterSystem.skillTreesMap;
    const skillSlotsMap = game.characterSystem.skillSlotsMap;
    const itemSlotsMap = game.itemSystem.itemSlotsMap;

    for (const char of game.getAllCharacters()) {
      const template = templatesMap.get(char.templateId);
      if (!template) continue;                                       // template gone (e.g. removed mod); leave char alone

      const coreStatus = char.getCoreStatus();

      // 1. Stats — reset to the template values. Safe against resource pools only because the
      // whole migration is wrapped in the snapshot/restore above: setStat delta-adjusts
      // replenishable resources (e.g. a pool that doubles as a lifespan) and that gets undone at the end.
      if (scopes.stats.enabled) {
        const tplStats = (template as any).stats || {};
        for (const key of Object.keys(coreStatus.stats || {})) {
          if (!scopes.stats.allows(key)) continue;
          if (!statsMap.has(key)) { delete coreStatus.stats[key]; continue; }
          if (typeof tplStats[key] === 'number') char.setStat(key, tplStats[key]);
        }
        for (const key of Object.keys(tplStats)) {
          if (!scopes.stats.allows(key)) continue;
          if (!statsMap.has(key)) continue;
          if (coreStatus.stats[key] === undefined) char.setStat(key, tplStats[key]);
        }
      }

      // 2. Traits
      if (scopes.traits.enabled) {
        const tplTraits = (template as any).traits || {};
        for (const key of Object.keys(coreStatus.traits || {})) {
          if (!scopes.traits.allows(key)) continue;
          if (!traitsMap.has(key)) { delete coreStatus.traits[key]; continue; }
          if (tplTraits[key] !== undefined) char.setTrait(key, tplTraits[key]);
        }
        for (const key of Object.keys(tplTraits)) {
          if (!scopes.traits.allows(key)) continue;
          if (!traitsMap.has(key)) continue;
          if (coreStatus.traits[key] === undefined) char.setTrait(key, tplTraits[key]);
        }
      }

      // 3. Attributes
      if (scopes.attributes.enabled) {
        const tplAttrs = (template as any).attributes || {};
        for (const key of Object.keys(coreStatus.attributes || {})) {
          if (!scopes.attributes.allows(key)) continue;
          if (!attributesMap.has(key)) { delete coreStatus.attributes[key]; continue; }
          if (typeof tplAttrs[key] === 'string') char.setAttribute(key, tplAttrs[key]);
        }
        for (const key of Object.keys(tplAttrs)) {
          if (!scopes.attributes.allows(key)) continue;
          if (!attributesMap.has(key)) continue;
          if (coreStatus.attributes[key] === undefined) char.setAttribute(key, tplAttrs[key]);
        }
      }

      // 3.5. Abilities — the core-status list is the template-innate set baked at creation;
      // status-/item-granted abilities live on their own statuses and recompute on reevaluate.
      if (scopes.abilities.enabled) {
        const tplAbilities: string[] = (template as any).abilities || [];
        for (const abilityId of [...coreStatus.abilities]) {
          if (!scopes.abilities.allows(abilityId)) continue;
          if (!abilityTemplatesMap.has(abilityId) || !tplAbilities.includes(abilityId)) char.removeAbility(abilityId);
        }
        for (const abilityId of tplAbilities) {
          if (!scopes.abilities.allows(abilityId)) continue;
          if (!abilityTemplatesMap.has(abilityId)) continue;
          if (!coreStatus.abilities.has(abilityId)) char.addAbility(abilityId);
        }
      }

      // 3.6. Item slots — backfill template slots the character is missing, and reposition the
      // ones that already exist (slot x/y are saved per character, so an editor reposition can
      // never reach an old save otherwise). Only x/y are synced: the slot's type and its equipped
      // item are save-owned. Never remove — runtime-granted slots (item_slot action) get random
      // uid ids, indistinguishable from a template slot that was deleted.
      if (scopes.itemSlots.enabled) {
        const tplSlots: any[] = (template as any).item_slots || [];
        for (const tplSlot of tplSlots) {
          if (!tplSlot?.id || !tplSlot?.slot) continue;
          if (!scopes.itemSlots.allows(tplSlot.id)) continue;
          if (!itemSlotsMap.has(tplSlot.slot)) continue;
          const existing = char.itemSlots.find(s => s.id === tplSlot.id);
          if (existing) {
            existing.x = tplSlot.x ?? 0;
            existing.y = tplSlot.y ?? 0;
          } else {
            char.addItemSlot(tplSlot.id, tplSlot.slot, tplSlot.x ?? 0, tplSlot.y ?? 0);
          }
        }
      }

      // 3.7. Skin layers — the core-status set is the template-innate set (like abilities);
      // status-/item-granted layers live on their own statuses and recompute on reevaluate.
      // Layers granted at runtime by the skin action land on the core status too, so
      // list those to keep them.
      if (scopes.skinLayers.enabled) {
        const tplSkinLayers: string[] = (template as any).skin_layers || [];
        const layersToRemove = [...coreStatus.skinLayers].filter(l =>
          scopes.skinLayers.allows(l) && (!skinLayersMap.has(l) || !tplSkinLayers.includes(l)));
        const layersToAdd = tplSkinLayers.filter(l =>
          scopes.skinLayers.allows(l) && skinLayersMap.has(l) && !coreStatus.skinLayers.has(l));
        if (layersToRemove.length) char.removeSkinLayers(layersToRemove);
        if (layersToAdd.length) char.addSkinLayers(layersToAdd);
      }

      // 3.8. Spine + static art views — template is authoritative for the core status;
      // per-view partial overrides from other statuses re-accumulate on reevaluate.
      // Reuse Status.setValues so the template's entries parse identically to creation.
      if (scopes.spine.enabled || scopes.staticArt.enabled) {
        const artParser = new Status();
        artParser.setValues({ spine: (template as any).spine || [], static_art: (template as any).static_art || [] } as any);
        if (scopes.spine.enabled) syncViewMap(coreStatus.spineViews, artParser.spineViews, scopes.spine);
        if (scopes.staticArt.enabled) syncViewMap(coreStatus.staticArtViews, artParser.staticArtViews, scopes.staticArt);
      }
      char.reevaluate();

      // 3.9. Skill trees — backfill from template, purge trees whose definition is gone.
      // Trees granted at runtime (not on the template) survive as long as they still exist.
      if (scopes.skillTrees.enabled) {
        const tplSkillTrees: string[] = (template as any).skill_trees || [];
        for (const treeId of [...char.skillTrees]) {
          if (scopes.skillTrees.allows(treeId) && !skillTreesMap.has(treeId)) char.removeSkillTree(treeId);
        }
        for (const treeId of tplSkillTrees) {
          if (!scopes.skillTrees.allows(treeId)) continue;
          if (skillTreesMap.has(treeId) && !char.skillTrees.has(treeId)) char.addSkillTree(treeId);
        }
      }

      // 3.10. Learned skills — player progress, so levels are preserved; rebuild each hidden
      // _skill_* status from the current slot definition so stat-grants pick up new values.
      // Skills whose tree/slot/skill no longer exists are dropped; levels clamp to the new max.
      if (scopes.learnedSkills.enabled) {
        for (const learned of [...char.learnedSkills]) {
          if (!scopes.learnedSkills.allows(learned.id)) continue;
          const statusId = char.getSkillStatusId(learned.skillTreeId, learned.id);
          const tree = skillTreesMap.get(learned.skillTreeId);
          const slot = tree?.skills?.find((s: any) => s.id === learned.id);
          const skillData = slot?.skill ? skillSlotsMap.get(slot.skill) : undefined;
          if (char.statuses.has(statusId)) char.removeStatus(statusId);
          if (!tree || !slot || !skillData) {
            char.learnedSkills.splice(char.learnedSkills.indexOf(learned), 1);
            continue;
          }
          learned.level = Math.min(learned.level, slot.max_upgrade_level || 1);
          if (skillData.status) {
            const status = new Status();
            status.id = statusId;
            status.setValues(skillData.status);
            status.currentStacks = learned.level;
            status.isHidden = true;
            char.addStatus(status);
          }
        }
      }

      // 4. Status reapply — refresh stat-grants for definition-backed statuses only.
      // Live/runtime statuses (item_<uid>, plugin-spawned, hand-rolled createStatus calls) have no
      // definition to refresh against — leave them entirely intact. The instance list (stacks,
      // remaining duration, source) is the save's own, like resource pools, and carries over.
      if (scopes.statuses.enabled) {
        const heldSnapshot = char.getStatuses()
          .filter(s => s.id !== '_core_status' && statusesMap.has(s.id) && scopes.statuses.allows(s.id))
          .map(s => ({ id: s.id, image: s.image, iconSource: s.iconSource, previous: s }));
        for (const { id, image, iconSource, previous } of heldSnapshot) {
          char.removeStatus(id);
          const fresh = game.createStatus(id);
          // The definition only knows a fresh application — replaying the held instances keeps a
          // buff's remaining turns, each multi-stack instance's own timer and its source. Through
          // applyInstance, so a retuned max_stacks (or a single/multi-stack switch) still applies.
          const held = previous.getInstances();
          if (held.length) {
            fresh._instances = [];
            for (const inst of held) fresh.applyInstance({ stacks: inst.stacks, duration: inst.duration, source: inst.source });
          }
          if (!fresh.iconSource && iconSource) fresh.iconSource = iconSource;
          // The pass may only restore what the definition actually declares. A status whose
          // definition carries no image was given one at runtime — a consumable's status wears the
          // icon of the item that applied it — so recreating it from the definition must not blank
          // that out. Same rule applies to any future runtime-stamped field.
          if (!fresh.image && image) fresh.image = image;
          // Per-status hook, like item_migrate: whatever a game derived for this instance when it was
          // applied (stats scaled to the item that granted it, a stamped meta value) is gone from the
          // fresh copy — put it back from the instance being replaced, before its stats land.
          this.trigger('status_migrate', char, fresh, previous);
          char.addStatus(fresh);
        }
      }
    }

    // Items: a saved item is a full snapshot of its template at creation time, so nothing it carries
    // ever catches up with the editor on its own. Traits are synced per trait id (instance-owned
    // ones are skipped by declaration); every other template-owned field comes back verbatim from a
    // fresh clone of the template through the same assignment createItem uses, so the two can never
    // disagree. Identity (uid), quantity, the equipped flag and trade prices are the instance's own.
    const itemTemplatesMap = game.itemSystem.itemTemplatesMap;
    const itemTraitsMap = game.itemSystem.itemTraitsMap;

    for (const inv of game.itemSystem.inventories.value.values()) {
      for (const item of inv.items) {
        const tpl = itemTemplatesMap.get(item.id);
        if (!tpl) continue;                                          // template gone (removed mod); leave alone

        // Traits
        if (scopes.itemTraits.enabled) {
          const tplTraits = (tpl as any).traits || {};
          for (const k of Object.keys(item.traits || {})) {
            if (!scopes.itemTraits.allows(k)) continue;
            if (!itemTraitsMap.has(k)) { delete item.traits[k]; continue; }
            if (tplTraits[k] !== undefined) item.traits[k] = tplTraits[k];
          }
          for (const k of Object.keys(tplTraits)) {
            if (!scopes.itemTraits.allows(k)) continue;
            if (!itemTraitsMap.has(k)) continue;
            if (item.traits[k] === undefined) item.traits[k] = tplTraits[k];
          }
        }

        // Everything else the template owns — cloned, since applyTemplateFields assigns by reference
        // and a shared object would let one instance's runtime edits leak into the template map.
        if (scopes.items.enabled && scopes.items.allows(item.id)) {
          game.itemSystem.applyTemplateFields(item, JSON.parse(JSON.stringify(tpl)));
        }

        // Per-item hook: whatever a plugin or the game derives per INSTANCE at creation (level
        // scaling, runtime-added choices) is gone after the reset above, and createItem does not
        // run on load — this is where it gets put back. Fires for every item the pass visits,
        // whatever the scopes allowed, with its own copy of the template.
        this.trigger('item_migrate', item, JSON.parse(JSON.stringify(tpl)));
      }
    }

    // Whole-save hook. Before the two finalize steps below on purpose: a listener that edits an
    // equip-status object gets it bound, and one that moves stats cannot clamp a pool.
    this.trigger('save_migrated');

    // Equip-status re-bind — a worn item's status is derived from its statusObject, so push it onto
    // whoever wears it regardless of who changed it (the items section, a listener, or nobody:
    // applyEquipStatus is an idempotent refresh).
    for (const char of game.getAllCharacters()) {
      for (const slot of char.itemSlots) {
        if (!slot.itemUid) continue;
        const item = game.itemSystem.getItemByUid(slot.itemUid);
        if (item) Inventory.applyEquipStatus(item, char);
      }
    }

    // Put back exactly the pools that were loaded (see snapshot above).
    for (const [char, snap] of resourceSnapshots) {
      char.restoreResources(snap);
    }

    console.log(`[save-migration] done in ${(performance.now() - migrationStart).toFixed(1)}ms`);
    return true;
  }

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
   * Whether a state key has been registered. Lets a game read a state a MOD owns without
   * having to guard against getState()'s throw.
   */
  public hasState(key: string): boolean {
    return this.registeredStates.has(key);
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

  /**
   * Everything currently playing, so any sound can be stopped mid-playback.
   * A flat array rather than a Map keyed by id: two overlapping one-shots of the
   * same id must stay independently stoppable.
   */
  @Skip()
  public activeSounds: SoundPlayback[] = [];

  /**
   * Ids of the loops that were playing when the run was saved, so loadGame can resume them.
   * Deliberately not @Skip()ed — this is the persisted half. Plain data because activeSounds
   * holds HTMLAudioElements, which JSON.stringify flattens to {}.
   */
  public loopingSoundIds: string[] = [];
  /** The saved loops that were started on the map rather than by a scene (they outlive scenes). */
  public mapLoopingSoundIds: string[] = [];

  music: string; // id from MusicMap

  @Skip()
  private autoplayResumers: (() => void)[] = [];
  @Skip()
  private autoplayHandler: (() => void) | null = null;

  /**
   * A spec that is an audio file's path rather than a registered sound id (a `file` field with
   * `fileType: 'audio'` stores one — e.g. a projectile's launch sound) plays as a one-file sound with
   * the defaults. Its id is the path, so stopSounds takes the same path.
   */
  private fileSound(spec: string): SoundObject | undefined {
    const ext = spec.split('.').pop()?.toLowerCase() ?? '';
    return spec.includes('/') && getFileExtensions('audio').includes(ext) ? { uid: '', id: spec, files: [spec] } : undefined;
  }

  private getSoundVolume(): number {
    return (Global.getInstance().userSettings.value.sound_volume || 0) / 100;
  }

  /**
   * Browsers block playback until the page has seen a gesture — always the case right after a
   * load, which goes through window.location.reload(). Mirrors musicPlayer.waitForInteraction,
   * but with one shared listener set serving every blocked sound.
   */
  private waitForInteraction(resume: () => void) {
    this.autoplayResumers.push(resume);
    if (this.autoplayHandler) {
      return;
    }

    const handler = () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('keydown', handler);
      document.removeEventListener('touchstart', handler);
      this.autoplayHandler = null;
      const resumers = this.autoplayResumers;
      this.autoplayResumers = [];
      for (const resumer of resumers) {
        resumer();
      }
    };
    this.autoplayHandler = handler;
    document.addEventListener('click', handler);
    document.addEventListener('keydown', handler);
    document.addEventListener('touchstart', handler);
  }

  private releaseSound(playback: SoundPlayback) {
    const index = this.activeSounds.indexOf(playback);
    if (index !== -1) {
      this.activeSounds.splice(index, 1);
    }
  }

  /**
   * Play sound(s). Each entry is an id with an optional inline tail, `rain(volume=0.4, fade_in=2)`:
   * `volume`, `fade_in`, `fade_out` and `delay` override the sound's own fields for this play.
   */
  public playSounds(val: string | string[]) {
    if (!val) {
      return;
    }

    const sounds = typeof val === "string" ? Game.getInstance().logicSystem.getParts(val) : val;

    for (const spec of sounds) {
      if (!spec?.trim()) {
        continue;
      }
      const { id: sound, props } = parseAudioSpec(spec);

      let compiledSound = this.soundsMap.get(sound) ?? this.fileSound(sound);
      if (!compiledSound) {
        gameLogger.error(`Sound not found: ${sound}`);
        continue;
      }
      let soundUrls = compiledSound.files;
      if (!soundUrls?.length) {
        continue;
      }

      const loop = !!compiledSound.loop;
      const random = !!compiledSound.random;
      // A random one-shot is one file of the pool; a random loop keeps them all and draws the next pass.
      if (random && !loop) {
        soundUrls = [soundUrls[Math.floor(Math.random() * soundUrls.length)]];
      }
      const channel = compiledSound.channel || '';
      const gain = props.volume ?? compiledSound.volume ?? 1;
      const fadeIn = props.fade_in ?? compiledSound.fade_in ?? 0;
      const fadeOut = props.fade_out ?? compiledSound.fade_out ?? 0;
      const delay = props.delay ?? compiledSound.delay ?? 0;
      // A running loop carries on instead of jumping back to the top or stacking a second copy:
      // re-staged content and repeated room enter actions play the same id again. Only a new gain lands.
      if (loop) {
        const running = this.activeSounds.find(p => p.loop && p.id === sound);
        if (running) {
          if (running.gain !== gain) {
            running.cancelRamp?.();
            running.cancelRamp = null;
            running.gain = gain;
            for (const audio of running.elements) {
              audio.volume = this.getSoundVolume() * gain;
            }
          }
          continue;
        }
      }
      // Sounds sharing a channel replace each other, each leaving over its own fade_out.
      if (channel) {
        this.stopSounds(this.activeSounds.filter(p => p.channel === channel).map(p => p.id));
      }

      const soundElements: HTMLAudioElement[] = [];
      const playback: SoundPlayback = {
        id: sound, loop, channel, stopped: false, elements: soundElements, gain, fadeOut, delayTimer: null, cancelRamp: null,
        fromScene: !!Game.getInstance().dungeonSystem.currentSceneId.value,
      };
      let loadedCount = 0;
      // The fade-in belongs to the first file that actually plays; a loop's later passes start at gain.
      let fadeInPending = fadeIn > 0;

      const playNextSound = (index: number) => {
        // Stopped while still loading: pause() was a no-op, so bail before it starts unhandled.
        if (playback.stopped) {
          return;
        }
        if (index >= soundElements.length) {
          if (!loop) {
            this.releaseSound(playback);
            return;
          }
          index = 0; // the whole sequence repeats
        }
        const audio = soundElements[index];
        audio.currentTime = 0;
        const target = this.getSoundVolume() * playback.gain;
        const fadeThisStart = fadeInPending;
        audio.volume = fadeThisStart ? 0 : target;
        audio.play().then(() => {
          if (fadeThisStart && !playback.stopped) {
            fadeInPending = false;
            playback.cancelRamp = rampVolume(audio, 0, target, fadeIn, () => { playback.cancelRamp = null; });
          }
        }).catch((e: any) => {
          if (e?.name === 'AbortError') {
            return;
          }
          if (e?.name === 'NotAllowedError') {
            gameLogger.warn(`[sound] "${sound}" blocked by autoplay policy - waiting for user interaction`);
            this.waitForInteraction(() => playNextSound(index));
            return;
          }
          gameLogger.error(`Error playing sound: ${sound}`, e);
        });
      };

      const begin = () => {
        playback.delayTimer = null;
        if (playback.stopped) {
          return;
        }
        gameLogger.info(`[sound] Playing sound effect: "${sound}"${loop ? ' (looping)' : ''}`);
        playNextSound(random ? Math.floor(Math.random() * soundUrls.length) : 0);
      };

      // The file after `index`: the next in sequence, or for a random loop any OTHER file of the pool.
      const nextIndex = (index: number) => {
        if (!random || soundUrls.length < 2) return index + 1;
        const n = Math.floor(Math.random() * (soundUrls.length - 1));
        return n >= index ? n + 1 : n;
      };

      // Load all sounds
      soundUrls.forEach((url, index) => {
        const audio = new Audio(`${url}`);
        // Registered once at creation — playNextSound may replay this element many times.
        audio.addEventListener('ended', () => playNextSound(nextIndex(index)));
        audio.addEventListener('canplaythrough', () => {
          loadedCount++;
          // If all sounds are loaded, start playing
          if (loadedCount === soundUrls.length) {
            if (delay > 0) {
              playback.delayTimer = window.setTimeout(begin, delay * 1000);
            } else {
              begin();
            }
          }
        }, { once: true });
        audio.addEventListener('error', (e) => {
          gameLogger.error(`Error loading sound: ${url}`, e);
          this.releaseSound(playback); // a file that never loads must not leak its handle
        });
        soundElements[index] = audio;
      });

      this.activeSounds.push(playback);
    }
  }

  /**
   * Stop sound(s) by id, looping or not. Omit `val` to stop everything currently playing. An id may
   * carry `(fade_out=N)`; otherwise `options.fadeOut`, then the sound's own `fade_out`, decides the
   * fade. A fading sound is released at once, so the same loop can start again over its own tail.
   */
  public stopSounds(val?: string | string[], options?: StopSoundOptions) {
    const specs = (val === undefined || val === '')
      ? null // null = match everything
      : (typeof val === "string" ? Game.getInstance().logicSystem.getParts(val) : val).map(parseAudioSpec);
    const inlineFade = new Map(specs?.map(spec => [spec.id, spec.props.fade_out]) ?? []);

    // Iterate a copy: releaseSound splices the live array.
    for (const playback of [...this.activeSounds]) {
      if (specs && !inlineFade.has(playback.id)) {
        continue;
      }
      if (options?.keepLooping && playback.loop) {
        continue;
      }
      if (options?.keepMapLoops && playback.loop && !playback.fromScene) {
        continue;
      }
      playback.stopped = true;
      if (playback.delayTimer !== null) {
        clearTimeout(playback.delayTimer);
        playback.delayTimer = null;
      }
      playback.cancelRamp?.();
      playback.cancelRamp = null;
      const fade = inlineFade.get(playback.id) ?? options?.fadeOut ?? playback.fadeOut ?? 0;
      const cut = (audio: HTMLAudioElement) => {
        audio.pause();
        audio.currentTime = 0;
      };
      for (const audio of playback.elements) {
        if (fade > 0 && !audio.paused) {
          rampVolume(audio, audio.volume, 0, fade, () => cut(audio));
        } else {
          cut(audio);
        }
      }
      this.releaseSound(playback);
      gameLogger.info(`[sound] Stopped sound: "${playback.id}"${fade > 0 ? ` (fading ${fade}s)` : ''}`);
    }
  }

  /**
   * Play music by id, with an optional inline tail: `forest(fade_in=3, volume=0.6, fade_out=2)`.
   * `fade_out` on a play is how the OUTGOING track leaves; `fade_in`, `volume` and `shuffle` are the
   * incoming track's. Each falls back to the entity's field, then to the engine default (a 1 s
   * fade-out, no fade-in, full gain, shuffled). `"!"` (or `"!(fade_out=N)"`) stops the music;
   * `false` returns to the dungeon's own music.
   */
  public setMusic(val: string | false, load: boolean = false, disableTransition: boolean = false) {
    const player = MusicPlayer.getInstance();
    const outgoing = this.music ? this.musicMap.get(this.music) : undefined;
    let overrides: AudioOverrides = {};

    if (typeof val === 'string') {
      const parsed = parseAudioSpec(val);
      val = parsed.id;
      overrides = parsed.props;
      if (val.startsWith('!')) {
        this.music = "";
        player.stop({ fadeOut: disableTransition ? 0 : (overrides.fade_out ?? outgoing?.fade_out ?? 1) });
        return;
      }
    }

    if (val === false) {
      const game = Game.getInstance();
      val = game.dungeonSystem.currentDungeon.value?.music || "";
      if (!val) {
        this.music = "";
        player.stop({ fadeOut: disableTransition ? 0 : (outgoing?.fade_out ?? 1) });
        return;
      }
    }

    if (!val) {
      return;
    }

    const track = this.musicMap.get(val);
    const files = track?.files || [];
    if (!track || files.length === 0) {
      gameLogger.error(`Music album "${val}" not found. Create it in the Music tab of the engine editor.`);
      return;
    }

    this.music = val;

    const volume = (Global.getInstance().userSettings.value.music_volume || 0) / 100;
    player.play(val, files, {
      fadeOut: disableTransition ? 0 : (overrides.fade_out ?? outgoing?.fade_out ?? 1),
      fadeIn: disableTransition ? 0 : (overrides.fade_in ?? track.fade_in ?? 0),
      volume,
      trackVolume: overrides.volume ?? track.volume ?? 1,
      shuffle: overrides.shuffle ?? track.shuffle ?? true,
      force: load,
    });
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

  // Merge, not replace: scripts createStore() during initGame, BEFORE loadSave applies the file.
  // Replace mode cleared the whole map and rebuilt only the ids the save knew, so a store added
  // to a script after a save was written vanished on load and its next getStore() threw. Merge
  // keeps code-created stores alive (as `state` already does) and loads saved entries into the
  // live Map instance, so a reference held from createStore() stays valid across a load.
  @Populate(Map, { mode: 'merge' })
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
  public generateSaveMetaData(gameManifest: ManifestObject, modsManifests: ManifestObject[], options?: SaveOptions): any {
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

    // Versions map: `_core` is the game itself; every other key is a loaded mod id.
    // Each entry carries the manifest's display name alongside the version so the save UI
    // can render human-friendly names without depending on the mod being currently loaded.
    const versions: Record<string, { name: string; version: string }> = {
      _core: { name: gameManifest?.name || '', version: gameManifest?.version || '0' },
    };
    for (const mod of modsManifests) {
      if (mod?.id) versions[mod.id] = { name: mod.name || mod.id, version: mod.version || '0' };
    }

    return {
      saveDate: currentTime,
      playTime: Math.round(this.accumulatedPlayTime),
      engineVersion: engineVersion,
      versions,
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
   * The title is resolved as a locale key at render time (literal text that matches no key is
   * shown as written), so a tab registered with a key follows a language switch.
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
  // item_discard_render is a pure render predicate, not a game event — suppressing it would answer
  // "yes, droppable" for protected items and show a Drop button that then refuses. item_compare is
  // the same kind: muted, a game's key rewrite would be skipped and the item card would misread.
  // status_preview likewise: muted, a preview card would fall back to the template's numbers.
  // Emitters that keep firing while events are suppressed. Two families:
  //  - render/mount events: UI hooks that must still run to paint the restored screen.
  //  - entity construction: dungeons, collectable pools, characters and items are rebuilt
  //    from definitions on every save load (they are not serialized), so a listener that
  //    misses these never gets a second chance — unlike gameplay events, which recur.
  //  - save migration: save_load_before fires on the raw JSON while stateLoading is still up, and
  //    the pass itself runs under migratingSave — these hooks exist precisely so listeners can
  //    act inside the load.
  ignoreSupressEvents: Set<string> = new Set([
    'character_render', 'item_discard_render', 'item_compare', 'status_preview', 'asset_render', 'asset_exit',
    'dungeon_create', 'collectable_resolve',
    'character_create', 'item_create',
    'save_load_before', 'save_migrated', 'item_migrate', 'status_migrate',
  ]);

  public trigger<K extends keyof EmitterMap>(
    type: K,
    ...args: Parameters<NonNullable<EmitterMap[K]>>
  ): boolean {
    // stateLoading covers the whole initial-load window (cleared just before game_initiated).
    // Restoring a save writes resources and states through the ordinary setters, so without
    // this a load replays gameplay events: to a listener, a restored resource value is
    // indistinguishable from the player spending that resource. Games cannot tell the two
    // apart, so the engine has to. One-way flag — never set back to true — so play is unaffected.
    if ((this.stateLoading.value || this.migratingSave || this.getState('supress_game_events'))
      && !this.ignoreSupressEvents.has(type)) {
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
    this.initPlayTimeTracking();
    this.createComputedProperties(game.dungeonSystem);

    // Looping sounds outlive their play call, so they need a live link to the volume
    // slider. Registered here rather than in global.ts (like music_volume) because the
    // registry is game-scoped and Game.getInstance() auto-creates outside a game.
    watch(() => Global.getInstance().userSettings.value.sound_volume, (newVolume) => {
      const volume = (newVolume || 0) / 100;
      for (const playback of this.activeSounds) {
        if (playback.cancelRamp) continue; // a fade-in lands on the new level by itself
        for (const audio of playback.elements) {
          audio.volume = volume * playback.gain;
        }
      }
    });

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
  public async saveGame(game: any, saveName: string, options?: SaveOptions) {
    const gameId = this.gameManifest?.id;
    if (!gameId) {
      gameLogger.error('Game ID is not set - cannot save game');
      return;
    }

    if (!options?.forceSave && this.isSaveDisabled()) {
      gameLogger.warn('Save is disabled - cannot save game');
      return;
    }


    let proceed = this.trigger('game_save', saveName);
    if (!proceed) {
      return;
    }

    // Snapshot which loops are live so loadGame can restart them. Derived here from the one
    // source of truth rather than mirrored on every play/stop, so it cannot drift.
    this.loopingSoundIds = this.activeSounds.filter(p => p.loop).map(p => p.id);
    this.mapLoopingSoundIds = this.activeSounds.filter(p => p.loop && !p.fromScene).map(p => p.id);

    const metaData = this.generateSaveMetaData(this.gameManifest, this.modsManifests, options);
    const gameCoreData = save(game);
    const dataToStore = { ...gameCoreData, saveMeta: metaData };

    try {
      const globalService = Global.getInstance();
      await this.indexedDbSaveService.save(gameId, saveName, dataToStore);
      // Debug: console.log(`Saved game ${gameId} as ${saveName}:`, dataToStore);
      gameLogger.success(`Game saved: ${saveName}`);
      if (!options?.hidden && !options?.noNotification) {
        globalService.addNotificationId('save_success_named', { name: saveName });
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

    // Hard Scene Reset (dev): a presence flag means "re-enter the loaded save's own scene
    // fresh" instead of restoring its cached text — rebuilds content from the (possibly
    // edited) disk lines and fires its enter actions exactly once. The scene id comes from
    // the loaded save (set just before the checkpoint was written), so callers don't pass it.
    const wantReplay = localStorage.getItem(DEV_REPLAY_SCENE_KEY);
    if (wantReplay) localStorage.removeItem(DEV_REPLAY_SCENE_KEY);

    const ds = game.dungeonSystem;
    if (wantReplay && ds.currentSceneId.value) {
      ds.playScene(ds.currentSceneId.value, ds.activeDungeonId.value ?? ds.currentDungeonId.value);
    } else {
      // call onLoad Actions
      let onLoadActions = ds.reloadActionObject;
      game.logicSystem.resolveActions(onLoadActions);

      // reload event choices
      if (ds.currentSceneId.value) {
        ds.loadDocChoices();
      }
    }

    // hide progression state
    this.setState('progression_state', '');

    // load music
    this.setMusic(this.music, true);

    // Resume looping ambience saved with the run. Restarts from the top of the sequence —
    // playback position isn't persisted, and ambience doesn't need it. Deliberately not done
    // through reload actions: the player may be in a different scene than the one that
    // started the loop, so re-firing the original action would be wrong.
    if (this.loopingSoundIds.length) {
      this.playSounds(this.loopingSoundIds);
      // A save restores its scene before this, so every resumed loop reads as the scene's: put
      // the map's own loops back to outliving it.
      for (const playback of this.activeSounds) {
        if (this.mapLoopingSoundIds.includes(playback.id)) playback.fromScene = false;
      }
    }

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

  // Locale system
  @Skip()
  public localeMap!: Map<string, LocaleObject>;

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
      // Store all skin layers (base + view-specific) for gallery view switching
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

      // Merge skin layers: add all layers (base + view-specific)
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

    // Merge spine configs (dedup by view + skeleton path)
    const dc = this.discoveredCharacters.get(character.templateId)!;
    for (const [viewKey, config] of character.spineViews) {
      const exists = dc.spineConfigs.some(c => c.view === viewKey && c.skeleton === config.skeleton);
      if (!exists) {
        dc.spineConfigs.push({
          view: viewKey,
          atlas: config.atlas,
          skeleton: config.skeleton,
          animations: [],
          skins: []
        });
      }
    }

  }

  public discoverCharacterView(templateId: string, view: string) {
    if (!view) return;
    const dc = this.discoveredCharacters.get(templateId);
    if (dc) dc.views.add(view);
  }

  public updateDiscoveredSpineData(templateId: string, skeletonPath: string, animations: string[], skins: string[]) {
    const dc = this.discoveredCharacters.get(templateId);
    if (!dc) return;
    const cfg = dc.spineConfigs.find(c => c.skeleton === skeletonPath);
    if (!cfg) return;
    // Merge new animations/skins into existing
    const animSet = new Set(cfg.animations);
    for (const a of animations) animSet.add(a);
    cfg.animations = Array.from(animSet);

    const skinSet = new Set(cfg.skins);
    for (const s of skins) skinSet.add(s);
    cfg.skins = Array.from(skinSet);
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
