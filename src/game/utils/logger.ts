/**
 * Game logging utility with colored output and importance levels
 * Use this instead of console.log/warn/error for game feedback messages
 *
 * Shows caller file:line information when in dev mode
 */

export enum LogLevel {
  DEBUG = 0,   // Gray - Development/debugging info (should be commented out in production)
  INFO = 1,    // Blue - General informational messages
  SUCCESS = 2, // Green - Successful operations
  OVERWRITE = 3, // Brown - Overwrite messages
  WARN = 4,    // Yellow - Warnings
  ERROR = 5,   // Red - Errors
  TEMPLATE = 6, // Magenta - Vue template/component errors
}

class Logger {
  private enabled = true;
  private minLevel = LogLevel.INFO; // Don't show DEBUG by default

  private colors = {
    [LogLevel.DEBUG]: '#999999',   // Gray
    [LogLevel.INFO]: '#3b82f6',    // Blue
    [LogLevel.SUCCESS]: '#10b981', // Green
    [LogLevel.OVERWRITE]: '#a66900', // BROWN
    [LogLevel.WARN]: '#a8a300',    // YELLOW
    [LogLevel.ERROR]: '#ef4444',   // Red
    [LogLevel.TEMPLATE]: '#d946ef', // Magenta
  };

  private labels = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.SUCCESS]: 'SUCCESS',
    [LogLevel.OVERWRITE]: 'OVERWRITE',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.ERROR]: 'ERROR',
    [LogLevel.TEMPLATE]: 'TEMPLATE',
  };

  /**
   * Enable or disable all logging
   */
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  /**
   * Set minimum log level to display
   */
  setMinLevel(level: LogLevel) {
    this.minLevel = level;
  }

  /**
   * Extract caller information from stack trace
   * Only called when debug panel is open
   *
   * Prioritizes showing the top-level caller (e.g., user scripts) over internal system calls
   */
  public getCallerInfo(): string {
    try {
      const stack = new Error().stack;
      if (!stack) return '';

      const lines = stack.split('\n');

      // Debug: Log stack to see what we're working with
      // console.log('STACK:', lines);

      // Skip internal frames (logger.ts, Error)
      // Look for the most external caller (scripts, or deepest non-system call)
      let firstSystemCall: string | null = null;
      let deepestCall: string | null = null;
      let absoluteDeepestCall: string | null = null; // Track the very last call regardless

      for (let i = 4; i < lines.length; i++) {
        const line = lines[i];

        // Skip logger.ts frames
        if (line.includes('logger.ts') || line.includes('Logger')) {
          continue;
        }

        // Extract filename and line number
        // Handle both formats: "at functionName (url:line:col)" and "at url:line:col"
        const matchWithParen = line.match(/\(([^)]+):(\d+):(\d+)\)/);
        // For URLs without parentheses, capture everything up to :lineNumber:columnNumber
        // Support http://, https://, and file:// protocols
        const matchWithoutParen = line.match(/at\s+((?:https?|file):\/\/[^:]+(?::\d+)?\/[^:]+):(\d+):(\d+)/);
        const match = matchWithParen || matchWithoutParen;

        if (!match) continue;

        const [, filePath, lineNum] = match;

        // Save first system call as fallback
        if (!firstSystemCall) {
          const fileName = filePath.split('/').pop() || filePath;
          firstSystemCall = `${fileName}:${lineNum}`;
        }

        // Always track the absolute deepest call (last in stack)
        const fileName = filePath.split('/').pop() || filePath;
        absoluteDeepestCall = `${fileName}:${lineNum}`;

        // Always update deepest call - we want the top of the stack
        let displayPath = filePath;

        // Check if it's an external script (not from src/)
        // In production (Electron), bundled files won't have clear paths, so we look at the deepest stack frame
        const isFromSrc = filePath.includes('/src/');
        const hasExternalMarkers = filePath.includes('/scripts/') ||
          filePath.includes('/public/') ||
          filePath.includes('/assets/') ||
          filePath.startsWith('http://') ||
          filePath.startsWith('https://') ||
          filePath.startsWith('file://');

        const isExternal = !isFromSrc && hasExternalMarkers;

        if (isExternal) {
          // Show relative path from assets or full filename
          if (filePath.includes('/assets/')) {
            // Extract path after /assets/
            const assetsIndex = filePath.indexOf('/assets/');
            displayPath = '@' + filePath.substring(assetsIndex + 1);
          } else if (filePath.includes('http://localhost') || filePath.includes('http://127.0.0.1')) {
            // Local dev server - extract path after domain
            const urlMatch = filePath.match(/https?:\/\/[^\/]+(.+)/);
            if (urlMatch && urlMatch[1].includes('/assets/')) {
              displayPath = '@' + urlMatch[1];
            } else {
              displayPath = filePath.split('/').pop() || filePath;
            }
          } else if (filePath.includes('http')) {
            // Keep full URL for remote scripts
            displayPath = filePath;
          } else {
            displayPath = filePath.split('/').pop() || filePath;
          }
          deepestCall = `${displayPath}:${lineNum}`;
          // Don't break - keep going to find the deepest caller
        }
      }

      // Prefer: deepest external call > absolute deepest call > first system call
      return deepestCall || absoluteDeepestCall || firstSystemCall || '';
    } catch (e) {
      // Silently fail if stack trace parsing fails
    }
    return '';
  }

  private log(level: LogLevel, message: string, ...args: any[]) {
    if (!this.enabled || level < this.minLevel) {
      return;
    }

    const color = this.colors[level];
    const timestamp = new Date().toLocaleTimeString();

    // Check if in dev mode to show caller info
    let showCaller = false;
    try {
      showCaller = localStorage.getItem('devMode') === 'true';
    } catch (e) {
      // localStorage might not be available, default to false
    }

    const caller = showCaller ? this.getCallerInfo() : '';

    // Use appropriate console method based on level
    const consoleMethod = level >= LogLevel.ERROR ? console.error :
      level >= LogLevel.WARN ? console.warn :
        console.log;

    if (caller) {
      // With caller info - make filename stand out with distinct styling
      consoleMethod(
        `%c[${timestamp}] [${this.labels[level]}]%c %c${caller}%c ${message}`,
        `color: ${color}; font-weight: bold`,           // Timestamp + level
        'color: inherit',                               // Reset
        'color: #9333ea; font-weight: bold; background: rgba(147, 51, 234, 0.1); padding: 2px 6px; border-radius: 3px;', // Caller (purple with bg)
        'color: inherit',                               // Message
        ...args
      );
    } else {
      // Without caller info - simple format
      consoleMethod(
        `%c[${timestamp}] [${this.labels[level]}]%c ${message}`,
        `color: ${color}; font-weight: bold`,
        'color: inherit',
        ...args
      );
    }
  }

  /**
   * Debug messages - for development only, typically commented out
   */
  debug(message: string, ...args: any[]) {
    this.log(LogLevel.DEBUG, message, ...args);
  }

  /**
   * Informational messages - general feedback
   */
  info(message: string, ...args: any[]) {
    this.log(LogLevel.INFO, message, ...args);
  }

  /**
   * Success messages - when operations complete successfully
   */
  success(message: string, ...args: any[]) {
    this.log(LogLevel.SUCCESS, message, ...args);
  }

  /**
   * Overwrite messages - overwrite messages
   */
  overwrite(message: string, ...args: any[]) {
    this.log(LogLevel.OVERWRITE, message, ...args);
  }

  /**
   * Warning messages - potential issues
   */
  warn(message: string, ...args: any[]) {
    this.log(LogLevel.WARN, message, ...args);
  }

  /**
   * Error messages - critical issues
   */
  error(message: string, ...args: any[]) {
    this.log(LogLevel.ERROR, message, ...args);
  }

  /**
   * Template errors - Vue template/component compilation errors
   */
  template(message: string, ...args: any[]) {
    this.log(LogLevel.TEMPLATE, message, ...args);
  }
}

export const gameLogger = new Logger();

/**
 * Utility function to capture caller information from stack trace
 * Can be used by any part of the codebase to track where code was called from
 *
 * @returns Formatted caller info like "@assets/.../script.js:123" or empty string
 */
export function captureCallerInfo(): string {
  return gameLogger.getCallerInfo();
}
