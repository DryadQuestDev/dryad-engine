/**
 * Manual highlight markup used by the prose editor's model value.
 *
 * Wire format: `<span class="hl-X">…</span>` around highlighted runs. The
 * editor's textarea binds to the plain text with the tags removed, and keeps
 * the highlights as side-channel ranges keyed by plain-text offsets — so no
 * markup chars ever reach the textarea and there are no empty-space gaps.
 */

export const HL_COLORS = ['yellow', 'pink', 'orange', 'green', 'blue', 'purple'] as const;
export type HighlightColor = typeof HL_COLORS[number];

export const HL_BG: Record<string, string> = {
  yellow: 'rgba(255, 235, 59, 0.42)',
  pink: 'rgba(255, 105, 180, 0.42)',
  orange: 'rgba(255, 152, 0, 0.42)',
  green: 'rgba(76, 175, 80, 0.42)',
  blue: 'rgba(33, 150, 243, 0.38)',
  purple: 'rgba(156, 39, 176, 0.38)',
};

export type Highlight = { start: number; end: number; color: string };

export type ParsedModelValue = {
  /** The model value with highlight tags removed — what the textarea shows. */
  text: string;
  hls: Highlight[];
  /**
   * Every tag span that was removed, as `[start, end)` ranges into the model
   * value, in order. Lets model-coordinate offsets (e.g. lint anchors) be
   * mapped onto `text` exactly, whatever the incoming markup looked like.
   */
  removed: Array<[number, number]>;
};

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

export function parseModelValue(mv: string): ParsedModelValue {
  const openRe = /<span\s+class=["']hl-([\w-]+)["']>/gi;
  const hls: Highlight[] = [];
  const removed: Array<[number, number]> = [];
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
    removed.push([m.index, innerStart]);
    removed.push([closeIdx, closeIdx + '</span>'.length]);
    i = closeIdx + '</span>'.length;
  }
  return { text: cleaned, hls, removed };
}

export function serializeModelValue(text: string, hls: Highlight[]): string {
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
export function shiftHighlight(
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

/**
 * Map an offset in the model value onto the parsed `text`, given the tag
 * spans `parseModelValue` removed. An offset inside a tag lands where the
 * tag was. Clamped to `[0, textLen]`.
 */
export function modelToInnerOffset(removed: Array<[number, number]>, offset: number, textLen: number): number {
  let inner = offset;
  for (const [s, e] of removed) {
    if (s >= offset) break;
    inner -= Math.min(e, offset) - s;
  }
  return Math.max(0, Math.min(inner, textLen));
}
