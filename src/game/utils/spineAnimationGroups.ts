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

  // Assign track numbers alphabetically starting at 1
  const sortedGroupNames = [...groupMap.keys()].sort();
  const groups: Record<string, { track: number; suffixes: string[] }> = {};
  for (let i = 0; i < sortedGroupNames.length; i++) {
    const name = sortedGroupNames[i];
    groups[name] = { track: i + 1, suffixes: groupMap.get(name)! };
  }

  return { baseAnimations, groups };
}
