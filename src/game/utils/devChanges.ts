import { computed, shallowRef } from 'vue';
import { Game } from '../game';
import { currentRunId } from '../../services/devCheckpoints';
import { devLogConsoleRun } from './devLog';
import { PARTY_INVENTORY_ID } from '../systems/itemSystem';

/**
 * Dev playtests only: the edits made in the debug panel's Characters and Inventories tabs. Each edit
 * runs the action content would use, and is kept as one change per thing edited, netted against
 * its value from before the first edit. Together they make one action object the author can paste
 * into content. Kept in sessionStorage per game and run, so the reloads within a run (Shift+R,
 * PageUp, the editor's Continue) keep them and a new game starts empty.
 */

export type DevChangeKind = 'attr' | 'trait' | 'stat' | 'resource' | 'status' | 'item';
export type DevValue = string | number | boolean | null;

export type DevChange = {
  kind: DevChangeKind;
  /** The character id; the inventory id for items. */
  owner: string;
  /** The attribute, trait, stat, resource, status or item id. */
  key: string;
  /** Before the first edit. A status holds its stack count (0 = absent), an item its count. */
  original: DevValue;
  /** Right after the last edit. A reload or the story can move the game off it since. */
  value: DevValue;
};

export type DevTarget = Pick<DevChange, 'kind' | 'owner' | 'key'>;

type SetAction = 'attr' | 'trait' | 'stat' | 'resource';

type Fragment =
  | { action: SetAction; path: string; value: string }
  | { action: 'status'; owner: string; item: string }
  | { action: 'add_item' | 'remove_item'; spec: string }
  // No action unsets a key, which an undo back to "unset" needs.
  | { action: 'direct'; run: () => void };

// The order the merged action runs in. Resources go last: their cap comes from the stats and
// statuses set before them, and a resource set first would clamp to the old cap.
const ACTION_ORDER = ['attr', 'trait', 'stat', 'status', 'add_item', 'remove_item', 'resource'] as const;

const STORAGE_PREFIX = 'dev_changes_';

type Stored = { game: string; run: string; changes: DevChange[] };

const stored = shallowRef<Stored | null>(null);

function gameId(): string {
  return Game.getInstance().coreSystem.gameId;
}

/** Read this game's changes back from sessionStorage. Call before reading devChanges. */
export function loadDevChanges(): void {
  const id = gameId();
  if (stored.value?.game === id) return;
  let blob: Stored | null = null;
  try {
    blob = JSON.parse(sessionStorage.getItem(STORAGE_PREFIX + id) || 'null');
  } catch { /* corrupt storage reads as no changes */ }
  stored.value = blob && Array.isArray(blob.changes) ? { ...blob, game: id } : { game: id, run: '', changes: [] };
}

/** This run's changes, oldest first. Empty once a new run starts. */
export const devChanges = computed<DevChange[]>(() => {
  const blob = stored.value;
  if (!blob || blob.game !== gameId() || blob.run !== currentRunId(blob.game)) return [];
  return blob.changes;
});

function save(changes: DevChange[]): void {
  const id = gameId();
  const blob: Stored = { game: id, run: currentRunId(id), changes };
  stored.value = blob;
  sessionStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(blob));
}

function sameTarget(a: DevTarget, b: DevTarget): boolean {
  return a.kind === b.kind && a.owner === b.owner && a.key === b.key;
}

function equal(a: DevValue | undefined, b: DevValue | undefined): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export function findDevChange(target: DevTarget): DevChange | undefined {
  return devChanges.value.find(c => sameTarget(c, target));
}

/** The game's value now, in the terms a change records; undefined when the owner is gone. */
export function readLive(target: DevTarget): DevValue | undefined {
  const game = Game.getInstance();
  if (target.kind === 'item') {
    const inventory = game.itemSystem.inventories.value.get(target.owner);
    if (!inventory) return undefined;
    return inventory.getItemsById(target.key).reduce((count, item) => count + item.quantity, 0);
  }
  const character = game.characterSystem.getCharacter(target.owner);
  if (!character) return undefined;
  const core = character.getCoreStatus();
  switch (target.kind) {
    case 'attr': return core.attributes[target.key] ?? null;
    case 'trait': return core.traits[target.key] ?? null;
    case 'stat': return core.stats[target.key] ?? 0;
    case 'resource':
      try { return character.getResource(target.key); } catch { return undefined; }
    case 'status': return character.getStatus(target.key)?.currentStacks ?? 0;
    default: return undefined;
  }
}

/** Whether the game still holds what the last edit left. */
export function isInEffect(change: DevChange): boolean {
  return equal(readLive(change), change.value);
}

function freshStacks(statusId: string): number {
  try {
    return Game.getInstance().createStatus(statusId).currentStacks || 1;
  } catch {
    return 1;
  }
}

/** The steps that take one target from one value to another. */
function fragments(target: DevTarget, from: DevValue, to: DevValue): Fragment[] {
  const { kind, owner, key } = target;
  if (kind === 'item') {
    const delta = Number(to) - Number(from);
    if (!delta) return [];
    const count = Math.abs(delta) > 1 ? `#${Math.abs(delta)}` : '';
    const where = owner !== PARTY_INVENTORY_ID ? ` -> ${owner}` : '';
    return [{ action: delta > 0 ? 'add_item' : 'remove_item', spec: `${key}${count}${where}` }];
  }
  if (kind === 'status') {
    const was = Number(from) || 0;
    const now = Number(to) || 0;
    if (was === now) return [];
    if (now === 0) return [{ action: 'status', owner, item: `!${key}` }];
    const apply = (stacks: number): Fragment =>
      ({ action: 'status', owner, item: stacks === freshStacks(key) ? key : `${key}(stacks = ${stacks})` });
    if (was === 0) return [apply(now)];
    // A reapply adds its stacks to the ones there.
    if (now > was) return [apply(now - was)];
    return [{ action: 'status', owner, item: `!${key}` }, apply(now)];
  }
  if (to === null) {
    return [{
      action: 'direct', run: () => {
        const character = Game.getInstance().characterSystem.getCharacter(owner);
        if (!character) return;
        const core = character.getCoreStatus();
        if (kind === 'attr') {
          delete core.attributes[key];
          delete character.coreWrites.attributes[key];
        } else if (kind === 'trait') {
          delete core.traits[key];
          delete character.coreWrites.traits[key];
        }
        character.reevaluate();
      },
    }];
  }
  return [{ action: kind, path: `${owner}.${key}`, value: String(to) }];
}

// The ops string splits on every comma and trims each value, so a value that would not survive
// that goes in the object form instead (all strings there, or a number would read as += / -=).
function fitsOps(value: string): boolean {
  return value !== '' && value === value.trim() && !/[,\n]/.test(value);
}

/** Merge steps into one action object, one key per action in run order. */
function compose(steps: Fragment[]): Record<string, string | Record<string, string>> {
  const out: Record<string, string | Record<string, string>> = {};
  for (const action of ACTION_ORDER) {
    const mine = steps.filter(s => s.action === action);
    if (!mine.length) continue;
    if (action === 'status') {
      const groups = new Map<string, string[]>();
      for (const s of mine as Extract<Fragment, { action: 'status' }>[]) {
        if (!groups.has(s.owner)) groups.set(s.owner, []);
        groups.get(s.owner)!.push(s.item);
      }
      out.status = [...groups].map(([owner, items]) => `${owner}->${items.join(' & ')}`).join(', ');
    } else if (action === 'add_item' || action === 'remove_item') {
      out[action] = (mine as Extract<Fragment, { action: 'add_item' | 'remove_item' }>[]).map(s => s.spec).join(', ');
    } else {
      const sets = mine as Extract<Fragment, { action: SetAction }>[];
      out[action] = sets.every(s => fitsOps(s.value))
        ? sets.map(s => `${s.path} = ${s.value}`).join(', ')
        : Object.fromEntries(sets.map(s => [s.path, s.value]));
    }
  }
  return out;
}

// fixJson turns curly quotes into straight ones, which would end a string early, so escape them.
function quote(text: string): string {
  return JSON.stringify(text).replace(/[«»‘-‟]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** The action as it would be written in a `{ }` line. */
export function formatAction(action: Record<string, string | Record<string, string>>): string {
  const parts = Object.entries(action).map(([key, value]) => typeof value === 'string'
    ? `${key}: ${quote(value)}`
    : `${key}: {${Object.entries(value).map(([path, v]) => `${quote(path)}: ${quote(v)}`).join(', ')}}`);
  return `{${parts.join(', ')}}`;
}

/** One action object that makes these changes on a game in the state they started from. */
export function devChangesAction(changes: DevChange[]): string {
  if (!changes.length) return '';
  return formatAction(compose(changes.flatMap(c => fragments(c, c.original, c.value))));
}

function run(steps: Fragment[]): string | null {
  const game = Game.getInstance();
  if (!game.isDevMode()) return 'Dev mode only';
  try {
    const action = compose(steps);
    // Logged as the panel's own group, so the edit doesn't read as something the paragraph did.
    devLogConsoleRun(Object.keys(action).length ? formatAction(action) : 'edit', () => {
      if (Object.keys(action).length) game.logicSystem.resolveActions(action);
      for (const step of steps) if (step.action === 'direct') step.run();
    }, 'Panel');
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  return null;
}

/** Run the steps on one target and record where it ended up. Returns an error message, or null. */
function record(target: DevTarget, steps: Fragment[]): string | null {
  if (!steps.length) return null;
  const before = readLive(target);
  if (before === undefined) return `"${target.owner}" no longer exists`;
  const changes = [...devChanges.value];
  const at = changes.findIndex(c => sameTarget(c, target));
  const original = at >= 0 ? changes[at].original : before;
  const error = run(steps);
  const after = readLive(target);
  if (after === undefined || equal(after, original)) {
    if (at >= 0) changes.splice(at, 1);
  } else {
    const change = { ...target, original, value: after };
    if (at >= 0) changes[at] = change;
    else changes.push(change);
  }
  save(changes);
  return error;
}

/**
 * Set an attribute, trait, stat or resource, an item's count in an inventory, or a status's stack
 * count, through the action content would use. Returns an error message, or null.
 */
export function devSet(target: DevTarget, to: DevValue): string | null {
  const from = readLive(target);
  if (from === undefined) return `"${target.owner}" no longer exists`;
  return record(target, fragments(target, from, to));
}

/** Apply a status once (`alice->blessed`) or remove it (`alice->!blessed`), as content would. */
export function devStatus(owner: string, statusId: string, add: boolean): string | null {
  return record({ kind: 'status', owner, key: statusId }, [{ action: 'status', owner, item: add ? statusId : `!${statusId}` }]);
}

/**
 * Put these changes back to their originals and forget them. A change the game no longer holds
 * (a reload or the story moved it since) is only forgotten: there is no edit of ours left to undo.
 */
export function undoDevChanges(changes: DevChange[]): string | null {
  const steps: Fragment[] = [];
  for (const change of changes) {
    const live = readLive(change);
    if (live !== undefined && equal(live, change.value)) steps.push(...fragments(change, live, change.original));
  }
  const error = run(steps);
  save(devChanges.value.filter(c => !changes.some(u => sameTarget(c, u))));
  return error;
}

/** Make the game hold these changes again, after a reload or the story moved it off them. */
export function reapplyDevChanges(changes: DevChange[]): string | null {
  const steps: Fragment[] = [];
  for (const change of changes) {
    const live = readLive(change);
    if (live !== undefined && !equal(live, change.value)) steps.push(...fragments(change, live, change.value));
  }
  return run(steps);
}
