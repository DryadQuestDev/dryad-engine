<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { getStack, getPinned, popTop, closeAll, unpinPopup } from './popupStore';
import PopupItem from './PopupItem.vue';

const stack = getStack();
const pinned = getPinned();

function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (stack.value.length === 0) return;
    e.stopPropagation();
    popTop();
}

function onDocClick(e: MouseEvent) {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.lore-link')) return;
    const insidePopup = target.closest('.popup') as HTMLElement | null;

    // Close the transient stack if clicked entirely outside.
    if (stack.value.length > 0 && !insidePopup) closeAll();

    // Pinned popups: dismiss any whose body wasn't clicked, and whose anchor wasn't clicked either.
    if (pinned.value.length > 0) {
        const insideKey = insidePopup?.dataset.popupKey;
        for (const entry of [...pinned.value]) {
            if (insideKey === entry.key) continue;
            if (entry.anchorEl.contains(target)) continue;
            unpinPopup(entry.key);
        }
    }
}

onMounted(() => {
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onDocClick, { capture: true });
});

onUnmounted(() => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('click', onDocClick, { capture: true });
});
</script>

<template>
    <Teleport to="body">
        <PopupItem v-for="(entry, idx) in stack" :key="'t:' + idx + ':' + entry.key" :entry="entry" :depth="idx" />
        <PopupItem v-for="entry in pinned" :key="'p:' + entry.key" :entry="entry" :depth="0" />
    </Teleport>
</template>
