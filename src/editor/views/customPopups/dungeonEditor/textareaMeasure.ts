/**
 * Pixel Y of `offset` inside a textarea, soft-wrapped lines included. Native
 * textareas don't expose per-char rects, so a hidden mirror element styled
 * identically is measured with a marker placed at `offset`. The result is
 * relative to the textarea's border-box top (padding and border included).
 */
export function measureOffsetTop(ta: HTMLTextAreaElement, offset: number): number {
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

const LAYOUT_PROPS = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
  'letterSpacing', 'wordSpacing', 'lineHeight', 'tabSize',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
  'whiteSpace', 'wordBreak', 'overflowWrap', 'boxSizing', 'textIndent',
];

/** A copy of the textarea's text box laid exactly over it (fixed, scrolled the same). */
function overlayMirror(ta: HTMLTextAreaElement): HTMLDivElement {
  const cs = getComputedStyle(ta);
  const r = ta.getBoundingClientRect();
  const mirror = document.createElement('div');
  for (const p of LAYOUT_PROPS) (mirror.style as any)[p] = (cs as any)[p];
  Object.assign(mirror.style, {
    position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    boxSizing: 'border-box', overflow: 'hidden', borderColor: 'transparent', color: 'transparent',
    background: 'transparent', zIndex: '2147483647', pointerEvents: 'auto', margin: '0',
  });
  // Wrapping is the textarea's own (pre-wrap); the mirror must break lines where it does.
  if (cs.whiteSpace === 'normal') mirror.style.whiteSpace = 'pre-wrap';
  return mirror;
}

/** Viewport rect of the caret at `offset`, where a completion list anchors. */
export function caretRect(ta: HTMLTextAreaElement, offset: number): DOMRect {
  const mirror = overlayMirror(ta);
  mirror.style.visibility = 'hidden';
  mirror.appendChild(document.createTextNode(ta.value.substring(0, offset)));
  const marker = document.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  mirror.appendChild(document.createTextNode(ta.value.substring(offset) || ' '));
  document.body.appendChild(mirror);
  mirror.scrollTop = ta.scrollTop;
  mirror.scrollLeft = ta.scrollLeft;
  const rect = marker.getBoundingClientRect();
  document.body.removeChild(mirror);
  return rect;
}

/** The offset of the character under a viewport point, or -1 over empty space. */
export function offsetAtPoint(ta: HTMLTextAreaElement, x: number, y: number): number {
  const mirror = overlayMirror(ta);
  const text = document.createTextNode(ta.value);
  mirror.appendChild(text);
  document.body.appendChild(mirror);
  mirror.scrollTop = ta.scrollTop;
  mirror.scrollLeft = ta.scrollLeft;
  let offset = -1;
  try {
    const doc = document as any;
    const pos = doc.caretPositionFromPoint?.(x, y);
    const range: Range | null = pos ? null : doc.caretRangeFromPoint?.(x, y) ?? null;
    const node = pos ? pos.offsetNode : range?.startContainer;
    const at = pos ? pos.offset : range?.startOffset;
    if (node === text && typeof at === 'number') {
      // The caret position nearest the point: the character is on whichever side of it holds the point.
      const probe = document.createRange();
      for (const i of [at, at - 1]) {
        if (i < 0 || i >= ta.value.length) continue;
        probe.setStart(text, i);
        probe.setEnd(text, i + 1);
        const b = probe.getBoundingClientRect();
        if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) { offset = i; break; }
      }
    }
  } finally {
    document.body.removeChild(mirror);
  }
  return offset;
}
