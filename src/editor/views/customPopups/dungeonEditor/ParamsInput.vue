<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { AssistMode } from '../../../../utility/dungeonEditor/assist';
import { useContentAssist } from './useContentAssist';

/**
 * The `{params}` field.
 *
 * A textarea purely so a long value soft-wraps instead of scrolling out of
 * sight — the stored value is still ONE line, and must stay that way:
 * `parseText` splits the document on newlines before it matches `/\{.*\}/`,
 * so a params object broken across two lines stops being params, and the
 * half below it lands as prose (on a `~`/`#`/row line that also shifts every
 * id beneath it). Any newline that arrives is therefore folded to a space
 * rather than kept.
 *
 * The author's params run to 170 characters at the top end — mostly one long
 * `if:` condition list rather than many keys — which is why wrapping, not
 * one-key-per-line, is what makes them readable in a narrow column.
 */
const props = defineProps<{
  modelValue?: string;
  placeholder?: string;
  /** Completion and hover for these params, read as this kind; none without. */
  assist?: AssistMode;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const fieldRef = ref<any>(null);

function nativeEl(): HTMLTextAreaElement | null {
  const el = fieldRef.value?.$el ?? fieldRef.value;
  return el instanceof HTMLTextAreaElement ? el : null;
}

useContentAssist(computed(() => nativeEl()), () => props.assist);

/**
 * Grow to fit the wrapped text.
 *
 * Not PrimeVue's own `auto-resize`: that sets `height = scrollHeight`, which
 * lands 2px short under `box-sizing: border-box` (the borders it just enclosed
 * are inside that height), so the last line sits clipped behind a scrollbar.
 * Hence the `offsetHeight - clientHeight` border correction.
 */
// Sized by CSS where the browser can (the desktop app can). The JS fallback reads the height back
// after setting it, a forced layout per field: on a big dungeon that froze a switch for seconds.
const sizedByCss = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');

function grow() {
  if (sizedByCss) return;
  const el = nativeEl();
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + (el.offsetHeight - el.clientHeight) + 'px';
}

onMounted(() => nextTick(grow));
// Covers an external change (undo, POV convert, a lint fix) and a card that
// was measured while its lazy-mounted block was still off screen at 0 height.
watch(() => props.modelValue, () => nextTick(grow));

// Paste is the realistic way a newline gets in (copying a line out of the Raw
// view brings its ending along); Enter is intercepted below so the caret
// never sees a break at all.
function onUpdate(value: string | undefined) {
  emit('update:modelValue', (value ?? '').replace(/[\r\n]+/g, ' '));
  nextTick(grow);
}

function onEnter(e: KeyboardEvent) {
  (e.target as HTMLTextAreaElement).blur();
}
</script>

<template>
  <!-- A plain textarea in PrimeVue's dress: a big dungeon mounts hundreds of these, and the
       PrimeVue component cost ten times as much to create (its CSS is loaded by the editor). -->
  <textarea ref="fieldRef" class="p-textarea p-component" :value="props.modelValue ?? ''"
    @input="onUpdate(($event.target as HTMLTextAreaElement).value)"
    :placeholder="props.placeholder ?? '{params}'" rows="1" spellcheck="false"
    @focus="grow" @keydown.enter.prevent="onEnter" />
</template>

<style scoped>
textarea {
  /* The box sizes itself; a manual drag would leave a height the row never
     gets back. `overflow-y: hidden` keeps a scrollbar from flashing in
     during the grow. */
  resize: none;
  overflow: hidden;
  field-sizing: content;
}
</style>
