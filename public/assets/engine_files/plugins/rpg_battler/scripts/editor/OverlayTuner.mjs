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

    const viewName = computed(() => side.value === 'player' ? 'back' : undefined);

    // Dev-tuned overlay offsets (battle_overlay_x/y_offset, in cqh of slot height).
    // The EditorCharacterPreview slot positions its #overlay relative to the slot
    // (mirroring CharacterSlot) from these — the tuner no longer computes geometry.
    const overlayDx = computed(() => localItem.value.traits?.battle_overlay_x_offset || 0);
    const overlayDy = computed(() => localItem.value.traits?.battle_overlay_y_offset || 0);

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
      // Both X and Y offsets are in cqh (% of slot height) — the slot = the
      // preview here, matching the in-game model. Compute totals from drag-start
      // (no per-frame accumulation drift).
      const totalDx = ((e.clientX - dragStartClientX.value) / rect.height) * 100;
      const totalDy = ((e.clientY - dragStartClientY.value) / rect.height) * 100;
      updateTrait('battle_overlay_x_offset', dragStartOverlayDx.value + totalDx);
      updateTrait('battle_overlay_y_offset', dragStartOverlayDy.value + totalDy);
    }

    function onMouseUp() {
      isDragging.value = false;
    }

    return {
      localItem, side, viewName,
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

      <div class="tuner-preview">
        <div class="tuner-slot" ref="artWrapperRef">
          <EditorCharacterPreview
            :character="localItem" :coreCharacter="coreItem" :view="viewName"
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
