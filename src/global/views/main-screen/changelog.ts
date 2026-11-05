import { useStorage } from '@vueuse/core';
import { ManifestObject } from '../../../schemas/manifestSchema';

export type ChangelogEntry = NonNullable<ManifestObject['changelog']>[number];

/** Numeric a.b.c comparison; a part that is not a number falls back to text order. */
export function compareVersions(a: string | undefined, b: string | undefined): number {
  const pa = String(a || '').split('.');
  const pb = String(b || '').split('.');
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '0';
    const y = pb[i] ?? '0';
    const nx = Number(x), ny = Number(y);
    const diff = !isNaN(nx) && !isNaN(ny) ? nx - ny : x.localeCompare(y);
    if (diff !== 0) return diff;
  }
  return 0;
}

// `[changes]` in a manifest description stands for the newest changelog entry. The editor's rich
// text wraps it in its own paragraph, which a heading and a list cannot sit inside, so a
// paragraph holding only the token goes with it; a token inside other text is replaced alone.
const CHANGES_TOKEN = /<p>(?:\s|&nbsp;)*\[changes\](?:\s|&nbsp;)*<\/p>|\[changes\]/gi;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * `html` with `[changes]` replaced by the manifest's newest changelog entry: a "New in <version>"
 * heading over its notes. `withChanges: false` drops the token instead, for previews too small to
 * hold a release's notes. Used for manifest descriptions and landing widgets.
 */
export function replaceChangesToken(
  html: string,
  manifest: ManifestObject | null | undefined,
  newInLabel: (version: string) => string,
  withChanges = true,
): string {
  if (!html || !/\[changes\]/i.test(html)) return html || '';
  const latest = withChanges ? sortedChangelog(manifest)[0] : undefined;
  const heading = latest?.version ? newInLabel(latest.version) : latest?.title || '';
  const block = latest ? `${heading ? `<h3>${escapeHtml(heading)}</h3>` : ''}${latest.notes || ''}` : '';
  return html.replace(CHANGES_TOKEN, block);
}

/** A manifest description with `[changes]` resolved against the manifest's own changelog. */
export function renderManifestDescription(
  manifest: ManifestObject | null | undefined,
  newInLabel: (version: string) => string,
  withChanges = true,
): string {
  return replaceChangesToken(manifest?.description || '', manifest, newInLabel, withChanges);
}

/** Entries with something to show, newest version first. */
export function sortedChangelog(manifest: ManifestObject | null | undefined): ChangelogEntry[] {
  return (manifest?.changelog || [])
    .filter((entry): entry is ChangelogEntry => !!entry && !!(entry.version || entry.title || entry.notes))
    .slice()
    .sort((a, b) => compareVersions(b.version, a.version));
}

// Last changelog version the player has seen, per manifest id. A viewing preference kept per
// browser, like the inventory sort, so it survives across games and sessions without a save.
const seenVersions = useStorage<Record<string, string>>('changelog_seen_versions', {});

/** True when the manifest's newest changelog entry arrived after the version recorded as seen. */
export function hasUnseenChangelog(manifest: ManifestObject | null | undefined): boolean {
  const id = manifest?.id;
  const latest = sortedChangelog(manifest)[0]?.version;
  if (!id || !latest) return false;
  const seen = seenVersions.value[id];
  return !!seen && compareVersions(latest, seen) > 0;
}

/**
 * The first time a manifest is shown, record its current version without flagging it: a new
 * player has nothing "since last time", and the dot is for returning players after an update.
 */
export function recordFirstVisit(manifest: ManifestObject | null | undefined): void {
  const id = manifest?.id;
  const latest = sortedChangelog(manifest)[0]?.version;
  if (!id || !latest || seenVersions.value[id]) return;
  seenVersions.value = { ...seenVersions.value, [id]: latest };
}

/** Record the manifest's newest changelog version as seen. */
export function markChangelogSeen(manifest: ManifestObject | null | undefined): void {
  const id = manifest?.id;
  const latest = sortedChangelog(manifest)[0]?.version;
  if (!id || !latest) return;
  if (seenVersions.value[id] === latest) return;
  seenVersions.value = { ...seenVersions.value, [id]: latest };
}
