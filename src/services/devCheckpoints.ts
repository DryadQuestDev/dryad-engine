import { ref } from 'vue';
import { DEV_AUTO_SAVE_SLOT } from './indexeddb-save.service';

/**
 * Dev playtest checkpoints: a ring of the last RING_SIZE paragraphs, each the state just before
 * that paragraph's actions fired, in its own hidden save slot. The ring position lives in
 * localStorage per game id, so it survives the page reloads every load goes through.
 */
const RING_SIZE = 10;
const SLOT_PREFIX = '__dev_checkpoint_';
const META_KEY_PREFIX = 'dev_checkpoints_';

/**
 * `head` is the slot the next checkpoint writes to; `count` how many slots behind it are valid.
 * `seq` numbers checkpoints within a run, always `head` modulo the ring size, so a serial names
 * one checkpoint even after the ring has lapped its slot.
 */
interface RingMeta {
  head: number;
  count: number;
  seq: number;
}

/** What the ring just did, for the dev log. */
export type CheckpointEvent =
  /** A new run: a new game, or `slot` loaded from outside the dev slots. */
  | { type: 'run'; gameId: string; slot?: string }
  /** A dev slot loaded. `replay` is the serial of the checkpoint replayed, `back` how far behind the newest it was. */
  | { type: 'load'; gameId: string; slot: string; replay: number | null; back: number }
  /** A checkpoint was claimed for the paragraph about to run its actions. */
  | { type: 'checkpoint'; gameId: string; serial: number };

let listener: ((event: CheckpointEvent) => void) | null = null;

/** The dev log's hook into the ring. One listener; a second call replaces the first. */
export function onCheckpointEvent(fn: (event: CheckpointEvent) => void): void {
  listener = fn;
}

// localStorage is not reactive: bumped on every ring change so a computed reading the ring
// (the debug panel's Back one paragraph button) re-evaluates.
const ringVersion = ref(0);

function metaKey(gameId: string): string {
  return `${META_KEY_PREFIX}${gameId}`;
}

function slotName(index: number): string {
  return `${SLOT_PREFIX}${index}__`;
}

function slotIndex(slot: string): number | null {
  if (!slot.startsWith(SLOT_PREFIX) || !slot.endsWith('__')) return null;
  const index = Number(slot.slice(SLOT_PREFIX.length, -2));
  return Number.isInteger(index) && index >= 0 && index < RING_SIZE ? index : null;
}

function wrap(index: number): number {
  return ((index % RING_SIZE) + RING_SIZE) % RING_SIZE;
}

function readMeta(gameId: string): RingMeta {
  try {
    const meta = JSON.parse(localStorage.getItem(metaKey(gameId)) || 'null');
    if (Number.isInteger(meta?.head) && Number.isInteger(meta?.count)) {
      const head = wrap(meta.head);
      const count = Math.max(0, Math.min(RING_SIZE, meta.count));
      const seq = Number.isInteger(meta.seq) && meta.seq >= count && wrap(meta.seq) === head
        ? meta.seq
        : head + (head < count ? RING_SIZE : 0);
      return { head, count, seq };
    }
  } catch { /* corrupt meta reads as an empty ring */ }
  return { head: 0, count: 0, seq: 0 };
}

function writeMeta(gameId: string, meta: RingMeta): void {
  localStorage.setItem(metaKey(gameId), JSON.stringify(meta));
  ringVersion.value++;
}

export function isCheckpointSlot(slot: string): boolean {
  return slotIndex(slot) !== null;
}

/**
 * Slot of the checkpoint `back` steps behind the newest (0 = newest), or null when the ring holds
 * fewer. Reactive inside a computed.
 */
export function peekCheckpoint(gameId: string, back = 0): string | null {
  void ringVersion.value;
  const meta = readMeta(gameId);
  if (back < 0 || back >= meta.count) return null;
  return slotName(wrap(meta.head - 1 - back));
}

/** Slot still holding checkpoint `serial`, or null once the ring has dropped it. Reactive inside a computed. */
export function checkpointSlot(gameId: string, serial: number): string | null {
  void ringVersion.value;
  const meta = readMeta(gameId);
  if (!Number.isInteger(serial) || serial >= meta.seq || serial < meta.seq - meta.count) return null;
  return slotName(wrap(serial));
}

/** Claim the slot for a new checkpoint, overwriting the oldest once the ring is full. */
export function nextCheckpointSlot(gameId: string): string {
  const meta = readMeta(gameId);
  const slot = slotName(meta.head);
  writeMeta(gameId, { head: wrap(meta.head + 1), count: Math.min(RING_SIZE, meta.count + 1), seq: meta.seq + 1 });
  listener?.({ type: 'checkpoint', gameId, serial: meta.seq });
  return slot;
}

const RUN_KEY_PREFIX = 'dev_run_';

function newRunId(gameId: string): string {
  const id = Math.random().toString(36).slice(2, 14);
  localStorage.setItem(`${RUN_KEY_PREFIX}${gameId}`, id);
  return id;
}

/**
 * The current dev run: it changes whenever the checkpoints reset (a new game, or a load from
 * outside the dev slots), so per-run dev records (the log, the debug panel's changes) can tell
 * they belong to an earlier run. Survives the reloads within a run. Reactive inside a computed.
 */
export function currentRunId(gameId: string): string {
  void ringVersion.value;
  return localStorage.getItem(`${RUN_KEY_PREFIX}${gameId}`) || newRunId(gameId);
}

/** Forget every checkpoint, so stepping back can never reach into another run. */
export function resetCheckpoints(gameId: string, loadedSlot?: string): void {
  localStorage.removeItem(metaKey(gameId));
  newRunId(gameId);
  ringVersion.value++;
  listener?.({ type: 'run', gameId, slot: loadedSlot });
}

/**
 * Keep the ring in step with a save that was just loaded. A checkpoint loaded to be replayed
 * drops itself and everything newer: the replayed paragraph writes its fresh checkpoint back
 * into the same slot, so stepping back again reaches the paragraph before it instead of
 * landing on the same one twice. Any save outside the dev slots starts a different run.
 */
export function syncCheckpointsOnLoad(gameId: string, slot: string, replay: boolean): void {
  const index = slotIndex(slot);
  if (index === null) {
    if (slot !== DEV_AUTO_SAVE_SLOT) {
      resetCheckpoints(gameId, slot);
      return;
    }
    listener?.({ type: 'load', gameId, slot, replay: null, back: 0 });
    return;
  }
  if (!replay) {
    listener?.({ type: 'load', gameId, slot, replay: null, back: 0 });
    return;
  }
  const meta = readMeta(gameId);
  const back = wrap(meta.head - 1 - index);
  if (back < meta.count) {
    const serial = meta.seq - 1 - back;
    writeMeta(gameId, { head: index, count: meta.count - back - 1, seq: serial });
    listener?.({ type: 'load', gameId, slot, replay: serial, back });
  } else {
    // A slot the ring no longer counts: nothing to step back to, and serials only move forward.
    writeMeta(gameId, { head: index, count: 0, seq: meta.seq + wrap(index - meta.head) });
    listener?.({ type: 'load', gameId, slot, replay: null, back });
  }
}
