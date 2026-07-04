/**
 * Shared Spine Renderer — single WebGL context for ALL spine characters.
 *
 * Uses one offscreen PixiJS renderer. Each spine character gets a 2D canvas
 * element inside its placeholder div. Each frame, skeletons are rendered to
 * the app canvas and copied to their 2D canvases via drawImage().
 *
 * The 2D canvases participate in normal DOM flow (z-index, scrolling, clipping).
 * Only one WebGL context is used regardless of character count.
 *
 * TODO: Deduplicate renders for identical characters. Slots with the same
 * atlas+skeleton+skins+animation should share one Spine instance,
 * with the rendered frame copied to all their 2D canvases.
 */

import { Application, Assets } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { Global } from '../../global/global';
import { SPINE_REFERENCE_HEIGHT } from './characterReference';

/** Minimum effective render scale — at lower slot.scale the backing buffer
 * is over-sampled relative to display size so spine edges don't alias when
 * the atlas is heavily downsampled by the GPU at small render scales.
 * The browser handles the final canvas → display scale with high-quality
 * smoothing, giving cleaner outlines at the cost of slightly more GPU work. */
const MIN_RENDER_SCALE = 0.6;

interface SpineTransition {
  snapshot: HTMLCanvasElement;
  remaining: number;
  duration: number;
}

interface SpineSlot {
  id: string;
  element: HTMLElement;
  canvas2d: HTMLCanvasElement;
  ctx2d: CanvasRenderingContext2D;
  spine: Spine;
  mirror: boolean;
  viewport?: ViewportAdjust;
  artScale: number;
  artDx: number;
  artDy: number;
  gameScale: number;
  slotScale: number;
  width: number;
  height: number;
  transition?: SpineTransition;
}

interface ViewportAdjust {
  dx?: number;
  dy?: number;
  zoom?: number;
}

interface RegisterOptions {
  atlasUrl: string;
  skeletonUrl: string;
  skins?: string[];
  animation?: string;
  loop?: boolean;
  mirror?: boolean;
  viewport?: ViewportAdjust;
  /** Per-character/per-asset scale multiplier applied inside the renderer's baseScale. Default 1. */
  artScale?: number;
  /** Per-spine x offset in % of slot height (cqh equivalent). Default 0. */
  artDx?: number;
  /** Per-spine y offset in % of slot height (cqh equivalent). Default 0. */
  artDy?: number;
  /** Per-game spine size multiplier (from manifest's spine_character_scale). Default 1. */
  gameScale?: number;
  /** Per-slot scale multiplier (replaces CSS transform scale to keep spine pixels sharp). Default 1. */
  slotScale?: number;
}

export interface SpineStats {
  animations: string[];
  skins: string[];
  bones: number;
  slots: number;
  ikConstraints: number;
  transformConstraints: number;
  pathConstraints: number;
}

class SpineRendererService {
  private app: Application | null = null;
  private slots = new Map<string, SpineSlot>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private loadingPromises = new Map<string, Promise<void>>();

  // Per-slot registration generation — stale async register() calls bail when superseded
  private registerVersions = new Map<string, number>();
  private maxCanvasW = 0;
  private maxCanvasH = 0;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      this.app = new Application();
      await this.app.init({
        backgroundAlpha: 0,
        width: 1,
        height: 1,
        antialias: true,
        autoDensity: false,
      });

      // Hide the offscreen canvas (used only for WebGL rendering)
      this.app.canvas.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;visibility:hidden;';
      document.body.appendChild(this.app.canvas as HTMLElement);

      // Use Pixi's ticker for the render loop
      this.app.ticker.add(this.renderLoop, this);

      this.initialized = true;
    })();

    return this.initPromise;
  }

  private makeAssetKey(atlasUrl: string, skeletonUrl: string): string {
    return `${atlasUrl}|${skeletonUrl}`;
  }

  private async loadAssets(atlasUrl: string, skeletonUrl: string): Promise<void> {

    const key = this.makeAssetKey(atlasUrl, skeletonUrl);
    const existing = this.loadingPromises.get(key);
    if (existing) return existing;

    const skelAlias = `skel_${key}`;
    const atlasAlias = `atlas_${key}`;

    // Check if already loaded (use cache.has to avoid warning spam from Assets.get)
    if (Assets.cache.has(skelAlias) && Assets.cache.has(atlasAlias)) return;

    const promise = (async () => {
      if (!Assets.resolver.hasKey(skelAlias)) {
        Assets.add({ alias: skelAlias, src: skeletonUrl });
      }
      if (!Assets.resolver.hasKey(atlasAlias)) {
        Assets.add({ alias: atlasAlias, src: atlasUrl });
      }
      await Assets.load([skelAlias, atlasAlias]);
      this.loadingPromises.delete(key);
    })();

    this.loadingPromises.set(key, promise);
    return promise;
  }

  /** Warm the atlas/skeleton into the Assets cache ahead of a register() (cached + in-flight deduped). */
  public async preloadAssets(atlasUrl: string, skeletonUrl: string): Promise<void> {
    await this.loadAssets(atlasUrl, skeletonUrl);
  }

  async register(id: string, element: HTMLElement, options: RegisterOptions): Promise<Spine | null> {
    // Generation guard: overlapping register calls for the same slot id (e.g. an
    // outfit swap re-inits while the previous atlas is still downloading) must not
    // BOTH complete — the stale one would append a second frozen canvas and fight
    // over the slot entry. Only the newest registration survives its awaits.
    const version = (this.registerVersions.get(id) ?? 0) + 1;
    this.registerVersions.set(id, version);

    if (!this.initialized) await this.init();
    if (!this.app) return null;
    if (this.registerVersions.get(id) !== version) return null;

    // Unregister existing slot with same ID (bumps the version — recapture ours)
    if (this.slots.has(id)) {
      this.unregister(id);
      this.registerVersions.set(id, version);
    }

    try {
      await this.loadAssets(options.atlasUrl, options.skeletonUrl);
      if (this.registerVersions.get(id) !== version) return null;

      const key = this.makeAssetKey(options.atlasUrl, options.skeletonUrl);
      const skelAlias = `skel_${key}`;
      const atlasAlias = `atlas_${key}`;

      const spine = Spine.from({
        skeleton: skelAlias,
        atlas: atlasAlias,
        scale: 1,
        autoUpdate: false, // We update manually in the render loop
      });

      // Smooth animation crossfade between track swaps
      spine.state.data.defaultMix = 0.3;

      // Log available animations and skins in dev mode or editor
      if (Global.getInstance().engineState.value === 'editor' || localStorage.getItem('devMode') === 'true') {
        console.log('🦴 Spine loaded:', { slot: id, ...this.getStats(spine) });
      }

      // Apply skins
      if (options.skins && options.skins.length > 0) {
        this.applySkins(spine, options.skins);
      }

      // Set animation
      if (options.animation) {
        const exists = spine.skeleton.data.findAnimation(options.animation);
        if (exists) {
          spine.state.setAnimation(0, options.animation, options.loop ?? true);
        }
      }

      // Create a 2D canvas inside the placeholder element. Sized by slotScale and
      // absolutely centered so it can overflow `element` symmetrically — lets the
      // spine render bigger than the slot bounds without getting clipped.
      // Per-spine art_dx/art_dy are applied as an EXTRA translate on the canvas itself
      // (not on spineX/spineY): the canvas moves within `element` so accessories that
      // sit on the offset side stay inside the canvas's render area instead of being
      // clipped at the edge.
      const canvas2d = document.createElement('canvas');
      const slotScale = options.slotScale ?? 1;
      const pct = slotScale * 100;
      const initArtDx = options.artDx ?? 0;
      const initArtDy = options.artDy ?? 0;
      const initMirror = options.mirror ?? false;
      // Multiply by slotScale: art_dx is "% of body height", not "% of slot CSS height".
      // See applyCanvasArtTransform for rationale.
      const initDx = (initMirror ? -initArtDx : initArtDx) * slotScale;
      const initDy = initArtDy * slotScale;
      canvas2d.style.cssText =
        `position:absolute;top:50%;left:50%;` +
        `transform:translate(-50%,-50%) translate(${initDx}cqh, ${initDy}cqh);` +
        `width:${pct}%;height:${pct}%;display:block;`;
      // ensure host can anchor an absolute child
      if (getComputedStyle(element).position === 'static') {
        element.style.position = 'relative';
      }
      element.appendChild(canvas2d);

      const ctx2d = canvas2d.getContext('2d')!;

      // Initial size from element × max(slotScale, MIN_RENDER_SCALE).
      // Backing buffer is decoupled from CSS display size — display stays at
      // slotScale × element via canvas's `width: pct%`, but the buffer is at
      // least MIN_RENDER_SCALE-relative so we render at a high enough resolution
      // for spine edges to look clean after the browser's final downsample.
      const rect = element.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const renderScale = Math.max(slotScale, MIN_RENDER_SCALE);
      const w = Math.max(1, Math.round(rect.width * renderScale * dpr));
      const h = Math.max(1, Math.round(rect.height * renderScale * dpr));
      canvas2d.width = w;
      canvas2d.height = h;

      // Grow the offscreen app canvas if this slot is larger (never shrink)
      if (w > this.maxCanvasW || h > this.maxCanvasH) {
        this.maxCanvasW = Math.max(this.maxCanvasW, w);
        this.maxCanvasH = Math.max(this.maxCanvasH, h);
        this.app!.renderer.resize(this.maxCanvasW, this.maxCanvasH);
      }

      const slot: SpineSlot = {
        id,
        element,
        canvas2d,
        ctx2d,
        spine,
        mirror: options.mirror ?? false,
        artScale: options.artScale ?? 1,
        artDx: options.artDx ?? 0,
        artDy: options.artDy ?? 0,
        gameScale: options.gameScale ?? 1,
        slotScale: options.slotScale ?? 1,
        viewport: options.viewport,
        width: w,
        height: h,
      };

      this.slots.set(id, slot);
      return spine;
    } catch (error) {
      console.error(`[SpineRenderer] Failed to register "${id}":`, error);
      return null;
    }
  }

  unregister(id: string): void {
    // Cancel any in-flight register for this id, even when nothing is in the
    // slots map yet (component unmounted while its assets were downloading).
    this.registerVersions.set(id, (this.registerVersions.get(id) ?? 0) + 1);

    const slot = this.slots.get(id);
    if (!slot) return;

    if (slot.canvas2d.parentNode) {
      slot.canvas2d.parentNode.removeChild(slot.canvas2d);
    }

    // Don't destroy spine's children/textures — they may be shared with other instances
    // via PixiJS asset cache. Just detach and let GC handle it.
    slot.spine.destroy({ children: false });

    this.slots.delete(id);
  }

  getSpine(id: string): Spine | null {
    return this.slots.get(id)?.spine ?? null;
  }

  getStats(spine: Spine): SpineStats {
    const data: any = spine.skeleton.data;
    return {
      animations: (data.animations ?? []).map((a: any) => a.name),
      skins: (data.skins ?? []).map((s: any) => s.name),
      bones: data.bones?.length ?? 0,
      slots: data.slots?.length ?? 0,
      ikConstraints: data.ikConstraints?.length ?? 0,
      transformConstraints: data.transformConstraints?.length ?? 0,
      pathConstraints: data.pathConstraints?.length ?? 0,
    };
  }

  applySkins(spine: Spine, skins: string[]): void {
    const skeletonData = spine.skeleton.data;
    const validSkins = skins.filter(name => skeletonData.skins.find((s: any) => s.name === name));
    if (validSkins.length === 0) return;

    if (validSkins.length === 1) {
      spine.skeleton.setSkinByName(validSkins[0]);
    } else {
      const firstSkinData = skeletonData.skins[0];
      if (firstSkinData) {
        const SkinConstructor = firstSkinData.constructor as any;
        const combinedSkin = new SkinConstructor('combined-skin');
        for (const skinName of validSkins) {
          const skin = skeletonData.skins.find((s: any) => s.name === skinName);
          if (skin) combinedSkin.addSkin(skin);
        }
        spine.skeleton.setSkin(combinedSkin);
      }
    }
    spine.skeleton.setSlotsToSetupPose();
  }

  /** Rebuilds the canvas's CSS transform to apply art_dx/art_dy (with mirror flip on dx).
   * Multiplies by slotScale so art_dx is "% of body's visible height" rather than "% of slot's
   * full CSS height" — without the multiplier, a small canvas at slot.scale=0.2 still gets the
   * full slot-height-relative shift, which translates to a 5x oversized relative shift. */
  private applyCanvasArtTransform(slot: SpineSlot): void {
    const dxRaw = slot.mirror ? -slot.artDx : slot.artDx;
    const dx = dxRaw * slot.slotScale;
    const dy = slot.artDy * slot.slotScale;
    slot.canvas2d.style.transform =
      `translate(-50%, -50%) translate(${dx}cqh, ${dy}cqh)`;
  }

  updateMirror(id: string, mirror: boolean): void {
    const slot = this.slots.get(id);
    if (!slot) return;
    slot.mirror = mirror;
    // dx flips with mirror, so re-apply the canvas transform.
    this.applyCanvasArtTransform(slot);
  }

  updateArtScale(id: string, artScale: number): void {
    const slot = this.slots.get(id);
    if (slot) slot.artScale = artScale;
  }

  updateArtOffset(id: string, artDx: number, artDy: number): void {
    const slot = this.slots.get(id);
    if (!slot) return;
    slot.artDx = artDx;
    slot.artDy = artDy;
    this.applyCanvasArtTransform(slot);
  }

  updateGameScale(id: string, gameScale: number): void {
    const slot = this.slots.get(id);
    if (slot) slot.gameScale = gameScale;
  }

  updateSlotScale(id: string, slotScale: number): void {
    const slot = this.slots.get(id);
    if (!slot) return;
    slot.slotScale = slotScale;
    // Resize canvas CSS to match new scale; renderLoop picks up backing pixels next frame.
    const pct = slotScale * 100;
    slot.canvas2d.style.width = `${pct}%`;
    slot.canvas2d.style.height = `${pct}%`;
    // applyCanvasArtTransform multiplies art_dx/dy by slotScale, so re-emit it.
    this.applyCanvasArtTransform(slot);
  }

  /** Capture current frame for a crossfade transition. Call before changing animations. */
  snapshotForTransition(id: string, duration: number = 0.3): void {
    const slot = this.slots.get(id);
    if (!slot || slot.width <= 0 || slot.height <= 0) return;

    // Reuse existing snapshot canvas if size matches, otherwise create new
    let snapshot = slot.transition?.snapshot;
    if (!snapshot || snapshot.width !== slot.width || snapshot.height !== slot.height) {
      snapshot = document.createElement('canvas');
      snapshot.width = slot.width;
      snapshot.height = slot.height;
    }
    const ctx = snapshot.getContext('2d')!;
    ctx.clearRect(0, 0, snapshot.width, snapshot.height);
    ctx.drawImage(slot.canvas2d, 0, 0);

    slot.transition = { snapshot, remaining: duration, duration };
  }

  // ── Render Loop (runs on Pixi ticker) ──

  private renderLoop = (): void => {
    if (!this.app) return;

    const renderer = this.app.renderer;
    const appCanvas = this.app.canvas as HTMLCanvasElement;
    const dpr = window.devicePixelRatio || 1;
    const dt = this.app!.ticker.deltaMS / 1000;

    for (const slot of this.slots.values()) {
      // Backing buffer = element × max(slotScale, MIN_RENDER_SCALE) × dpr.
      // CSS display still scales by slotScale; the buffer is over-sampled at
      // low scales so atlas downsampling doesn't produce ragged edges.
      const renderScale = Math.max(slot.slotScale, MIN_RENDER_SCALE);
      const ow = slot.element.offsetWidth * renderScale;
      const oh = slot.element.offsetHeight * renderScale;
      if (ow <= 0 || oh <= 0) continue;

      const w = Math.round(ow * dpr);
      const h = Math.round(oh * dpr);

      // Update slot's 2D canvas size if layout changed
      if (w !== slot.width || h !== slot.height) {
        slot.width = w;
        slot.height = h;
        slot.canvas2d.width = w;
        slot.canvas2d.height = h;

        // Grow app canvas if needed (never per-frame resize during normal operation)
        if (w > this.maxCanvasW || h > this.maxCanvasH) {
          this.maxCanvasW = Math.max(this.maxCanvasW, w);
          this.maxCanvasH = Math.max(this.maxCanvasH, h);
          renderer.resize(this.maxCanvasW, this.maxCanvasH);
        }
      }

      slot.spine.update(dt);

      // Render at a consistent scale relative to a fixed reference height so
      // every character's body is sized the same regardless of accessories
      // extending its AABB. spine_character_scale is the per-game multiplier;
      // art_scale (slot.artScale) is the per-character/per-asset fine-tune.
      const data = slot.spine.skeleton.data;
      const skelW = data.width || w;
      const skelH = data.height || h;
      const baseScale = (h / SPINE_REFERENCE_HEIGHT) * slot.gameScale * slot.artScale;
      const zoom = slot.viewport?.zoom ?? 1;
      const scale = baseScale * zoom;
      const dx = (slot.viewport?.dx ?? 0) * baseScale;
      const dy = (slot.viewport?.dy ?? 0) * baseScale;
      // Spine position is always at canvas center. Per-spine art_dx/art_dy live on the
      // canvas's CSS transform (set in register / updateArtOffset / updateMirror) so the
      // canvas itself moves within `element` — accessories on the offset side are not
      // clipped at the canvas edge.
      const spineX = (w / 2) - (data.x + skelW / 2) * scale + dx;
      const spineY = (h / 2) + (data.y + skelH / 2) * scale + dy;

      slot.spine.position.set(spineX, spineY);
      slot.spine.scale.set(slot.mirror ? -scale : scale, scale);

      // Render to app canvas (no resize) + GPU-accelerated copy with source cropping
      renderer.render({ container: slot.spine, clear: true });
      slot.ctx2d.globalCompositeOperation = 'copy';
      slot.ctx2d.drawImage(appCanvas, 0, 0, w, h, 0, 0, w, h);
      slot.ctx2d.globalCompositeOperation = 'source-over';

      // Crossfade: overlay old snapshot with decreasing opacity
      if (slot.transition) {
        slot.transition.remaining -= dt;
        if (slot.transition.remaining <= 0) {
          slot.transition = undefined;
        } else {
          const alpha = slot.transition.remaining / slot.transition.duration;
          slot.ctx2d.globalAlpha = alpha;
          slot.ctx2d.drawImage(slot.transition.snapshot, 0, 0);
          slot.ctx2d.globalAlpha = 1;
        }
      }
    }
  };


  // ── Cleanup ──

  destroy(): void {
    for (const id of [...this.slots.keys()]) {
      this.unregister(id);
    }

    if (this.app) {
      this.app.ticker.remove(this.renderLoop, this);
      if (this.app.canvas?.parentNode) {
        (this.app.canvas as HTMLElement).parentNode!.removeChild(this.app.canvas as HTMLElement);
      }
      this.app.destroy(true);
    }

    this.app = null;
    this.initialized = false;
    this.initPromise = null;
    this.loadingPromises.clear();
  }
}

export const spineRenderer = new SpineRendererService();
