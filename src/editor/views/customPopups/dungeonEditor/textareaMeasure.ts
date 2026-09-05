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
