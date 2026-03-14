/**
 * Template validation utilities for Vue components.
 * Validates template structure and JavaScript expressions before Vue compiles them.
 */

import { compile } from 'vue';
import * as Vue from 'vue';
import { generateCodeFrame } from '@vue/shared';
import { gameLogger, captureCallerInfo } from '../game/utils/logger';

/**
 * Strip Vue error reference URLs from compiler error messages.
 * In production builds, Vue replaces error messages with URLs like
 * https://vuejs.org/error-reference/#compiler-23 — these are useless to developers.
 */
function cleanVueErrorMessage(msg: string, code?: number): string {
  // Strip the URL entirely
  const cleaned = msg.replace(/\s*https?:\/\/vuejs\.org\/error-reference\/#compiler-\d+\s*/g, '').trim();
  // If message was only the URL (production build), provide a readable fallback
  if (!cleaned && code != null) {
    return `Compiler error #${code}`;
  }
  return cleaned || msg;
}

/** Escape HTML special characters to prevent injection in error templates. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Validate JavaScript expressions in Vue template bindings.
 * Catches syntax errors in :attr="expr", v-bind:attr="expr", v-if, v-show, v-model, and @event patterns.
 */
export function validateExpressions(template: string): string[] {
  const errors: string[] = [];
  // Strip HTML comments before validation to avoid false positives
  const templateWithoutComments = template.replace(/<!--[\s\S]*?-->/g, '');
  const lines = templateWithoutComments.split('\n');

  const patterns = [
    { regex: /(?::|v-bind:)([\w.-]+)="([^"]*)"/g, prefix: ':' },
    { regex: /v-(if|else-if|show|model)="([^"]*)"/g, prefix: 'v-' },
    { regex: /(?:@|v-on:)([\w.-]+)="([^"]*)"/g, prefix: '@' },
  ];

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];

    for (const { regex, prefix } of patterns) {
      regex.lastIndex = 0;
      let match;

      while ((match = regex.exec(line)) !== null) {
        const attr = match[1];
        const expr = match[2];

        // Skip empty expressions or valid JS identifiers/property paths (must start with letter/_/$)
        if (!expr || /^[a-zA-Z_$][\w$.]*$/.test(expr)) continue;
        // Skip simple function calls like foo() or foo.bar()
        if (/^[a-zA-Z_$][\w$.]*\([^)]*\)$/.test(expr)) continue;
        if (attr === 'for') continue;

        try {
          new Function(`return (${expr})`);
        } catch (e: any) {
          const looksLikeCssValue = /^\d+(\.\d+)?(px|em|rem|%|vh|vw|pt|cm|mm|in|ex|ch)$/i.test(expr);
          const directive = prefix === ':' ? `:${attr}` : prefix === '@' ? `@${attr}` : `v-${attr}`;

          // Build error with code snippet
          let msg = `Invalid JavaScript expression: ${directive}="${expr}"`;
          msg += `\n  JS Error: ${e.message}`;

          if (looksLikeCssValue && prefix === ':') {
            msg += `\n  Fix: Use ${attr}="${expr}" (static) or ${directive}="'${expr}'" (quoted string)`;
          } else if (/^[a-z][\w-]*$/i.test(expr) && prefix === ':') {
            msg += `\n  Fix: Use ${attr}="${expr}" (static) - "${expr}" contains hyphens, not valid JS`;
          }

          // Show code context
          msg += `\n  Code: ${line.trim()}`;

          errors.push(msg);
        }
      }
    }
  }

  return errors;
}

/**
 * Detect unclosed attribute quotes in template tags.
 * Returns messages about unclosed quotes, or empty array if none found.
 * Unclosed quotes are a common root cause of cascading tag mismatch errors.
 */
export function detectUnclosedQuotes(template: string): string[] {
  const cleanTemplate = template.replace(/<!--[\s\S]*?-->/g, '');
  const errors: string[] = [];

  // State machine: walk through chars tracking tag/quote state
  let inTag = false;
  let quoteChar: string | null = null; // '"' or "'" when inside a quoted attribute
  let quoteStartLine = 0;
  let lineNum = 1;

  for (let i = 0; i < cleanTemplate.length; i++) {
    const ch = cleanTemplate[i];

    if (ch === '\n') {
      lineNum++;
      continue;
    }

    if (quoteChar) {
      // Inside a quoted attribute value — look for matching close
      if (ch === quoteChar) {
        quoteChar = null;
      } else if (ch === '<') {
        // Hit a new tag opening while quote is still open — the quote was never closed
        const line = cleanTemplate.split('\n')[quoteStartLine - 1];
        errors.push(`Unclosed quote ${quoteChar} on line ${quoteStartLine}:\n  ${line.trim()}\n  Fix: Add closing ${quoteChar} to the attribute value`);
        // Reset state and treat this as new tag
        quoteChar = null;
        inTag = true;
      }
    } else if (inTag) {
      if (ch === '"' || ch === "'") {
        quoteChar = ch;
        quoteStartLine = lineNum;
      } else if (ch === '>') {
        inTag = false;
      }
    } else {
      if (ch === '<') {
        inTag = true;
      }
    }
  }

  // Check for quote still open at end of template
  if (quoteChar) {
    const line = cleanTemplate.split('\n')[quoteStartLine - 1];
    errors.push(`Unclosed quote ${quoteChar} on line ${quoteStartLine}:\n  ${line.trim()}\n  Fix: Add closing ${quoteChar} to the attribute value`);
  }

  return errors;
}

/**
 * Analyze template for tag count mismatches.
 * Returns a helpful message if there's an imbalance, null otherwise.
 * Skipped if unclosed quotes are detected (they cause false tag mismatches).
 */
export function analyzeTagCounts(template: string): string | null {
  // Check for unclosed quotes first — they're the root cause of most tag mismatch noise
  const quoteErrors = detectUnclosedQuotes(template);
  if (quoteErrors.length > 0) {
    return quoteErrors.join('\n');
  }

  // Strip HTML comments before analysis to avoid false positives from commented-out tags
  const cleanTemplate = template.replace(/<!--[\s\S]*?-->/g, '');
  const lines = cleanTemplate.split('\n');
  const voidElements = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
  ]);

  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*\/?>/g;
  const openCount: Record<string, number[]> = {};
  const closeCount: Record<string, number[]> = {};

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    let match;
    while ((match = tagRegex.exec(line)) !== null) {
      const fullTag = match[0];
      const tagName = match[1].toLowerCase();
      if (voidElements.has(tagName) || fullTag.endsWith('/>')) continue;

      if (fullTag.startsWith('</')) {
        if (!closeCount[tagName]) closeCount[tagName] = [];
        closeCount[tagName].push(lineNum + 1);
      } else {
        if (!openCount[tagName]) openCount[tagName] = [];
        openCount[tagName].push(lineNum + 1);
      }
    }
  }

  const results: string[] = [];
  const allTags = new Set([...Object.keys(openCount), ...Object.keys(closeCount)]);

  for (const tag of allTags) {
    const opens = openCount[tag]?.length || 0;
    const closes = closeCount[tag]?.length || 0;
    if (opens !== closes) {
      const closeLocs = closeCount[tag]?.join(', ') || 'none';
      results.push(`Tag mismatch: ${closes} </${tag}> but ${opens} <${tag}>\n  Closing </${tag}> at lines: ${closeLocs}`);
    }
  }

  return results.length > 0 ? results.join('\n') : null;
}

/** Standard HTML elements — used to filter out non-component tags. */
const HTML_ELEMENTS = new Set([
  'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio', 'b', 'base', 'bdi', 'bdo',
  'blockquote', 'body', 'br', 'button', 'canvas', 'caption', 'cite', 'code', 'col', 'colgroup',
  'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt', 'em', 'embed',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'head', 'header', 'hgroup', 'hr', 'html', 'i', 'iframe', 'img', 'input', 'ins', 'kbd',
  'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'menu', 'meta', 'meter', 'nav',
  'noscript', 'object', 'ol', 'optgroup', 'option', 'output', 'p', 'param', 'picture', 'pre',
  'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'script', 'search', 'section', 'select',
  'slot', 'small', 'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup', 'table',
  'tbody', 'td', 'textarea', 'tfoot', 'th', 'thead', 'time', 'title', 'tr', 'track', 'u',
  'ul', 'var', 'video', 'wbr',
]);

/** SVG elements that might appear in templates. */
const SVG_ELEMENTS = new Set([
  'svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'text', 'tspan',
  'g', 'defs', 'use', 'symbol', 'clippath', 'mask', 'pattern', 'image', 'foreignobject',
  'lineargradient', 'radialgradient', 'stop', 'filter', 'fegaussianblur', 'feoffset',
  'feblend', 'fecolormatrix', 'fecomposite', 'feflood', 'femerge', 'femergenode',
]);

/** Vue built-in components that don't need registration. */
const VUE_BUILTINS = new Set([
  'teleport', 'transition', 'transition-group', 'transitiongroup',
  'keep-alive', 'keepalive', 'suspense', 'component', 'template',
]);

/** Convert PascalCase to kebab-case. */
function toKebabCase(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Validate that all component tags in a template are registered in the local components option.
 * Returns warning messages for unresolved component tags.
 */
export function validateComponentResolution(template: string, options: any): string[] {
  const warnings: string[] = [];
  const cleanTemplate = template.replace(/<!--[\s\S]*?-->/g, '');

  // Extract all opening tag names (not closing tags, not self-closing void elements)
  const tagRegex = /<([a-zA-Z][a-zA-Z0-9-]*)/g;
  const usedTags = new Set<string>();
  let match;
  while ((match = tagRegex.exec(cleanTemplate)) !== null) {
    usedTags.add(match[1]);
  }

  // Build set of registered component names (both PascalCase and kebab-case forms)
  const registered = new Set<string>();
  if (options.components) {
    for (const name of Object.keys(options.components)) {
      registered.add(name.toLowerCase());
      registered.add(toKebabCase(name));
    }
  }

  for (const tag of usedTags) {
    const lower = tag.toLowerCase();
    // Skip HTML elements, SVG elements, and Vue built-ins
    if (HTML_ELEMENTS.has(lower) || SVG_ELEMENTS.has(lower) || VUE_BUILTINS.has(lower)) continue;
    // Check if registered locally
    if (registered.has(lower)) continue;
    warnings.push(`Unresolved component: <${tag}> is not registered in components option.\n  Fix: Add "${tag}" to the components: { ${tag} } option in defineComponent.`);
  }

  return warnings;
}

/**
 * Create a wrapped defineComponent that validates template expressions and structure.
 * This ensures all Vue components (including child components) get validated.
 */
export function createValidatingDefineComponent() {
  return function validatingDefineComponent(options: any, ...args: any[]) {
    // Only validate in dev mode to avoid production overhead
    const isDevMode = localStorage.getItem('devMode') === 'true';

    if (isDevMode && options && typeof options.template === 'string') {
      const template = options.template;

      // 1. Expression validation FIRST (catches invalid JS expressions like :attr="5px")
      // This runs before compile() so we always get the helpful error message
      const exprErrors = validateExpressions(template);
      if (exprErrors.length > 0) {
        // gameLogger.template includes file path at start, then our error details
        gameLogger.template(`\n${exprErrors.join('\n\n')}`);
      }

      // 2. Vue compile validation (catches template structure errors)
      const structureErrors: string[] = [];
      try {
        compile(template, {
          onError: (err: any) => {
            let msg = cleanVueErrorMessage(err.message, err.code);
            if (err.loc) {
              msg += `\n${generateCodeFrame(template, err.loc.start.offset, err.loc.end.offset)}`;
            }
            const tagAnalysis = analyzeTagCounts(template);
            if (tagAnalysis) {
              msg += `\n\n${tagAnalysis}`;
            }
            structureErrors.push(msg);
          },
          onWarn: (err: any) => {
            let msg = `Warning: ${cleanVueErrorMessage(err.message, err.code)}`;
            if (err.loc) {
              msg += `\n${generateCodeFrame(template, err.loc.start.offset, err.loc.end.offset)}`;
            }
            structureErrors.push(msg);
          }
        });
      } catch (compileError: any) {
        // compile() can throw for expression errors - but we already caught those above
        // Only log if we didn't already find expression errors
        if (exprErrors.length === 0) {
          structureErrors.push(`Compile error: ${cleanVueErrorMessage(compileError.message)}`);
        }
      }

      if (structureErrors.length > 0) {
        gameLogger.template(`\n${structureErrors.join('\n')}`);
      }

      // 3. Component resolution validation (catches unregistered components like <ItemCard> without components: { ItemCard })
      const componentWarnings = validateComponentResolution(template, options);
      if (componentWarnings.length > 0) {
        gameLogger.template(`\n${componentWarnings.join('\n')}`);
      }

      // If errors found, replace with a safe error-display component
      if (exprErrors.length > 0 || structureErrors.length > 0 || componentWarnings.length > 0) {
        const allErrors = [...exprErrors, ...structureErrors, ...componentWarnings];
        const componentName = options.name || '(unnamed component)';
        const caller = captureCallerInfo();
        const sourceLabel = caller ? `${escapeHtml(caller)}` : escapeHtml(componentName);
        // Escape HTML, then convert \n to <br> since Vue's template compiler collapses whitespace
        const errorHtml = allErrors.map(e => escapeHtml(e)).join('\n\n').replace(/\n/g, '<br>');

        const errorOptions: any = {
          name: options.name,
          template: `<div style="background:rgba(220,38,38,0.15);border:2px solid #dc2626;border-radius:8px;padding:12px 16px;margin:4px;font-family:'JetBrains Mono',monospace;font-size:12px;color:#fca5a5;word-break:break-word;max-height:300px;overflow-y:auto"><span style="color:#f87171;font-weight:bold;font-size:13px">Template Error in ${sourceLabel}</span><br><br>${errorHtml}</div>`
        };
        return Vue.defineComponent(errorOptions, ...args);
      }
    }
    return Vue.defineComponent(options, ...args);
  };
}
