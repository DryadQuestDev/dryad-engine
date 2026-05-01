import type { Block, Document } from './ast';

export type QuestKind = 'title' | 'main_stage' | 'goal' | 'goal_stage';

/**
 * Decide what role a `$template` block plays in a quest based purely on its id
 * shape. Returns null for templates whose id isn't a quest pattern (e.g.
 * `$dungeon_name`, `$variable_template`).
 *
 * Patterns:
 *   `quest_id.main`            → 'title'
 *   `quest_id.main.stage_id`   → 'main_stage'
 *   `quest_id.goal_id`         → 'goal'         (where goal_id !== 'main')
 *   `quest_id.goal_id.stage_id`→ 'goal_stage'   (where goal_id !== 'main')
 */
export function questKindOf(id: string | undefined): QuestKind | null {
  if (!id) return null;
  const parts = id.split('.');
  if (parts.length === 2 && parts[1] === 'main') return 'title';
  if (parts.length === 2 && parts[1] && parts[1] !== 'main') return 'goal';
  if (parts.length === 3 && parts[1] === 'main') return 'main_stage';
  if (parts.length === 3 && parts[1] && parts[1] !== 'main') return 'goal_stage';
  return null;
}

/** First dot-segment — the quest id. Returns empty string for templates that
 * aren't quest-shaped. */
export function questIdOf(id: string | undefined): string {
  if (!id) return '';
  if (questKindOf(id) === null) return '';
  return id.split('.')[0];
}

export type QuestGroup = {
  questId: string;
  startIndex: number;
  endIndex: number;       // exclusive — endIndex - startIndex === total member count
  titleBlockIdx: number | null;        // `$<questId>.main`
  mainStageIdxs: number[];             // `$<questId>.main.<stage>`, in doc order
  goals: Array<{
    blockIdx: number;                  // `$<questId>.<goalId>`
    goalId: string;
    stageIdxs: number[];               // `$<questId>.<goalId>.<stage>`, in doc order
  }>;
};

export type GroupedItem =
  | { kind: 'block'; idx: number }
  | { kind: 'quest'; group: QuestGroup };

/**
 * Walk `doc.blocks` once and group contiguous quest-shaped `$template` blocks
 * by their first dot-segment. Templates that aren't quest-shaped (or aren't
 * templates at all) close any open group and pass through as `{ kind: 'block' }`.
 *
 * Hand-authored gaps (e.g. a `^room` between two same-quest templates) split
 * the quest across multiple groups — non-fatal, each contiguous run renders
 * as its own QuestCard. The author can move them adjacent to merge.
 */
export function groupQuestBlocks(doc: Document): GroupedItem[] {
  const out: GroupedItem[] = [];
  let current: { questId: string; startIndex: number; idxs: number[] } | null = null;

  const flush = () => {
    if (!current) return;
    out.push({
      kind: 'quest',
      group: assembleGroup(current.questId, current.startIndex, current.idxs, doc.blocks),
    });
    current = null;
  };

  doc.blocks.forEach((b, i) => {
    if (!b) return;
    if (b.kind === 'template') {
      const kind = questKindOf((b as any).id);
      if (kind) {
        const qid = questIdOf((b as any).id);
        if (current && current.questId === qid) {
          current.idxs.push(i);
        } else {
          flush();
          current = { questId: qid, startIndex: i, idxs: [i] };
        }
        return;
      }
    }
    flush();
    out.push({ kind: 'block', idx: i });
  });
  flush();
  return out;
}

function assembleGroup(
  questId: string,
  startIndex: number,
  idxs: number[],
  blocks: Block[],
): QuestGroup {
  let titleBlockIdx: number | null = null;
  const mainStageIdxs: number[] = [];
  const goalsByName = new Map<string, { blockIdx: number; goalId: string; stageIdxs: number[] }>();
  const goalOrder: string[] = [];

  for (const i of idxs) {
    const b = blocks[i];
    if (!b || b.kind !== 'template') continue;
    const id = (b as any).id as string | undefined;
    const kind = questKindOf(id);
    if (kind === 'title') {
      titleBlockIdx = i;
    } else if (kind === 'main_stage') {
      mainStageIdxs.push(i);
    } else if (kind === 'goal') {
      const goalId = id!.split('.')[1];
      if (!goalsByName.has(goalId)) {
        goalsByName.set(goalId, { blockIdx: i, goalId, stageIdxs: [] });
        goalOrder.push(goalId);
      } else {
        // Duplicate goal id within the same quest group — keep the first as
        // the canonical block and treat the rest as orphan stages of nothing
        // (defensive; shouldn't happen in author-written content).
        goalsByName.get(goalId)!.blockIdx = i;
      }
    } else if (kind === 'goal_stage') {
      const goalId = id!.split('.')[1];
      let goal = goalsByName.get(goalId);
      if (!goal) {
        // Stage seen before its parent goal — synthesize a placeholder so we
        // don't drop the stage. Author can fix the order via add buttons.
        goal = { blockIdx: -1, goalId, stageIdxs: [] };
        goalsByName.set(goalId, goal);
        goalOrder.push(goalId);
      }
      goal.stageIdxs.push(i);
    }
  }

  return {
    questId,
    startIndex,
    endIndex: idxs[idxs.length - 1] + 1,
    titleBlockIdx,
    mainStageIdxs,
    goals: goalOrder.map((g) => goalsByName.get(g)!),
  };
}
