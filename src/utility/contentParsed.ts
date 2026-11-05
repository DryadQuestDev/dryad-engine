import { parseText } from './functions';
import { stripHighlights } from './dungeonEditor/stripHighlights';
import { stripMeta } from './dungeonEditor/meta';

/**
 * Which text and config a content_parsed.json was built from: a hash of both, kept on its
 * `_config_` entry. A hash rather than file times, so a git checkout that only touches the files
 * doesn't make every parsed file look stale and rewrite it.
 */
export type ParsedSource = { hash: string };

/**
 * cyrb53 over the dungeon's text and its config. The config counts as its compact JSON: the dev
 * server hands a .json file back re-serialized, the desktop app as written. Tools outside the engine
 * may recompute it to check a parsed file is fresh, so a change here is a format change for them too.
 */
export function sourceHash(raw: string, configText: string): string {
  let config = configText;
  try {
    config = JSON.stringify(JSON.parse(configText));
  } catch { /* not JSON (or empty): hashed as it is */ }
  const text = `${raw}\u0000${config}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * A dungeon layer's content_parsed.json: a `_config_` entry carrying its config (with the map size
 * of a non-text dungeon) and source hash, then the parsed lines.
 */
export function buildContentParsed(
  raw: string,
  config: Record<string, any>,
  mapSize: { width: number; height: number } | null,
  source: ParsedSource | null,
): Record<string, any>[] {
  // `__meta` is editor-only authoring state. It must not reach the runtime: `^` is absent from
  // parseText's brace-strip list, so an un-stripped room param becomes part of `room_id` and
  // renames every id beneath it.
  const lines = parseText(stripMeta(stripHighlights(raw)));
  const params = JSON.parse(JSON.stringify(config));
  delete params.dungeon_content;
  if (mapSize) {
    params.map_width = mapSize.width;
    params.map_height = mapSize.height;
  }
  lines.unshift({ id: '_config_', params, ...(source ? { source } : {}) });
  return lines;
}
