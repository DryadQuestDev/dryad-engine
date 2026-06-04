<script setup lang="ts">
defineProps<{
    html: string;
    context?: Record<string, any>;
}>();
</script>

<template>
    <div class="popup-inner">
        <div v-script="{ html, context }" class="popup-body"></div>
    </div>
</template>
