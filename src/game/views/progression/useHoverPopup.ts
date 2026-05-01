import { ref, watch } from 'vue';
import type { Ref } from 'vue';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue';
import type { Placement } from '@floating-ui/vue';
import { getStack as getLoreStack, loreAnchorIsInside } from '../lore/lorePopupStore';

/**
 * Composable for a hover-triggered floating popup that:
 *  - shows on a trigger's mouseenter, hides 100ms after mouseleave (so cursor can transition into the popup)
 *  - stays alive while a lore popup is anchored inside it (so nested lore can be reached)
 *  - re-evaluates close when the lore stack drains
 *
 * Each call site is responsible for the popup template/content. This composable owns the lifecycle.
 *
 * Usage:
 *   const popup = useHoverPopup<MyData>({ placement: 'left-start' });
 *   // trigger:  @mouseenter="(e) => popup.show(data, e.currentTarget)" @mouseleave="popup.scheduleHide"
 *   // popup:    <div v-if="popup.hovered" :ref="popup.popupRef" :style="popup.floatingStyles"
 *   //               @mouseenter="popup.onPopupEnter" @mouseleave="popup.onPopupLeave"> ... </div>
 */
export function useHoverPopup<T>(options: {
    placement?: Placement;
    offset?: number;
    hideDelay?: number;
} = {}) {
    const hovered = ref<T | null>(null) as Ref<T | null>;
    const referenceRef = ref<HTMLElement | null>(null);
    const popupRef = ref<HTMLElement | null>(null);
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const { floatingStyles } = useFloating(referenceRef, popupRef, {
        placement: options.placement ?? 'left-start',
        strategy: 'fixed',
        middleware: [
            offset(options.offset ?? 10),
            flip({ padding: 8 }),
            shift({ padding: 8 }),
        ],
        whileElementsMounted: autoUpdate,
    });

    function show(entity: T, anchor: HTMLElement) {
        if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null; }
        hovered.value = entity;
        referenceRef.value = anchor;
    }

    function close() {
        hovered.value = null;
        referenceRef.value = null;
        if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null; }
    }

    function scheduleHide() {
        if (hideTimer !== null) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            hovered.value = null;
            referenceRef.value = null;
            hideTimer = null;
        }, options.hideDelay ?? 100);
    }

    function onPopupEnter() {
        if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null; }
    }

    function onPopupLeave() {
        if (loreAnchorIsInside(popupRef.value)) return;
        close();
    }

    // When the lore stack drains, close this popup if cursor isn't on it.
    watch(() => getLoreStack().value.length, (n) => {
        if (n > 0) return;
        if (hovered.value && popupRef.value && !popupRef.value.matches(':hover')) close();
    });

    return {
        hovered,
        referenceRef,
        popupRef,
        floatingStyles,
        show,
        scheduleHide,
        close,
        onPopupEnter,
        onPopupLeave,
    };
}
