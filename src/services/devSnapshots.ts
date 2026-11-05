import { ref } from 'vue';
import ShortUniqueId from 'short-unique-id';
import { IndexedDbSaveService } from './indexeddb-save.service';

/**
 * Dev playtest snapshots: named moments the developer keeps, each a hidden save in its own slot.
 * The list lives in localStorage per game id, so the editor (same origin) can list them and start
 * a playtest from one. Never shown in the save lists: the slots are saved with `hidden`.
 */
export interface DevSnapshot {
  id: string;
  name: string;
  slot: string;
  savedAt: number;
  dungeonId: string | null;
  roomId: string | null;
  /** The paragraph on screen when it was taken, null outside a scene. */
  sceneId: string | null;
  /** A few story values at that moment, e.g. "trust 2". */
  summary: string;
}

// Not the checkpoint ring's `__dev_checkpoint_N__`, so the ring never claims a snapshot's slot.
const SLOT_PREFIX = '__dev_snapshot_';
const META_KEY_PREFIX = 'dev_snapshots_';

const uid = new ShortUniqueId({ length: 12 });

// localStorage is not reactive: bumped on every change so computeds reading the list re-run.
const listVersion = ref(0);

function metaKey(gameId: string): string {
  return `${META_KEY_PREFIX}${gameId}`;
}

export function isSnapshotSlot(slot: string): boolean {
  return slot.startsWith(SLOT_PREFIX) && slot.endsWith('__');
}

/** A fresh snapshot id and its slot. */
export function newSnapshotSlot(): { id: string; slot: string } {
  const id = uid.rnd();
  return { id, slot: `${SLOT_PREFIX}${id}__` };
}

function read(gameId: string): DevSnapshot[] {
  try {
    const list = JSON.parse(localStorage.getItem(metaKey(gameId)) || '[]');
    return Array.isArray(list) ? list.filter((s) => s && typeof s.id === 'string' && typeof s.slot === 'string') : [];
  } catch {
    return [];
  }
}

function write(gameId: string, list: DevSnapshot[]): void {
  if (list.length) localStorage.setItem(metaKey(gameId), JSON.stringify(list));
  else localStorage.removeItem(metaKey(gameId));
  listVersion.value++;
}

/** The game's snapshots, newest first. Reactive inside a computed. */
export function listSnapshots(gameId: string): DevSnapshot[] {
  void listVersion.value;
  if (!gameId) return [];
  return read(gameId).sort((a, b) => b.savedAt - a.savedAt);
}

export function getSnapshot(gameId: string, id: string): DevSnapshot | null {
  return read(gameId).find((s) => s.id === id) ?? null;
}

export function addSnapshot(gameId: string, snapshot: DevSnapshot): void {
  write(gameId, [...read(gameId).filter((s) => s.id !== snapshot.id), snapshot]);
}

export function renameSnapshot(gameId: string, id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  write(gameId, read(gameId).map((s) => (s.id === id ? { ...s, name: trimmed } : s)));
}

/** Forget the snapshot and free its save slot. */
export async function deleteSnapshot(gameId: string, id: string): Promise<void> {
  const snapshot = getSnapshot(gameId, id);
  write(gameId, read(gameId).filter((s) => s.id !== id));
  if (snapshot) {
    try {
      await new IndexedDbSaveService().delete(gameId, snapshot.slot);
    } catch (error) {
      console.error('Failed to delete the snapshot save:', error);
    }
  }
}

/** "now", "3 min ago", "yesterday"… for a snapshot list. */
export function snapshotAge(savedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - savedAt) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(savedAt).toLocaleDateString();
}

/** Where a snapshot stands: its paragraph, or its room outside a scene. */
export function snapshotPlace(snapshot: DevSnapshot): string {
  return snapshot.sceneId ?? snapshot.roomId ?? snapshot.dungeonId ?? '';
}
