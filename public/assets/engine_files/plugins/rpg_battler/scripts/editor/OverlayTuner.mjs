// @ts-ignore — editor globals not typed
const { ref, computed, watch, defineComponent } = window.__editorVue;
// @ts-ignore
const { EditorCharacterPreview } = window.__editorUtils;

export default defineComponent({
  components: { EditorCharacterPreview },
  props: ['item', 'coreItem', 'schema', 'subtabId'],
  emits: ['update:item'],
  setup(props, { emit }) {
    const localItem = ref(props.item);
    const side = ref('enemy');
    const artWrapperRef = ref(null);
    const isDragging = ref(false);
    // Drag-start anchors so each frame computes the new value from the original
    // mouse-down position rather than accumulating per-frame deltas. Accumulating
    // would drift: every tick rounds to 0.1 and bias-rounds the next read, so
    // the overlay creeps ahead of the mouse over a slow drag.
    const dragStartClientX = ref(0);
    const dragStartClientY = ref(0);
    const dragStartOverlayDx = ref(0);
    const dragStartOverlayDy = ref(0);

    watch(() => props.item, (v) => { localItem.value = v; }, { deep: true });

    // Trait helper with coreItem fallback
    function trait(key, fallback) {
      return localItem.value.traits?.[key] ?? props.coreItem?.traits?.[key] ?? fallback;
    }

    const viewName = computed(() => side.value === 'player' ? 'back' : undefined);

    // Spine characters: EditorCharacterPreview already applies the *spine entry*'s
    // art_dx/art_dy/art_scale internally via the spine renderer (per-asset offsets,
    // post-refactor). Adding the character traits' art_* on the outer wrapper here
    // would double-shift them — the front-view body lands twice as far left as in
    // the actual battle slot, which is exactly the misalignment the dev sees.
    //
    // Static characters: the preview just renders <img>s with no transform, so the
    // outer wrapper is the right (only) place to apply traits.art_*.
    const isSpineForActiveView = computed(() => {
      const spine = localItem.value?.spine;
      if (!Array.isArray(spine)) return false;
      const target = viewName.value;
      return spine.some((s) => {
        const a = !s?.view || s.view === '_default' ? '_default' : s.view;
        const b = !target || target === '_default' ? '_default' : target;
        return a === b;
      });
    });

    const artDx = computed(() => isSpineForActiveView.value ? 0 : trait('art_dx', 0));
    const artDy = computed(() => isSpineForActiveView.value ? 0 : trait('art_dy', 0));
    const artScale = computed(() => isSpineForActiveView.value ? 1 : trait('art_scale', 1));
    // `translate(t) scale(s)` — translate runs in screen coords AFTER scale, so the
    // visible offset stays slot-relative (cqh) regardless of art_scale. Matches
    // CharacterSlot's wrapper composition so the tuner agrees with the battle slot.
    const artTransform = computed(() =>
      `translate(${artDx.value}cqh, ${artDy.value}cqh) scale(${artScale.value})`
    );

    // Overlay offsets (battle_overlay_x/y_offset, in cqh of slot height — the
    // tuner's preview-height is the slot stand-in, so cqh ≈ % of preview-height).
    const overlayDx = computed(() => localItem.value.traits?.battle_overlay_x_offset || 0);
    const overlayDy = computed(() => localItem.value.traits?.battle_overlay_y_offset || 0);

    // Resolve the body's per-view art_dx/dy so the overlay rect tracks the body
    // automatically — same model as CharacterSlot's overlay wrapper. cqh on the
    // overlay rect resolves against .tuner-preview (container-type:size).
    function findSpineEntryForView(spineArr, view) {
      if (!Array.isArray(spineArr)) return null;
      return spineArr.find((s) => {
        const a = !s?.view || s.view === '_default' ? '_default' : s.view;
        const b = !view || view === '_default' ? '_default' : view;
        return a === b;
      }) || null;
    }
    const bodyArtDx = computed(() => {
      if (isSpineForActiveView.value) {
        const entry = findSpineEntryForView(localItem.value?.spine, viewName.value)
          || findSpineEntryForView(props.coreItem?.spine, viewName.value);
        return typeof entry?.art_dx === 'number' ? entry.art_dx : 0;
      }
      return trait('art_dx', 0);
    });
    const bodyArtDy = computed(() => {
      if (isSpineForActiveView.value) {
        const entry = findSpineEntryForView(localItem.value?.spine, viewName.value)
          || findSpineEntryForView(props.coreItem?.spine, viewName.value);
        return typeof entry?.art_dy === 'number' ? entry.art_dy : 0;
      }
      return trait('art_dy', 0);
    });

    // Mirror the in-game effective overlay scale (Follow-up 13) so the rect
    // visually matches what the dev will see in battle. Player-side simulates
    // an inactive player slot (slot.scale=0.39, overlayScale=2 → 0.78); enemy-
    // side simulates an enemy slot (slot.scale=0.20, overlayScale=4 → 0.80).
    // Body in the preview stays at full size (preview is at "scale=1") — only
    // the rect is scaled to match its in-game visual size. transform-origin is
    // set to top-center via CSS so the rect grows downward from its anchor,
    // matching .character-slot-overlay-wrapper's convention.
    const effectiveOverlayScale = computed(() =>
      side.value === 'enemy' ? 0.80 : 0.78
    );

    // Position overlay rect at body-top (= 25% of preview-height since the
    // preview's body sits in `.tuner-art-wrapper` which is `bottom:0; height:75%`)
    // plus the dev-tuned offset, with bodyArtDx/dy auto-tracking the body. cqh
    // resolves against the preview (size container), matching the in-game model
    // where cqh on CharacterSlot's overlay-wrapper resolves against the slot.
    // The rect's scale is purely visual; drag math operates on the anchor.
    //
    // Vertical nudge: the editor's placeholder rect anchors to body-top, but the
    // visible game overlay's name text sits below the anchor by an amount that
    // scales with `effectiveOverlayScale`. The 10cqh was calibrated at enemy
    // side (effectiveOverlayScale = 0.80). Express it as a constant in overlay-
    // local coords (= 10 / 0.80 = 12.5) and re-scale per active side, so back
    // (player, 0.78) gets a proportionally smaller nudge — matches body for both
    // views consistently.
    const NUDGE_OVERLAY_LOCAL = 12.5;
    const overlayStyle = computed(() => ({
      left: `calc(50% + ${bodyArtDx.value}cqh + ${overlayDx.value}cqh)`,
      top: `calc(25% + ${NUDGE_OVERLAY_LOCAL * effectiveOverlayScale.value}cqh + ${bodyArtDy.value}cqh + ${overlayDy.value}cqh)`,
      transform: `translateX(-50%) scale(${effectiveOverlayScale.value})`,
    }));

    function updateTrait(key, value) {
      if (!localItem.value.traits) localItem.value.traits = {};
      localItem.value.traits[key] = Math.round(value * 10) / 10;
      emit('update:item', localItem.value);
    }

    function onOverlayMouseDown(e) {
      isDragging.value = true;
      dragStartClientX.value = e.clientX;
      dragStartClientY.value = e.clientY;
      dragStartOverlayDx.value = overlayDx.value;
      dragStartOverlayDy.value = overlayDy.value;
      e.preventDefault();
      e.stopPropagation();
    }

    function onMouseMove(e) {
      if (!isDragging.value || !artWrapperRef.value) return;
      const rect = artWrapperRef.value.getBoundingClientRect();
      if (rect.height === 0) return;
      // Both X and Y offsets are in cqh (% of preview-height) — matches the
      // overlayStyle's cqh terms and the in-game model (cqh of slot-height).
      // Compute totals from drag-start (no per-frame accumulation drift).
      const totalDx = ((e.clientX - dragStartClientX.value) / rect.height) * 100;
      const totalDy = ((e.clientY - dragStartClientY.value) / rect.height) * 100;
      updateTrait('battle_overlay_x_offset', dragStartOverlayDx.value + totalDx);
      updateTrait('battle_overlay_y_offset', dragStartOverlayDy.value + totalDy);
    }

    function onMouseUp() {
      isDragging.value = false;
    }

    return {
      localItem, side, viewName, artTransform, overlayStyle,
      overlayDx, overlayDy, artWrapperRef, isDragging,
      onOverlayMouseDown, onMouseMove, onMouseUp, updateTrait,
    };
  },
  template: /*html*/ `
    <div class="overlay-tuner" @mousemove="onMouseMove" @mouseup="onMouseUp" @mouseleave="onMouseUp">
      <div class="tuner-controls">
        <button class="tuner-toggle" @click="side = side === 'enemy' ? 'player' : 'enemy'">
          {{ side === 'enemy' ? 'Enemy (front)' : 'Player (back)' }}
        </button>
        <span class="tuner-values">
          X: {{ overlayDx.toFixed(1) }}% &nbsp; Y: {{ overlayDy.toFixed(1) }}%
        </span>
        <button class="tuner-reset" @click="updateTrait('battle_overlay_x_offset', 0); updateTrait('battle_overlay_y_offset', 0)">Reset</button>
      </div>

      <div class="tuner-preview" ref="artWrapperRef">
        <div class="tuner-art-wrapper">
          <div class="tuner-art" :style="{ transform: artTransform, transformOrigin: 'center center' }">
            <EditorCharacterPreview
              :character="localItem" :coreCharacter="coreItem"
              :view="viewName" />
          </div>
        </div>
        <div class="tuner-overlay-rect" :style="overlayStyle"
          @mousedown="onOverlayMouseDown" :class="{ 'is-dragging': isDragging }">
          <div class="tuner-overlay-label">OVERLAY</div>
        </div>
      </div>
    </div>
  `,
});
