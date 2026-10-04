<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount, type StyleValue } from 'vue';
import { Global } from '../../../global/global';

const props = defineProps<{
  /** Resolved HTML of the paragraph, arrow excluded. */
  content: string;
  /** Characters revealed so far, counted over text nodes in document order. Infinity = all. */
  revealedChars: number;
  /** Show the continue arrow at the reveal boundary (or the end once the text is complete). */
  showArrow: boolean;
  selectable: boolean;
  characterName: string;
  showInlineName: boolean;
  contentStyle?: StyleValue;
  nameStyle?: StyleValue;
}>();

// Name and separator in one key: the colon's shape is language-specific, and the ghost and live
// layers have to render the identical string or the two stacks measure apart. The gap after it is
// CSS, not a trailing space in the locale value, which the first editor that trims would eat.
const speakerPrefix = computed(() =>
  Global.getInstance().getString('dialogue.speaker_prefix', { character: props.characterName })
);

const ARROW = ' ➢';

// The live layer renders the full HTML exactly once per paragraph and then reveals it by moving
// characters out of hidden spans. Re-setting innerHTML with a growing prefix (the previous
// approach) recreated every element each frame, which restarted the CSS animations of text
// effects like [wave] on every typed character.
//
// Because its DOM is stable, the live layer is also the layer the player interacts with: the
// v-script delegation lives on it (`html: null` — content is written here, not by the directive)
// and the ghost underneath is inert. A lore link whose text is not fully revealed yet carries
// `.tw-pending` (pointer-events: none), so hidden text can't open a card.
const liveEl = ref<HTMLElement | null>(null);
let segments: { text: Text; hidden: HTMLElement }[] = [];
let links: { el: HTMLElement; lastSegment: number }[] = [];
let arrowEl: HTMLElement | null = null;

function renderLive() {
  const el = liveEl.value;
  if (!el) return;
  el.innerHTML = props.content;
  arrowEl = null;
  segments = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if ((node as Text).data.length > 0) textNodes.push(node as Text);
  }
  for (const text of textNodes) {
    const hidden = document.createElement('span');
    hidden.className = 'tw-hidden';
    hidden.textContent = text.data;
    text.data = '';
    text.after(hidden);
    segments.push({ text, hidden });
  }
  links = [];
  for (const link of Array.from(el.querySelectorAll<HTMLElement>('.lore-link'))) {
    let lastSegment = -1;
    segments.forEach((seg, i) => { if (link.contains(seg.text)) lastSegment = i; });
    links.push({ el: link, lastSegment });
  }
  applyReveal();
}

function applyReveal() {
  let remaining = props.revealedChars;
  let boundary: HTMLElement | null = null;
  let boundaryIndex = segments.length;
  segments.forEach((seg, i) => {
    const hiddenText = seg.hidden.textContent ?? '';
    const total = seg.text.data.length + hiddenText.length;
    const show = Math.min(total, remaining);
    remaining -= show;
    if (seg.text.data.length !== show) {
      const all = seg.text.data + hiddenText;
      seg.text.data = all.slice(0, show);
      seg.hidden.textContent = all.slice(show);
    }
    if (!boundary && show < total) {
      boundary = seg.hidden;
      boundaryIndex = i;
    }
  });
  for (const link of links) {
    link.el.classList.toggle('tw-pending', link.lastSegment >= boundaryIndex);
  }
  placeArrow(boundary);
}

function placeArrow(boundary: HTMLElement | null) {
  const el = liveEl.value;
  if (!el) return;
  if (!props.showArrow) {
    arrowEl?.remove();
    arrowEl = null;
    return;
  }
  if (!arrowEl) {
    arrowEl = document.createElement('span');
    arrowEl.className = 'tw-arrow';
    arrowEl.textContent = ARROW;
  }
  if (boundary) {
    // A boundary inside a text-effect letter span would drag the arrow into that letter's
    // animation; sit it in front of the outermost effect span instead.
    let anchor: Element = boundary;
    while (anchor.parentElement && anchor.parentElement !== el && anchor.parentElement.classList.contains('fx-char')) {
      anchor = anchor.parentElement;
    }
    if (arrowEl.nextSibling !== anchor) anchor.before(arrowEl);
  } else if (arrowEl.parentNode !== el || arrowEl.nextSibling) {
    el.append(arrowEl);
  }
}

watch(() => props.content, renderLive, { flush: 'post' });
watch(() => [props.revealedChars, props.showArrow], applyReveal, { flush: 'post' });
watch(liveEl, (el) => { if (el) renderLive(); });
onBeforeUnmount(() => { segments = []; links = []; arrowEl = null; });
</script>

<template>
  <div class="dialogue-stack" :class="{ selecting: selectable }">
    <div class="dialogue-content event-content dialogue-ghost" :style="contentStyle" aria-hidden="true">
      <span v-if="showInlineName" class="inline-character-name" :style="nameStyle">{{ speakerPrefix }}</span>
      <span v-script="{ html: content, resolver: false, disabled: true }" style="display:inline"></span><span>{{ ARROW }}</span>
    </div>

    <div class="dialogue-live is-overlay">
      <div class="dialogue-content event-content" :style="contentStyle">
        <span v-if="showInlineName" class="inline-character-name" :style="nameStyle">{{ speakerPrefix }}</span>
        <span ref="liveEl" v-script="{ html: null }" style="display:inline"></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialogue-stack {
  position: relative;
}

.dialogue-ghost {
  opacity: 0;
  pointer-events: none;
}

.dialogue-live.is-overlay {
  position: absolute;
  inset: 0;
}

/* Not-yet-typed text keeps its box so the line never reflows as it fills. */
.dialogue-live :deep(.tw-hidden) {
  visibility: hidden;
}

/* A link still (partly) hidden: its box is there for layout, but nothing to hover yet. */
.dialogue-live :deep(.lore-link.tw-pending) {
  pointer-events: none;
}

.dialogue-content {
  padding: 10px;
  line-height: 1.2em;
  font-family: var(--font-family-serif);
}

.text-dungeon-layout .dialogue-content {
  padding: 0px;
}

.inline-character-name {
  font-weight: bold;
  margin-inline-end: 0.3em;
}
</style>
