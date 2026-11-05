import { shallowRef } from 'vue';
import { Game } from '../game';

/**
 * Dev playtests only: what went wrong while playing, for the debug panel's Problems tab. One row
 * per kind, message and paragraph, newest first; a repeat raises its count instead of adding a row.
 * Held in memory, so a reload (Shift+R, PageUp) starts a fresh list.
 */

export type DevProblemKind = 'speaker' | 'asset' | 'action' | 'condition' | 'quest';

export type DevProblem = {
  kind: DevProblemKind;
  /** What is wrong, in the author's terms: "Unknown action 'flg'". */
  message: string;
  /** The paragraph that was playing ('#room.scene.row.col.para'), for Open in editor. */
  sceneId: string | null;
  dungeonId: string | null;
  count: number;
  lastAt: number;
};

const MAX_PROBLEMS = 200;

export const devProblems = shallowRef<DevProblem[]>([]);

export function reportDevProblem(kind: DevProblemKind, message: string, where?: { sceneId?: string | null; dungeonId?: string | null }): void {
  if (localStorage.getItem('devMode') !== 'true') return;
  let sceneId = where?.sceneId;
  let dungeonId = where?.dungeonId;
  if (sceneId === undefined || dungeonId === undefined) {
    const ds = Game.getInstance().dungeonSystem;
    if (sceneId === undefined) sceneId = ds.currentSceneId.value ?? null;
    if (dungeonId === undefined) dungeonId = ds.activeDungeonId.value ?? ds.currentDungeonId.value ?? null;
  }
  const list = devProblems.value;
  const i = list.findIndex(p => p.kind === kind && p.message === message && p.sceneId === sceneId);
  const row: DevProblem = i >= 0
    ? { ...list[i], count: list[i].count + 1, lastAt: Date.now() }
    : { kind, message, sceneId: sceneId ?? null, dungeonId: dungeonId ?? null, count: 1, lastAt: Date.now() };
  const rest = i >= 0 ? list.filter((_, j) => j !== i) : list;
  devProblems.value = [row, ...rest].slice(0, MAX_PROBLEMS);
}

export function clearDevProblems(): void {
  devProblems.value = [];
}
