import { Global } from '../global/global';
import { getImageDimensions } from '../utility/functions';
import { buildContentParsed, sourceHash } from '../utility/contentParsed';

/**
 * A dungeon's content_parsed.json is generated from its content_raw.txt and config.json and carries
 * a hash of both. Text edited outside the editor (an AI, VS Code, a Docs pipeline) no longer
 * matches it, and these regenerate the parsed file from the text. Dev boot, the editor opening a
 * game and export run them, so a game can't ship content its text no longer says. Hosts that can't
 * stat files (web) skip the check.
 */

type FileStamp = { mtimeMs: number; size: number };
type CachedHash = { raw: FileStamp; config: FileStamp | null; hash: string };

// Per machine: the hash a file pair had at a given time and size, so a boot where nothing changed
// only stats the files instead of reading and hashing every dungeon's text.
const HASH_CACHE_PREFIX = 'dev_parsed_hash:';

function sameStamp(a: FileStamp | null | undefined, b: FileStamp | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.mtimeMs === b.mtimeMs && a.size === b.size;
}

function dungeonDir(gameId: string, layer: string, dungeonId: string): string {
  return `games_files/${gameId}/${layer}/dungeons/${dungeonId}`;
}

type Source = { hash: string; raw?: string; configText?: string | null };

/** The layer's source hash, read from the cache while its files are untouched; null without text or stat. */
async function sourceOf(dir: string): Promise<Source | null> {
  const global = Global.getInstance();
  const [rawStamp, configStamp] = await Promise.all([
    global.statFile(`${dir}/content_raw.txt`),
    global.statFile(`${dir}/config.json`),
  ]);
  if (!rawStamp) return null;
  const key = HASH_CACHE_PREFIX + dir;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || 'null') as CachedHash | null;
    if (cached && sameStamp(cached.raw, rawStamp) && sameStamp(cached.config, configStamp)) return { hash: cached.hash };
  } catch { /* a corrupt entry is a miss */ }
  const raw = await global.readText(`${dir}/content_raw.txt`);
  if (raw === null || raw === undefined) return null;
  const configText = configStamp ? await global.readText(`${dir}/config.json`) : null;
  const hash = sourceHash(raw, configText ?? '');
  localStorage.setItem(key, JSON.stringify({ raw: rawStamp, config: configStamp, hash } satisfies CachedHash));
  return { hash, raw, configText };
}

async function mapSizeOf(config: Record<string, any>, onMissingImage?: (image: string) => void) {
  if (config.dungeon_type === 'text' || !config.image) return null;
  try {
    return await getImageDimensions(config.image);
  } catch {
    onMissingImage?.(config.image);
    return null;
  }
}

async function regenerate(dir: string, source: Source, onMissingImage?: (image: string) => void): Promise<Record<string, any>[] | null> {
  const global = Global.getInstance();
  const raw = source.raw ?? await global.readText(`${dir}/content_raw.txt`);
  if (raw === null || raw === undefined) return null;
  const configPath = `${dir}/config.json`;
  const configText = source.configText !== undefined ? source.configText
    : (await global.pathExists(configPath)) ? await global.readText(configPath).catch(() => null) : null;
  let config: Record<string, any> = {};
  try {
    config = configText ? JSON.parse(configText) : {};
  } catch { /* a broken config parses as none */ }
  const lines = buildContentParsed(raw, config, await mapSizeOf(config, onMissingImage), { hash: source.hash });
  await global.writeJson(`${dir}/content_parsed.json`, lines);
  return lines;
}

/**
 * Write a dungeon layer's content_parsed.json from its text and config files, once they are
 * written (the editor's Save). Always rewrites, even when the hash still matches.
 */
export async function writeContentParsed(
  gameId: string, layer: string, dungeonId: string,
  onMissingImage?: (image: string) => void,
): Promise<void> {
  const dir = dungeonDir(gameId, layer, dungeonId);
  let source = await sourceOf(dir);
  if (!source) {
    // A new dungeon has its config before any text: it still needs its `_config_` entry.
    const configText = await Global.getInstance().readText(`${dir}/config.json`).catch(() => null);
    source = { hash: sourceHash('', configText ?? ''), raw: '', configText };
  }
  await regenerate(dir, source, onMissingImage);
}

/**
 * A layer's parsed lines, regenerated from its text first (and written back) when the text or
 * config changed since the parsed file was written. null when there's nothing to check: no text in
 * this layer, or a host that can't stat.
 */
export async function freshLayerLines(
  gameId: string, layer: string, dungeonId: string,
): Promise<{ lines: Record<string, any>[]; regenerated: boolean } | null> {
  const global = Global.getInstance();
  const dir = dungeonDir(gameId, layer, dungeonId);
  const source = await sourceOf(dir);
  if (!source) return null;

  const parsedPath = `${dir}/content_parsed.json`;
  let parsed: any = null;
  try {
    parsed = (await global.pathExists(parsedPath)) ? await global.readJson(parsedPath) : null;
  } catch { /* unreadable: regenerate */ }
  const stored = Array.isArray(parsed) ? parsed.find((line: any) => line?.id === '_config_')?.source?.hash : undefined;
  if (Array.isArray(parsed) && stored === source.hash) return { lines: parsed, regenerated: false };

  const lines = await regenerate(dir, source);
  return lines ? { lines, regenerated: true } : null;
}

/** Regenerate every stale parsed file in these layers; returns them as `layer/dungeon`. */
export async function refreshStaleContent(gameId: string, layers: string[]): Promise<string[]> {
  const global = Global.getInstance();
  const updated: string[] = [];
  for (const layer of layers) {
    const dir = `games_files/${gameId}/${layer}/dungeons`;
    let dungeons: string[] = [];
    try {
      if (await global.pathExists(dir)) dungeons = await global.listFolders(dir);
    } catch { /* unreadable: nothing to refresh */ }
    const results = await Promise.all(dungeons.map(d => freshLayerLines(gameId, layer, d)));
    results.forEach((r, i) => { if (r?.regenerated) updated.push(`${layer}/${dungeons[i]}`); });
  }
  return updated;
}
