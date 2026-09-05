<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { getStack, getPinned, closeAll, unpinPopup } from './popupStore';
import PopupItem from './PopupItem.vue';

const stack = getStack();
const pinned = getPinned();

function onDocClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.lore-link')) return;
    const insidePopup = target.closest('.popup') as HTMLElement | null;

    // Close the transient stack if clicked entirely outside.
    if (stack.value.length > 0 && !insidePopup) closeAll();

    // Pinned popups: dismiss any whose anchor wasn't clicked. A click landing anywhere in the popup
    // layer belongs to the chain rather than counting as a click-outside — a nested card sits in its
    // own .popup under its own key, so matching the key alone would unpin the card its chain hangs
    // off. Anchors are not popups, so clicking a different slot still swaps the pin.
    if (pinned.value.length > 0 && !insidePopup) {
        for (const entry of [...pinned.value]) {
            if (entry.anchorEl.contains(target)) continue;
            unpinPopup(entry.key);
        }
    }
}

onMounted(() => {
    document.addEventListener('click', onDocClick, { capture: true });
});

onUnmounted(() => {
    document.removeEventListener('click', onDocClick, { capture: true });
});
</script>

<template>
    <Teleport to="body">
        <PopupItem v-for="(entry, idx) in stack" :key="'t:' + idx + ':' + entry.key" :entry="entry" :depth="idx" />
        <PopupItem v-for="entry in pinned" :key="'p:' + entry.key" :entry="entry" :depth="0" />
    </Teleport>
</template>
