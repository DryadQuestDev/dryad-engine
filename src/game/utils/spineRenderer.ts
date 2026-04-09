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
}

class SpineRendererService {
  private app: Application | null = null;
  private slots = new Map<string, SpineSlot>();
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private loadingPromises = new Map<string, Promise<void>>();
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

  async register(id: string, element: HTMLElement, options: RegisterOptions): Promise<Spine | null> {
    if (!this.initialized) await this.init();
    if (!this.app) return null;

    // Unregister existing slot with same ID
    if (this.slots.has(id)) {
      this.unregister(id);
    }

    try {
      await this.loadAssets(options.atlasUrl, options.skeletonUrl);

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
        console.log('🦴 Spine loaded:', {
          slot: id,
          animations: spine.skeleton.data.animations.map((a: any) => a.name),
          skins: spine.skeleton.data.skins.map((s: any) => s.name),
        });
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

      // Create a 2D canvas inside the placeholder element
      const canvas2d = document.createElement('canvas');
      canvas2d.style.cssText = 'width:100%;height:100%;display:block;';
      element.appendChild(canvas2d);

      const ctx2d = canvas2d.getContext('2d')!;

      // Initial size from element
      const rect = element.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
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

  updateMirror(id: string, mirror: boolean): void {
    const slot = this.slots.get(id);
    if (slot) slot.mirror = mirror;
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
      // Use offsetWidth/Height (layout size, ignores CSS transforms — no false resizes during animations)
      const ow = slot.element.offsetWidth;
      const oh = slot.element.offsetHeight;
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

      // Position and scale (with small inset padding to avoid edge clipping)
      const pad = 20;
      const data = slot.spine.skeleton.data;
      const skelW = data.width || w;
      const skelH = data.height || h;
      const baseScale = Math.min((w - pad * 2) / skelW, (h - pad * 2) / skelH);
      const zoom = slot.viewport?.zoom ?? 1;
      const scale = baseScale * zoom;
      const dx = (slot.viewport?.dx ?? 0) * baseScale;
      const dy = (slot.viewport?.dy ?? 0) * baseScale;
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
