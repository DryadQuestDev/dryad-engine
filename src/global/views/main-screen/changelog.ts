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

/** The two headings a rendered changelog writes: "New in 0.23.1" and "Hotfix 0.23.1". */
export interface ChangelogLabels {
  newIn: (version: string) => string;
  hotfix: (version: string) => string;
}

/** The engine's locale strings for those headings, from any `getString`. */
export function changelogLabels(getString: (id: string, params: Record<string, string>) => string): ChangelogLabels {
  return {
    newIn: (version) => getString('changelog.new_in', { version }),
    hotfix: (version) => getString('changelog.hotfix', { version }),
  };
}

/**
 * One release as players read it: an a.b version's own entry plus every hotfix shipped on top of
 * it (a.b.1, a.b.2, …). The oldest entry of an a.b line is the release; each later one is a hotfix.
 */
export interface ChangelogGroup {
  key: string;
  /** The newest version of the line – the one the player is getting. */
  version?: string;
  /** The newest date in the line. */
  date?: string;
  title?: string;
  image?: string;
  /** The release's notes, then one "Hotfix <version>" section per hotfix, in release order. */
  notes: string;
}

function releaseLine(version: string | undefined): string | undefined {
  const parts = String(version || '').split('.');
  return version && parts.length >= 2 ? `${parts[0]}.${parts[1]}` : undefined;
}

/** The changelog grouped into releases, newest first, each hotfix folded into its release's notes. */
export function groupedChangelog(
  manifest: ManifestObject | null | undefined,
  hotfixLabel: (version: string) => string,
): ChangelogGroup[] {
  const lines = new Map<string, ChangelogEntry[]>();
  sortedChangelog(manifest).forEach((entry, i) => {
    const key = releaseLine(entry.version) ?? `${entry.uid || entry.version || entry.title || ''}#${i}`;
    lines.set(key, [entry, ...(lines.get(key) || [])]);
  });
  return [...lines].map(([key, entries]) => {
    const [release, ...hotfixes] = entries;
    const newest = entries[entries.length - 1];
    let notes = release.notes || '';
    for (const fix of hotfixes) {
      const label = [fix.version ? hotfixLabel(fix.version) : '', fix.title || ''].filter(Boolean).join(': ');
      notes += `${label ? `<h4 class="changelog-hotfix">${escapeHtml(label)}</h4>` : ''}${fix.notes || ''}`;
    }
    return {
      key,
      version: newest.version,
      date: [...entries].reverse().find((e) => e.date)?.date,
      title: release.title || hotfixes.find((e) => e.title)?.title,
      image: release.image || hotfixes.find((e) => e.image)?.image,
      notes,
    };
  });
}

// `[changes]` in a manifest description stands for the newest release. The editor's rich
// text wraps it in its own paragraph, which a heading and a list cannot sit inside, so a
// paragraph holding only the token goes with it; a token inside other text is replaced alone.
const CHANGES_TOKEN = /<p>(?:\s|&nbsp;)*\[changes\](?:\s|&nbsp;)*<\/p>|\[changes\]/gi;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * `html` with `[changes]` replaced by the manifest's newest release: a "New in <version>" heading
 * over its notes, hotfixes included. `withChanges: false` drops the token instead, for previews too
 * small to hold a release's notes. Used for manifest descriptions and landing widgets.
 */
export function replaceChangesToken(
  html: string,
  manifest: ManifestObject | null | undefined,
  labels: ChangelogLabels,
  withChanges = true,
): string {
  if (!html || !/\[changes\]/i.test(html)) return html || '';
  const latest = withChanges ? groupedChangelog(manifest, labels.hotfix)[0] : undefined;
  const heading = latest?.version ? labels.newIn(latest.version) : latest?.title || '';
  const block = latest ? `${heading ? `<h3>${escapeHtml(heading)}</h3>` : ''}${latest.notes}` : '';
  return html.replace(CHANGES_TOKEN, block);
}

/** A manifest description with `[changes]` resolved against the manifest's own changelog. */
export function renderManifestDescription(
  manifest: ManifestObject | null | undefined,
  labels: ChangelogLabels,
  withChanges = true,
): string {
  return replaceChangesToken(manifest?.description || '', manifest, labels, withChanges);
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
