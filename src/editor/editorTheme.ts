import { ref, watch } from 'vue';

export type EditorTheme = 'light' | 'dark';

const EDITOR_THEME_KEY = 'dryadEditor_theme';

/** Class applied to <html> while the editor is on screen. PrimeVue keys its own dark
    palette off the same selector (see the theme options in main.ts), and the editor's
    --editor-* tokens in style.css flip with it. It has to sit on <html> rather than the
    editor root because overlays (selects, dialogs, tooltips) teleport to <body>. */
export const EDITOR_DARK_CLASS = 'editor-dark';

export const editorTheme = ref<EditorTheme>(
  localStorage.getItem(EDITOR_THEME_KEY) === 'dark' ? 'dark' : 'light'
);

/** Paint the current theme. Called when the editor mounts. */
export function applyEditorTheme(): void {
  document.documentElement.classList.toggle(EDITOR_DARK_CLASS, editorTheme.value === 'dark');
}

/** Drop the editor theme — the game and main menu bring their own (dark) styling and
    must not inherit the editor's palette. Called when the editor unmounts. */
export function clearEditorTheme(): void {
  document.documentElement.classList.remove(EDITOR_DARK_CLASS);
}

export function toggleEditorTheme(): void {
  editorTheme.value = editorTheme.value === 'dark' ? 'light' : 'dark';
}

watch(editorTheme, (theme) => {
  localStorage.setItem(EDITOR_THEME_KEY, theme);
  applyEditorTheme();
});

/* ── Scoped PrimeVue tokens ───────────────────────────────────────────────────
   PrimeVue emits each component's tokens into its own `<style>` block, and many of
   them are aliases of a base token: `:root,:host { --p-inputtext-background: var(--p-form-field-background) }`.
   An alias declared on `:root` is resolved ON `:root`, so it flattens to the LIGHT
   value and every descendant inherits that — overriding the base token further down
   the tree (the way the game's dev panel themes only itself) comes too late to change it.
   It works in the editor only because the class sits on <html>, which IS `:root`.

   So mirror those alias declarations into a `.editor-dark` rule: inside a dark subtree
   the alias re-resolves against that subtree's base tokens. Tokens PrimeVue already
   emits per scheme need nothing — they carry a real value in both blocks. */

const ALIAS_STYLE_ID = 'editor-dark-primevue-aliases';
const ALIAS_DECL = /(--p-[\w-]+)\s*:\s*(var\(\s*--p-[^;}]*\))/g;

function collectAliasRules(): string {
  const decls = new Map<string, string>();
  for (const style of document.querySelectorAll('style[data-primevue-style-id$="-variables"]')) {
    const text = style.textContent ?? '';
    for (const [, name, value] of text.matchAll(ALIAS_DECL)) decls.set(name, value);
  }
  if (!decls.size) return '';
  const body = [...decls].map(([name, value]) => `  ${name}: ${value};`).join('\n');
  return `.${EDITOR_DARK_CLASS} {\n${body}\n}\n`;
}

/** Keep the mirrored rule in step with PrimeVue, which injects a component's token
    block the first time that component renders — a debug tab opened later would
    otherwise get light form fields. */
export function scopePrimeVueTokens(): void {
  let style = document.getElementById(ALIAS_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = ALIAS_STYLE_ID;
    document.head.appendChild(style);

    let pending = false;
    new MutationObserver((records) => {
      const injected = records.some(r => [...r.addedNodes].some(n =>
        n instanceof HTMLStyleElement && (n.dataset.primevueStyleId ?? '').endsWith('-variables')));
      if (!injected || pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; scopePrimeVueTokens(); });
    }).observe(document.head, { childList: true });
  }
  const rules = collectAliasRules();
  if (rules && style.textContent !== rules) style.textContent = rules;
}
