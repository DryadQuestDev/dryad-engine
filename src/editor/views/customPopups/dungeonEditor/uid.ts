// Module-level uid counter shared by the dungeon editor's keyed v-fors.
// Used to tag blocks, scene rows, and scene columns with a stable `__uid`
// that survives `{ ...obj }` spreads — so edit-emit cycles don't change the
// v-for key (which would remount the component, steal focus, and lose state).
//
// Tags are session-only, never serialized. `tagWithUid` is idempotent: it
// only assigns when the property is missing.

let counter = 0;

export function tagWithUid<T extends object>(o: T): T {
  if (o && (o as any).__uid === undefined) (o as any).__uid = ++counter;
  return o;
}

export function tagBlocks<T extends object>(arr: T[]): T[] {
  for (const b of arr) tagBlockDeep(b);
  return arr;
}

/**
 * Tag a block with a uid. For scene blocks, also recursively tag every row
 * and every column inside, so SceneEditor's keyed v-fors get stable uids
 * from the moment the doc is parsed / replaced.
 */
export function tagBlockDeep<T extends object>(b: T): T {
  tagWithUid(b);
  const kind = (b as any)?.kind;
  if (kind === 'scene') {
    const rows = (b as any).rows as any[] | undefined;
    if (rows) {
      for (const row of rows) {
        tagWithUid(row);
        const cols = row?.columns as any[] | undefined;
        if (cols) for (const col of cols) tagWithUid(col);
      }
    }
  } else if (kind === 'encounter' || kind === 'template') {
    const rows = (b as any).rows as any[] | undefined;
    if (rows) for (const row of rows) tagWithUid(row);
  }
  return b;
}
