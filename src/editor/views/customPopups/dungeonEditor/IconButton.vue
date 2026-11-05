<script setup lang="ts">
/**
 * The cards' round icon buttons (move, remove, layout). Looks like PrimeVue's text rounded icon
 * Button and reads its theme tokens, but costs a plain <button>: a big dungeon mounts thousands,
 * and as PrimeVue Buttons they took a second of every switch.
 */
defineProps<{
  icon: string;
  severity?: 'secondary' | 'danger' | 'success';
  size?: 'small';
  disabled?: boolean;
  /** The accessible name: the button shows only an icon. */
  label?: string;
  title?: string;
}>();
</script>

<template>
  <button type="button" class="icon-btn" :class="[`icon-btn--${severity ?? 'secondary'}`, { 'icon-btn--small': size === 'small' }]"
    :disabled="disabled" :aria-label="label" :title="title">
    <i :class="icon" aria-hidden="true" />
  </button>
</template>

<style>
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: var(--p-button-icon-only-width, 2.5rem);
  height: var(--p-button-icon-only-width, 2.5rem);
  padding: 0;
  border: 1px solid transparent;
  border-radius: 50%;
  background: transparent;
  color: var(--icon-btn-color);
  font-size: 1rem;
  cursor: pointer;
  transition: background var(--p-button-transition-duration, 0.2s), color var(--p-button-transition-duration, 0.2s);
}

.icon-btn--small {
  width: 2rem;
  height: 2rem;
  font-size: var(--p-button-sm-font-size, 0.875rem);
}

.icon-btn .pi {
  font-size: inherit;
}

.icon-btn--secondary {
  --icon-btn-color: var(--p-button-text-secondary-color);
  --icon-btn-hover: var(--p-button-text-secondary-hover-background);
}

.icon-btn--danger {
  --icon-btn-color: var(--p-button-text-danger-color);
  --icon-btn-hover: var(--p-button-text-danger-hover-background);
}

.icon-btn--success {
  --icon-btn-color: var(--p-button-text-success-color);
  --icon-btn-hover: var(--p-button-text-success-hover-background);
}

.icon-btn:not(:disabled):hover {
  background: var(--icon-btn-hover);
}

.icon-btn:focus-visible {
  outline: var(--p-button-focus-ring-width, 1px) solid var(--p-focus-ring-color);
  outline-offset: 2px;
}

.icon-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
