<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { getStack, popTop, closeAll } from './lorePopupStore';
import LorePopupItem from './LorePopupItem.vue';

const stack = getStack();

function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (stack.value.length === 0) return;
    e.stopPropagation();
    popTop();
}

function onDocClick(e: MouseEvent) {
    if (stack.value.length === 0) return;
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.lore-link')) return;
    if (target.closest('.lore-popup')) return;
    closeAll();
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
        <LorePopupItem v-for="(entry, idx) in stack" :key="idx + ':' + entry.recordId" :entry="entry" :depth="idx" />
    </Teleport>
</template>
