import { ref, Ref, computed, nextTick, type ComputedRef } from "vue";
import gsap from 'gsap';

import { DungeonData } from "../core/dungeon/dungeonData";
import { Skip } from "../../utility/save-system";
import { DEV_PREV_SCENE_SLOT } from "../../services/indexeddb-save.service";
export type DungeonLine = {
  id: string;
  val: string;
  params?: Record<string, any>;
  anchor?: string;
}

export type ChoiceType = 'encounter' | 'text' | 'scene';
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
import { warmImages } from "../utils/assetPreloader";
import { CharacterSceneSlotObject } from "../../schemas/characterSceneSlotSchema";
import { DungeonRoomObject } from "../../schemas/dungeonRoomSchema";
import { DungeonEncounterObject } from "../../schemas/dungeonEncounterSchema";
import { DungeonConfigParsed } from "../../editor/editor";

// Scene ids are dot-separated and choice ids end in `*N`, so both are full of
// regex metacharacters. Without escaping, every `.` is a wildcard.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
  removalTimeoutId?: number; // Pending removal timer, cleared if the character re-enters
}

export type SceneAsset = AssetObject & {
  isRemoving?: boolean; // Flag to trigger exit animation before removal
}

// Day-for-night colour grade applied over the scene and the map art. The tint is kept as separate
// r/g/b numbers because GSAP can only tween colours as a CSS property on an element, never as a
// plain object property — and a plain object is what the crossfade tweens.
export type SceneGrade = {
  brightness: number;
  saturate: number;
  contrast: number;
  hue: number;
  r: number;
  g: number;
  b: number;
  tint_amount: number;
}

// Fully resolved before it is stored, so the view never parses.
export type SceneGradeState = {
  grade: SceneGrade;
  duration: number;
}

export const IDENTITY_GRADE: SceneGrade = {
  brightness: 1, saturate: 1, contrast: 1, hue: 0, r: 0, g: 0, b: 0, tint_amount: 0
};

/** Daylight — nothing to render. The tint colour is ignored while tint_amount is 0. */
export function isIdentityGrade(g: SceneGrade): boolean {
  return g.brightness === 1 && g.saturate === 1 && g.contrast === 1 && g.hue === 0 && g.tint_amount === 0;
}

// Two things learned tuning these against real art:
//
// 1. The tint is a linear blend TOWARD a colour — the matrix is scaled by (1 - tint_amount) and the
//    tint added to the offset column. Any tint therefore drags luminance toward that colour, so a
//    dark tint darkens. Bright presets use light tint colours; copying a dark-tint preset and merely
//    raising `brightness` gives muddy grey, not a brighter scene.
// 2. Pull `saturate` down before leaning on the tint. A source colour that keeps its saturation
//    fights the blend, so a subtle tint over, say, a yellow-green field reads as no tint at all.
//    Every preset here that wants a recognisable hue desaturates first.
const GRADE_PRESETS: Record<string, SceneGrade> = {
  none: IDENTITY_GRADE,

  // Light & time of day
  dawn: { brightness: 1.05, saturate: 0.85, contrast: 0.98, hue: 4, r: 255, g: 176, b: 122, tint_amount: 0.28 },
  dusk: { brightness: 0.82, saturate: 0.92, contrast: 1.02, hue: -6, r: 74, g: 42, b: 78, tint_amount: 0.14 },
  night: { brightness: 0.55, saturate: 0.55, contrast: 1.06, hue: -10, r: 22, g: 38, b: 79, tint_amount: 0.24 },
  moonlit: { brightness: 0.62, saturate: 0.45, contrast: 1.10, hue: -14, r: 29, g: 58, b: 122, tint_amount: 0.28 },
  sunlit: { brightness: 1.18, saturate: 0.95, contrast: 1.02, hue: 3, r: 255, g: 228, b: 176, tint_amount: 0.20 },
  bright: { brightness: 1.35, saturate: 0.60, contrast: 1.20, hue: 0, r: 255, g: 248, b: 232, tint_amount: 0.18 },

  // Weather & place
  overcast: { brightness: 0.95, saturate: 0.45, contrast: 0.90, hue: 0, r: 170, g: 180, b: 192, tint_amount: 0.25 },
  stormy: { brightness: 0.58, saturate: 0.35, contrast: 1.04, hue: 0, r: 42, g: 48, b: 56, tint_amount: 0.22 },
  foggy: { brightness: 1.08, saturate: 0.30, contrast: 0.78, hue: 0, r: 221, g: 227, b: 232, tint_amount: 0.38 },
  underwater: { brightness: 0.70, saturate: 0.50, contrast: 1.00, hue: -10, r: 20, g: 112, b: 126, tint_amount: 0.40 },

  // Fire, cold, magic
  candlelit: { brightness: 0.70, saturate: 0.85, contrast: 1.05, hue: 8, r: 107, g: 58, b: 18, tint_amount: 0.20 },
  infernal: { brightness: 0.78, saturate: 0.70, contrast: 1.15, hue: -6, r: 160, g: 28, b: 5, tint_amount: 0.40 },
  frozen: { brightness: 1.02, saturate: 0.35, contrast: 1.06, hue: -6, r: 168, g: 220, b: 240, tint_amount: 0.32 },
  arcane: { brightness: 0.76, saturate: 0.45, contrast: 1.08, hue: 0, r: 107, g: 46, b: 168, tint_amount: 0.40 },
  void: { brightness: 0.40, saturate: 0.20, contrast: 1.20, hue: 0, r: 10, g: 6, b: 18, tint_amount: 0.40 },

  // Body & mind
  sickly: { brightness: 0.72, saturate: 0.60, contrast: 1.08, hue: 35, r: 45, g: 74, b: 30, tint_amount: 0.22 },
  bloodied: { brightness: 0.70, saturate: 0.55, contrast: 1.12, hue: -4, r: 140, g: 16, b: 16, tint_amount: 0.42 },
  dream: { brightness: 1.20, saturate: 0.35, contrast: 0.80, hue: 4, r: 255, g: 210, b: 238, tint_amount: 0.35 },
  nightmare: { brightness: 0.45, saturate: 0.25, contrast: 1.32, hue: 0, r: 26, g: 13, b: 20, tint_amount: 0.35 },

  // Utility
  memory: { brightness: 0.98, saturate: 0.35, contrast: 0.95, hue: 12, r: 201, g: 168, b: 120, tint_amount: 0.35 },
  noir: { brightness: 0.95, saturate: 0.00, contrast: 1.25, hue: 0, r: 0, g: 0, b: 0, tint_amount: 0.00 },
};

export const GRADE_FADE_DURATION = 0.8;

/** Id of the shared feColorMatrix def; art elements reference it as filter: url(#…). */
export const GRADE_FILTER_ID = 'scene-grade';

/** Same grade, taller filter region — for character slots only. A spine canvas overflows its
 * slot box vertically (slot.scale plus the viewport pad), and an SVG filter region CLIPS, so
 * the standard region would cut exactly the head and feet the pad exists to save. Kept as a
 * separate def so full-screen backgrounds don't pay for a region they can't use. */
export const GRADE_FILTER_TALL_ID = 'scene-grade-tall';

// A 4x5 affine colour matrix as the flat 20 numbers feColorMatrix wants.
type ColorMatrix = number[];

const IDENTITY_MATRIX: ColorMatrix = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];

// b · a, both 4x5 affine (the implicit last row is 0 0 0 0 1), i.e. "apply a, then b".
function multiplyMatrix(b: ColorMatrix, a: ColorMatrix): ColorMatrix {
  const out: ColorMatrix = new Array(20);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += b[row * 5 + k] * a[k * 5 + col];
      // The offset column also picks up b's own offset, since a's implicit last row is (0,0,0,0,1).
      if (col === 4) sum += b[row * 5 + 4];
      out[row * 5 + col] = sum;
    }
  }
  return out;
}

/**
 * Fold a grade into the single colour matrix feColorMatrix applies. Composed in the same order the
 * CSS filter chain used, so the presets keep the look they were tuned to:
 * brightness -> saturate -> contrast -> hue -> tint.
 */
export function gradeMatrix(g: SceneGrade): ColorMatrix {
  let m = IDENTITY_MATRIX;

  if (g.brightness !== 1) {
    const b = g.brightness;
    m = multiplyMatrix([b, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0], m);
  }

  if (g.saturate !== 1) {
    // The luma weights the filter-effects spec defines saturate() against, so this matches what
    // CSS saturate() produced before.
    const s = g.saturate;
    const lr = 0.213, lg = 0.715, lb = 0.072;
    m = multiplyMatrix([
      lr + (1 - lr) * s, lg - lg * s, lb - lb * s, 0, 0,
      lr - lr * s, lg + (1 - lg) * s, lb - lb * s, 0, 0,
      lr - lr * s, lg - lg * s, lb + (1 - lb) * s, 0, 0,
      0, 0, 0, 1, 0,
    ], m);
  }

  if (g.contrast !== 1) {
    const c = g.contrast;
    const off = 0.5 - 0.5 * c; // pivot around mid-grey
    m = multiplyMatrix([c, 0, 0, 0, off, 0, c, 0, 0, off, 0, 0, c, 0, off, 0, 0, 0, 1, 0], m);
  }

  if (g.hue !== 0) {
    const rad = g.hue * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    m = multiplyMatrix([
      0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928, 0, 0,
      0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.140, 0.072 - cos * 0.072 - sin * 0.283, 0, 0,
      0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072, 0, 0,
      0, 0, 0, 1, 0,
    ], m);
  }

  if (g.tint_amount > 0) {
    // Blend the result toward the tint colour. Scaling the whole matrix and adding the tint to the
    // offset column is the matrix form of out = out * (1 - a) + tint * a.
    const a = g.tint_amount;
    const keep = 1 - a;
    const tint = [g.r / 255 * a, g.g / 255 * a, g.b / 255 * a];
    const scaled = m.slice();
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) scaled[row * 5 + col] *= keep;
      scaled[row * 5 + 4] += tint[row];
    }
    m = scaled;
  }

  return m;
}

export type ScenePlayOptions = {
  // false plays the scene as a cutaway — no root-scene staging (default dungeon/room
  // assets, dungeon music, scene_play default actors) even when no scene is active.
  root?: boolean;
}

// Snapshot of the live scene machinery, used to interrupt and later resume a scene
// (e.g. a battle plugin playing cutaway scenes mid-fight). Restoring never replays
// the paragraph — it puts the stored presentation state back as-is.
export type SceneContext = {
  sceneId: string | null;
  activeDungeonId: string | null;
  activeRoomId: string | null;
  cachedText: string | null;
  cachedFlashArray: string[];
  delayedActions: Record<string, any>;
  reloadActions: Record<string, any>;
  eventChoices: Choice | Choice[] | null;
  isChoices: number;
  sceneSlots: SceneSlot[];
  assets: SceneAsset[];
  talkingCharacterId: string | null;
}

export class DungeonSystem {

  // Toolbar state
  @Skip()
  public showLocationCircles: Ref<boolean> = ref(true);
  @Skip()
  public toolbarMinimized: Ref<boolean> = ref(false);

  // False while the current dungeon's art is being fetched. The map hides itself and the
  // toolbar shows a spinner in place of the dungeon name until every image has decoded.
  @Skip()
  public dungeonAssetsLoaded: Ref<boolean> = ref(true);

  // Dungeons whose art has already been warmed — re-entering one never shows the spinner.
  @Skip()
  private preloadedDungeons: Set<string> = new Set();

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

  /**
   * A `solo` asset clears the stage: remove every other staged asset (each honoring
   * its own exit animation) so the incoming one is the only asset on scene. The
   * backdrop (dungeon/room defaults + `bg`-flagged assets) is preserved.
   */
  private applySoloAsset(asset: AssetObject): void {
    if (!asset.solo) return;
    const keep = this.getPreservedAssetIds();
    for (const a of [...this.assets.value]) {
      if (a.id !== asset.id && !keep.has(a.id) && !a.isRemoving) this.removeAssets(a.id);
    }
  }

  /**
   * IDs of the dungeon- and room-level default assets — the backdrop that is
   * auto-staged at event start (insertion order matches that staging: dungeon
   * first, then room). Mirrors playSceneResolver: dungeon defaults apply to any
   * dungeon type, and room defaults come from the reactive room normally or the
   * raw room object in replay mode.
   */
  private getDefaultAssetIds(): Set<string> {
    const ids = new Set<string>();
    const dungeon = this.currentDungeon.value;

    for (const id of dungeon?.default_assets ?? []) ids.add(id);

    if (!this.game.getState('replay_mode')) {
      for (const id of this.currentRoom.value?.defaultAssets ?? []) ids.add(id);
    } else {
      const roomObject = dungeon?.id && this.activeRoomId.value
        ? this.dungeonRooms.get(dungeon.id)?.get(this.activeRoomId.value)
        : null;
      for (const id of roomObject?.default_assets ?? []) ids.add(id);
    }
    return ids;
  }

  /**
   * IDs of assets that count as the backdrop for `clear`/`solo` sweeps: the
   * dungeon/room defaults plus any currently-staged asset flagged `bg` at runtime.
   */
  private getPreservedAssetIds(): Set<string> {
    const ids = this.getDefaultAssetIds();
    for (const a of this.assets.value) {
      if (a.bg) ids.add(a.id);
    }
    return ids;
  }

  /**
   * The "clear" keyword (a fake asset id in an add directive): remove every staged
   * asset except the backdrop (dungeon/room defaults + `bg`-flagged assets), so the
   * backdrop stays while transient scene visuals are swept away. Removed assets
   * honor their own exit animations.
   */
  public clearTransientAssets(): void {
    const keep = this.getPreservedAssetIds();
    for (const a of [...this.assets.value]) {
      if (!keep.has(a.id) && !a.isRemoving) this.removeAssets(a.id);
    }
  }

  /**
   * The "reset" keyword (a fake asset id in an add directive): hard-clear the whole
   * stage (no exit animations) and re-stage the dungeon/room defaults fresh from
   * their templates — restoring the scene to its event-start backdrop, even if a
   * default had been moved/updated during the scene.
   */
  public resetToDefaultAssets(): void {
    this.assets.value = [];
    const ids = this.getDefaultAssetIds();
    if (ids.size) this.addAssets([...ids]);
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

    if (typeof data === 'string' || Array.isArray(data)) {

      // "false", "reset" and "clear" are fake asset ids handled before template lookup:
      //   false — remove EVERY asset, including the dungeon/room defaults.
      //   reset — hard-clear the stage and re-stage the dungeon/room defaults.
      //   clear — remove every non-default asset, keeping the backdrop.
      // Any real ids alongside them still stage afterwards (e.g. "false, forest, pic1").
      if (assetIds.includes('false')) {
        this.clearAssets();
      }
      if (assetIds.includes('reset')) {
        this.resetToDefaultAssets();
      }
      if (assetIds.includes('clear')) {
        this.clearTransientAssets();
      }
      assetIds = assetIds.filter(id => id !== 'false' && id !== 'reset' && id !== 'clear');

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

        this.applySoloAsset(asset);
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
        this.applySoloAsset(existingAsset);
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

      this.applySoloAsset(asset);
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

  public getAssets(): SceneAsset[] {
    return [...this.assets.value];
  }

  public setAssets(assets: SceneAsset[]): void {
    this.assets.value = [...assets];
  }

  public clearAssets(): void {
    this.assets.value = [];
  }

  // Active colour grade, saved with the run (no @Skip, same as `assets` above). null = daylight.
  public sceneGrade: Ref<SceneGradeState | null> = ref(null);

  // True while the grade is anything but daylight, including mid-fade. Art elements read this to
  // decide whether to reference the colour-matrix filter at all, so daylight costs no filter passes.
  // Presentation only — SceneGradeFilter owns it, and it is rebuilt from sceneGrade on mount.
  @Skip()
  public gradeActive: Ref<boolean> = ref(false);

  /**
   * Set the scene colour grade. Accepts a preset id ("night"), a preset with strength
   * ("night#0.5"), false/"none" to clear, or an object for manual control.
   * `instant` skips the crossfade, mirroring setMusic's disableTransition.
   */
  public setGrade(val: string | boolean | Record<string, any> | null, instant: boolean = false): void {
    const resolved = this.resolveGrade(val);
    if (instant) resolved.duration = 0;
    this.sceneGrade.value = resolved;
  }

  /** Null while the scene is at daylight, so callers can test it directly. */
  public getGrade(): SceneGradeState | null {
    const active = this.sceneGrade.value;
    return (!active || isIdentityGrade(active.grade)) ? null : active;
  }

  // Clearing resolves to an identity grade rather than null so the fade-out length survives —
  // a null payload would carry no duration and snap.
  private resolveGrade(raw: string | boolean | Record<string, any> | null): SceneGradeState {
    const cleared = (): SceneGradeState => ({ grade: { ...IDENTITY_GRADE }, duration: GRADE_FADE_DURATION });
    // Returning the same object reference leaves the watch unfired, so a bad value is a no-op
    // rather than silently wiping whatever mood the scene was in.
    const unchanged = (): SceneGradeState => this.sceneGrade.value ?? cleared();
    if (raw === false || raw === null || raw === undefined || raw === '') return cleared();

    let duration = GRADE_FADE_DURATION;
    let grade: SceneGrade;

    if (typeof raw === 'string') {
      const [presetId, amountStr] = raw.split('#');
      const preset = GRADE_PRESETS[presetId.trim()];
      if (!preset) {
        gameLogger.warn(`Unknown grade preset "${presetId.trim()}". Valid: ${Object.keys(GRADE_PRESETS).join(', ')}`);
        return unchanged();
      }
      const amount = amountStr === undefined ? 1 : parseFloat(amountStr);
      grade = this.lerpGrade(IDENTITY_GRADE, preset, isNaN(amount) ? 1 : amount);
    } else if (typeof raw === 'object') {
      const base = raw.preset ? GRADE_PRESETS[String(raw.preset).trim()] : IDENTITY_GRADE;
      if (!base) {
        gameLogger.warn(`Unknown grade preset "${raw.preset}". Valid: ${Object.keys(GRADE_PRESETS).join(', ')}`);
        return unchanged();
      }
      const amount = typeof raw.amount === 'number' ? raw.amount : 1;
      grade = this.lerpGrade(IDENTITY_GRADE, base, amount);

      // Explicit fields override the preset.
      for (const key of ['brightness', 'saturate', 'contrast', 'hue', 'tint_amount'] as const) {
        if (typeof raw[key] === 'number') grade[key] = raw[key];
      }
      if (typeof raw.tint === 'string') {
        const rgb = this.parseHexColor(raw.tint);
        if (rgb) Object.assign(grade, rgb);
        else gameLogger.warn(`Invalid grade tint "${raw.tint}" — expected a hex colour like #16264f.`);
      }
      if (typeof raw.duration === 'number') duration = raw.duration;
    } else {
      // `true` and anything else unusable
      gameLogger.warn(`Invalid grade value: ${JSON.stringify(raw)}. Expected a preset id, false, or an object.`);
      return unchanged();
    }

    return { grade, duration };
  }

  private lerpGrade(from: SceneGrade, to: SceneGrade, t: number): SceneGrade {
    const k = Math.max(0, Math.min(1, t));
    const out = {} as SceneGrade;
    for (const key of Object.keys(from) as (keyof SceneGrade)[]) {
      out[key] = from[key] + (to[key] - from[key]) * k;
    }
    // The tint colour itself shouldn't wash toward black as strength drops — only its opacity does.
    out.r = to.r;
    out.g = to.g;
    out.b = to.b;
    return out;
  }

  private parseHexColor(hex: string): { r: number, g: number, b: number } | null {
    const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
    if (!m) return null;
    let body = m[1];
    if (body.length === 3) body = body.split('').map(c => c + c).join('');
    return {
      r: parseInt(body.slice(0, 2), 16),
      g: parseInt(body.slice(2, 4), 16),
      b: parseInt(body.slice(4, 6), 16),
    };
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

  // Graceful scene exit: while true the dialogue is fading out (.overlay-closing) and
  // actors are playing their exit animations; the real teardown runs when it clears.
  @Skip()
  public isSceneClosing: Ref<boolean> = ref(false);
  @Skip()
  private sceneCloseTimeout: number | null = null;
  private static readonly SCENE_CLOSE_MS = 400;


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

  // Where the story resumes once a delayed branch action (battle, exchange…) finishes.
  // Scoped to the scene it was clicked from so an unrelated later nextScene can't consume
  // it. Saved on purpose — a save can land between the click and the action finishing.
  public pendingResume: { fromSceneId: string | null; target: string } | null = null;

  /** Record the branch to resume into after a delayed branch action completes. */
  public noteBranchResume(target: string): void {
    this.pendingResume = { fromSceneId: this.currentSceneId.value, target };
  }

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
    // case 4a: scene name without dungeon: my_room.my_scene (leading # tolerated)
    else if (parts.length == 2) {
      const room = parts[0].startsWith("#") ? parts[0].slice(1) : parts[0];
      sceneId = room + "." + parts[1];
      dungeonId = null;
      // case 4b: scene name with dungeon: my_dungeon.my_room.my_scene (leading # tolerated)
    } else if (parts.length == 3) {
      sceneId = parts[1] + "." + parts[2];
      dungeonId = parts[0].startsWith("#") ? parts[0].slice(1) : parts[0];
    }
    if (!realSceneId) {
      realSceneId = "#" + sceneId + ".1.1.1";
    }
    return { sceneId: realSceneId, dungeonId: dungeonId };
  }


  // 0 - no choices, 1 - choices, 2 - choices over
  isChoices: number = 0;

  // Resolves a friendly scene id (scene / room.scene / dungeon.room.scene / &anchor /
  // next / shift:x / full #id) then plays it — the same two steps the `scene` action does.
  public playSceneResolver(value: string | null, dungeonId: string | null = null, options?: ScenePlayOptions) {
    if (!value) {
      this.playScene(null, dungeonId);
      return;
    }
    const resolved = this.resolveSceneId(value);
    this.playScene(resolved.sceneId, dungeonId ?? resolved.dungeonId, options);
  }

  public playScene(sceneId: string | null, dungeonId: string | null, options?: ScenePlayOptions) {

    this.game.setState('hide_events', false);

    this.cancelPathMovement();

    if (!sceneId) {
      this.exitScene();
      return;
    }

    // A new scene supersedes any in-flight graceful exit — it replaces the old outright.
    this.cancelPendingExit();

    // options.root=false plays the scene as a cutaway: no root-scene staging (default
    // dungeon/room assets, dungeon music, scene_play default actors). Used by battle
    // systems playing scenes over a running fight.
    let isRootScene = options?.root ?? this.isRootScene.value;
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

    // Handle {intro: true} — redirect to block 2 on repeat visits
    if (line.params?.intro && sceneId.endsWith(".1.1.1")) {
      const isVisited = this.usedDungeonData.value.visitedEvents.has(sceneId);
      if (isVisited) {
        const block2Id = sceneId.replace(/\.1\.1\.1$/, ".1.2.1");
        const block2Line = this.getLineByDungeonId(block2Id, dungeonUsedId);
        if (block2Line) {
          this.playScene(block2Id, dungeonUsedId, options);
          return;
        } else {
          gameLogger.error(`Scene '${sceneId}' has {intro: true} but no block 2 scene '${block2Id}' exists.`);
          return;
        }
      }
    }

    gameLogger.info(`[scene] Playing scene: "${sceneId}" (dungeon "${dungeonUsedId}")`);
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
    output = this.game.logicSystem.resolveTalkingCharacter(output);

    // If paragraph resolved to empty (e.g. inline if{} produced no text), skip to next paragraph
    if (!output.trim() && Object.keys(actions).length === 0) {
      this.playScene(this.getNextSceneId(sceneId), dungeonUsedId, options);
      return;
    }

    // Check for {redirect} first. If there's then resolve and return immediately.
    if (actions["redirect"]) {
      gameLogger.info(`[redirect] Redirecting to scene: "${actions["redirect"]}"`);
      this.game.logicSystem.resolveActions(actions);
      return;
    }

    // Gates run before the paragraph renders and before any of its actions fire, so a
    // gated paragraph shows nothing and changes nothing — the reader goes elsewhere
    // instead. currentSceneId is already set above, so a gate returning "shift:1"
    // resolves relative to the paragraph being gated.
    let gateTarget = this.game.logicSystem.runGates(actions, { sceneId, dungeonId: dungeonUsedId });
    if (gateTarget) {
      this.playSceneResolver(gateTarget, dungeonUsedId);
      return;
    }

    if (isRootScene) {

      // auto-stage the configured dungeon default assets at event start (any dungeon type)
      if (this.currentDungeon.value?.default_assets?.length) {
        this.addAssets(this.currentDungeon.value.default_assets);
      }

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

    // scene is committed (past gates/redirects) and about to run its own actions — the point to
    // stage default actors so they precede the scene's asset actions. isRootScene is the value
    // captured at the top, before it was reset above.
    this.game.trigger('scene_play', sceneId, dungeonUsedId, isRootScene);

    // Dev-only rolling checkpoint: snapshot the state BEFORE this scene's actions fire, so
    // Hard Scene Reset can reload and re-enter the scene once on clean state. Fire-and-forget —
    // save(game) serializes synchronously here before any await, so no mutation race.
    if (localStorage.getItem('devMode') === 'true') {
      this.game.saveGame(DEV_PREV_SCENE_SLOT, { hidden: true, noNotification: true, forceSave: true });
    }

    // execute actions
    this.game.logicSystem.resolveActions(actions, true);

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

    // force overlay-navigation overlay to be shown to show dialogue box
    this.game.coreSystem.setState('overlay_state', 'overlay-navigation');

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

    if (this.currentSceneId.value) {
      return;
    }
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
    // A direct reset supersedes any in-flight graceful exit — never tear down twice.
    this.cancelPendingExit();
    // Read before currentSceneId is cleared below. enterRoom calls resetScene on every step
    // of map movement, so ambience started outside a scene must survive an unscened reset.
    const hadScene = !!this.currentSceneId.value;
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
    // Keep actors that are mid-exit: their identity-based removal timers splice them
    // out when the exit animation finishes (the actor layer stays mounted for them).
    this.sceneSlots.value = this.sceneSlots.value.filter(s => s.isRemoving);
    this.assets.value = [];

    // A scene's sounds die with it. Outside a scene — ordinary room movement, which runs this
    // reset on every step — only the one-shots are cut; looping ambience from room/dungeon
    // enter actions keeps playing.
    this.game.coreSystem.stopSounds(undefined, { keepLooping: !hadScene });

    if (this.game.coreSystem.getState('game_state') === "exploration") {
      // reset dungeon music — guarded so a custom game_state (e.g. a battle screen
      // playing cutaway scenes) keeps its own music when those scenes exit
      this.game.setMusic(false);
      this.game.coreSystem.setState('overlay_state', 'overlay-navigation');
    }

    this.game.coreSystem.setState('block_party_inventory', false);

    // The item_view card lives only for the event that showed it.
    this.game.coreSystem.setState('viewed_item', null);

    this.isRootScene.value = true;
    //console.warn("setting isRootScene to true", this.isRootScene.value);
    this.game.trigger('event_end');
  }

  /**
   * Instantly remove every staged actor — no exit animations, pending removal
   * timers canceled. Used by systems that need a clean stage (e.g. battle cutaway
   * scenes) before staging their own actors.
   * @param keepExiting - Leave actors that are mid-exit alone (timers intact): they
   * finish their exit animations on their own, and a following scene that re-stages
   * the same character revives them in place, killing the exit early.
   */
  public clearActors(keepExiting: boolean = false): void {
    if (keepExiting) {
      this.sceneSlots.value = this.sceneSlots.value.filter(s => s.isRemoving);
      return;
    }
    for (const slot of this.sceneSlots.value) {
      this.cancelScheduledRemoval(slot);
    }
    this.sceneSlots.value = [];
  }

  /**
   * Snapshot the live scene machinery so an interrupting scene (e.g. a mid-battle
   * cutaway) can play and the interrupted scene be put back afterward. Transient
   * animation bookkeeping (pending slot/asset removals) is stripped from the copy.
   */
  public captureSceneContext(): SceneContext {
    return {
      sceneId: this.currentSceneId.value,
      activeDungeonId: this.activeDungeonId.value,
      activeRoomId: this.activeRoomId.value,
      cachedText: this.cachedText.value,
      cachedFlashArray: [...this.cachedFlashArray.value],
      delayedActions: { ...this.delayedActionObject },
      reloadActions: { ...this.reloadActionObject },
      eventChoices: this.eventChoices.value,
      isChoices: this.isChoices,
      sceneSlots: this.sceneSlots.value.map(({ isRemoving, removalTimeoutId, ...slot }) => ({ ...slot })),
      assets: this.assets.value.map(({ isRemoving, ...asset }) => ({ ...asset })),
      talkingCharacterId: this.talkingCharacterId.value,
    };
  }

  /**
   * Restore a captured scene context WITHOUT replaying the paragraph — no actions
   * re-run, no enter animations. Safe to call synchronously from an `event_end`
   * listener: currentSceneId is set back before `exitScene` reaches `triggerEvent`,
   * so no room event can fire in the gap.
   */
  public restoreSceneContext(ctx: SceneContext): void {
    // pending removal timers on the outgoing slots would fire against the restored
    // array — cancel them before swapping
    for (const slot of this.sceneSlots.value) {
      this.cancelScheduledRemoval(slot);
    }
    this.currentSceneId.value = ctx.sceneId;
    // matching animated id suppresses the scene-enter animation replay
    this.currentSceneIdAnimated.value = ctx.sceneId;
    this.activeDungeonId.value = ctx.activeDungeonId;
    this.activeRoomId.value = ctx.activeRoomId;
    this.cachedText.value = ctx.cachedText;
    this.cachedFlashArray.value = [...ctx.cachedFlashArray];
    this.delayedActionObject = { ...ctx.delayedActions };
    this.reloadActionObject = { ...ctx.reloadActions };
    this.eventChoices.value = ctx.eventChoices;
    this.isChoices = ctx.isChoices;
    this.sceneSlots.value = ctx.sceneSlots.map(s => ({ ...s }));
    this.assets.value = ctx.assets.map(a => ({ ...a }));
    this.talkingCharacterId.value = ctx.talkingCharacterId;
    this.isRootScene.value = !ctx.sceneId;
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
      if (slot.removalTimeoutId !== undefined) {
        clearTimeout(slot.removalTimeoutId);
        delete slot.removalTimeoutId;
      }
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

    // A missing template with no inline position falls back to center defaults —
    // almost always a typo'd slot id rather than an intentional ad-hoc placement.
    if (!template && slotData.x === undefined && slotData.y === undefined) {
      gameLogger.error(`[actor] Slot "${slotId}" does not exist (no matching slot template) — placing "${charId}" at default center. Check the slot id.`);
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
    const template = data.id ? this.characterSlotTemplates.get(data.id) : undefined;
    if (template) {
      slotData = { ...template };
    }

    // Overwrite with provided data (except char which is handled separately)
    const { char, ...restData } = data;
    slotData = { ...slotData, ...restData };

    // A referenced slot id with no matching template and no explicit position
    // falls back to center defaults — flag it as a likely typo'd slot id.
    if (data.id && !template && slotData.x === undefined && slotData.y === undefined) {
      gameLogger.error(`[actor] Slot "${data.id}" does not exist (no matching slot template). Check the slot id.`);
    }

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

  private static readonly ANIM_GROUPS = {
    enter: ['enter', 'enter_duration', 'enter_delay', 'enter_ease'],
    exit: ['exit', 'exit_duration', 'exit_ease'],
    idle: ['idle', 'idle_duration', 'idle_intensity'],
  } as const;

  private resolveInheritedAnimations(incoming: Record<string, any>, previous?: Partial<SceneSlot>): void {
    for (const anchor of ['enter', 'exit', 'idle'] as const) {
      const val = incoming[anchor];
      if (val !== 'inherit' && val !== undefined) continue;
      for (const prop of DungeonSystem.ANIM_GROUPS[anchor]) {
        const prev = previous?.[prop as keyof SceneSlot];
        if (prev !== undefined) incoming[prop] = prev;
        else delete incoming[prop];
      }
    }
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
    this.resolveInheritedAnimations(slot as any, existingSlot);
    if (existingSlot) {
      const wasRemoving = !!existingSlot.isRemoving;
      // If character is being removed, cancel the removal
      this.cancelScheduledRemoval(existingSlot);

      if (wasRemoving) {
        // Revive in place: the character was mid-exit and reappears in the next scene —
        // kill the exit early instead of finishing it and re-entering from scratch.
        // Mutating THIS slot preserves object identity, so CharacterSlot's isRemoving
        // true->false watch restores visibility; enter props are stripped so the
        // revival doesn't replay an enter animation (same treatment as moveActorToSlot).
        const { enter, enter_duration, enter_delay, enter_ease, ...updates } = slot;
        Object.assign(existingSlot, updates);
        gameLogger.info(`[actor] Revived "${slot.char}" mid-exit (exit canceled)`);
        this.game.coreSystem.addCharacterToGallery(character);
        this.revealActorsFromHideAssets();
        return true;
      }

      // Remove the old slot from the array
      this.sceneSlots.value = this.sceneSlots.value.filter(s => s.char !== slot.char);
      gameLogger.info(`[actor] Removed existing "${slot.char}" from scene before re-adding`);
    }

    // Add new slot to scene
    this.sceneSlots.value.push(slot);

    // Add to discovered characters for the gallery system
    this.game.coreSystem.addCharacterToGallery(character);
    gameLogger.info(`[actor] Added "${slot.char}" to scene`);
    this.revealActorsFromHideAssets();
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

    // Nothing to animate when the actor layer can't be seen (a hide_actors CG covers it,
    // or the event layer is hidden) — drop the slot right away instead of holding it
    // on stage for the exit duration.
    if (this.areActorsHidden()) {
      this.cancelScheduledRemoval(slot);
      this.sceneSlots.value = this.sceneSlots.value.filter(s => s !== slot);
      gameLogger.info(`[actor] Removed "${charId}" from scene (hidden — no exit animation)`);
      return true;
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

    // Store timeout ID so it can be cancelled if character re-enters.
    // Remove by object IDENTITY, never by char id: if this slot was wiped or replaced
    // meanwhile (scene reset, the char re-staged by a following scene), the stale timer
    // must not delete the newer slot for the same character.
    slot.removalTimeoutId = setTimeout(() => {
      if (slot.isRemoving) {
        this.sceneSlots.value = this.sceneSlots.value.filter(s => s !== slot);
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
    this.resolveInheritedAnimations(updates, existingSlot);
    Object.assign(existingSlot, updates);
    gameLogger.info(`[actor] Updated properties for "${charId}":`, updates);
    this.revealActorsFromHideAssets();
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
    this.resolveInheritedAnimations(newSlotData, existingSlot);

    // Strip enter animations to avoid playing them during slot change
    // But preserve exit animations so the character has correct exit for new slot
    const { enter, enter_duration, enter_delay, enter_ease, ...updates } = newSlotData;

    // Update the slot by mutating the existing object to preserve reactivity
    Object.assign(existingSlot, updates, { id: newSlotId });

    gameLogger.info(`[actor] Moved "${charId}" to slot "${newSlotId}"`);
    this.revealActorsFromHideAssets();
    return true;
  }

  /**
   * True when the actor layer isn't visible: a `hide_actors` asset covers it, or the event
   * layer is hidden entirely (e.g. a battle screen owns the view). Assets that are fading
   * out don't count — the actors are already showing again behind them.
   */
  public areActorsHidden(): boolean {
    if (this.game.coreSystem.getState('hide_events')) return true;
    return this.assets.value.some(a => a.hide_actors && !a.isRemoving);
  }

  /**
   * Reveal the actor layer: drop any staged asset flagged `hide_actors` so the actors show again.
   * Called whenever an actor is staged/moved/updated — the implicit "show the characters" intent.
   * Uses removeAssets, so each asset honors its own exit animation (fade) or cuts if it has none.
   */
  private revealActorsFromHideAssets(): void {
    for (const a of this.assets.value) {
      if (a.hide_actors && !a.isRemoving) this.removeAssets(a.id);
    }
  }


  public exitScene(skipEvents: boolean = false, instant: boolean = false) {
    if (this.game.getState('replay_mode')) {
      this.game.setState('progression_state', 'gallery');
      this.game.setState('gallery_tab', 'scenes');
      return;
    }

    // Cancellable: a listener can veto the exit entirely.
    if (!this.game.trigger('scene_exit_before', skipEvents)) {
      return;
    }

    if (this.isSceneClosing.value) {
      if (!instant) {
        return; // an exit is already closing — swallow repeat clicks
      }
      this.cancelPendingExit(); // instant caller (e.g. battle teardown) takes over
    }

    // Finish right away when there's no visible dialogue to close, or in exploration —
    // map dialogue <-> scene dialogue switches must be instant; the graceful close is
    // for custom game states (battle cutaways) where the layer disappears entirely.
    // Actors still leave with their exit animations: they start now, survive
    // resetScene's wipe (isRemoving slots are kept), and their timers clean them up.
    if (instant || !this.currentSceneId.value || this.game.getState('game_state') === 'exploration') {
      if (!instant) {
        for (const slot of [...this.sceneSlots.value]) {
          if (!slot.isRemoving && slot.char) this.removeActorFromScene(slot.char);
        }
      }
      this.finishExitScene(skipEvents);
      return;
    }

    // Graceful close: the dialogue fades out (.overlay-closing) while actors leave
    // with their slot exit animations; the actual teardown runs after the window.
    this.isSceneClosing.value = true;
    for (const slot of [...this.sceneSlots.value]) {
      if (!slot.isRemoving && slot.char) this.removeActorFromScene(slot.char);
    }
    this.sceneCloseTimeout = setTimeout(() => {
      this.sceneCloseTimeout = null;
      this.isSceneClosing.value = false;
      this.finishExitScene(skipEvents);
    }, DungeonSystem.SCENE_CLOSE_MS) as unknown as number;
  }

  /** Abort a pending graceful scene exit (a new scene or a direct reset superseded it). */
  private cancelPendingExit(): void {
    if (this.sceneCloseTimeout !== null) {
      clearTimeout(this.sceneCloseTimeout);
      this.sceneCloseTimeout = null;
    }
    this.isSceneClosing.value = false;
  }

  private finishExitScene(skipEvents: boolean): void {
    gameLogger.info('[exit] Exited scene');

    this.resetScene();

    // The scroll may have drifted while the scene was up (hide_map rebuilding the
    // container, mid-scene teleports) — bring the camera back to the selected
    // encounter, or the room when nothing is selected.
    this.centerToActive(true);
    // restore encounter content and redo actions
    // TODO: maybe don't run actions again???

    // A scene is where stats move — a level-up, an item, a buff — so leaving one is the
    // other moment a hidden encounter can become findable without the player going anywhere.
    this.scanDiscoverableEncounters();

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

      // `>` inline choices are PARAGRAPH-scoped — they hang off the paragraph
      // directly above them and may sit anywhere in a block. `~` branch choices
      // are BLOCK-END-scoped — they are the named columns of the *next* row and
      // may only be offered once this block is exhausted. Hence two separate
      // lookups: hoisting `~` up here would offer next-row branches while the
      // reader still has paragraphs left to read in this block.
      let inlineChoiceLines = this.findLines(
        lines,
        new RegExp("^>" + escapeRegExp(`${scene_name}.${scene_row}.${scene_block}.${scene_paragraph}`) + "\\*"),
      );

      let nextParagraphLine = lines.get(
        this.compileSceneId(scene_name, scene_row, scene_block, nextParagraphId),
      );

      // Inline choices replace the plain "click to continue".
      if (inlineChoiceLines.length) {
        choices = inlineChoiceLines.map(line => {
          // Params verbatim — no auto-advance. A `>` choice that should move the
          // story writes it explicitly ({scene: "next"}, {enter: ...}, {exit: true});
          // one that doesn't fires its actions and stays on the paragraph.
          // Copy: line.params is the shared parsed object and choices may modify theirs.
          let params: Record<string, any> = line.params ? JSON.parse(JSON.stringify(line.params)) : {};
          return this.game.logicSystem.createCustomChoice({ id: line.id, name: line.val, params });
        });

        // At a block boundary the two kinds share one menu, as they did in DQ9.
        if (!nextParagraphLine) {
          choices.push(...this.createBranchChoices(lines, scene_name, nextRow));
        }
        return choices;
      }

      if (nextParagraphLine) {
        return this.game.logicSystem.createCustomChoice({
          id: nextParagraphLine.id,
          name: '',
          params: { scene: nextParagraphLine.id }
        });
      }

      // Block exhausted — offer the next row's branches.
      choices = this.createBranchChoices(lines, scene_name, nextRow);
      if (choices.length) {
        return choices;
      }

      // Nothing branches: fall through to the next row, or leave the scene.
      let fallthrough = this.getFallthroughParams(lines, scene_name, scene_row, scene_block, scene_paragraph);
      return this.game.logicSystem.createCustomChoice({
        id: fallthrough.scene ?? 'exit_event',
        name: '',
        params: fallthrough
      });
    }
    return choices;
  }

  private findLines(lines: Map<string, DungeonLine>, re: RegExp): DungeonLine[] {
    let found: DungeonLine[] = [];
    for (let [id, line] of lines) {
      if (re.test(id)) {
        found.push(line);
      }
    }
    return found;
  }

  /**
   * The `~` named columns of `row` — each one a branch the reader can step into.
   * A branch with no navigation action of its own jumps to its own first paragraph.
   */
  private createBranchChoices(lines: Map<string, DungeonLine>, scene_name: string, row: number): Choice[] {
    let re = new RegExp("^~" + escapeRegExp(`${scene_name}.${row}.`) + "\\d+$");
    return this.findLines(lines, re).map(line => {
      let params: Record<string, any> = line.params ? JSON.parse(JSON.stringify(line.params)) : {};
      const branchBlockId = "#" + line.id.slice(1) + ".1";
      const isDelayed = !!Object.keys(this.getDelayedActions(line.params)).length;
      if (!isDelayed) {
        params['scene'] = branchBlockId;
      }
      const choice = this.game.logicSystem.createCustomChoice({ id: line.id, name: line.val, params });
      if (isDelayed) {
        // A delayed branch (e.g. {battle}) jumps nowhere now — it runs its action and the
        // story resumes later. Remember THIS branch as the resume point, otherwise
        // nextScene falls through to the row's first branch (the one not taken).
        choice.resumeSceneId = branchBlockId;
      }
      return choice;
    });
  }

  /**
   * Where the reader goes when nothing explicit says otherwise: the next paragraph
   * of this block, else the first paragraph of the next row, else out of the scene.
   */
  private getFallthroughParams(
    lines: Map<string, DungeonLine>,
    scene_name: string,
    scene_row: number,
    scene_block: number,
    scene_paragraph: number,
  ): Record<string, any> {
    let nextParagraph = lines.get(this.compileSceneId(scene_name, scene_row, scene_block, scene_paragraph + 1));
    if (nextParagraph) {
      return { scene: nextParagraph.id };
    }
    let nextRowLine = lines.get(this.compileSceneId(scene_name, scene_row + 1, 1, 1));
    if (nextRowLine) {
      return { scene: nextRowLine.id };
    }
    return { exit: true };
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
    if (!this.game.trigger('encounter_selected', encounter.id, this.currentDungeonId.value ?? '')) return;
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

  // ============================================
  // HIDDEN ENCOUNTERS  (`@x{discover: "perception#6"}`)
  // ============================================

  /** Has this encounter already been revealed? Latched for good, and saved. */
  public isEncounterDiscovered(encounterId: string, dungeonId: string): boolean {
    return this.getDataByDungeonId(dungeonId)?.uncoveredInteractions.has(encounterId) ?? false;
  }

  /**
   * Parse a discover spec — `"perception#6"` or `"perception#6, wits#5"` — and test it
   * against the party. Each clause is met if ANY party member reaches it (the sharpest
   * eyes in the group spot it); every clause must be met.
   */
  private partyMeetsDiscoverSpec(spec: string, encounterId: string): boolean {
    const clauses = this.parseDiscoverSpec(spec, encounterId);
    if (!clauses.length) {
      return false;
    }
    const party = this.game.getParty();
    return clauses.every(({ statId, threshold }) =>
      // getStat throws on an unknown stat, so ask first.
      party.some(character => character.hasStat(statId) && character.getStat(statId) >= threshold),
    );
  }

  public parseDiscoverSpec(spec: string, encounterId: string = ""): Array<{ statId: string; threshold: number }> {
    const clauses: Array<{ statId: string; threshold: number }> = [];
    for (const part of String(spec).split(',').map(s => s.trim()).filter(Boolean)) {
      const [statId, rawThreshold] = part.split('#').map(s => s.trim());
      const threshold = Number(rawThreshold);
      if (!statId || !rawThreshold || isNaN(threshold)) {
        gameLogger.error(`[discover] invalid clause "${part}"${encounterId ? ` on encounter "${encounterId}"` : ''} — use "<stat>#<number>", e.g. "perception#6"`);
        continue;
      }
      clauses.push({ statId, threshold });
    }
    return clauses;
  }

  // ============================================
  // COLLECTABLES  (encounters with collect_item)
  // ============================================

  /** Has this collectable been taken (and not yet regrown)? */
  public isEncounterCollected(encounterId: string, dungeonId: string | null = null): boolean {
    return this.getDataByDungeonId(dungeonId)?.collectedEncounters.has(encounterId) ?? false;
  }

  /** Latch a collectable as taken, stamping its regrow countdown (-1 = never regrows). */
  public markEncounterCollected(encounter: DungeonEncounter, dungeonId: string | null = null): void {
    const countdown = encounter.regrowTurns && encounter.regrowTurns > 0 ? encounter.regrowTurns : -1;
    this.getDataByDungeonId(dungeonId)?.collectedEncounters.set(encounter.id, countdown);
  }

  /** Clear a collectable's collected latch — it becomes visible and collectable again. */
  public uncollectEncounter(encounterId: string, dungeonId: string | null = null): void {
    this.getDataByDungeonId(dungeonId)?.collectedEncounters.delete(encounterId);
  }

  /**
   * Advance every collected collectable's regrow countdown by `turns`, across all
   * dungeons. Countdowns reaching 0 are cleared — the node regrows. -1 entries (no
   * regrow) are untouched. Called by time-system plugins (turn_system does, one
   * line on `turn_advanced`); the engine never calls this on its own.
   */
  public tickCollectables(turns: number): void {
    if (!Number.isFinite(turns) || turns <= 0) {
      return;
    }
    for (const data of this.dungeonDatas.value.values()) {
      for (const [encounterId, remaining] of data.collectedEncounters) {
        if (remaining <= 0) continue;
        const next = remaining - turns;
        if (next <= 0) {
          data.collectedEncounters.delete(encounterId);
        } else {
          data.collectedEncounters.set(encounterId, next);
        }
      }
    }
  }

  /**
   * Reveal every hidden encounter in the current room whose threshold the party now
   * meets. Runs on room entry and on scene exit — a scene is where stats actually move
   * (level-up, an item, a buff), so coming back out of one is the other moment a hidden
   * encounter can become findable without the player going anywhere.
   */
  public scanDiscoverableEncounters(): void {
    const dungeon = this.currentDungeon.value;
    const room = this.currentRoom.value;
    if (!dungeon || !room) {
      return;
    }
    const dungeonId = dungeon.id;
    const data = this.getDataByDungeonId(dungeonId);
    if (!data) {
      return;
    }

    for (const encounter of dungeon.encounters.values()) {
      if (!encounter.discoverSpec) continue;
      if (data.uncoveredInteractions.has(encounter.id)) continue;
      if (!encounter.isHere(room)) continue;
      if (!this.partyMeetsDiscoverSpec(encounter.discoverSpec, encounter.id)) continue;

      data.uncoveredInteractions.add(encounter.id);
      gameLogger.info(`[discover] "${encounter.id}" revealed (${encounter.discoverSpec})`);
      this.game.trigger('encounter_discovered', encounter.id, dungeonId);
    }
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
    const applied: string[] = [];
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
      applied.push(`${varName}${operator}${varValue}`);
    }
    if (applied.length > 0) {
      gameLogger.info(`[flag] ${applied.join(', ')}`);
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
    const clamped = Math.max(0.3, Math.min(factor, 2.0));
    if (clamped === this.game.coreSystem.getState<number>('map_zoom_factor')) {
      return;
    }
    this.game.coreSystem.setState('map_zoom_factor', clamped);
    // The content rescales via --map-zoom-factor on the next render; recenter after
    // that so zooming keeps the room / selected encounter under the viewport center.
    nextTick(() => this.centerToActive());
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

  /**
   * Fetch and decode the current dungeon's art (background, fog mask, encounter images) before
   * the map is shown, so it draws in one piece instead of popping in image by image. The map
   * hides itself and the toolbar shows a spinner while this runs. Text dungeons have no art to
   * wait for, and a dungeon is only ever warmed once.
   */
  private async preloadDungeonAssets(): Promise<void> {
    const dungeon = this.currentDungeon.value;
    if (!dungeon || dungeon.dungeon_type === 'text' || this.preloadedDungeons.has(dungeon.id)) {
      this.dungeonAssetsLoaded.value = true;
      return;
    }

    this.dungeonAssetsLoaded.value = false;

    const images: (string | undefined)[] = [dungeon.image, dungeon.fog_image];
    for (const encounter of dungeon.encounters.values()) {
      images.push(encounter.image);
    }

    await warmImages(images);

    this.preloadedDungeons.add(dungeon.id);
    // The player may have travelled on while the art was loading.
    if (this.currentDungeonId.value !== dungeon.id) return;

    this.dungeonAssetsLoaded.value = true;
    this.centerToActiveLocation(true);
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

    // Play the dungeon's default music on enter, independent of the resetScene
    // game_state guard (which only governs scene exits). Must run BEFORE enterRoom:
    // enterRoom may play a first scene whose {music: X} action should win over this.
    this.game.setMusic(this.currentDungeon.value?.music || false);

    this.enterRoom(roomId);

    // Fire-and-forget: entering stays synchronous, the map just stays hidden until the art lands.
    this.preloadDungeonAssets();

    gameLogger.info(`Dungeon ${dungeonId} loaded and set.`);

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

    let proceed = this.game.trigger('room_enter_before', roomId, dungeon.id);
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

    // Before room_enter_after, so a listener already sees anything this reveals.
    this.scanDiscoverableEncounters();

    if (room.actions?.room_enter_after) {
      this.game.logicSystem.resolveActions(room.actions.room_enter_after);
    }
    this.game.trigger('room_enter_after', roomId, dungeon.id);
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

  /** Center on the selected encounter when one is still visible, else on the current room. */
  public centerToActive(smooth = false) {
    if (this.selectedEncounter.value?.getVisibilityState()) {
      this.centerToActiveEncounter(smooth);
    } else {
      this.centerToActiveLocation(smooth);
    }
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

  /**
   * Advance to the next scene. `instant` only matters when there IS no next scene: the fallback
   * exit closes immediately instead of playing the graceful actor fade-out. Callers that are
   * already swapping the whole screen (battle teardown) pass true — otherwise a restored cast the
   * player never saw would linger for SCENE_CLOSE_MS and read as actors flashing in.
   */
  public nextScene(instant: boolean = false) {
    let sceneId = this.currentSceneId.value;
    this.game.coreSystem.setState('overlay_state', 'overlay-navigation');

    if (!sceneId) {
      this.exitScene(false, instant);
      return;
    }

    let dungeonId = this.activeDungeonId.value || this.currentDungeonId.value;
    if (!dungeonId) {
      gameLogger.warn("No active dungeon ID, cannot navigate to next scene");
      return;
    }

    // A delayed branch choice ({battle} etc.) resumes into the branch the player took,
    // not the row's first one. Only for the scene it was clicked from — so a mid-battle
    // cutaway's exit, or a battle that was lost, can never consume it.
    const resume = this.pendingResume;
    this.pendingResume = null;
    if (resume && resume.fromSceneId === sceneId) {
      if (this.dungeonLines.get(dungeonId)?.has(resume.target)) {
        this.playScene(resume.target, dungeonId);
      } else {
        // The branch has no content of its own — the scene is over.
        this.exitScene(false, instant);
      }
      return;
    }

    // Use getNextSceneId to find the next scene
    const nextSceneId = this.getNextSceneId(sceneId);

    if (nextSceneId) {
      this.playScene(nextSceneId, dungeonId);
    } else {
      // No next scene found, exit the scene
      this.exitScene(false, instant);
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
    /*
        // 2. Try to find the next block (same row, block + 1, paragraph 1)
        let nextBlockId = this.compileSceneId(scene_name, scene_row, scene_block + 1, 1);
        if (lines.has(nextBlockId)) {
          return nextBlockId;
        }
    */
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
    gameLogger.info(`[quest] Added quest log: ${dungeonId}.${questId}.${goalId}.${logId}`);

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
    // A replayed scene starts from daylight — the grade belongs to wherever the player actually is,
    // not to a gallery replay. Cleared unconditionally so replaying a second scene from inside
    // replay mode doesn't inherit a grade the first one set. Instant: this is a hard context switch.
    // Leaving replay reloads the save taken just above, which restores whatever grade was live then.
    this.setGrade(false, true);
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
