import { gameLogger } from '../game/utils/logger';

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
      gameLogger.error(
        '[Unhandled Promise Rejection]',
        `\n  Message: ${reason.message}`,
        `\n  Stack: ${reason.stack || 'No stack trace'}`
      );
    } else {
      gameLogger.error(
        '[Unhandled Promise Rejection]',
        `\n  Reason: ${JSON.stringify(reason, null, 2)}`
      );
    }

    // Prevent default to avoid "Uncaught (in promise)" in console
    // since we're already logging it
    event.preventDefault();
  });

  gameLogger.info('[Error Handler] Global error handlers initialized');
}
