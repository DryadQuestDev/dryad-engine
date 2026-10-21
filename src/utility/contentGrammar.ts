/**
 * The value grammars content actions share, as pure functions that keep each piece's offset.
 * The runtime (LogicSystem.getParts / parseOpsSpec / parseTargetedSpec) and the editor's checks
 * both parse with these, so a value the game reads one way is checked the same way.
 */

/** A piece of a value and the offset it starts at. */
export type Piece = { text: string; start: number };

export type OpsSpecOp = '=' | '+=' | '-=';

/** One `id op value` spec; `id`, `op` and `value` are missing when the spec does not parse. */
export type OpPiece = { spec: Piece; id?: Piece; op?: OpsSpecOp; value?: Piece };

/** One `target->item & !item` group; `target` is missing without a `->`. */
export type TargetedPiece = { spec: Piece; target?: Piece; items: Array<{ name: Piece; remove: boolean }> };

function piece(raw: string, base: number): Piece {
  const lead = raw.length - raw.trimStart().length;
  return { text: raw.trim(), start: base + lead };
}

/**
 * Split on commas outside `()` and `[]`. Middle parts are kept even when empty and a trailing
 * empty part is dropped, as the runtime always has.
 */
export function splitParts(str: string, base = 0): Piece[] {
  const parts: Piece[] = [];
  let bracketDepth = 0;
  let parenDepth = 0;
  let from = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (c === '[') bracketDepth++;
    else if (c === ']') bracketDepth--;
    else if (c === '(') parenDepth++;
    else if (c === ')') parenDepth--;
    else if (c === ',' && bracketDepth === 0 && parenDepth === 0) {
      parts.push(piece(str.slice(from, i), base + from));
      from = i + 1;
    }
  }
  const last = piece(str.slice(from), base + from);
  if (last.text) parts.push(last);
  return parts;
}

/** Split on every comma, dropping empty parts (no bracket awareness). */
export function splitCommas(str: string, base = 0): Piece[] {
  const out: Piece[] = [];
  let from = 0;
  for (const raw of str.split(',')) {
    const p = piece(raw, base + from);
    if (p.text) out.push(p);
    from += raw.length + 1;
  }
  return out;
}

// The id may hold a '-' ("x-y = 2"), so the lazy id stops at the first real operator.
const OP_SPEC = /^([^=<>+\s]+?)\s*(\+=|-=|=)\s*(.+)$/;

/** Comma-separated `id = value` / `id += value` / `id -= value` specs. */
export function splitOps(str: string, base = 0): OpPiece[] {
  return splitCommas(str, base).map((spec) => {
    const m = spec.text.match(OP_SPEC);
    if (!m) return { spec };
    const value = m[3].trim();
    return {
      spec,
      id: { text: m[1], start: spec.start },
      op: m[2] as OpsSpecOp,
      value: { text: value, start: spec.start + spec.text.length - value.length },
    };
  });
}

/** `target->item & item, target->!item` groups; commas inside an item's `(…)` stay with it. */
export function splitTargeted(str: string, base = 0): TargetedPiece[] {
  const out: TargetedPiece[] = [];
  for (const spec of splitParts(str, base)) {
    if (!spec.text) continue;
    const arrow = spec.text.indexOf('->');
    if (arrow === -1) {
      out.push({ spec, items: [] });
      continue;
    }
    const target = piece(spec.text.slice(0, arrow), spec.start);
    const items: TargetedPiece['items'] = [];
    let from = arrow + 2;
    for (const raw of spec.text.slice(arrow + 2).split('&')) {
      const token = piece(raw, spec.start + from);
      from += raw.length + 1;
      if (!token.text) continue;
      const remove = token.text.startsWith('!');
      const name = remove ? piece(token.text.slice(1), token.start + 1) : token;
      if (name.text) items.push({ name, remove });
    }
    out.push({ spec, target, items });
  }
  return out;
}

/** `id(props)` → the id before a `(…)` tail, and the tail's `key = value` pairs. */
export function splitProps(p: Piece): { id: Piece; props: Array<{ key: Piece; value: Piece }> } {
  const open = p.text.indexOf('(');
  if (open === -1) return { id: p, props: [] };
  const id = piece(p.text.slice(0, open), p.start);
  const close = p.text.lastIndexOf(')');
  const inner = p.text.slice(open + 1, close === -1 ? undefined : close);
  const props: Array<{ key: Piece; value: Piece }> = [];
  for (const part of splitParts(inner, p.start + open + 1)) {
    const eq = part.text.indexOf('=');
    if (eq === -1) {
      props.push({ key: part, value: { text: '', start: part.start + part.text.length } });
      continue;
    }
    props.push({ key: piece(part.text.slice(0, eq), part.start), value: piece(part.text.slice(eq + 1), part.start + eq + 1) });
  }
  return { id, props };
}
