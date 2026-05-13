// Strip manual highlight `<span class="hl-X">…</span>` wrappers from raw
// dungeon content before it's handed to `parseText` for `content_parsed.json`.
//
// Pure string-walking regex — never invokes `tmp.innerHTML = text`. The DOM
// variant we used previously parsed the entire file as HTML the moment ANY
// `hl-` span existed anywhere, which turned literal `<…>` in author content
// (choice values like `<How does this list of choices work?>`, author-typed
// `<strong>`, `<table>`, …) into mangled HTML-attribute soup. Walking as a
// string with depth-counted span tags preserves that content byte-for-byte.
const HL_OPEN_RE = /<span\s+class=["']hl-[\w-]+["']>/gi;
const ANY_SPAN_TAG_RE = /<(\/?)span\b[^>]*>/gi;

export function stripHighlights(text: string): string {
  if (!text || !text.includes('hl-')) return text;
  let out = '';
  let i = 0;
  while (i < text.length) {
    HL_OPEN_RE.lastIndex = i;
    const open = HL_OPEN_RE.exec(text);
    if (!open) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, open.index);
    // Find the matching `</span>` by counting nested span depth.
    ANY_SPAN_TAG_RE.lastIndex = open.index + open[0].length;
    let depth = 1;
    let closeIdx = -1;
    let m: RegExpExecArray | null;
    while ((m = ANY_SPAN_TAG_RE.exec(text)) !== null) {
      if (m[1] === '/') {
        depth--;
        if (depth === 0) { closeIdx = m.index; break; }
      } else {
        depth++;
      }
    }
    if (closeIdx === -1) {
      // Unclosed open — preserve verbatim so we don't drop content.
      out += open[0];
      i = open.index + open[0].length;
      continue;
    }
    out += text.slice(open.index + open[0].length, closeIdx);
    i = closeIdx + '</span>'.length;
  }
  return out;
}
