/**
 * Text sanitizers shared by the dungeon linter, the action/flag index and the
 * AST parser, so they all agree on what the game engine will actually read.
 *
 * The authority is `parseText` in `src/utility/functions.ts` — these helpers
 * exist to mirror it, not to define their own dialect.
 */

/**
 * Blank out `[code]…[/code]` spans, preserving both length and line structure
 * so range-slicing scanners keep their offsets and line-based scanners keep
 * their line numbers. Code blocks are literal raw passthrough: the braces,
 * `//` and URLs inside them are not DryadScript and must never be scanned.
 */
export function stripCodeBlocks(s: string): string {
  return s.replace(/\[code\][\s\S]*?\[\/code\]/gi, (match) => match.replace(/[^\n]/g, ' '));
}

/**
 * A DryadScript comment: `//` at column 0, tested on the raw line.
 *
 * Deliberately NOT trimmed — the engine's test is `/^\/\//` against an
 * untrimmed line (functions.ts), so an indented `  // note` is not a comment
 * to the engine, it is rendered as prose. Trimming here would hide real
 * content from the linter.
 */
export function isCommentLine(line: string): boolean {
  return /^\/\//.test(line);
}

/**
 * Remove whole comment lines, exactly as the engine drops them.
 *
 * Lines are removed rather than blanked so a comment sitting inside a
 * multi-line `{…}` doesn't read as a blank line — the engine skips the line
 * outright, so it never becomes a paragraph break.
 */
export function stripCommentLines(text: string): string {
  const masked = stripCodeBlocks(text).split('\n');
  return text
    .split('\n')
    .filter((_, i) => !isCommentLine(masked[i] ?? ''))
    .join('\n');
}
