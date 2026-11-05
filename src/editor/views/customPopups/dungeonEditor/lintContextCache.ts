import type { BuiltLintContext } from '../../../../utility/dungeonEditor/lintContext';

/**
 * The content checks' view of the game – its data, scripts and every dungeon's index – kept per
 * game and mod. Switching dungeons reuses it and re-reads only the dungeons involved, instead of
 * the whole game (hundreds of reads) on every switch.
 */
let entry: { key: string; built: BuiltLintContext } | null = null;

export function cachedLintContext(key: string): BuiltLintContext | null {
  return entry?.key === key ? entry.built : null;
}

export function cacheLintContext(key: string, built: BuiltLintContext): void {
  entry = { key, built };
}
