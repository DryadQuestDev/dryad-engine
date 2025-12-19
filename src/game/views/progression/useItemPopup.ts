import { ref, computed, watch, provide } from 'vue';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue';
import { Game } from '../../game';
import { Item } from '../../core/character/item';

// Injection keys for provide/inject
export const STICKY_ITEM_UID_KEY = Symbol('stickyItemUid');
export const HOVER_ITEM_UID_KEY = Symbol('hoverItemUid');

/**
 * Composable for managing item popup state and positioning
 * @param items - Function that returns the items array to search in
 * @param clearOnItemsChange - Whether to clear popup state when items array changes (true for equipped items, false for shared inventory)
 */
export function useItemPopup(
  items: () => Item[],
  clearOnItemsChange: boolean = false
) {
  const game = Game.getInstance();

  // Internal sticky state (replaces itemSystem.stickyItemUid / stickyEquippedItemUid)
  const stickyItemUid = ref<string | null>(null);

  // Global hover state (shared across all components for highlighting purposes)
  const hoverItemUid = ref<string | null>(null);

  // Provide these to child components (ItemSlot)
  provide(STICKY_ITEM_UID_KEY, stickyItemUid);
  provide(HOVER_ITEM_UID_KEY, hoverItemUid);

  // Popup state
  const hoveredItemSlotRef = ref<HTMLElement | null>(null);
  const popupContainerRef = ref<HTMLElement | null>(null);
  const currentHoveredItem = ref<Item | null>(null);
  const isHoveringPopup = ref(false);
  let clearHoverTimeout: ReturnType<typeof setTimeout> | null = null;

  // Floating UI instance
  const { floatingStyles } = useFloating(hoveredItemSlotRef, popupContainerRef, {
    placement: 'left-start',
    strategy: 'fixed',
    middleware: [
      offset(-4),  // Negative offset brings popup closer (overlaps by 4px)
      flip({ padding: 8 }),
      shift({ padding: 8 })
    ],
    whileElementsMounted: autoUpdate
  });

  // Get the sticky item (if any)
  const stickyItem = computed(() => {
    const stickyUid = stickyItemUid.value;
    if (stickyUid) {
      return items().find(item => item.uid === stickyUid) || null;
    }
    return null;
  });

  // The item to show popup for (sticky item takes precedence over hovered item)
  const displayedItem = computed(() => {
    return stickyItem.value || currentHoveredItem.value;
  });

  // Get item choices
  const itemChoices = computed(() => {
    if (!displayedItem.value) return [];
    return game.characterSystem.selectedCharacter.value?.getItemChoices(displayedItem.value) || [];
  });

  const hasChoices = computed(() => itemChoices.value.length > 0);

  // Computed to determine if popup should be shown
  const showPopup = computed(() => {
    if (!displayedItem.value) return false;
    // Don't show if we don't have a valid reference element (prevents flicker at 0,0)
    if (!hoveredItemSlotRef.value) return false;
    // Don't show if another item of the same type is sticky (only check if we have a hovered item)
    if (currentHoveredItem.value && isAnotherItemSticky.value) return false;
    return true;
  });

  // Computed to check if another item is sticky
  const isAnotherItemSticky = computed(() => {
    const hovered = currentHoveredItem.value;
    if (!hovered) return false;
    return stickyItemUid.value !== null && stickyItemUid.value !== hovered.uid;
  });

  // Watch for changes to the items array
  // Clear popup state when items change if clearOnItemsChange is true
  if (clearOnItemsChange) {
    watch(items, () => {
      // Clear any pending timeout
      if (clearHoverTimeout !== null) {
        clearTimeout(clearHoverTimeout);
        clearHoverTimeout = null;
      }

      stickyItemUid.value = null;
      hoverItemUid.value = null;
      currentHoveredItem.value = null;
      isHoveringPopup.value = false;
      hoveredItemSlotRef.value = null;
    });
  }

  // Handle when an item slot reports hover
  function handleItemHover(item: Item | null, slotElement: HTMLElement | null) {
    // If an item is being set (not cleared)
    if (item && slotElement) {
      // Cancel any pending clear timeout
      if (clearHoverTimeout !== null) {
        clearTimeout(clearHoverTimeout);
        clearHoverTimeout = null;
      }

      const otherItemIsSticky = stickyItemUid.value !== null && stickyItemUid.value !== item.uid;

      if (otherItemIsSticky) {
        // Don't change the current hover/popup - keep showing the sticky item
        return;
      }

      // Set this item as the globally hovered item
      hoverItemUid.value = item.uid;
      currentHoveredItem.value = item;
      hoveredItemSlotRef.value = slotElement;
    } else {
      // Clearing hover - use a delay to allow time to move to popup
      if (currentHoveredItem.value) {
        // Cancel any existing timeout
        if (clearHoverTimeout !== null) {
          clearTimeout(clearHoverTimeout);
        }

        // Only clear if NOT hovering the popup AND no sticky item
        clearHoverTimeout = setTimeout(() => {
          if (!isHoveringPopup.value && !stickyItem.value) {
            if (hoverItemUid.value === currentHoveredItem.value?.uid) {
              hoverItemUid.value = null;
            }
            currentHoveredItem.value = null;
            hoveredItemSlotRef.value = null;
          }
          clearHoverTimeout = null;
        }, 100); // 100ms delay gives time to move to popup
      }
    }
  }

  function handlePopupEnter() {
    // Cancel any pending clear timeout when entering popup
    if (clearHoverTimeout !== null) {
      clearTimeout(clearHoverTimeout);
      clearHoverTimeout = null;
    }

    isHoveringPopup.value = true;
    // Keep the current item as globally hovered
    if (displayedItem.value) {
      hoverItemUid.value = displayedItem.value.uid;
    }
  }

  function handlePopupLeave() {
    isHoveringPopup.value = false;
    // Clear hover state when leaving popup (unless there's a sticky item)
    if (!stickyItem.value && currentHoveredItem.value) {
      // Clear global hover
      if (hoverItemUid.value === currentHoveredItem.value.uid) {
        hoverItemUid.value = null;
      }
      currentHoveredItem.value = null;
      hoveredItemSlotRef.value = null;
    }
  }

  return {
    // Refs for positioning
    popupContainerRef,
    floatingStyles,

    // State
    displayedItem,
    itemChoices,
    hasChoices,
    showPopup,

    // Event handlers
    handleItemHover,
    handlePopupEnter,
    handlePopupLeave,
  };
}
