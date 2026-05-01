const HL_SPAN_RE = /<span\s+class=["']hl-[\w-]+["']>([\s\S]*?)<\/span>/gi;

export function stripHighlights(text: string): string {
  if (!text) return text;
  let out = text;
  let prev;
  do {
    prev = out;
    out = out.replace(HL_SPAN_RE, '$1');
  } while (out !== prev);
  return out;
}
