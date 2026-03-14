import { gameLogger } from '../game/utils/logger';

/**
 * Human-readable messages for Vue compiler error codes.
 * In production builds, Vue strips error messages to just URLs like
 * https://vuejs.org/error-reference/#compiler-23
 * Source: @vue/compiler-core ErrorCodes enum
 */
const VUE_COMPILER_ERRORS: Record<number, string> = {
  0: 'Abrupt closing of empty comment',
  1: 'CDATA in HTML content',
  2: 'Duplicate attribute',
  3: 'End tag with attributes',
  4: 'End tag with trailing solidus',
  5: 'EOF before tag name',
  6: 'EOF in CDATA',
  7: 'EOF in comment',
  8: 'EOF in script/HTML comment-like text',
  9: 'EOF in tag',
  10: 'Incorrectly closed comment',
  11: 'Incorrectly opened comment',
  12: 'Invalid first character of tag name',
  13: 'Missing attribute value',
  14: 'Missing end tag name',
  15: 'Missing whitespace between attributes',
  16: 'Nested comment',
  17: 'Unexpected character in attribute name',
  18: 'Unexpected character in unquoted attribute value',
  19: 'Unexpected equals sign before attribute name',
  20: 'Unexpected null character',
  21: 'Unexpected question mark instead of tag name',
  22: 'Unexpected solidus in tag',
  23: 'Invalid end tag (mismatched closing tag)',
  24: 'Missing end tag (unclosed element)',
  25: 'Missing interpolation end (unclosed {{ }})',
  26: 'Missing directive name',
  27: 'Missing dynamic directive argument end (unclosed [)',
  28: 'v-if has no expression',
  29: 'v-if has duplicate key',
  30: 'v-else has no adjacent v-if',
  31: 'v-for has no expression',
  32: 'v-for has malformed expression',
  33: 'v-for template key placement issue',
  34: 'v-bind has no expression',
  35: 'v-on has no expression',
  36: 'Unexpected directive on slot outlet',
  37: 'Mixed slot usage',
  38: 'Duplicate slot names',
  39: 'Extraneous default slot children',
  40: 'v-slot is misplaced',
  41: 'v-model has no expression',
  42: 'v-model has malformed expression',
  43: 'v-model on scope variable',
  44: 'v-model on props',
  45: 'Invalid expression',
  46: 'KeepAlive has invalid children',
  47: 'Prefix ID not supported',
  48: 'Module mode not supported',
  49: 'Cache handler not supported',
};

/** Decode a Vue error reference URL into a human-readable message, or return null. */
function decodeVueErrorUrl(message: string): string | null {
  const match = message.match(/vuejs\.org\/error-reference\/#compiler-(\d+)/);
  if (!match) return null;
  const code = parseInt(match[1], 10);
  const description = VUE_COMPILER_ERRORS[code];
  return description
    ? `Vue Template Compiler Error #${code}: ${description}`
    : `Vue Template Compiler Error #${code}`;
}

/**
 * Initialize global error handlers to catch all uncaught errors
 * including those from ES6 modules and external scripts
 */
export function initGlobalErrorHandlers(): void {
  // Handler for standard JavaScript errors
  window.onerror = (message, source, lineno, colno, error) => {
    const errorInfo = {
      message: message?.toString() || 'Unknown error',
      source: source || 'unknown',
      line: lineno || 0,
      column: colno || 0,
      stack: error?.stack || 'No stack trace available',
    };

    gameLogger.error(
      '[Global Error Handler] Uncaught error:',
      `\n  Message: ${errorInfo.message}`,
      `\n  Source: ${errorInfo.source}:${errorInfo.line}:${errorInfo.column}`,
      `\n  Stack: ${errorInfo.stack}`
    );

    // Return false to allow default browser error handling (shows in console)
    // Return true to prevent default handling
    return false;
  };

  // Handler for errors that occur during resource loading and ES6 module errors
  // Using capture phase (true) to catch errors from all sources including modules
  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      // Avoid duplicate logging if window.onerror already handled it
      if (event.error) {
        // This is a runtime error, likely already handled by window.onerror
        return;
      }

      // Handle resource loading errors or module errors
      const target = event.target as HTMLElement;
      if (target && target.tagName) {
        gameLogger.error(
          '[Global Error Handler] Resource loading error:',
          `\n  Tag: ${target.tagName}`,
          `\n  Source: ${(target as any).src || (target as any).href || 'unknown'}`,
          `\n  Message: ${event.message}`
        );
      } else {
        gameLogger.error(
          '[Global Error Handler] Error event:',
          `\n  Message: ${event.message}`,
          `\n  Filename: ${event.filename}`,
          `\n  Line: ${event.lineno}:${event.colno}`
        );
      }
    },
    true // Use capture phase
  );

  // Handler for unhandled promise rejections
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;

    if (reason instanceof Error) {
      // Check if this is a Vue compiler error URL (production build strips messages to URLs)
      const decoded = decodeVueErrorUrl(reason.message);
      if (decoded) {
        gameLogger.template(
          `[Vue Compiler] ${decoded}`,
          `\n  Check the console for the component that triggered it.`
        );
      } else {
        gameLogger.error(
          '[Unhandled Promise Rejection]',
          `\n  Message: ${reason.message}`,
          `\n  Stack: ${reason.stack || 'No stack trace'}`
        );
      }
    } else {
      const reasonStr = JSON.stringify(reason, null, 2);
      const decoded = decodeVueErrorUrl(reasonStr);
      if (decoded) {
        gameLogger.template(`[Vue Compiler] ${decoded}`);
      } else {
        gameLogger.error(
          '[Unhandled Promise Rejection]',
          `\n  Reason: ${reasonStr}`
        );
      }
    }

    // Prevent default to avoid "Uncaught (in promise)" in console
    // since we're already logging it
    event.preventDefault();
  });

  gameLogger.info('[Error Handler] Global error handlers initialized');
}
