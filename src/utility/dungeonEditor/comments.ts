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

export type MappedText = {
  text: string;
  /** Map an offset in `text` back to the offset in the original string. */
  toOriginal: (offset: number) => number;
};

/**
 * `stripCommentLines` that remembers where each kept line came from, so a
 * scanner running over the stripped text can report positions in the
 * original (what the editor actually shows).
 */
export function stripCommentLinesMapped(text: string): MappedText {
  const masked = stripCodeBlocks(text).split('\n');
  const lines = text.split('\n');
  const kept: string[] = [];
  const keptStarts: number[] = [];
  const origStarts: number[] = [];
  let origPos = 0;
  let keptPos = 0;
  lines.forEach((line, i) => {
    if (!isCommentLine(masked[i] ?? '')) {
      kept.push(line);
      keptStarts.push(keptPos);
      origStarts.push(origPos);
      keptPos += line.length + 1;
    }
    origPos += line.length + 1;
  });
  const toOriginal = (offset: number): number => {
    if (keptStarts.length === 0) return 0;
    let lo = 0;
    let hi = keptStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (keptStarts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    const col = Math.max(0, Math.min(offset - keptStarts[lo], kept[lo].length));
    return origStarts[lo] + col;
  };
  return { text: kept.join('\n'), toOriginal };
}
