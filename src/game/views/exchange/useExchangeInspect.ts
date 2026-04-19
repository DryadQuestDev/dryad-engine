import { ref } from 'vue';

/**
 * Shared state for the Exchange overlay's Inspect mode toggle.
 *
 * Lives in its own module so the parent `OverlayExchange` can render the single
 * toggle button in its header while child `ExchangeInventory` instances (party
 * + trader) read the same value to decide whether a click should show the
 * item-info popup (Inspect on) or trigger buy/move (Inspect off).
 */
export const inspectMode = ref(false);

export function toggleInspectMode() {
  inspectMode.value = !inspectMode.value;
}
