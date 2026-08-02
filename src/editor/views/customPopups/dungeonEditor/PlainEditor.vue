<script setup lang="ts">
import { ref, shallowRef, computed, nextTick, onBeforeUnmount, watch } from 'vue';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue';
import { useStorage } from '@vueuse/core';
import { dungeonSearchQuery, dungeonStructuredFilter } from './searchState';
import { useLazyMount } from './useLazyMount';
import type { IndexCategory } from '../../../../utility/dungeonEditor/index';

const editorSettings = useStorage<{ autoCurlyQuotes?: boolean; autoEnDash?: boolean }>('dungeonEditor_settings', {});

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

// =====================================================================
// Token pattern finders (pure, over text strings)
// =====================================================================

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
  // Mask record ranges first so `[[r3|Custom Name]]` doesn't break the
  // placeholder scan at the inner `|`.
  const recordRanges = findRecordRanges(text);
  let masked = text;
  for (const [s, e] of recordRanges) {
    masked = masked.slice(0, s) + ' '.repeat(e - s) + masked.slice(e);
  }
  const re = /\|[^|\n]+\|/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

function findRecordRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /\[\[[^\[\]\n]+\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    ranges.push([m.index, m.index + m[0].length]);
  }
  return ranges;
}

// `>Label` inline choices. Only the sigil + label — the trailing `{…}` params
// are already covered by findBalancedBraces.
function findInlineChoiceRanges(text: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /^>[^\n{]*/gm;
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

// Structured-filter highlight: match `name` only in its indexed role (see
// utility/dungeonEditor/index.ts), never as a plain substring — the word
// "actor" in prose must not match the `actor` action.
function findStructuredRanges(text: string, kind: IndexCategory, name: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  if (!name) return ranges;
  const esc = escapeRegex(name);
  if (kind === 'anchor') {
    const re = new RegExp(`(^|\\n)&${esc}(?!\\w)`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const lead = m[1] ? 1 : 0;
      ranges.push([m.index + lead, m.index + m[0].length]);
    }
    return ranges;
  }
  const keyRe = new RegExp(`(^|[{,\\s"'])${esc}(?=\\s*["']?\\s*:)`, 'g');
  const wordRe = new RegExp(`(^|[^\\w.])${esc}(?![\\w.])`, 'g');
  for (const [s, e] of findBalancedBraces(text)) {
    // A range starting off `{` was pulled back over a condition keyword —
    // condition braces hold flag checks, never actions.
    if (kind === 'action' && text[s] !== '{') continue;
    const re = kind === 'action' ? keyRe : wordRe;
    const seg = text.slice(s, e);
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(seg)) !== null) {
      const start = s + m.index + m[1].length;
      ranges.push([start, start + name.length]);
    }
  }
  return ranges;
}

function findEmphasisRanges(text: string): { double: Array<[number, number]>; single: Array<[number, number]> } {
  const double: Array<[number, number]> = [];
  const single: Array<[number, number]> = [];
  const doubleRe = /\*\*([^*\n]+?)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = doubleRe.exec(text)) !== null) {
    double.push([m.index, m.index + m[0].length]);
  }
  const singleRe = /\*([^*\n]+?)\*/g;
  while ((m = singleRe.exec(text)) !== null) {
    const s = m.index;
    const e = m.index + m[0].length;
    const overlaps = double.some(([ds, de]) => !(e <= ds || s >= de));
    if (!overlaps) single.push([s, e]);
  }
  return { double, single };
}

// `++text++` (altered state) / `+text+` (initial state) — mirrors the runtime
// resolveTextStyles guards, so what colors here is exactly what styles in game:
// the single-`+` opener can't follow a word char or lead into a digit, and the
// closer must end a word ("+43 health", "a+b+c", "C++" all stay plain).
function findStateRanges(text: string): { altered: Array<[number, number]>; initial: Array<[number, number]> } {
  const altered: Array<[number, number]> = [];
  const initial: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  const alteredRe = /\+\+([^+\n]+?)\+\+/g;
  while ((m = alteredRe.exec(text)) !== null) {
    altered.push([m.index, m.index + m[0].length]);
  }
  const initialRe = /(?<![\w+])\+([^\s+\d][^+\n]*?)\+(?![\w+])/g;
  while ((m = initialRe.exec(text)) !== null) {
    initial.push([m.index, m.index + m[0].length]);
  }
  return { altered, initial };
}

const HL_COLORS = ['yellow', 'pink', 'orange', 'green', 'blue', 'purple'] as const;
type HighlightColor = typeof HL_COLORS[number];

const HL_BG: Record<string, string> = {
  yellow: 'rgba(255, 235, 59, 0.42)',
  pink: 'rgba(255, 105, 180, 0.42)',
  orange: 'rgba(255, 152, 0, 0.42)',
  green: 'rgba(76, 175, 80, 0.42)',
  blue: 'rgba(33, 150, 243, 0.38)',
  purple: 'rgba(156, 39, 176, 0.38)',
};

type Highlight = { start: number; end: number; color: string };

// =====================================================================
// modelValue (wire format with `<span class="hl-X">…</span>` markup) ↔
// internal state (plain `innerText` + side-channel `highlights` ranges).
// The textarea binds to `innerText` only — markup chars never reach it,
// so no empty-space gaps for tag chars.
// =====================================================================

// Find the closing `</span>` matching the hl-open at `from`, counting any
// nested `<span…>` so that a literal `<span>x</span>` inside a highlight
// doesn't terminate it early. Returns the index of the matching `</span>`,
// or -1 if unclosed.
function findMatchingSpanClose(mv: string, from: number): number {
  const tagRe = /<(\/?)span\b[^>]*>/gi;
  tagRe.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(mv)) !== null) {
    if (m[1] === '/') {
      depth--;
      if (depth === 0) return m.index;
    } else {
      depth++;
    }
  }
  return -1;
}

function parseModelValue(mv: string): { text: string; hls: Highlight[] } {
  const openRe = /<span\s+class=["']hl-([\w-]+)["']>/gi;
  const hls: Highlight[] = [];
  let cleaned = '';
  let i = 0;
  while (i < mv.length) {
    openRe.lastIndex = i;
    const m = openRe.exec(mv);
    if (!m) {
      cleaned += mv.slice(i);
      break;
    }
    cleaned += mv.slice(i, m.index);
    const color = m[1];
    const innerStart = m.index + m[0].length;
    if (!HL_BG[color]) {
      // Unknown color — preserve the open tag as literal text.
      cleaned += m[0];
      i = innerStart;
      continue;
    }
    const closeIdx = findMatchingSpanClose(mv, innerStart);
    if (closeIdx === -1) {
      // Unclosed hl-span — preserve as literal so we don't lose content.
      cleaned += m[0];
      i = innerStart;
      continue;
    }
    const inner = mv.slice(innerStart, closeIdx);
    const start = cleaned.length;
    cleaned += inner;
    const end = cleaned.length;
    if (end > start) hls.push({ start, end, color });
    i = closeIdx + '</span>'.length;
  }
  return { text: cleaned, hls };
}

function serializeModelValue(text: string, hls: Highlight[]): string {
  if (hls.length === 0) return text;
  // Splice from the end backward so earlier offsets don't shift.
  const sorted = [...hls].sort((a, b) => b.start - a.start);
  let out = text;
  for (const h of sorted) {
    out = out.slice(0, h.end) + '</span>' + out.slice(h.end);
    out = out.slice(0, h.start) + `<span class="hl-${h.color}">` + out.slice(h.start);
  }
  return out;
}

// Edit replaces oldText[prefix..oldSuffix) with `insertedLen` chars at
// [prefix, prefix+insertedLen). Maps old highlight endpoints to new ones.
// Stickiness: typing AT highlight start → text goes BEFORE highlight
// (start advances). Typing AT highlight end → text goes AFTER highlight
// (end stays). Typing INSIDE → highlight extends.
function shiftHighlight(
  h: Highlight,
  prefix: number,
  oldSuffix: number,
  insertedLen: number,
): Highlight | null {
  const delta = insertedLen - (oldSuffix - prefix);
  let newStart: number;
  if (h.start < prefix) newStart = h.start;
  else if (h.start >= oldSuffix) newStart = h.start + delta;
  else newStart = prefix + insertedLen;
  let newEnd: number;
  if (h.end <= prefix) newEnd = h.end;
  else if (h.end > oldSuffix) newEnd = h.end + delta;
  else newEnd = prefix + insertedLen;
  if (newStart >= newEnd) return null;
  return { start: newStart, end: newEnd, color: h.color };
}

// Per-token visual style strings (paint into the overlay).
//
// IMPORTANT: never use `font-weight` or `font-style` here. They change glyph
// metrics → the overlay's chars no longer pixel-align with the textarea's
// (which is locked to regular weight + upright), so the caret drifts off
// the visible text. Use `text-shadow` for faux-bold instead — it only
// affects paint, not layout.
const FAUX_BOLD = 'text-shadow:0.03em 0 0 currentColor';
const STYLE_BRACE = `color:#9c27b0;${FAUX_BOLD}`;
const STYLE_ANCHOR = `color:#6a1b9a;${FAUX_BOLD}`;
const STYLE_BR = `color:#00838f;${FAUX_BOLD};background:rgba(0,188,212,0.16);padding:0 2px;border-radius:2px`;
const STYLE_PLACEHOLDER = `color:#2e7d32;${FAUX_BOLD}`;
const STYLE_RECORD = `color:#1565c0;${FAUX_BOLD}`;
const STYLE_COMMENT = 'color:#888;font-style:italic';
const STYLE_CHOICE = `color:#c62828;${FAUX_BOLD}`;
const STYLE_SEARCH = 'background:#fff59d;color:#000';
const STYLE_INITIAL = `color:#a100ff;${FAUX_BOLD}`;
const STYLE_ALTERED = `color:#c95500;${FAUX_BOLD}`;

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderOverlay(text: string, hls: Highlight[]): string {
  if (!text) return '';
  const len = text.length;
  const tokenStyle: Array<string | null> = new Array(len).fill(null);
  const emStyle: Array<string | null> = new Array(len).fill(null);
  const strongStyle: Array<string | null> = new Array(len).fill(null);
  const hlBg: Array<string | null> = new Array(len).fill(null);

  for (const r of hls) {
    const bg = HL_BG[r.color];
    if (!bg) continue;
    const last = Math.min(r.end, len);
    for (let i = Math.max(r.start, 0); i < last; i++) hlBg[i] = bg;
  }

  const setTok = (style: string, ranges: Array<[number, number]>) => {
    for (const [s, e] of ranges) {
      const last = Math.min(e, len);
      for (let i = Math.max(s, 0); i < last; i++) tokenStyle[i] = style;
    }
  };

  // Choice first: placeholders / records / braces inside a label keep their own
  // color by overwriting it per-character below. Same for +/++ state spans —
  // tokens nested inside (e.g. `++|$color|++`) overwrite per-char.
  setTok(STYLE_CHOICE, findInlineChoiceRanges(text));
  const stateRanges = findStateRanges(text);
  setTok(STYLE_ALTERED, stateRanges.altered);
  setTok(STYLE_INITIAL, stateRanges.initial);
  setTok(STYLE_BRACE, findBalancedBraces(text));
  setTok(STYLE_ANCHOR, findAnchorRanges(text));
  setTok(STYLE_BR, findBrRanges(text));
  setTok(STYLE_PLACEHOLDER, findPlaceholderRanges(text));
  setTok(STYLE_RECORD, findRecordRanges(text));
  setTok(STYLE_COMMENT, findCommentRanges(text));

  const sq = dungeonSearchQuery.value.trim();
  if (sq) setTok(STYLE_SEARCH, findSearchRanges(text, sq));
  const sf = dungeonStructuredFilter.value;
  if (sf?.name) setTok(STYLE_SEARCH, findStructuredRanges(text, sf.kind, sf.name));

  const { double, single } = findEmphasisRanges(text);
  // Faux-bold via text-shadow — `font-weight` would change glyph widths and
  // drift the caret. Italic stays as `font-style:italic` because italic
  // glyphs have near-identical advance widths in most fonts.
  //
  // Standard markdown: `**text**` → bold, `*text*` → italic.
  // Markers (`*` / `**`) are EXCLUDED from the styled range so the asterisks
  // render in regular weight. Bolding them via text-shadow made the ink
  // bleed onto adjacent tall glyphs (capital letters), so `*Word*` looked
  // denser than `*word*`. With markers in regular weight only the inner
  // content carries emphasis and the markers read uniformly.
  for (const [s, e] of double) {
    if (e - s < 5) continue; // need at least `**x**`
    for (let i = s + 2; i < e - 2 && i < len; i++) strongStyle[i] = FAUX_BOLD;
  }
  for (const [s, e] of single) {
    if (e - s < 3) continue; // need at least `*x*`
    for (let i = s + 1; i < e - 1 && i < len; i++) emStyle[i] = 'font-style:italic';
  }

  let out = '';
  let i = 0;
  while (i < len) {
    const t = tokenStyle[i];
    const eS = emStyle[i];
    const sS = strongStyle[i];
    const h = hlBg[i];
    let j = i + 1;
    while (j < len
      && tokenStyle[j] === t
      && emStyle[j] === eS
      && strongStyle[j] === sS
      && hlBg[j] === h) {
      j++;
    }
    const chunk = escHtml(text.slice(i, j));
    const parts: string[] = [];
    if (t) parts.push(t);
    if (eS) parts.push(eS);
    if (sS && !t) parts.push(sS);  // token bold wins; emph bold otherwise
    if (h) parts.push(`background-color:${h}`);
    // Search chunks carry a real class so the popup's match counter and
    // prev/next navigation can find them via querySelectorAll('.at-search').
    const cls = t === STYLE_SEARCH ? ' class="at-search"' : '';
    out += parts.length ? `<span${cls} style="${parts.join(';')}">${chunk}</span>` : chunk;
    i = j;
  }
  // Trailing space so a final '\n' shows as a visible empty line in <pre>
  // (otherwise pre collapses the trailing newline).
  if (text.endsWith('\n')) out += ' ';
  return out;
}

// =====================================================================
// Reactive state — innerText is the textarea value; highlights live in a
// side-channel keyed by innerText offsets.
// =====================================================================

const innerText = ref('');
const highlights = ref<Highlight[]>([]);
let lastEmitted = '';

function syncFromModelValue(mv: string) {
  if (mv === lastEmitted) return;
  const { text, hls } = parseModelValue(mv ?? '');
  innerText.value = text;
  highlights.value = hls;
  lastEmitted = mv ?? '';
}
syncFromModelValue(props.modelValue ?? '');

watch(() => props.modelValue, (mv) => syncFromModelValue(mv ?? ''));

function commitState(newText: string, newHls: Highlight[]) {
  innerText.value = newText;
  highlights.value = newHls;
  const serialized = serializeModelValue(newText, newHls);
  if (serialized === lastEmitted) return;
  lastEmitted = serialized;
  emit('update:modelValue', serialized);
}

const overlayHtml = computed(() => renderOverlay(innerText.value, highlights.value));

// =====================================================================
// Editor host + textarea + scroll sync
// =====================================================================

const hostRef = ref<HTMLElement | null>(null);
const taRef = ref<HTMLTextAreaElement | null>(null);
const overlayRef = ref<HTMLPreElement | null>(null);

const { isActive, activate } = useLazyMount(hostRef);

function onInput(e: Event) {
  const ta = e.target as HTMLTextAreaElement;
  let newText = ta.value;
  const oldText = innerText.value;

  // Diff: longest common prefix / suffix.
  let prefix = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (prefix < minLen && oldText[prefix] === newText[prefix]) prefix++;
  let oldSuffix = oldText.length;
  let newSuffix = newText.length;
  while (oldSuffix > prefix && newSuffix > prefix
    && oldText[oldSuffix - 1] === newText[newSuffix - 1]) {
    oldSuffix--;
    newSuffix--;
  }
  let insertedLen = newSuffix - prefix;

  // Auto-curly-quote: substitute the inserted char in-place if it's a
  // single-char quote insertion and the surrounding context calls for it.
  let caretAfterCommit = -1;
  if (editorSettings.value?.autoCurlyQuotes
    && insertedLen === 1 && oldSuffix === prefix) {
    const inserted = newText[prefix];
    if (inserted === '"' || inserted === "'") {
      const prev = prefix >= 1 ? newText[prefix - 1] : '';
      const isOpening = prev === '' || /[\s(\[{<]/.test(prev);
      const replacement = inserted === '"'
        ? (isOpening ? '“' : '”')
        : (isOpening ? '‘' : '’');
      newText = newText.slice(0, prefix) + replacement + newText.slice(prefix + 1);
      caretAfterCommit = prefix + 1;
    }
  }

  // Auto en dash: when the user types the second `-` of a `--` pair, replace
  // both with `–`. Only fires on a single-char insertion (so paste of `--`
  // is preserved as-is). Caret lands after the inserted en dash.
  if (editorSettings.value?.autoEnDash
    && insertedLen === 1 && oldSuffix === prefix
    && newText[prefix] === '-' && prefix >= 1 && newText[prefix - 1] === '-') {
    newText = newText.slice(0, prefix - 1) + '–' + newText.slice(prefix + 1);
    caretAfterCommit = prefix;
  }

  const newHls = highlights.value
    .map((h) => shiftHighlight(h, prefix, oldSuffix, insertedLen))
    .filter((h): h is Highlight => h !== null);

  commitState(newText, newHls);

  if (caretAfterCommit >= 0) {
    nextTick(() => {
      if (taRef.value) {
        taRef.value.selectionStart = caretAfterCommit;
        taRef.value.selectionEnd = caretAfterCommit;
      }
    });
  }
}

function syncScroll() {
  if (!taRef.value || !overlayRef.value) return;
  overlayRef.value.scrollTop = taRef.value.scrollTop;
  overlayRef.value.scrollLeft = taRef.value.scrollLeft;
}

// =====================================================================
// Floating selection toolbar (manual highlight + bold/italic wrap)
// =====================================================================

const floatingRef = ref<HTMLElement | null>(null);
const showToolbar = ref(false);
const virtualRef = shallowRef<{ getBoundingClientRect: () => DOMRect } | null>(null);

const { floatingStyles } = useFloating(virtualRef, floatingRef, {
  placement: 'top',
  middleware: [offset(8), flip(), shift({ padding: 8 })],
  whileElementsMounted: autoUpdate,
});

// Measure the pixel position of `offset` within the textarea, including
// soft-wrapped lines. Native textarea doesn't expose per-char rects, so we
// build a hidden mirror element styled identically and read the position of
// a marker placed at `offset`.
function measureOffsetTop(ta: HTMLTextAreaElement, offset: number): number {
  const cs = getComputedStyle(ta);
  const mirror = document.createElement('div');
  // Copy every style that affects text layout.
  const props = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
    'letterSpacing', 'wordSpacing', 'lineHeight', 'tabSize',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
    'whiteSpace', 'wordBreak', 'overflowWrap', 'boxSizing', 'textIndent',
  ];
  for (const p of props) (mirror.style as any)[p] = (cs as any)[p];
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.width = ta.clientWidth + 'px';
  mirror.style.height = 'auto';
  mirror.style.overflow = 'hidden';

  const before = ta.value.substring(0, offset);
  mirror.appendChild(document.createTextNode(before));
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();
  document.body.removeChild(mirror);
  // Y of marker relative to the mirror's content origin.
  return markerRect.top - mirrorRect.top;
}

function updateToolbarFromSelection() {
  const ta = taRef.value;
  if (!ta) {
    showToolbar.value = false;
    virtualRef.value = null;
    return;
  }
  if (ta.selectionStart === ta.selectionEnd) {
    showToolbar.value = false;
    virtualRef.value = null;
    return;
  }
  const rect = ta.getBoundingClientRect();
  const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20;
  const offsetTop = measureOffsetTop(ta, ta.selectionStart);
  // offsetTop is measured from the mirror's content origin (which mirrors
  // the textarea's). Add the textarea's viewport top, subtract its scroll.
  const top = rect.top + offsetTop - ta.scrollTop;
  virtualRef.value = {
    getBoundingClientRect: () => new DOMRect(rect.left + rect.width / 2, top, 1, lineHeight),
  };
  showToolbar.value = true;
}

function onSelect() {
  // Defer so selection state has settled.
  nextTick(updateToolbarFromSelection);
}

function onBlur() {
  // Hide on blur, but only if focus didn't move into the toolbar.
  setTimeout(() => {
    if (!floatingRef.value?.contains(document.activeElement)) {
      showToolbar.value = false;
      virtualRef.value = null;
    }
  }, 50);
}

// Replace a slice of innerText via `document.execCommand('insertText', ...)`.
// execCommand is the only programmatic textarea-edit path that enters the
// browser's native undo stack (setRangeText / direct `.value =` do not).
// It's deprecated but still universally supported on textareas. After it
// runs, the textarea fires a real `input` event → our onInput runs the
// usual prefix/suffix diff and shifts highlights. Ctrl+Z reverses it
// natively → fires `input` with the prior text → onInput diffs back and
// shifts highlights symmetrically.
function replaceTextRange(
  start: number,
  end: number,
  replacement: string,
  caretPolicy: 'end' | 'select',
) {
  const ta = taRef.value;
  if (!ta) return;
  ta.focus();
  ta.selectionStart = start;
  ta.selectionEnd = end;
  const ok = document.execCommand('insertText', false, replacement);
  if (!ok) {
    // Fallback for browsers / contexts where execCommand is blocked.
    // Loses native undo for this op but keeps the edit working.
    ta.setRangeText(replacement, start, end, caretPolicy === 'end' ? 'end' : 'select');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  // execCommand collapses the selection to the end of the inserted text.
  // Restore the 'select' caret policy if requested.
  if (caretPolicy === 'select') {
    ta.selectionStart = start;
    ta.selectionEnd = start + replacement.length;
  }
}

function wrapSelection(marker: '*' | '**') {
  const ta = taRef.value;
  if (!ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  if (start === end) return;
  const sel = innerText.value.slice(start, end);
  replaceTextRange(start, end, `${marker}${sel}${marker}`, 'end');
  showToolbar.value = false;
}

// Collapse the selection to the end of the just-affected range and dismiss
// the toolbar. Called from applyHighlight after committing — without
// collapse, the still-non-empty selection would re-trigger the toolbar via
// the next select/mouseup event, causing visible flicker.
function dismissToolbarAndCollapse(end: number) {
  showToolbar.value = false;
  virtualRef.value = null;
  nextTick(() => {
    if (!taRef.value) return;
    taRef.value.selectionStart = end;
    taRef.value.selectionEnd = end;
    taRef.value.focus();
  });
}

function applyHighlight(color: HighlightColor | false) {
  const ta = taRef.value;
  if (!ta) return;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  if (start === end) return;

  if (color === false) {
    // Clear: split / drop any highlight intersecting the selection.
    const newHls = highlights.value.flatMap((h): Highlight[] => {
      if (h.end <= start || h.start >= end) return [h];
      const out: Highlight[] = [];
      if (h.start < start) out.push({ start: h.start, end: start, color: h.color });
      if (h.end > end) out.push({ start: end, end: h.end, color: h.color });
      return out;
    });
    commitState(innerText.value, newHls);
    dismissToolbarAndCollapse(end);
    return;
  }

  // Toggle off if the selection EXACTLY matches a same-color highlight.
  const exact = highlights.value.find(
    (h) => h.start === start && h.end === end && h.color === color,
  );
  if (exact) {
    commitState(innerText.value, highlights.value.filter((h) => h !== exact));
    dismissToolbarAndCollapse(end);
    return;
  }

  // Drop / clip any overlap regardless of color — the new color wins for
  // the selected range. (If we only clipped same-color, re-coloring an
  // existing highlight would produce overlapping ranges, which the
  // serializer can't emit cleanly: nested spans whose offsets shift each
  // other's splice positions, producing corrupted markup like
  // `<span class="hl-yel</span>low">`.)
  const cleaned = highlights.value.flatMap((h): Highlight[] => {
    if (h.end <= start || h.start >= end) return [h];
    const out: Highlight[] = [];
    if (h.start < start) out.push({ start: h.start, end: start, color: h.color });
    if (h.end > end) out.push({ start: end, end: h.end, color: h.color });
    return out;
  });
  cleaned.push({ start, end, color });
  cleaned.sort((a, b) => a.start - b.start);
  commitState(innerText.value, cleaned);
  dismissToolbarAndCollapse(end);
}

onBeforeUnmount(() => {
  showToolbar.value = false;
  virtualRef.value = null;
});
</script>

<template>
  <div ref="hostRef" class="plain-editor">
    <template v-if="isActive">
      <pre ref="overlayRef" class="plain-overlay" v-html="overlayHtml" aria-hidden="true"></pre>
      <textarea
        ref="taRef"
        class="plain-input"
        spellcheck="false"
        :value="innerText"
        :placeholder="placeholder"
        @input="onInput"
        @scroll="syncScroll"
        @select="onSelect"
        @keyup="onSelect"
        @mouseup="onSelect"
        @blur="onBlur" />
    </template>
    <div v-else class="plain-placeholder" @click="activate()">{{ innerText || placeholder }}</div>

    <Teleport to="body">
      <div v-show="showToolbar" ref="floatingRef" class="hl-toolbar" :style="floatingStyles">
        <button type="button" class="hl-format hl-format--bold" title="Bold (**text**)"
          @mousedown.prevent="wrapSelection('**')">B</button>
        <button type="button" class="hl-format hl-format--italic" title="Italic (*text*)"
          @mousedown.prevent="wrapSelection('*')">I</button>
        <span class="hl-sep"></span>
        <button v-for="color in HL_COLORS" :key="color" type="button" class="hl-swatch"
          :class="`hl-swatch--${color}`" :title="color"
          @mousedown.prevent="applyHighlight(color)" />
        <button type="button" class="hl-swatch hl-swatch--clear" title="Clear highlight"
          @mousedown.prevent="applyHighlight(false)">
          <i class="pi pi-eraser"></i>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.plain-editor {
  position: relative;
  display: block;
  width: 100%;
  max-width: 800px;
}

.plain-overlay,
.plain-editor .plain-input {
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.5;
  font-weight: 400;
  letter-spacing: 0;
  margin: 0;
  padding: 0.4rem 0.6rem;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 3px;
  box-sizing: border-box;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  tab-size: 2;
  -moz-tab-size: 2;
  word-break: break-word;
}

.plain-overlay {
  position: relative;
  margin: 0;
  background: #ffffff;
  color: #1f2937;
  pointer-events: none;
  min-height: calc(1.5em + 0.8rem + 2px);
  /* Reset <pre> defaults */
  font-family: inherit;
}

.plain-editor .plain-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  resize: none;
  background: transparent;
  color: transparent;
  caret-color: #1f2937;
  outline: none;
  overflow: hidden;
  border-color: transparent;
}

.plain-editor .plain-input::placeholder {
  color: rgba(80, 80, 80, 0.5);
}

.plain-editor .plain-input::selection {
  background: rgba(33, 150, 243, 0.3);
  color: transparent;
}

.plain-placeholder {
  white-space: pre-wrap;
  padding: 0.4rem 0.6rem;
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 3px;
  box-sizing: border-box;
  cursor: text;
  font-family: inherit;
  font-size: 0.95rem;
  line-height: 1.5;
  min-height: calc(1.5em + 0.8rem + 2px);
  color: #6b7280;
  background: #ffffff;
}
</style>

<style>
/* Floating selection toolbar — teleported to <body>, so styles must be
   unscoped to reach it. */
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

.hl-swatch--yellow { background: #fff3a3; }
.hl-swatch--pink   { background: #ffb3b3; }
.hl-swatch--orange { background: #ffd9a3; }
.hl-swatch--green  { background: #b3f5c0; }
.hl-swatch--blue   { background: #cfe8ff; }
.hl-swatch--purple { background: #e5ccff; }

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
</style>
