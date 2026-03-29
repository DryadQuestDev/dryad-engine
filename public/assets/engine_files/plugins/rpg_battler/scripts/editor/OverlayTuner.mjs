const { ref, computed, watch, defineComponent } = window.__editorVue;
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

    watch(() => props.item, (v) => { localItem.value = v; }, { deep: true });

    // Trait helper with coreItem fallback
    function trait(key, fallback) {
      return localItem.value.traits?.[key] ?? props.coreItem?.traits?.[key] ?? fallback;
    }

    const viewName = computed(() => side.value === 'player' ? 'back' : undefined);

    // Art offset (only for default/enemy view)
    const artDx = computed(() => side.value === 'enemy' ? trait('art_dx', 0) : 0);
    const artDy = computed(() => side.value === 'enemy' ? trait('art_dy', 0) : 0);
    const artScale = computed(() => side.value === 'enemy' ? trait('art_scale', 1) : 1);
    const artTransform = computed(() =>
      `scale(${artScale.value}) translate(${artDx.value}%, ${artDy.value}%)`
    );

    // Global overlay offsets (must match RpgBattleScreen constants)
    const OVERLAY_X_OFFSET = -1;
    const OVERLAY_Y_OFFSET = -3;

    // Overlay offsets
    const overlayDx = computed(() => localItem.value.traits?.battle_overlay_x_offset || 0);
    const overlayDy = computed(() => localItem.value.traits?.battle_overlay_y_offset || 0);

    const overlayStyle = computed(() => ({
      left: `calc(50% + ${OVERLAY_X_OFFSET + overlayDx.value}%)`,
      top: `${OVERLAY_Y_OFFSET + overlayDy.value}%`,
    }));

    function updateTrait(key, value) {
      if (!localItem.value.traits) localItem.value.traits = {};
      localItem.value.traits[key] = Math.round(value * 10) / 10;
      emit('update:item', localItem.value);
    }

    function onOverlayMouseDown(e) {
      isDragging.value = true;
      e.preventDefault();
      e.stopPropagation();
    }

    function onMouseMove(e) {
      if (!isDragging.value || !artWrapperRef.value) return;
      const rect = artWrapperRef.value.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dx = (e.movementX / rect.width) * 100;
      const dy = (e.movementY / rect.height) * 100;
      updateTrait('battle_overlay_x_offset', overlayDx.value + dx);
      updateTrait('battle_overlay_y_offset', overlayDy.value + dy);
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

      <div class="tuner-preview">
        <div class="tuner-art-wrapper" ref="artWrapperRef">
          <div class="tuner-art" :style="{ transform: artTransform, transformOrigin: 'center center' }">
            <EditorCharacterPreview
              :character="localItem" :coreCharacter="coreItem"
              :view="viewName" />
          </div>
          <div class="tuner-overlay-rect" :style="overlayStyle"
            @mousedown="onOverlayMouseDown" :class="{ 'is-dragging': isDragging }">
            <div class="tuner-overlay-label">OVERLAY</div>
          </div>
        </div>
      </div>
    </div>
  `,
});
