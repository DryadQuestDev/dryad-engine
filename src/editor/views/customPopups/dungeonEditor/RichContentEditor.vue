<script setup lang="ts">
import { ref, shallowRef, nextTick, onBeforeUnmount, watch } from 'vue';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue';
import { useStorage, watchDebounced } from '@vueuse/core';
import Quill from 'quill';
import { dungeonSearchQuery, dungeonStructuredHighlight } from './searchState';
import { useLazyMount } from './useLazyMount';

const curlyQuoteSettings = useStorage<{ autoCurlyQuotes?: boolean }>('dungeonEditor_settings', {});

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const hostRef = ref<HTMLElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);
const floatingRef = ref<HTMLElement | null>(null);
const showToolbar = ref(false);
const virtualRef = shallowRef<{ getBoundingClientRect: () => DOMRect } | null>(null);
const isRawMode = ref(false);

const { isActive, activate } = useLazyMount(hostRef);

function onRawInput(e: Event) {
  const target = e.target as HTMLTextAreaElement;
  emit('update:modelValue', target.value);
}

let quill: Quill | null = null;
let suppressChange = false;

const HIGHLIGHT_COLORS = ['yellow', 'pink', 'orange', 'green', 'blue', 'purple'] as const;
type HighlightColor = typeof HIGHLIGHT_COLORS[number];

// Structural autotoken kinds. One value per char (Parchment ClassAttributor
// is single-valued), so these never overlap each other in practice — they're
// applied in order and the last write wins on overlap, but the ranges don't
// overlap meaningfully.
const AUTOTOKEN_KINDS = ['brace', 'anchor', 'br', 'placeholder', 'record', 'comment', 'search'] as const;
// Emphasis lives on its OWN attributor so `*|placeholder|*` can carry both
// the green placeholder color (via autotoken) AND bold (via autoemph) on the
// same characters. Two attributors → two CSS classes → both visual effects.
const AUTOEMPH_KINDS = ['strong', 'em'] as const;

function registerHighlightAttributor() {
  const existing = (Quill as any).imports?.['attributors/class/highlight'];
  if (existing) return;
  const Parchment = Quill.import('parchment') as any;
  const HighlightClass = new Parchment.ClassAttributor('highlight', 'hl', {
    scope: Parchment.Scope.INLINE,
    whitelist: [...HIGHLIGHT_COLORS],
  });
  Quill.register(HighlightClass, true);
}

function registerAutotokenAttributor() {
  const existing = (Quill as any).imports?.['attributors/class/autotoken'];
  if (existing) return;
  const Parchment = Quill.import('parchment') as any;
  const AutotokenClass = new Parchment.ClassAttributor('autotoken', 'at', {
    scope: Parchment.Scope.INLINE,
    whitelist: [...AUTOTOKEN_KINDS],
  });
  Quill.register(AutotokenClass, true);
}

function registerAutoemphAttributor() {
  const existing = (Quill as any).imports?.['attributors/class/autoemph'];
  if (existing) return;
  const Parchment = Quill.import('parchment') as any;
  const AutoemphClass = new Parchment.ClassAttributor('autoemph', 'ae', {
    scope: Parchment.Scope.INLINE,
    whitelist: [...AUTOEMPH_KINDS],
  });
  Quill.register(AutoemphClass, true);
}

// Atomic block-level embed for raw HTML (`<table>`, `<div>`, `<ul>`, `<h1-6>`,
// `<blockquote>`, `<pre>`). Quill 2.x's clipboard discards any unknown block
// element on paste; without this format we lose author-typed structural HTML
// the moment the editor mounts. The embed stores the original outerHTML in a
// data attribute and renders it as-is. Author can move/delete it as a unit;
// to edit cells they pop into raw mode (`<>` toggle).
const BLOCK_HTML_TAGS = ['TABLE', 'DIV', 'UL', 'OL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE'] as const;

function registerRawHtmlBlot() {
  const existing = (Quill as any).imports?.['formats/raw-html'];
  if (existing) return;
  const BlockEmbed = Quill.import('blots/block/embed') as any;
  class RawHtmlBlot extends BlockEmbed {
    static blotName = 'raw-html';
    static tagName = 'div';
    static className = 'ql-raw-html';
    static create(value: string) {
      const node = super.create() as HTMLElement;
      node.setAttribute('data-raw-html', value ?? '');
      node.innerHTML = value ?? '';
      return node;
    }
    static value(node: HTMLElement): string {
      return node.getAttribute('data-raw-html') ?? '';
    }
  }
  Quill.register(RawHtmlBlot, true);
}

registerHighlightAttributor();
registerAutotokenAttributor();
registerAutoemphAttributor();
registerRawHtmlBlot();

const { floatingStyles } = useFloating(virtualRef, floatingRef, {
  placement: 'top',
  middleware: [offset(8), flip(), shift({ padding: 8 })],
  whileElementsMounted: autoUpdate,
});

// Lines whose first non-whitespace token is a block element are passed
// through unwrapped — wrapping `<table>` etc. in `<p>` produces invalid HTML
// the browser auto-corrects, leaving Quill nothing to parse. The clipboard
// matchers (registered at mount) then turn each block element into a single
// `raw-html` embed.
const BLOCK_HTML_LINE_RE = /^\s*<(table|div|ul|ol|h[1-6]|blockquote|pre)[\s>]/i;

function textToHtml(text: string): string {
  if (!text) return '';
  return text
    .split('\n')
    .map((line) => {
      if (line === '') return '<p><br></p>';
      if (BLOCK_HTML_LINE_RE.test(line)) return line;
      return `<p>${line}</p>`;
    })
    .join('');
}

const AUTOTOKEN_SPAN_RE = /<span\s+class=["'](?:at|ae)-[\w-]+["']>([\s\S]*?)<\/span>/gi;

function stripAutotokenSpans(html: string): string {
  let out = html;
  let prev;
  do {
    prev = out;
    out = out.replace(AUTOTOKEN_SPAN_RE, '$1');
  } while (out !== prev);
  return out;
}

// Detached <textarea> reused for entity decoding. innerHTML on a textarea
// decodes character-reference entities (&amp; → &, &lt; → <, &nbsp; →  ,
// etc.) but leaves tags as plain text — exactly what we need to undo the
// browser's mandatory HTML serialization escaping in clone.innerHTML.
const _entityDecoder = document.createElement('textarea');
function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  _entityDecoder.innerHTML = s;
  return _entityDecoder.value;
}

function htmlToText(html: string): string {
  if (!html) return '';
  const cleaned = stripAutotokenSpans(html);
  const tmp = document.createElement('div');
  tmp.innerHTML = cleaned;
  const lines: string[] = [];
  for (const child of Array.from(tmp.children)) {
    const el = child as HTMLElement;
    if (el.classList?.contains('ql-raw-html')) {
      // Read the original outerHTML stored on insertion — the rendered DOM
      // may have been mutated by the browser and isn't faithful.
      lines.push(decodeEntities(el.getAttribute('data-raw-html') ?? ''));
      continue;
    }
    if (child.tagName === 'P') {
      const clone = child.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('br').forEach((br) => br.remove());
      lines.push(decodeEntities(clone.innerHTML));
    } else {
      lines.push(decodeEntities(el.outerHTML));
    }
  }
  return lines.join('\n');
}

// Longer keywords first so `ifOr` wins over `if`.
const COND_KEYWORDS = ['ifOr', 'else', 'if', 'fi'] as const;

function findBalancedBraces(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      if (depth === 0) continue;
      depth--;
      if (depth === 0 && start !== -1) {
        let rangeStart = start;
        for (const kw of COND_KEYWORDS) {
          const kwStart = start - kw.length;
          if (kwStart >= 0 && text.substring(kwStart, start) === kw) {
            const prev = kwStart > 0 ? text[kwStart - 1] : '';
            if (!/\w/.test(prev)) {
              rangeStart = kwStart;
              break;
            }
          }
        }
        ranges.push([rangeStart, i + 1]);
        start = -1;
      }
    }
  }
  return ranges;
}

function findAnchorRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /(^|\n)&\w+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const leadOffset = m[1] === '\n' ? 1 : 0;
    const start = m.index + leadOffset;
    ranges.push([start, m.index + m[0].length]);
  }
  return ranges;
}

function findBrRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /\[br\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function findPlaceholderRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /\|[^|\n]+\|/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function findRecordRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  // [[record]] — encyclopedia record reference. Inner content can be any
  // non-bracket / non-newline chars; the outer brackets are part of the range.
  const re = /\[\[[^\[\]\n]+\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function findCommentRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /^[ \t]*\/\/[^\n]*/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findSearchRanges(text: string, query: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  if (!query) return ranges;
  const re = new RegExp(escapeRegex(query), 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) break;
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function findEmphasisRanges(text: string): { em: Array<[number, number]>; strong: Array<[number, number]> } {
  const em: Array<[number, number]> = [];
  const strong: Array<[number, number]> = [];
  // `**…**` → italic (em). No asterisks or newlines inside.
  const doubleRe = /\*\*([^*\n]+?)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = doubleRe.exec(text)) !== null) {
    em.push([m.index, m.index + m[0].length]);
  }
  // `*…*` → bold (strong). Skip anything overlapping with a double match.
  const singleRe = /\*([^*\n]+?)\*/g;
  while ((m = singleRe.exec(text)) !== null) {
    const s = m.index;
    const e = m.index + m[0].length;
    const overlaps = em.some(([ds, de]) => !(e <= ds || s >= de));
    if (!overlaps) strong.push([s, e]);
  }
  return { em, strong };
}

let suppressAutoBold = false;

function applyAutoBold() {
  if (!quill || suppressAutoBold) return;
  const text = quill.getText();
  // getText adds a trailing \n; strip so ranges don't point past real content
  const effectiveLen = text.endsWith('\n') ? text.length - 1 : text.length;
  suppressAutoBold = true;
  try {
    quill.formatText(0, effectiveLen, 'autotoken', false, 'api');
    quill.formatText(0, effectiveLen, 'autoemph', false, 'api');
    for (const [start, end] of findBalancedBraces(text)) {
      if (end <= effectiveLen) {
        quill.formatText(start, end - start, 'autotoken', 'brace', 'api');
      }
    }
    for (const [start, end] of findAnchorRanges(text)) {
      if (end <= effectiveLen) {
        quill.formatText(start, end - start, 'autotoken', 'anchor', 'api');
      }
    }
    for (const [start, end] of findBrRanges(text)) {
      if (end <= effectiveLen) {
        quill.formatText(start, end - start, 'autotoken', 'br', 'api');
      }
    }
    for (const [start, end] of findPlaceholderRanges(text)) {
      if (end <= effectiveLen) {
        quill.formatText(start, end - start, 'autotoken', 'placeholder', 'api');
      }
    }
    for (const [start, end] of findRecordRanges(text)) {
      if (end <= effectiveLen) {
        quill.formatText(start, end - start, 'autotoken', 'record', 'api');
      }
    }
    for (const [start, end] of findCommentRanges(text)) {
      if (end <= effectiveLen) {
        quill.formatText(start, end - start, 'autotoken', 'comment', 'api');
      }
    }
    const q = dungeonSearchQuery.value.trim();
    if (q) {
      for (const [start, end] of findSearchRanges(text, q)) {
        if (end <= effectiveLen) {
          quill.formatText(start, end - start, 'autotoken', 'search', 'api');
        }
      }
    }
    const sh = dungeonStructuredHighlight.value.trim();
    if (sh && sh !== q) {
      for (const [start, end] of findSearchRanges(text, sh)) {
        if (end <= effectiveLen) {
          quill.formatText(start, end - start, 'autotoken', 'search', 'api');
        }
      }
    }
    const { em, strong } = findEmphasisRanges(text);
    for (const [start, end] of em) {
      if (end <= effectiveLen) {
        quill.formatText(start, end - start, 'autoemph', 'em', 'api');
      }
    }
    for (const [start, end] of strong) {
      if (end <= effectiveLen) {
        quill.formatText(start, end - start, 'autoemph', 'strong', 'api');
      }
    }
  } finally {
    suppressAutoBold = false;
  }
}

let suppressCurly = false;

function applyCurlyQuoteAtCaret() {
  if (!quill || suppressCurly) return;
  if (!curlyQuoteSettings.value?.autoCurlyQuotes) return;
  const range = quill.getSelection();
  if (!range || range.length > 0) return;
  const idx = range.index;
  if (idx <= 0) return;
  const last = quill.getText(idx - 1, 1);
  if (last !== '"' && last !== "'") return;
  const context = idx >= 2 ? quill.getText(idx - 2, 1) : '';
  const isOpening = context === '' || /[\s(\[{<]/.test(context);
  let replacement: string;
  if (last === '"') {
    replacement = isOpening ? '“' : '”';
  } else {
    // `'` after a letter/digit is an apostrophe (right single).
    replacement = isOpening ? '‘' : '’';
  }
  suppressCurly = true;
  try {
    quill.deleteText(idx - 1, 1, 'api');
    quill.insertText(idx - 1, replacement, 'api');
    quill.setSelection(idx, 0, 'api');
  } finally {
    suppressCurly = false;
  }
}

function wrapSelection(marker: '*' | '**') {
  if (!quill) return;
  const range = quill.getSelection(true);
  if (!range || range.length === 0) return;
  const text = quill.getText(range.index, range.length);
  quill.deleteText(range.index, range.length, 'user');
  quill.insertText(range.index, `${marker}${text}${marker}`, 'user');
  quill.blur();
  showToolbar.value = false;
  virtualRef.value = null;
}

function applyHighlight(value: HighlightColor | false) {
  if (!quill) return;
  const range = quill.getSelection(true);
  if (!range || range.length === 0) return;
  quill.format('highlight', value, 'user');
  quill.blur();
  showToolbar.value = false;
  virtualRef.value = null;
}

function updateToolbarFromSelection(range: { index: number; length: number } | null) {
  if (!quill || !range || range.length === 0) {
    showToolbar.value = false;
    virtualRef.value = null;
    return;
  }
  const bounds = quill.getBounds(range.index, range.length);
  if (!bounds) {
    showToolbar.value = false;
    virtualRef.value = null;
    return;
  }
  const editorRect = quill.root.getBoundingClientRect();
  const x = editorRect.left + bounds.left;
  const y = editorRect.top + bounds.top;
  const w = bounds.width;
  const h = bounds.height;
  virtualRef.value = {
    getBoundingClientRect: () => new DOMRect(x, y, w, h),
  };
  showToolbar.value = true;
}

function mountQuill() {
  if (quill) return;
  if (!containerRef.value) return;

  // Preserve the user's focus — Quill construction + dangerouslyPasteHTML
  // can steal focus from inputs outside this editor (notably the popup's
  // search bar during type-driven lazy activation).
  const prevActive = document.activeElement as HTMLElement | null;

  quill = new Quill(containerRef.value, {
    modules: { toolbar: false },
    placeholder: props.placeholder,
    formats: ['highlight', 'autotoken', 'autoemph', 'raw-html'],
  });

  // Convert any block-level element into a single `raw-html` embed instead of
  // letting Quill's clipboard descend into it and discard the wrapper. Without
  // these, `<table>` / `<div>` / etc. lose their structure on paste.
  const Delta = Quill.import('delta') as any;
  for (const tag of BLOCK_HTML_TAGS) {
    quill.clipboard.addMatcher(tag, (node: Node) =>
      new Delta().insert({ 'raw-html': (node as HTMLElement).outerHTML }),
    );
  }

  const initial = textToHtml(props.modelValue ?? '');
  if (initial) {
    suppressChange = true;
    quill.clipboard.dangerouslyPasteHTML(initial, 'silent');
    suppressChange = false;
  }
  applyAutoBold();
  // Discard the initial-load delta so Ctrl+Z can't undo past the opened state.
  (quill.getModule('history') as any)?.clear?.();

  quill.on('text-change', (_delta, _oldDelta, source) => {
    if (suppressChange || source !== 'user') return;
    applyCurlyQuoteAtCaret();
    applyAutoBold();
    const html = quill!.root.innerHTML;
    const text = htmlToText(html);
    emit('update:modelValue', text);
  });

  quill.on('selection-change', (range) => {
    updateToolbarFromSelection(range);
  });

  if (prevActive && prevActive !== document.activeElement && typeof prevActive.focus === 'function') {
    prevActive.focus({ preventScroll: true });
  }
}

watch(isActive, async (active) => {
  if (!active) return;
  await nextTick();
  mountQuill();
});

// Re-run autotoken highlighting when the shared search query OR the
// Index-driven structured highlight changes. Debounced so typing in the
// search bar doesn't hammer every Quill instance. If this editor is still
// deferred, activate on match so the highlight shows up.
watchDebounced(
  [dungeonSearchQuery, dungeonStructuredHighlight],
  ([q, sh]) => {
    if (!isActive.value) {
      const haystack = (props.modelValue ?? '').toLowerCase();
      const query = ((q as string) ?? '').trim().toLowerCase();
      const struct = ((sh as string) ?? '').trim().toLowerCase();
      if ((query && haystack.includes(query)) || (struct && haystack.includes(struct))) {
        activate();
      }
      return;
    }
    applyAutoBold();
  },
  { debounce: 200 },
);

onBeforeUnmount(() => {
  quill = null;
});

function syncQuillFromModel() {
  if (!quill) return;
  const current = htmlToText(quill.root.innerHTML);
  if (current === (props.modelValue ?? '')) return;
  const prevActive = document.activeElement as HTMLElement | null;
  suppressChange = true;
  quill.setContents([] as any, 'silent');
  const html = textToHtml(props.modelValue ?? '');
  if (html) {
    quill.clipboard.dangerouslyPasteHTML(html, 'silent');
  }
  suppressChange = false;
  applyAutoBold();
  (quill.getModule('history') as any)?.clear?.();
  if (prevActive && prevActive !== document.activeElement && typeof prevActive.focus === 'function') {
    prevActive.focus({ preventScroll: true });
  }
}

watch(
  () => props.modelValue,
  () => {
    // Don't touch Quill's DOM while the user is typing in the raw textarea —
    // it steals focus. We'll resync when they switch back to visual mode.
    if (isRawMode.value) return;
    syncQuillFromModel();
  },
);

watch(isRawMode, (raw) => {
  if (raw) return;
  if (!isActive.value) {
    activate();
  } else {
    syncQuillFromModel();
  }
});
</script>

<template>
  <div ref="hostRef" class="rich-content">
    <div v-if="!isActive && !isRawMode" class="rich-placeholder" @click="activate()">{{ modelValue }}</div>
    <div v-show="isActive && !isRawMode" ref="containerRef" class="rich-editor"></div>
    <textarea v-if="isRawMode" class="raw-editor" :value="modelValue" spellcheck="false" rows="10"
      @input="onRawInput" />
    <button type="button" class="raw-toggle" :title="isRawMode ? 'Visual edit' : 'Edit HTML source'"
      @click="isRawMode = !isRawMode">
      <i :class="isRawMode ? 'pi pi-pencil' : 'pi pi-code'"></i>
    </button>
    <Teleport to="body">
      <div v-show="showToolbar && !isRawMode" ref="floatingRef" class="hl-toolbar" :style="floatingStyles">
        <button type="button" class="hl-format hl-format--bold" title="Bold (*text*)"
          @mousedown.prevent="wrapSelection('*')">B</button>
        <button type="button" class="hl-format hl-format--italic" title="Italic (**text**)"
          @mousedown.prevent="wrapSelection('**')">I</button>
        <span class="hl-sep"></span>
        <button v-for="color in HIGHLIGHT_COLORS" :key="color" type="button" class="hl-swatch"
          :class="`hl-swatch--${color}`" :title="color" @mousedown.prevent="applyHighlight(color)" />
        <button type="button" class="hl-swatch hl-swatch--clear" title="Clear highlight"
          @mousedown.prevent="applyHighlight(false)">
          <i class="pi pi-eraser"></i>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.rich-content {
  position: relative;
  width: 100%;
  max-width: 800px;
  display: flex;
  align-items: flex-start;
  gap: 0.25rem;
}

.raw-toggle {
  flex: 0 0 auto;
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  margin-top: 2px;
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 3px;
  color: #555;
  cursor: pointer;
  font-size: 0.72rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s ease, color 0.1s ease;
}

.raw-toggle:hover {
  background: #fff;
  color: #000;
}

.raw-toggle .pi {
  font-size: 0.78rem;
}

.raw-editor {
  flex: 1 1 0;
  min-width: 0;
  min-height: 8rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  background: #fff;
  color: #000;
  font-family: var(--font-family-mono, monospace);
  font-size: inherit;
  line-height: 1.4;
  resize: vertical;
  box-sizing: border-box;
}

.rich-editor {
  flex: 1 1 0;
  min-width: 0;
  min-height: 2.25rem;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  background: #fff;
  font-family: inherit;
  font-size: inherit;
  line-height: 1.4;
}

.rich-placeholder {
  flex: 1 1 0;
  min-width: 0;
  min-height: 2.25rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  background: #fff;
  color: #000;
  font-family: inherit;
  font-size: inherit;
  line-height: 1.4;
  white-space: pre-line;
  word-wrap: break-word;
  cursor: text;
  box-sizing: border-box;
}

.rich-editor :deep(.ql-editor) {
  padding: 0.4rem 0.6rem;
  min-height: 2.25rem;
  color: #000;
  font-family: inherit;
  font-size: inherit;
  line-height: 1.4;
}

.rich-editor :deep(.ql-editor p) {
  margin: 0;
}

.rich-editor :deep(.ql-editor.ql-blank::before) {
  color: #888;
  font-style: italic;
  left: 0.6rem;
}
</style>

<style>
/* Global — teleported toolbar lives at body, and `.hl-*` spans inside the
   contenteditable also need styles outside the scoped boundary. */
.hl-toolbar {
  display: flex;
  gap: 0.2rem;
  padding: 0.25rem;
  background: #333;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  z-index: 10000;
  pointer-events: auto;
}

.hl-swatch {
  width: 1.1rem;
  height: 1.1rem;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 3px;
  cursor: pointer;
  transition: transform 0.08s ease;
  font-family: inherit;
}

.hl-swatch:hover {
  transform: scale(1.12);
}

.hl-swatch--yellow {
  background: #fff3a3;
}

.hl-swatch--pink {
  background: #ffb3b3;
}

.hl-swatch--orange {
  background: #ffd9a3;
}

.hl-swatch--green {
  background: #b3f5c0;
}

.hl-swatch--blue {
  background: #cfe8ff;
}

.hl-swatch--purple {
  background: #e5ccff;
}

.hl-swatch--clear {
  width: auto;
  padding: 0 0.35rem;
  background: #555;
  color: #eee;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hl-swatch--clear .pi {
  font-size: 0.78rem;
}

.hl-format {
  min-width: 1.4rem;
  height: 1.4rem;
  padding: 0 0.35rem;
  background: #eee;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 3px;
  cursor: pointer;
  color: #000;
  font-family: inherit;
  font-size: 0.8rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s ease;
}

.hl-format:hover {
  background: #fff;
}

.hl-format--bold {
  font-weight: 700;
}

.hl-format--italic {
  font-style: italic;
  font-weight: 600;
}

.hl-sep {
  width: 1px;
  align-self: stretch;
  margin: 0.1rem 0.15rem;
  background: rgba(255, 255, 255, 0.2);
}

.hl-yellow {
  background: #fff3a3;
}

.hl-pink {
  background: #ffb3b3;
}

.hl-orange {
  background: #ffd9a3;
}

.hl-green {
  background: #b3f5c0;
}

.hl-blue {
  background: #cfe8ff;
}

.hl-purple {
  background: #e5ccff;
}

.at-brace {
  font-weight: 700;
  color: #9c27b0;
}

.at-anchor {
  font-weight: 700;
  color: #6a1b9a;
}

.ae-strong {
  font-weight: 700;
}

.ae-em {
  font-style: italic;
}

.at-br {
  font-weight: 700;
  color: #00838f;
  background: rgba(0, 188, 212, 0.12);
  padding: 0 2px;
  border-radius: 2px;
}

.at-placeholder {
  font-weight: 700;
  color: #2e7d32;
}

.at-record {
  font-weight: 700;
  color: #72733c;
}

.at-comment {
  color: #888;
  font-style: italic;
}

.at-search {
  background: #ffec99;
  border-radius: 2px;
  padding: 0 1px;
  box-shadow: 0 0 0 1px rgba(255, 193, 7, 0.4);
}

/* Whole-input tint when an `<input>` value matches the search query.
   The `<input>` value is plain text so we can't sub-string-style it;
   tinting the whole field is the next-best signal that this field carries
   the hit. Yellow palette matches `.at-search`. !important beats PrimeVue's
   inputtext theme background. */
.input-search-hit {
  background: #ffec99 !important;
  box-shadow: inset 0 0 0 1px rgba(255, 193, 7, 0.55);
}

/* All structural-id inputs across the dungeon editor share one identity:
   monospace + bold + teal text. !important beats PrimeVue's inputtext theme
   color. PrimeVue InputText forwards the class straight to the <input>, so
   we target it directly (no :deep wrapper). */
input.id-input,
input.quest-id-input,
input.goal-id-input,
input.stage-id-input,
input.choice-id-input {
  font-family: var(--font-family-mono, monospace) !important;
  font-weight: 700 !important;
  color: #003fe0 !important;
}
</style>
