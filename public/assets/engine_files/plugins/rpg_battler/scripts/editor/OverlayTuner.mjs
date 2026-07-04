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

    // Subtabs where the character-appearance override is nested under `.status`
    // (item/skill-slot applied-status shape) rather than at the entity top level.
    const NESTED = ['item_templates', 'skill_slots'];
    const nested = NESTED.includes(props.subtabId);
    function artRoot(base) {
      if (!base) return base;
      if (!nested) return base;
      if (!base.status) base.status = {};
      return base.status;
    }
    // Ensure the writable root exists before first render so early reads are safe.
    artRoot(localItem.value);
    const artLocal = computed(() => artRoot(localItem.value));
    const artCore = computed(() => props.coreItem ? (nested ? props.coreItem.status : props.coreItem) : undefined);

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

    watch(() => props.item, (v) => { localItem.value = v; artRoot(localItem.value); }, { deep: true });

    const viewName = computed(() => side.value === 'player' ? 'back' : undefined);

    // Dev-tuned overlay offsets (battle_overlay_x/y_offset, in cqh of slot height),
    // measured from the slot anchor. art_dx/dy already center the body's pixels on
    // the slot (Art Manager reference-line tuning), so X usually stays ~0 and Y
    // compensates character height. The EditorCharacterPreview slot positions its
    // #overlay from these (mirroring CharacterSlot) — the tuner doesn't compute geometry.
    const overlayDx = computed(() => artLocal.value.traits?.battle_overlay_x_offset || 0);
    const overlayDy = computed(() => artLocal.value.traits?.battle_overlay_y_offset || 0);

    function updateTrait(key, value) {
      const root = artRoot(localItem.value);
      if (!root.traits) root.traits = {};
      root.traits[key] = Math.round(value * 10) / 10;
      emit('update:item', localItem.value);
    }

    // Reset removes the traits entirely (not 0): absent keys keep the template
    // JSON clean and fall through to the core item in mod merges, where an
    // explicit 0 would override.
    function resetOffsets() {
      const root = artRoot(localItem.value);
      if (root.traits) {
        delete root.traits.battle_overlay_x_offset;
        delete root.traits.battle_overlay_y_offset;
      }
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
      // Both X and Y offsets are in cqh (% of slot height) — the slot = the
      // preview here, matching the in-game model. Compute totals from drag-start
      // (no per-frame accumulation drift).
      // Ctrl/Shift locks X (Y-only drag). While locked, re-anchor the X drag
      // origin each frame so releasing the key continues X from its current
      // value instead of jumping by the distance travelled while locked.
      if (e.ctrlKey || e.shiftKey) {
        dragStartClientX.value = e.clientX;
        dragStartOverlayDx.value = overlayDx.value;
      } else {
        const totalDx = ((e.clientX - dragStartClientX.value) / rect.height) * 100;
        updateTrait('battle_overlay_x_offset', dragStartOverlayDx.value + totalDx);
      }
      const totalDy = ((e.clientY - dragStartClientY.value) / rect.height) * 100;
      updateTrait('battle_overlay_y_offset', dragStartOverlayDy.value + totalDy);
    }

    function onMouseUp() {
      isDragging.value = false;
    }

    return {
      localItem, artLocal, artCore, side, viewName,
      overlayDx, overlayDy, artWrapperRef, isDragging,
      onOverlayMouseDown, onMouseMove, onMouseUp, updateTrait, resetOffsets,
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
        <button class="tuner-reset" @click="resetOffsets">Reset</button>
        <span class="tuner-hint">X auto-centers via Art Manager – tune Y for character height · hold Ctrl/Shift to lock X</span>
      </div>

      <div class="tuner-preview">
        <div class="tuner-slot" ref="artWrapperRef">
          <EditorCharacterPreview
            :character="artLocal" :coreCharacter="artCore" :view="viewName"
            :overlayOffsetX="overlayDx" :overlayOffsetY="overlayDy">
            <template #overlay>
              <div class="tuner-overlay-rect"
                @mousedown="onOverlayMouseDown" :class="{ 'is-dragging': isDragging }">
                <div class="tuner-overlay-label">OVERLAY</div>
              </div>
            </template>
          </EditorCharacterPreview>
        </div>
      </div>
    </div>
  `,
});
