/**
 * Utility for grouping Spine animation names by convention.
 *
 * Animations named `group_suffix` (split on last `_`) are grouped together.
 * Each group gets a deterministic track number (alphabetical, starting at 1).
 * Animations without `_` are base animations for track 0.
 */

export interface AnimationGroupData {
  baseAnimations: string[];
  groups: Record<string, { track: number; suffixes: string[] }>;
}

export function buildAnimationGroups(animationNames: string[]): AnimationGroupData {
  const baseAnimations: string[] = [];
  const groupMap = new Map<string, string[]>();

  for (const name of animationNames) {
    const lastUnderscore = name.lastIndexOf('_');
    if (lastUnderscore === -1) {
      baseAnimations.push(name);
    } else {
      const group = name.substring(0, lastUnderscore);
      const suffix = name.substring(lastUnderscore + 1);
      let suffixes = groupMap.get(group);
      if (!suffixes) {
        suffixes = [];
        groupMap.set(group, suffixes);
      }
      suffixes.push(suffix);
    }
  }

  // Assign track numbers alphabetically starting at 1; suffixes within each
  // group sorted alphabetically so "first suffix" is deterministic.
  const sortedGroupNames = [...groupMap.keys()].sort();
  const groups: Record<string, { track: number; suffixes: string[] }> = {};
  for (let i = 0; i < sortedGroupNames.length; i++) {
    const name = sortedGroupNames[i];
    groups[name] = { track: i + 1, suffixes: groupMap.get(name)!.sort() };
  }

  baseAnimations.sort();
  return { baseAnimations, groups };
}

/**
 * Build the {track → animation name} map for a character's spine playback.
 *
 * - Base animations (no `_`) autoplay the first alphabetically on track 0.
 * - For each group:
 *   - Attribute unset: autoplay the first suffix alphabetically.
 *   - Attribute set and matches an animation: play that one.
 *   - Attribute set but doesn't match: leave the track empty (dev opted out).
 *
 * Mirrored at runtime by Character.getSpineTrackAnimations so editor previews
 * match gameplay.
 */
export function buildEditorTrackMap(
  animationNames: string[],
  attributes: Record<string, unknown>,
): Map<number, string> {
  const result = new Map<number, string>();
  const groups = buildAnimationGroups(animationNames);
  const available = new Set(animationNames);

  if (groups.baseAnimations.length > 0) {
    result.set(0, groups.baseAnimations[0]);
  }

  for (const groupName in groups.groups) {
    const group = groups.groups[groupName];
    const attrValue = attributes[groupName];

    if (typeof attrValue === 'string' && attrValue) {
      const animName = `${groupName}_${attrValue}`;
      if (available.has(animName)) {
        result.set(group.track, animName);
      }
      continue;
    }

    if (group.suffixes.length > 0) {
      result.set(group.track, `${groupName}_${group.suffixes[0]}`);
    }
  }

  return result;
}

/**
 * Plays each [track, name] entry, skipping animations the skeleton lacks.
 * Tracks currently playing on the spine that aren't in the new map are
 * faded out via `setEmptyAnimation` so attribute changes that drop a track
 * actually stop the previous animation.
 */
export function applyTrackMap(
  spine: { skeleton: any; state: any },
  trackMap: Map<number, string>,
  loop: boolean = true,
): void {
  const tracks = spine.state.tracks ?? [];
  for (let i = 0; i < tracks.length; i++) {
    if (tracks[i] && !trackMap.has(i)) {
      spine.state.setEmptyAnimation(i, 0.3);
    }
  }
  for (const [track, animName] of trackMap) {
    if (spine.skeleton.data.findAnimation(animName)) {
      spine.state.setAnimation(track, animName, loop);
    }
  }
}

export interface AutoplayedAnimation {
  /** Animation name that will play automatically (no attribute drives it). */
  name: string;
  /** The group whose unset attribute caused autoplay, or null for a base animation playing on track 0. */
  groupName: string | null;
}

/**
 * Returns animations that will play without any attribute driving them:
 * - The track 0 base animation (no `_` in name) if any.
 * - The first suffix of every group whose attribute is unset.
 *
 * A group whose attribute is set but points to a non-existent animation is
 * NOT autoplayed — the dev explicitly chose nothing for that track. Used by
 * the editor to tag chips with an `autoplayed` indicator.
 */
export function findAutoplayedAnimations(
  animationNames: string[],
  attributes: Record<string, unknown>,
): AutoplayedAnimation[] {
  const groups = buildAnimationGroups(animationNames);
  const result: AutoplayedAnimation[] = [];

  if (groups.baseAnimations.length > 0) {
    result.push({ name: groups.baseAnimations[0], groupName: null });
  }

  for (const groupName in groups.groups) {
    const attrValue = attributes[groupName];
    if (typeof attrValue === 'string' && attrValue) continue;

    const group = groups.groups[groupName];
    if (group.suffixes.length === 0) continue;
    result.push({ name: `${groupName}_${group.suffixes[0]}`, groupName });
  }

  return result;
}
