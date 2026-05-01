import type { Block, Document, EncounterBlock, SceneBlock, TemplateBlock } from './ast';

const ALL_EDITOR_SPAN_RE = /<span\s+class=["'](?:hl|at|ae)-[\w-]+["']>([\s\S]*?)<\/span>/gi;
const AUTO_TOKEN_SPAN_RE = /<span\s+class=["'](?:at|ae)-[\w-]+["']>([\s\S]*?)<\/span>/gi;

function stripSpansBy(s: string, re: RegExp): string {
  if (!s) return s;
  let out = s;
  let prev;
  do {
    prev = out;
    out = out.replace(re, '$1');
  } while (out !== prev);
  return out;
}

// Plain-text export: strip every visual span, including manual highlights.
function stripAllEditorSpans(s: string): string {
  return stripSpansBy(s, ALL_EDITOR_SPAN_RE);
}

// HTML export: strip only auto-tokens; keep manual `hl-*` highlights so the
// walker can convert them to inline-styled spans for the paste target.
function stripAutoTokens(s: string): string {
  return stripSpansBy(s, AUTO_TOKEN_SPAN_RE);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// --- Token highlighting (mirrors RichContentEditor's auto-bold) ---------

const STYLE_BRACE = 'font-weight:bold;color:#9c27b0';
const STYLE_ANCHOR = 'font-weight:bold;color:#6a1b9a';
const STYLE_BR = 'font-weight:bold;color:#00838f;background:rgba(0,188,212,0.12);padding:0 2px;border-radius:2px';
const STYLE_RECORD = 'font-weight:bold;color:#1976d2';
const STYLE_PLACEHOLDER = 'font-weight:bold;color:#2e7d32';
const STYLE_COMMENT = 'color:#888;font-style:italic';
const STYLE_STRONG = 'font-weight:bold';
const STYLE_EM = 'font-style:italic';

const COND_KEYWORDS = ['ifOr', 'else', 'if', 'fi'] as const;

type TokenRange = { start: number; end: number; style: string };

function findTokenRanges(text: string): TokenRange[] {
  const out: TokenRange[] = [];

  // Balanced `{...}` braces, including the leading if/ifOr/else/fi keyword.
  {
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '{') {
        if (depth === 0) start = i;
        depth++;
      } else if (c === '}' && depth > 0) {
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
          out.push({ start: rangeStart, end: i + 1, style: STYLE_BRACE });
          start = -1;
        }
      }
    }
  }

  let m: RegExpExecArray | null;
  for (const re of [/(^|\n)&\w+/g]) {
    while ((m = re.exec(text)) !== null) {
      const leadOffset = m[1] === '\n' ? 1 : 0;
      out.push({ start: m.index + leadOffset, end: m.index + m[0].length, style: STYLE_ANCHOR });
    }
  }
  for (const re = /\[br\]/gi; (m = re.exec(text)) !== null;) {
    out.push({ start: m.index, end: m.index + m[0].length, style: STYLE_BR });
  }
  for (const re = /\[\[[^\[\]\n]+\]\]/g; (m = re.exec(text)) !== null;) {
    out.push({ start: m.index, end: m.index + m[0].length, style: STYLE_RECORD });
  }
  for (const re = /\|[^|\n]+\|/g; (m = re.exec(text)) !== null;) {
    out.push({ start: m.index, end: m.index + m[0].length, style: STYLE_PLACEHOLDER });
  }
  for (const re = /^[ \t]*\/\/[^\n]*/gm; (m = re.exec(text)) !== null;) {
    out.push({ start: m.index, end: m.index + m[0].length, style: STYLE_COMMENT });
  }
  // Emphasis: `**text**` → italic, `*text*` → bold (longest first so they
  // override outer brace/record/placeholder bold on the same chars when they
  // wrap them, but lose to those when nested inside).
  const emRanges: Array<[number, number]> = [];
  for (const re = /\*\*([^*\n]+?)\*\*/g; (m = re.exec(text)) !== null;) {
    out.push({ start: m.index, end: m.index + m[0].length, style: STYLE_EM });
    emRanges.push([m.index, m.index + m[0].length]);
  }
  for (const re = /\*([^*\n]+?)\*/g; (m = re.exec(text)) !== null;) {
    const s = m.index, e = m.index + m[0].length;
    const overlapsEm = emRanges.some(([ds, de]) => !(e <= ds || s >= de));
    if (!overlapsEm) out.push({ start: s, end: e, style: STYLE_STRONG });
  }
  return out;
}

function highlightTokens(text: string): string {
  if (!text) return '';
  const ranges = findTokenRanges(text);
  if (ranges.length === 0) return esc(text);
  // Longest range first; shortest overrides on overlap so the inner token
  // (e.g. `|placeholder|` inside `*…*`) wins for color while still appearing
  // bold via the placeholder style.
  ranges.sort((a, b) => (b.end - b.start) - (a.end - a.start));
  const styleAt: string[] = new Array(text.length).fill('');
  for (const r of ranges) {
    for (let i = r.start; i < r.end; i++) styleAt[i] = r.style;
  }
  let out = '';
  let i = 0;
  while (i < text.length) {
    const style = styleAt[i];
    let j = i;
    while (j < text.length && styleAt[j] === style) j++;
    const chunk = esc(text.slice(i, j));
    out += style ? `<span style="${style}">${chunk}</span>` : chunk;
    i = j;
  }
  return out;
}

// Manual highlight palette — keep in sync with `.hl-*` rules in
// RichContentEditor.vue. We translate the class to an inline `background-color`
// style so the highlight survives a paste into Google Docs / external editors
// that don't load our stylesheet.
const HIGHLIGHT_BG: Record<string, string> = {
  yellow: '#fff3a3',
  pink: '#ffb3b3',
  orange: '#ffd9a3',
  green: '#b3f5c0',
  blue: '#cfe8ff',
  purple: '#e5ccff',
};

function highlightClassToInlineStyle(className: string | null): string | null {
  if (!className) return null;
  for (const cls of className.split(/\s+/)) {
    if (cls.startsWith('hl-')) {
      const bg = HIGHLIGHT_BG[cls.slice(3)];
      if (bg) return `background-color:${bg}`;
    }
  }
  return null;
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function walkAndHighlight(node: Node): string {
  let out = '';
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3 /* TEXT_NODE */) {
      out += highlightTokens(child.textContent || '');
    } else if (child.nodeType === 1 /* ELEMENT_NODE */) {
      const el = child as Element;
      const inner = walkAndHighlight(el);
      const hlStyle = highlightClassToInlineStyle(el.getAttribute('class'));
      if (hlStyle) {
        out += `<span style="${hlStyle}">${inner}</span>`;
        continue;
      }
      // Preserve other inline tags (e.g. <a href>) verbatim with their
      // attributes — dungeon_content allows raw HTML for links etc.
      const tagName = el.tagName.toLowerCase();
      const attrs: string[] = [];
      for (const attr of Array.from(el.attributes)) {
        attrs.push(`${attr.name}="${escAttr(attr.value)}"`);
      }
      const openTag = attrs.length ? `<${tagName} ${attrs.join(' ')}>` : `<${tagName}>`;
      if (tagName === 'br' || tagName === 'hr' || tagName === 'img') {
        out += openTag;
      } else {
        out += `${openTag}${inner}</${tagName}>`;
      }
    }
  }
  return out;
}

function cellContent(raw: string): string {
  // Pipeline: strip auto-token spans (visual-only) → walk DOM, applying
  // token highlighting to text nodes and translating `hl-*` highlight spans
  // to inline-styled spans (so they survive paste). Newlines never fall
  // inside a token range, so converting them to <br> last is safe.
  if (!raw) return '';
  const stripped = stripAutoTokens(raw);
  const tmp = document.createElement('div');
  tmp.innerHTML = stripped;
  return walkAndHighlight(tmp).replace(/\n/g, '<br>');
}

const COLOR_ROOM = '#ffe599';
const COLOR_ENCOUNTER = '#b4a7d6';
const COLOR_ENCOUNTER_DESCRIPTION = '#ffe599';
const COLOR_SCENE = '#9fc5e8';
const COLOR_TEMPLATE = '#b7b7b7';
const COLOR_QUEST_TITLE = '#00ffff';
const COLOR_QUEST_STAGE = '#ffd580';
const COLOR_QUEST_GOAL = '#ffff00';

function headerCellStyle(bg: string): string {
  return `background-color:${bg};padding:4px 8px`;
}

function tableOpen(): string {
  return '<table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;border:1px solid #ccc;margin:4px 0;width:500px;table-layout:fixed">';
}

function h3(text: string): string {
  return `<h3 style="margin:0;font-weight:bold">${text}</h3>`;
}

function questKindOf(id: string | undefined): 'title' | 'main_stage' | 'goal' | 'goal_stage' | null {
  if (!id) return null;
  const parts = id.split('.');
  if (parts.length === 2 && parts[1] === 'main') return 'title';
  if (parts.length === 2 && parts[1] && parts[1] !== 'main') return 'goal';
  if (parts.length === 3 && parts[1] === 'main') return 'main_stage';
  if (parts.length === 3 && parts[1] && parts[1] !== 'main') return 'goal_stage';
  return null;
}

function templateBg(id: string | undefined): string {
  const q = questKindOf(id);
  if (q === 'title') return COLOR_QUEST_TITLE;
  if (q === 'goal') return COLOR_QUEST_GOAL;
  if (q === 'main_stage' || q === 'goal_stage') return COLOR_QUEST_STAGE;
  return COLOR_TEMPLATE;
}

function encounterBg(id: string): string {
  return id === 'description' ? COLOR_ENCOUNTER_DESCRIPTION : COLOR_ENCOUNTER;
}

function encounterToHtml(block: EncounterBlock): string {
  const header = highlightTokens('@' + block.id + (block.paramsRaw ?? ''));
  const rows: string[] = [];
  rows.push(`<tr><td style="${headerCellStyle(encounterBg(block.id))}">${h3(header)}</td></tr>`);

  const textParts: string[] = [];
  for (const row of block.rows) {
    if (row.kind === 'choice') {
      const choice = '!' + row.name
        + (row.value !== undefined ? '<' + row.value + '>' : '')
        + (row.paramsRaw ?? '');
      rows.push(`<tr><td style="font-weight:bold;padding:4px 8px">${highlightTokens(choice)}</td></tr>`);
    } else if (row.kind === 'text') {
      textParts.push(row.text);
    } else if (row.kind === 'comment') {
      // Comments aren't copied to tables (they're author-only notes in source)
    }
  }
  const body = textParts.join('\n').trim();
  if (body) {
    rows.push(`<tr><td style="padding:4px 8px">${cellContent(body)}</td></tr>`);
  }
  return `${tableOpen()}${rows.join('')}</table>`;
}

function sceneToHtml(block: SceneBlock): string {
  const header = highlightTokens('#' + block.id + (block.paramsRaw ?? ''));
  const parts: string[] = [];
  parts.push(`${tableOpen()}<tr><td style="${headerCellStyle(COLOR_SCENE)}">${h3(header)}</td></tr></table>`);
  block.rows.forEach((row, idx) => {
    const n = idx + 1;
    // Top-to-bottom layout: one <tr> for the row number, then one <tr> per
    // column underneath (mirrors the Apps-Script `sceneRow` template).
    const trs: string[] = [];
    trs.push(`<tr><td style="text-align:center;padding:4px">${n}</td></tr>`);
    for (const col of row.columns) {
      const prefix = col.kind === '%'
        ? '%'
        : '~' + (col.name ?? '') + (col.paramsRaw ?? '');
      const body = col.content ? `<br>${cellContent(col.content)}` : '';
      trs.push(`<tr><td style="padding:4px 8px"><strong>${highlightTokens(prefix)}</strong>${body}</td></tr>`);
    }
    parts.push(`${tableOpen()}${trs.join('')}</table>`);
  });
  return parts.join('');
}

function templateToHtml(block: TemplateBlock): string {
  const header = highlightTokens('$' + block.id + (block.paramsRaw ?? ''));
  const rows: string[] = [];
  rows.push(`<tr><td style="${headerCellStyle(templateBg(block.id))}">${h3(header)}</td></tr>`);
  const text = block.rows
    .filter((r) => r.kind === 'text' || r.kind === 'empty')
    .map((r) => (r.kind === 'text' ? r.text : ''))
    .join('\n')
    .trim();
  rows.push(`<tr><td style="padding:4px 8px">${text ? cellContent(text) : ''}</td></tr>`);
  return `${tableOpen()}${rows.join('')}</table>`;
}

function roomToHtml(block: { id: string; paramsRaw?: string }): string {
  const header = esc('^' + block.id + (block.paramsRaw ?? ''));
  return `<h2 style="font-weight:bold;margin:12px 0 4px 0">${header}</h2>`;
}

export function exportBlockAsHtml(block: Block): string {
  switch (block.kind) {
    case 'room': return roomToHtml(block);
    case 'encounter': return encounterToHtml(block);
    case 'scene': return sceneToHtml(block);
    case 'template': return templateToHtml(block);
    case 'raw': return `<pre style="margin:4px 0">${esc(block.text)}</pre>`;
  }
}

export function exportDocumentAsHtml(doc: Document): string {
  return doc.blocks.map(exportBlockAsHtml).join('\n');
}

export function exportDocumentAsText(serialized: string): string {
  return stripAllEditorSpans(serialized);
}
