import { reactive } from 'vue';

/**
 * Asset files the app rewrote during this page's life, by data path. Rewriting a file in place
 * keeps its path, so an <img> showing it never reloads (its src did not change), and a new <img>
 * can be handed the copy the page still holds. A view showing a file the editor can rewrite takes
 * its src from assetRevisionUrl(), which adds the rewrite time as a query.
 */
const revisions = reactive(new Map<string, number>());

function revisionKey(path: string): string {
  return path.replace(/^\/+/, '').replace(/^assets\//, '').split('?')[0];
}

/** Marks a file as rewritten. Takes a storage path (`games_assets/…`) or a data path (`assets/games_assets/…`). */
export function bumpAssetRevision(path: string): void {
  revisions.set(revisionKey(path), Date.now());
}

/** The URL to show `path` with: unchanged unless the file was rewritten since the page loaded. */
export function assetRevisionUrl<T extends string | null | undefined>(path: T): T {
  if (!path) return path;
  const revision = revisions.get(revisionKey(path));
  if (!revision) return path;
  return `${path}${path.includes('?') ? '&' : '?'}v=${revision}` as T;
}
