/**
 * Template validation utilities for Vue components.
 * Validates template structure and JavaScript expressions before Vue compiles them.
 */

import { compile } from 'vue';
import * as Vue from 'vue';
import { generateCodeFrame } from '@vue/shared';
import { gameLogger } from '../game/utils/logger';

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
 * Analyze template for tag count mismatches.
 * Returns a helpful message if there's an imbalance, null otherwise.
 */
export function analyzeTagCounts(template: string): string | null {
  const lines = template.split('\n');
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
          onError: (err) => {
            let msg = err.message;
            if (err.loc) {
              msg += `\n${generateCodeFrame(template, err.loc.start.offset, err.loc.end.offset)}`;
            }
            const tagAnalysis = analyzeTagCounts(template);
            if (tagAnalysis) {
              msg += `\n\n${tagAnalysis}`;
            }
            structureErrors.push(msg);
          },
          onWarn: (err) => {
            let msg = `Warning: ${err.message}`;
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
          structureErrors.push(`Compile error: ${compileError.message}`);
        }
      }

      if (structureErrors.length > 0) {
        gameLogger.template(`\n${structureErrors.join('\n')}`);
      }
    }
    return Vue.defineComponent(options, ...args);
  };
}
