// Builds the command-line tools shipped in public/assets/engine_files/tools/:
//  - builtin_vocabulary.json: the engine's own actions, conditions, placeholders, states and text
//    effects with their help, exported by running InitSystem's registrations against a recorder;
//  - dryad.mjs: the content checks and parser as one dependency-free Node script.
// Run with `npm run build:cli`; `npm run build` runs it first.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public/assets/engine_files/tools');
fs.mkdirSync(outDir, { recursive: true });
const tsconfigRaw = { compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false } };

// --- builtin_vocabulary.json ---
// InitSystem lives in the game code, which imports the whole UI: its .vue/.css files and the
// IndexedDB wrapper are stubbed, and the few browser globals touched at import time faked.
const stubs = {
  name: 'stub-browser-modules',
  setup(b) {
    b.onResolve({ filter: /\.(vue|css|scss)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default {};', loader: 'js' }));
    b.onResolve({ filter: /^idb$/ }, () => ({ path: 'idb', namespace: 'stub-idb' }));
    b.onLoad({ filter: /.*/, namespace: 'stub-idb' }, () => ({ contents: 'export function openDB() { return new Promise(() => {}); }', loader: 'js' }));
  },
};
const browserGlobals = [
  'const __noop = () => {};',
  'const __el = () => ({ style: {}, classList: { add: __noop, remove: __noop, toggle: __noop, contains: () => false }, setAttribute: __noop, getAttribute: () => null, appendChild: __noop, removeChild: __noop, addEventListener: __noop, removeEventListener: __noop, querySelector: () => null, querySelectorAll: () => [] });',
  'globalThis.window = globalThis;',
  'globalThis.Storage = class { getItem() { return null; } setItem() {} removeItem() {} clear() {} key() { return null; } get length() { return 0; } };',
  'globalThis.localStorage = new Storage(); globalThis.sessionStorage = new Storage();',
  'globalThis.document = { ...__el(), createElement: __el, createElementNS: __el, createTextNode: __el, head: __el(), body: __el(), documentElement: __el(), getElementById: () => null, fonts: { ready: Promise.resolve(), add: __noop } };',
  "try { globalThis.navigator ??= { userAgent: 'node' }; } catch {}",
  'globalThis.Image = class { set src(v) {} };',
  'globalThis.Audio = class { play() { return Promise.resolve(); } pause() {} };',
  'globalThis.AudioContext = class { createGain() { return { connect: __noop, gain: {} }; } };',
  'globalThis.matchMedia = () => ({ matches: false, addEventListener: __noop, removeEventListener: __noop });',
  'globalThis.requestAnimationFrame = (f) => setTimeout(f, 16); globalThis.cancelAnimationFrame = clearTimeout;',
  "for (const n of ['ResizeObserver', 'MutationObserver', 'IntersectionObserver']) globalThis[n] = class { observe() {} disconnect() {} unobserve() {} };",
  "for (const n of ['HTMLElement', 'Element', 'Node', 'SVGElement', 'HTMLCanvasElement', 'HTMLImageElement', 'Event', 'CustomEvent', 'KeyboardEvent']) globalThis[n] ??= class {};",
  'globalThis.customElements = { define: __noop, get: () => undefined };',
  "globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });",
  "globalThis.location = { href: 'http://localhost/', origin: 'http://localhost', pathname: '/', search: '', hash: '', reload: __noop };",
  'globalThis.history = { pushState: __noop, replaceState: __noop };',
  'globalThis.addEventListener = __noop; globalThis.removeEventListener = __noop; globalThis.dispatchEvent = __noop;',
].join('\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dryad-cli-'));
const entry = path.join(tmp, 'vocabulary.ts');
fs.writeFileSync(entry, [
  `import { builtinVocabulary } from ${JSON.stringify(path.join(root, 'src/game/utils/builtinVocabulary'))};`,
  'const out: Record<string, [string, unknown][]> = {};',
  'for (const [kind, map] of Object.entries(builtinVocabulary())) out[kind] = [...(map as Map<string, unknown>)];',
  'process.stdout.write(JSON.stringify(out));',
].join('\n'));
const exporter = path.join(tmp, 'vocabulary.mjs');
await build({
  entryPoints: [entry], outfile: exporter, bundle: true, platform: 'node', format: 'esm', absWorkingDir: root,
  tsconfigRaw, plugins: [stubs], banner: { js: browserGlobals }, logLevel: 'warning',
});
const vocabulary = execFileSync(process.execPath, [exporter], { maxBuffer: 64 * 1024 * 1024 }).toString();
const counts = Object.entries(JSON.parse(vocabulary)).map(([k, v]) => `${v.length} ${k}`).join(', ');
fs.writeFileSync(path.join(outDir, 'builtin_vocabulary.json'), vocabulary);
fs.rmSync(tmp, { recursive: true, force: true });

// --- dryad.mjs ---
await build({
  entryPoints: [path.join(root, 'src/cli/dryad.ts')], outfile: path.join(outDir, 'dryad.mjs'),
  bundle: true, platform: 'node', format: 'esm', target: 'node18', absWorkingDir: root, tsconfigRaw,
  banner: { js: '#!/usr/bin/env node\n// Dryad Engine command-line tools – built from src/cli by npm run build:cli; do not edit.' },
  logLevel: 'warning',
});
const size = (fs.statSync(path.join(outDir, 'dryad.mjs')).size / 1024).toFixed(0);
console.log(`engine_files/tools: builtin_vocabulary.json (${counts}), dryad.mjs (${size} KB)`);
