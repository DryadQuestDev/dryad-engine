import { parse, type Comment, type Node } from 'acorn';
import type { CallEntry, ValueSpec, VocabEntry } from '../contentVocabulary';

/**
 * What a game's and its plugins' scripts register, read without running them: the editor parses
 * each script and follows the register calls (registerAction / Condition / Placeholder /
 * TextEffect / State), plus the characters a script creates and the flags it sets.
 *
 * A name is read when it is a literal, a `const`, a loop or forEach over a literal list or object
 * (Object.keys / values / entries included), an import of one of those, or the argument of a
 * local helper called with one. A kind registered under a name the reader cannot work out is
 * marked open: the editor then stays quiet about unknown names of that kind.
 */

export type ScriptFile = {
  path: string;
  text: string;
  /** Who loads it: `plugin:<id>`, `game`, or `mod:<id>`. */
  source: string;
};

export type NameKind = 'action' | 'condition' | 'placeholder' | 'effect' | 'state';

export type Registration = { source: string; file: string; line: number };
export type ActionRegistration = Registration & VocabEntry;
export type CallRegistration = Registration & CallEntry;

export type ScriptVocabulary = {
  actions: Map<string, ActionRegistration>;
  conditions: Map<string, CallRegistration>;
  placeholders: Map<string, CallRegistration>;
  effects: Map<string, Registration>;
  states: Map<string, Registration>;
  /** Character ids passed to createCharacter / resetCharacter. */
  characters: Set<string>;
  /** Flag names passed to setFlag, with and without a `dungeon.` prefix. */
  flags: Set<string>;
  /** Kinds some script registers under a name the reader could not work out. */
  open: Set<NameKind>;
  /** Where those registrations are. */
  unresolved: Array<{ kind: NameKind; file: string; line: number }>;
  /** Scripts that did not parse. */
  unread: string[];
};

// ---------------------------------------------------------------------------------------------
// Static values
// ---------------------------------------------------------------------------------------------

/** A value the reader cannot know. Objects and arrays may hold it and still be partly known. */
const UNKNOWN: unique symbol = Symbol('unknown');
/** A function value: never called, but it does not make its object unknown. */
const FUNCTION: unique symbol = Symbol('function');
type Value = string | number | boolean | null | undefined | typeof UNKNOWN | typeof FUNCTION | Value[] | { [k: string]: Value };

type AnyNode = Node & Record<string, any>;
type FunctionNode = AnyNode;

class Scope {
  vars = new Map<string, Value>();
  fns = new Map<string, FunctionNode>();
  constructor(public parent: Scope | null) {}
  lookup(name: string): { value?: Value; fn?: FunctionNode } | null {
    for (let s: Scope | null = this; s; s = s.parent) {
      if (s.vars.has(name)) return { value: s.vars.get(name) };
      if (s.fns.has(name)) return { fn: s.fns.get(name) };
    }
    return null;
  }
}

const REGISTER: Record<string, NameKind> = {
  registerAction: 'action', registerCondition: 'condition', registerPlaceholder: 'placeholder',
  registerTextEffect: 'effect', registerState: 'state',
};

/** Loops and inlined helpers walk a body once per value; past this many the kind is open. */
const MAX_UNROLL = 2000;
const MAX_INLINE_DEPTH = 4;

type Module = { file: ScriptFile; ast: AnyNode; comments: Comment[]; scope: Scope; lineStarts: number[]; imports: Map<string, { from: string; name: string }> };

export function readScripts(files: ScriptFile[]): ScriptVocabulary {
  const out: ScriptVocabulary = {
    actions: new Map(), conditions: new Map(), placeholders: new Map(), effects: new Map(), states: new Map(),
    characters: new Set(), flags: new Set(), open: new Set(), unresolved: [], unread: [],
  };
  const modules = new Map<string, Module>();
  for (const file of files) {
    const comments: Comment[] = [];
    let ast: AnyNode;
    try {
      ast = parse(file.text, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true, allowAwaitOutsideFunction: true, onComment: comments }) as AnyNode;
    } catch {
      out.unread.push(file.path);
      // A script nobody can read may register anything.
      for (const k of Object.values(REGISTER)) out.open.add(k);
      continue;
    }
    const lineStarts = [0];
    for (let i = 0; i < file.text.length; i++) if (file.text[i] === '\n') lineStarts.push(i + 1);
    modules.set(normalize(file.path), { file, ast, comments, scope: new Scope(null), lineStarts, imports: new Map() });
  }

  // Top-level constants first (in every module), so a function above a const still sees it.
  const evaluating = new Set<string>();
  const ready = new Set<string>();
  const prepare = (key: string) => {
    if (ready.has(key) || evaluating.has(key)) return;
    const m = modules.get(key);
    if (!m) return;
    evaluating.add(key);
    for (const st of m.ast.body as AnyNode[]) {
      if (st.type === 'ImportDeclaration') {
        const from = resolveImport(key, String(st.source.value));
        for (const sp of st.specifiers) {
          const name = sp.type === 'ImportSpecifier' ? (sp.imported.name ?? sp.imported.value) : sp.type === 'ImportDefaultSpecifier' ? 'default' : '*';
          m.imports.set(sp.local.name, { from, name });
        }
      }
    }
    for (const st of m.ast.body as AnyNode[]) {
      const decl = st.type === 'ExportNamedDeclaration' ? st.declaration : st.type === 'ExportDefaultDeclaration' ? null : st;
      if (decl?.type === 'FunctionDeclaration' && decl.id) m.scope.fns.set(decl.id.name, decl);
    }
    for (const st of m.ast.body as AnyNode[]) {
      const decl = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
      if (decl?.type === 'VariableDeclaration' && decl.kind === 'const') bindDeclaration(decl, m.scope, m);
    }
    evaluating.delete(key);
    ready.add(key);
  };
  const exported = (key: string, name: string): Value => {
    prepare(key);
    const m = modules.get(key);
    if (!m) return UNKNOWN;
    const hit = m.scope.lookup(name);
    return hit && 'value' in hit ? hit.value : UNKNOWN;
  };

  /** Evaluate an expression to what is statically known about it. */
  function evaluate(node: AnyNode | null | undefined, scope: Scope, m: Module): Value {
    if (!node) return undefined;
    switch (node.type) {
      case 'Literal':
        return node.regex ? UNKNOWN : node.value;
      case 'TemplateLiteral': {
        let s = '';
        for (let i = 0; i < node.quasis.length; i++) {
          s += node.quasis[i].value.cooked ?? '';
          if (i < node.expressions.length) {
            const v = evaluate(node.expressions[i], scope, m);
            if (typeof v !== 'string' && typeof v !== 'number') return UNKNOWN;
            s += String(v);
          }
        }
        return s;
      }
      case 'ArrayExpression': {
        const arr: Value[] = [];
        for (const el of node.elements) {
          if (!el) continue;
          if (el.type === 'SpreadElement') {
            const v = evaluate(el.argument, scope, m);
            if (!Array.isArray(v)) return UNKNOWN;
            arr.push(...v);
          } else arr.push(evaluate(el, scope, m));
        }
        return arr;
      }
      case 'ObjectExpression': {
        const obj: Record<string, Value> = {};
        for (const p of node.properties) {
          if (p.type === 'SpreadElement') {
            const v = evaluate(p.argument, scope, m);
            if (!isObject(v)) return UNKNOWN;
            Object.assign(obj, v);
            continue;
          }
          const key = p.computed ? evaluate(p.key, scope, m) : (p.key.name ?? p.key.value);
          if (typeof key !== 'string' && typeof key !== 'number') return UNKNOWN;
          obj[String(key)] = p.kind === 'init' && !p.method ? evaluate(p.value, scope, m) : FUNCTION;
        }
        return obj;
      }
      case 'Identifier': {
        if (node.name === 'undefined') return undefined;
        const hit = scope.lookup(node.name);
        if (hit) return 'value' in hit ? hit.value : FUNCTION;
        const imp = m.imports.get(node.name);
        if (imp && imp.name !== '*' && imp.name !== 'default') return exported(imp.from, imp.name);
        return UNKNOWN;
      }
      case 'MemberExpression': {
        const obj = evaluate(node.object, scope, m);
        const key = node.computed ? evaluate(node.property, scope, m) : node.property.name;
        if (Array.isArray(obj)) {
          if (key === 'length') return obj.length;
          return typeof key === 'number' ? obj[key] ?? undefined : UNKNOWN;
        }
        if (isObject(obj) && (typeof key === 'string' || typeof key === 'number')) return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
        if (typeof obj === 'string' && key === 'length') return obj.length;
        return UNKNOWN;
      }
      case 'CallExpression': {
        const callee = node.callee;
        if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.object.name === 'Object' && !callee.computed) {
          const arg = evaluate(node.arguments[0], scope, m);
          if (!isObject(arg)) return UNKNOWN;
          if (callee.property.name === 'keys') return Object.keys(arg);
          if (callee.property.name === 'values') return Object.values(arg);
          if (callee.property.name === 'entries') return Object.entries(arg).map(([k, v]) => [k, v]);
        }
        if (callee.type === 'MemberExpression' && !callee.computed && ['map', 'filter'].includes(callee.property.name)) return UNKNOWN;
        return UNKNOWN;
      }
      case 'BinaryExpression': {
        if (node.operator !== '+') return UNKNOWN;
        const a = evaluate(node.left, scope, m);
        const b = evaluate(node.right, scope, m);
        if ((typeof a === 'string' || typeof a === 'number') && (typeof b === 'string' || typeof b === 'number')) return (a as any) + (b as any);
        return UNKNOWN;
      }
      case 'UnaryExpression': {
        const v = evaluate(node.argument, scope, m);
        if (node.operator === '-' && typeof v === 'number') return -v;
        if (node.operator === '!' && v !== UNKNOWN && v !== FUNCTION && !Array.isArray(v) && !isObject(v)) return !v;
        return UNKNOWN;
      }
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        return FUNCTION;
      case 'ParenthesizedExpression':
        return evaluate(node.expression, scope, m);
      default:
        return UNKNOWN;
    }
  }

  /** Bind a `const` / `let` / loop declaration's names. */
  function bindDeclaration(decl: AnyNode, scope: Scope, m: Module) {
    for (const d of decl.declarations) {
      if (d.init?.type === 'ArrowFunctionExpression' || d.init?.type === 'FunctionExpression') {
        if (d.id.type === 'Identifier') scope.fns.set(d.id.name, d.init);
        continue;
      }
      bindPattern(d.id, decl.kind === 'const' && d.init ? evaluate(d.init, scope, m) : UNKNOWN, scope);
    }
  }

  function bindPattern(pattern: AnyNode, value: Value, scope: Scope) {
    if (!pattern) return;
    if (pattern.type === 'Identifier') scope.vars.set(pattern.name, value);
    else if (pattern.type === 'ObjectPattern') {
      for (const p of pattern.properties) {
        if (p.type === 'RestElement') { bindPattern(p.argument, UNKNOWN, scope); continue; }
        const key = p.computed ? null : (p.key.name ?? p.key.value);
        bindPattern(p.value, isObject(value) && key != null ? value[key] : UNKNOWN, scope);
      }
    } else if (pattern.type === 'ArrayPattern') {
      pattern.elements.forEach((el: AnyNode, i: number) => {
        if (!el) return;
        if (el.type === 'RestElement') bindPattern(el.argument, Array.isArray(value) ? value.slice(i) : UNKNOWN, scope);
        else bindPattern(el, Array.isArray(value) ? value[i] : UNKNOWN, scope);
      });
    } else if (pattern.type === 'AssignmentPattern') {
      bindPattern(pattern.left, value === undefined ? UNKNOWN : value, scope);
    }
  }

  // Functions some call site walked with its arguments: their plain walk (arguments unknown) is
  // left out, so a helper does not report the names it registers as unknown.
  const inlined = new Set<FunctionNode>();
  type Pending = { kind: NameKind; chain: FunctionNode[]; file: string; line: number };
  const pendingOpen: Pending[] = [];

  function lineOf(m: Module, pos: number): number {
    let lo = 0;
    let hi = m.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (m.lineStarts[mid] <= pos) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  }

  /** The comment block right above the statement at `pos`, as one line of help. */
  function commentAbove(m: Module, pos: number): string | undefined {
    const line = lineOf(m, pos);
    const block: string[] = [];
    let want = line - 1;
    for (let i = m.comments.length - 1; i >= 0; i--) {
      const c = m.comments[i];
      if (c.end > pos) continue;
      const endLine = lineOf(m, c.end - 1);
      if (endLine !== want) break;
      if (c.type === 'Block') {
        const text = c.value.split('\n').map((l) => l.replace(/^\s*\*?\s?/, '')).join('\n');
        block.unshift(text.split(/\n\s*@/)[0]);
      } else block.unshift(c.value);
      want = lineOf(m, c.start) - 1;
    }
    const help = block.join(' ').replace(/\s+/g, ' ').trim();
    return help || undefined;
  }

  function toSpec(v: Value): ValueSpec | undefined {
    if (v === undefined || v === FUNCTION) return undefined;
    const clean = (x: Value): any => {
      if (x === UNKNOWN || x === FUNCTION) return 'any';
      if (Array.isArray(x)) return x.map(clean);
      if (isObject(x)) return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, clean(y)]));
      return x;
    };
    return clean(v) as ValueSpec;
  }

  function record(kind: NameKind, idValue: Value, call: AnyNode, scope: Scope, m: Module, statementStart: number, chain: FunctionNode[]) {
    const ids = typeof idValue === 'string' ? [idValue] : null;
    if (!ids) {
      pendingOpen.push({ kind, chain, file: m.file.path, line: lineOf(m, call.start) });
      return;
    }
    const base: Registration = { source: m.file.source, file: m.file.path, line: lineOf(m, call.start) };
    const id = ids[0];
    const second = call.arguments[1] as AnyNode | undefined;
    const third = call.arguments[2] as AnyNode | undefined;
    const comment = commentAbove(m, statementStart);
    if (kind === 'action') {
      const obj = second && second.type === 'ObjectExpression' ? evaluate(second, scope, m) : undefined;
      const help = isObject(obj) && typeof obj.help === 'string' ? obj.help : comment;
      const value = isObject(obj) ? toSpec(obj.value) : undefined;
      const examples = isObject(obj) ? strings(obj.examples) : undefined;
      out.actions.set(id, { ...base, ...(help ? { help } : {}), ...(value ? { value } : {}), ...(examples ? { examples } : {}) });
    } else if (kind === 'condition' || kind === 'placeholder') {
      const info = third ? evaluate(third, scope, m) : undefined;
      const help = isObject(info) && typeof info.help === 'string' ? info.help : comment;
      const args = isObject(info) && Array.isArray(info.args) ? (info.args.map(toSpec).map((a) => a ?? 'any') as ValueSpec[]) : undefined;
      const examples = isObject(info) ? strings(info.examples) : undefined;
      (kind === 'condition' ? out.conditions : out.placeholders).set(id, { ...base, ...(help ? { help } : {}), ...(args ? { args } : {}), ...(examples ? { examples } : {}) });
    } else if (kind === 'effect') out.effects.set(id, base);
    else out.states.set(id, base);
  }

  /** `chain`: the functions around this code that were walked without their arguments. */
  function walk(node: AnyNode | null | undefined, scope: Scope, m: Module, chain: FunctionNode[], depth: number, statementStart: number) {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'ImportDeclaration':
      case 'ExportAllDeclaration':
        return;
      case 'VariableDeclaration':
        if (scope.parent !== null) bindDeclaration(node, scope, m);
        for (const d of node.declarations) {
          if (d.init?.type === 'ArrowFunctionExpression' || d.init?.type === 'FunctionExpression') continue;
          walk(d.init, scope, m, chain, depth, statementStart);
        }
        return;
      case 'FunctionDeclaration':
        if (node.id && !scope.fns.has(node.id.name)) scope.fns.set(node.id.name, node);
        walkFunction(node, scope, m, null, chain, depth);
        return;
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        walkFunction(node, scope, m, null, chain, depth);
        return;
      case 'ForOfStatement':
      case 'ForInStatement': {
        const right = evaluate(node.right, scope, m);
        const values = node.type === 'ForInStatement'
          ? (isObject(right) ? Object.keys(right) : Array.isArray(right) ? right.map((_, i) => String(i)) : null)
          : (Array.isArray(right) ? right : typeof right === 'string' ? [...right] : null);
        const pattern = node.left.type === 'VariableDeclaration' ? node.left.declarations[0].id : node.left;
        if (values && values.length <= MAX_UNROLL) {
          for (const v of values) {
            const inner = new Scope(scope);
            bindPattern(pattern, v, inner);
            walk(node.body, inner, m, chain, depth, statementStart);
          }
        } else {
          const inner = new Scope(scope);
          bindPattern(pattern, UNKNOWN, inner);
          walk(node.body, inner, m, chain, depth, statementStart);
        }
        return;
      }
      case 'BlockStatement':
      case 'StaticBlock': {
        const inner = new Scope(scope);
        for (const st of node.body) if (st.type === 'FunctionDeclaration' && st.id) inner.fns.set(st.id.name, st);
        for (const st of node.body) walk(st, inner, m, chain, depth, st.start);
        return;
      }
      case 'CallExpression':
        handleCall(node, scope, m, chain, depth, statementStart);
        return;
    }
    for (const key in node) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) if (c && typeof c.type === 'string') walk(c, scope, m, chain, depth, isStatement(c) ? c.start : statementStart);
      } else if (child && typeof child.type === 'string') walk(child, scope, m, chain, depth, isStatement(child) ? child.start : statementStart);
    }
  }

  /**
   * Walk a function body. With `args` (a call site's values) its parameters are bound and what it
   * registers is final; without, they are unknown and the function joins the chain.
   */
  function walkFunction(f: FunctionNode, scope: Scope, m: Module, args: Value[] | null, chain: FunctionNode[], depth: number) {
    const inner = new Scope(scope);
    f.params.forEach((p: AnyNode, i: number) => bindPattern(p, args ? args[i] : UNKNOWN, inner));
    const next = args ? chain : [...chain, f];
    if (f.body.type === 'BlockStatement') {
      for (const st of f.body.body) if (st.type === 'FunctionDeclaration' && st.id) inner.fns.set(st.id.name, st);
      for (const st of f.body.body) walk(st, inner, m, next, depth, st.start);
    } else walk(f.body, inner, m, next, depth, f.body.start);
  }

  function handleCall(node: AnyNode, scope: Scope, m: Module, chain: FunctionNode[], depth: number, statementStart: number) {
    const callee = node.callee;
    const method = callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : null;
    const kind = method ? REGISTER[method] : undefined;

    if (kind) {
      record(kind, evaluate(node.arguments[0], scope, m), node, scope, m, statementStart, chain);
    } else if (method === 'createCharacter' || method === 'resetCharacter') {
      const id = evaluate(node.arguments[0], scope, m);
      if (typeof id === 'string') out.characters.add(id);
    } else if (method === 'setFlag') {
      const id = evaluate(node.arguments[0], scope, m);
      if (typeof id === 'string') {
        out.flags.add(id);
        const dot = id.indexOf('.');
        if (dot !== -1) out.flags.add(id.slice(dot + 1));
      }
    }

    // `list.forEach((x) => …)` over a known list: walk the callback once per element.
    if (method === 'forEach' && node.arguments[0] && /Function/.test(node.arguments[0].type)) {
      const list = evaluate(callee.object, scope, m);
      if (Array.isArray(list) && list.length <= MAX_UNROLL) {
        const cb = node.arguments[0];
        inlined.add(cb);
        list.forEach((v, i) => walkFunction(cb, scope, m, [v, i, list], chain, depth));
        walk(callee.object, scope, m, chain, depth, statementStart);
        return;
      }
    }

    // A local helper called with what we can know of its arguments.
    if (callee.type === 'Identifier') {
      const hit = scope.lookup(callee.name);
      if (hit?.fn && depth < MAX_INLINE_DEPTH) {
        inlined.add(hit.fn);
        walkFunction(hit.fn, scope, m, node.arguments.map((a: AnyNode) => evaluate(a, scope, m)), chain, depth + 1);
      }
    }

    walk(callee, scope, m, chain, depth, statementStart);
    for (const a of node.arguments) walk(a, scope, m, chain, depth, statementStart);
  }

  for (const [key, m] of modules) {
    prepare(key);
    for (const st of m.ast.body as AnyNode[]) walk(st, m.scope, m, [], 0, st.start);
  }
  for (const p of pendingOpen) {
    if (p.chain.some((f) => inlined.has(f))) continue;
    out.open.add(p.kind);
    if (!out.unresolved.some((u) => u.file === p.file && u.line === p.line)) out.unresolved.push({ kind: p.kind, file: p.file, line: p.line });
  }
  return out;
}

/** A list of literal strings, or undefined for anything else. */
function strings(v: Value): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string');
  return out.length ? out : undefined;
}

function isObject(v: Value): v is { [k: string]: Value } {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isStatement(n: AnyNode): boolean {
  return /Statement$|Declaration$/.test(n.type);
}

function normalize(p: string): string {
  const parts: string[] = [];
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop(); else parts.push(seg);
  }
  return parts.join('/');
}

function resolveImport(fromKey: string, spec: string): string {
  if (!spec.startsWith('.')) return spec;
  const dir = fromKey.split('/').slice(0, -1).join('/');
  return normalize(`${dir}/${spec}`);
}
