import { computed, ref } from 'vue';
import { Game } from '../game';
import { Global } from '../../global/global';
import { reportDevProblem } from '../utils/devProblems';
import type { Choice } from '../core/content/choice';
import type { ScenePointObject } from '../../schemas/scenePointSchema';

type Layout = ScenePointObject;
type LayoutPoint = NonNullable<Layout['points']>[number];

/** The `inspect` state: the layout in force, the point the frame is zoomed toward, and what the zoom replaced. */
export interface InspectState {
  layout: string;
  zoomed: string | null;
  /** A look_button layout: the player pressed Look around and hasn't stopped. */
  looking?: boolean;
  /** Each frame asset's own scale/x/y before the zoom, restored when it zooms back out. */
  restore: Record<string, { scale: number; x: number; y: number }>;
}

/** A point of the active layout, as `game.getScenePoints()` returns it. Coordinates are viewport (client) pixels. */
export interface ScenePointInfo {
  id: string;
  layout: string;
  x: number;
  y: number;
  /** Side of a square around the point, scaled with the picture (for highlights and anchoring). */
  size: number;
  /** The character that stands for the thing at this point, if the layout names one. */
  character: string | null;
  /** The visible choice bound to this point on the menu on screen, if any. */
  choice: Choice | null;
}

const ZOOM_SECONDS = 1.2;
const MARKER_SIZE_PCT = 4;

/**
 * Scene points: point layouts (the scene_points data) switched on by {inspect}, choices bound to their
 * points ({point}) drawn on the picture instead of in the menu, and a zoom of the layout's frame toward a
 * point. Transient: what must survive a load lives in the `inspect` state and in the staged assets.
 */
export class ScenePointSystem {
  get game() {
    return Game.getInstance();
  }

  /** True while the frame eases back out: the markers wait, so they never sit on a moving picture. */
  public settling = ref(false);
  private settleTimer?: ReturnType<typeof setTimeout>;
  /** Bumped when the scene view resizes, so marker positions recompute. */
  public viewTick = ref(0);

  public get state(): InspectState | null {
    return (this.game.coreSystem.getState('inspect') as InspectState | null) ?? null;
  }

  public getLayout(id: string | null | undefined): Layout | null {
    if (!id) return null;
    try {
      return (this.game.getData('scene_points', true) as Map<string, Layout>)?.get(id) ?? null;
    } catch {
      return null;
    }
  }

  public activeLayout = computed<Layout | null>(() => this.getLayout(this.state?.layout));

  private findPoint(layout: Layout | null, pointId: string | null | undefined): LayoutPoint | null {
    if (!layout || !pointId) return null;
    return (layout.points || []).find((p) => p.id === pointId) ?? null;
  }

  /** Whether a choice is drawn on the picture instead of the menu: it names a point of the layout in force. */
  public isPointChoice(choice: Choice | null | undefined): boolean {
    const id = choice?.params?.point;
    return typeof id === 'string' && !!this.findPoint(this.activeLayout.value, id);
  }

  /** The visible choices bound to points, on the menu that's up now. */
  public pointChoices = computed<Choice[]>(() => {
    const raw = this.game.dungeonSystem.relevantChoices.value;
    const list = Array.isArray(raw) ? raw : raw ? [raw as Choice] : [];
    if (this.game.dungeonSystem.choiceType.value === 'encounter') return [];
    return list.filter((c) => c?.isVisible && this.isPointChoice(c));
  });

  /** A menu with point choices is up, its text has landed, and the picture is settled and unzoomed. */
  private menuReady = computed(() => {
    const ds = this.game.dungeonSystem;
    return !!ds.currentSceneId.value
      && ds.currentSceneIdAnimated.value === ds.currentSceneId.value
      && !this.state?.zoomed
      && !this.settling.value
      && this.pointChoices.value.length > 0;
  });

  /** Markers show on a ready menu; a look_button layout also waits for the player to press Look around. */
  public markersShown = computed(() => this.menuReady.value
    && (!this.activeLayout.value?.look_button || !!this.state?.looking));

  /** The Look around button: a look_button layout's ready menu, pressed or not (pressed, it stops looking). */
  public lookButtonShown = computed(() => !!this.activeLayout.value?.look_button && this.menuReady.value);

  public setLooking(on: boolean): void {
    const st = this.state;
    if (!st || !!st.looking === on) return;
    this.game.coreSystem.setState('inspect', { ...st, looking: on });
  }

  /** An ordinary choice picked from the menu the markers belong to ends the look; a point keeps it going. */
  public onChoicePicked(choice: Choice): void {
    if (this.state?.looking && this.pointChoices.value.length > 0 && !this.isPointChoice(choice)) this.setLooking(false);
  }

  /** Actors fade while the markers are up and while the frame is zoomed in, when the layout asks for it. */
  public hideActors = computed(() => {
    const layout = this.activeLayout.value;
    return !!layout?.hide_actors && (this.markersShown.value || !!this.state?.zoomed || this.settling.value);
  });

  // ── geometry ──

  /** The scene view: the box backgrounds are fitted to. */
  private viewElement(): HTMLElement | null {
    return document.querySelector('.game-body-content');
  }

  /** The staged asset's drawn element (its rect includes the asset transform, the enter/idle wrapper and shake). */
  private assetElement(assetId: string): HTMLElement | null {
    const root = document.querySelector(`#backgrounds-wrapper [data-asset-id="${CSS.escape(assetId)}"]`);
    return root?.querySelector('.background-asset, .background-asset-stack') as HTMLElement | null;
  }

  private naturalSize(el: HTMLElement): { w: number; h: number } | null {
    const img = (el.matches('img') ? el : el.querySelector('img.background-asset-layer')) as HTMLImageElement | null;
    if (img?.naturalWidth) return { w: img.naturalWidth, h: img.naturalHeight };
    const video = el.matches('video') ? (el as HTMLVideoElement) : null;
    if (video?.videoWidth) return { w: video.videoWidth, h: video.videoHeight };
    return null;
  }

  /** Where a picture of natural size n sits inside a box of size b under an object-fit mode, box-local. */
  private fitRect(b: { w: number; h: number }, n: { w: number; h: number } | null, fit: string) {
    if (!n || fit === 'fill') return { left: 0, top: 0, width: b.w, height: b.h };
    const k = fit === 'none' ? 1
      : fit === 'contain' || fit === 'scale-down' ? Math.min(b.w / n.w, b.h / n.h, fit === 'scale-down' ? 1 : Infinity)
      : Math.max(b.w / n.w, b.h / n.h);
    const width = n.w * k, height = n.h * k;
    return { left: (b.w - width) / 2, top: (b.h - height) / 2, width, height };
  }

  private fitMode(assetId: string): string {
    const staged = this.game.dungeonSystem.assets.value.find((a) => a.id === assetId) as any;
    return staged?.fit_mode ?? 'fill';
  }

  /**
   * The reference picture as drawn now, in viewport pixels: the staged reference asset's element with its
   * object-fit applied, or the scene view when the reference isn't on stage.
   */
  private pictureRect(layout: Layout): { left: number; top: number; width: number; height: number } | null {
    void this.viewTick.value;
    const ref = layout.reference_asset ? this.assetElement(layout.reference_asset) : null;
    if (ref) {
      const r = ref.getBoundingClientRect();
      const f = this.fitRect({ w: r.width, h: r.height }, this.naturalSize(ref), this.fitMode(layout.reference_asset!));
      return { left: r.left + f.left, top: r.top + f.top, width: f.width, height: f.height };
    }
    const view = this.viewElement()?.getBoundingClientRect();
    return view ? { left: view.left, top: view.top, width: view.width, height: view.height } : null;
  }

  public pointClient(layout: Layout, point: LayoutPoint): { x: number; y: number; size: number } | null {
    const pic = this.pictureRect(layout);
    if (!pic) return null;
    return {
      x: pic.left + ((point.x ?? 0) / 100) * pic.width,
      y: pic.top + ((point.y ?? 0) / 100) * pic.height,
      size: (MARKER_SIZE_PCT / 100) * pic.width,
    };
  }

  /** Every point of the layout in force, with where it is on screen and the choice bound to it on the menu up now. */
  public getScenePoints(): ScenePointInfo[] {
    const layout = this.activeLayout.value;
    if (!layout) return [];
    const bound = new Map(this.pointChoices.value.map((c) => [String(c.params.point), c]));
    const shown = this.markersShown.value;
    return (layout.points || []).flatMap((p) => {
      const at = this.pointClient(layout, p);
      if (!at) return [];
      return [{
        id: p.id, layout: layout.id, x: at.x, y: at.y, size: at.size,
        character: p.character || null,
        choice: shown ? bound.get(p.id) ?? null : null,
      }];
    });
  }

  /**
   * A staged actor's on-screen box (the character's 1:1 doll frame), viewport pixels; null when not on stage.
   * `hidden` while the body is staged but not shown: a hide_actors layout's fade, a plate that hides actors.
   */
  public getActorRect(characterId: string): { left: number; top: number; width: number; height: number; mirrored: boolean; hidden: boolean } | null {
    const el = document.querySelector(`.character-slot[data-char-id="${CSS.escape(characterId)}"] .character-doll, .character-slot[data-char-id="${CSS.escape(characterId)}"] .character-doll-spine`);
    const r = el?.getBoundingClientRect();
    if (!r || !r.width) return null;
    const slot = this.game.dungeonSystem.sceneSlots.value.find((s) => s.char === characterId && !s.isRemoving);
    const hidden = this.hideActors.value || this.game.dungeonSystem.areActorsHidden();
    return { left: r.left, top: r.top, width: r.width, height: r.height, mirrored: !!(slot as any)?.mirror, hidden };
  }

  // ── zoom ──

  private frameIds(layout: Layout): string[] {
    const staged = new Set(this.game.dungeonSystem.assets.value.filter((a) => !a.isRemoving).map((a) => a.id));
    return [layout.reference_asset, ...(layout.frame_assets || [])].filter((id): id is string => !!id && staged.has(id));
  }

  private tweenSeconds(): number {
    return Global.getInstance().reducedEffects ? 0 : ZOOM_SECONDS;
  }

  /** Zoom the layout's frame toward one of its points (the point lands on the layout's aim). */
  public zoomTo(pointId: string): boolean {
    const st = this.state;
    const layout = this.activeLayout.value;
    const point = this.findPoint(layout, pointId);
    if (!st || !layout || !point) return false;
    const scale = point.zoom ?? layout.zoom ?? 2;
    if (!(scale > 1)) return false;
    const view = this.viewElement()?.getBoundingClientRect();
    const refId = layout.reference_asset;
    const frames = this.frameIds(layout);
    if (!view || !frames.length) return false;

    // The point in the scene view as it sits with no transform: the reference picture's fit, unmoved.
    const W = view.width, H = view.height;
    const refEl = refId ? this.assetElement(refId) : null;
    const fit = refId ? this.fitRect({ w: W, h: H }, refEl ? this.naturalSize(refEl) : null, this.fitMode(refId)) : { left: 0, top: 0, width: W, height: H };
    const px = fit.left + ((point.x ?? 0) / 100) * fit.width;
    const py = fit.top + ((point.y ?? 0) / 100) * fit.height;

    // translate(x%, y%) scale(S) about the centre: p' = c + (x/100·W, y/100·H) + S·(p − c). Solve for the aim,
    // clamped so a filling picture still covers the view edge to edge.
    const reach = (scale - 1) * 50;
    const clamp = (v: number) => Math.round(Math.max(-reach, Math.min(reach, v)) * 10) / 10;
    const x = clamp((((layout.aim_x ?? 50) / 100) * W - W / 2 - scale * (px - W / 2)) / W * 100);
    const y = clamp((((layout.aim_y ?? 45) / 100) * H - H / 2 - scale * (py - H / 2)) / H * 100);

    const restore = st.zoomed ? st.restore : Object.fromEntries(frames.map((id) => {
      const a = this.game.dungeonSystem.assets.value.find((s) => s.id === id) as any;
      return [id, { scale: a?.scale ?? 1, x: a?.x ?? 0, y: a?.y ?? 0 }];
    }));
    const tween = this.tweenSeconds();
    for (const id of frames) this.game.dungeonSystem.addAssets({ id, scale, x, y, tween } as any);
    this.game.coreSystem.setState('inspect', { ...st, zoomed: pointId, restore });
    return true;
  }

  /** Ease the frame back to where it was before the zoom. The markers wait for it to settle. */
  public zoomOut(): void {
    const st = this.state;
    if (!st?.zoomed) return;
    const tween = this.tweenSeconds();
    for (const [id, was] of Object.entries(st.restore || {})) {
      if (this.game.dungeonSystem.assets.value.some((a) => a.id === id && !a.isRemoving)) {
        this.game.dungeonSystem.addAssets({ id, ...was, tween } as any);
      }
    }
    this.game.coreSystem.setState('inspect', { ...st, zoomed: null, restore: {} });
    if (tween > 0) {
      this.settling.value = true;
      clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(() => { this.settling.value = false; }, tween * 1000);
    }
  }

  /** {inspect: "layout"} switches a layout on (and, coming back to its menu, zooms back out); false switches it off. */
  public inspect(value: unknown): void {
    if (value === false || value === 'false' || value === null || value === '') {
      this.zoomOut();
      this.game.coreSystem.setState('inspect', null);
      return;
    }
    const id = String(value);
    if (!this.getLayout(id)) {
      reportDevProblem('action', `{inspect}: no scene point layout "${id}"`);
      console.error(`[inspect] no scene point layout "${id}"`);
      return;
    }
    const st = this.state;
    if (st?.layout === id) {
      this.zoomOut();
      return;
    }
    if (st?.zoomed) this.zoomOut();
    this.game.coreSystem.setState('inspect', { layout: id, zoomed: null, restore: {} });
  }

  /** The scene ended: its assets are gone, so is any zoom and the layout. */
  public reset(): void {
    clearTimeout(this.settleTimer);
    this.settling.value = false;
    if (this.state) this.game.coreSystem.setState('inspect', null);
  }
}
