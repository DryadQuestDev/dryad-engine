<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, provide } from 'vue';
import { useSortable } from '@vueuse/integrations/useSortable';
import { useStorage, watchDebounced } from '@vueuse/core';
import {
  dungeonSearchQuery as searchQuery,
  dungeonStructuredFilter,
} from './dungeonEditor/searchState';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import ToggleSwitch from 'primevue/toggleswitch';
import { Editor } from '../../editor';
import type { EditorCustomPopupProps } from '../../editor';
import { Global } from '../../../global/global';
import { parseToAst } from '../../../utility/dungeonEditor/parseToAst';
import { serializeAst } from '../../../utility/dungeonEditor/serializeAst';
import { exportDocumentAsHtml, exportDocumentAsText } from '../../../utility/dungeonEditor/exportHtml';
import { lintDungeonContent, type LintIssue } from '../../../utility/dungeonEditor/lint';
import { buildDocumentIndex, type IndexCategory } from '../../../utility/dungeonEditor/index';
import {
  newEncounter,
  newScene,
  newTemplate,
  newRoom,
} from '../../../utility/dungeonEditor/ast';
import type { Block, Document, SceneBlock } from '../../../utility/dungeonEditor/ast';
import BlockCard from './dungeonEditor/BlockCard.vue';
import IndexPopover from './dungeonEditor/IndexPopover.vue';
import QuestCard from './dungeonEditor/QuestCard.vue';
import DungeonSelect from '../shared/DungeonSelect.vue';
import { tagBlockDeep as tagBlock, tagBlocks } from './dungeonEditor/uid';
import { groupQuestBlocks, questIdOf, questKindOf as questKindOfUtil } from '../../../utility/dungeonEditor/quest';

const props = defineProps<EditorCustomPopupProps>();
const emit = defineEmits<{
  'update:item': [item: any];
}>();

const editorInstance = Editor.getInstance();
const global = Global.getInstance();
const localItem = ref<any>(props.item);

const doc = ref<Document>(parseToAst(localItem.value?.dungeon_content ?? ''));
tagBlocks(doc.value.blocks);
ensureRequiredBlocks();
const showRaw = ref(false);

function stripHtml(s: string): string {
  if (!s) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = s;
  return (tmp.textContent || '').replace(/\s+/g, ' ');
}

function blockMatches(block: Block, needle: string): boolean {
  const q = needle.toLowerCase();
  if (block.kind === 'raw') return stripHtml(block.text).toLowerCase().includes(q);
  if ((block as any).id && String((block as any).id).toLowerCase().includes(q)) return true;
  if ('paramsRaw' in block && block.paramsRaw && block.paramsRaw.toLowerCase().includes(q)) return true;
  if (block.kind === 'encounter' || block.kind === 'template') {
    for (const row of block.rows) {
      if (row.kind === 'text' && stripHtml(row.text).toLowerCase().includes(q)) return true;
      if (row.kind === 'choice') {
        if (row.name?.toLowerCase().includes(q)) return true;
        if (row.value?.toLowerCase().includes(q)) return true;
        if (row.paramsRaw?.toLowerCase().includes(q)) return true;
      }
      if (row.kind === 'code' && row.text.toLowerCase().includes(q)) return true;
    }
    return false;
  }
  if (block.kind === 'scene') {
    for (const row of block.rows) {
      for (const col of row.columns) {
        if (col.name?.toLowerCase().includes(q)) return true;
        if (col.paramsRaw?.toLowerCase().includes(q)) return true;
        if (col.content && stripHtml(col.content).toLowerCase().includes(q)) return true;
      }
    }
    return false;
  }
  return false;
}
type DungeonEditorSettings = {
  autoOpen: boolean;
  autosave: boolean;
  autoCurlyQuotes: boolean;
  selectedBlock: Record<string, { kind: string; id: string }>;
};
const settings = useStorage<DungeonEditorSettings>('dungeonEditor_settings', {
  autoOpen: false,
  autosave: false,
  autoCurlyQuotes: false,
  selectedBlock: {},
});
const autoOpen = computed({
  get: () => settings.value.autoOpen,
  set: (v) => { settings.value.autoOpen = v; },
});
const autosave = computed({
  get: () => settings.value.autosave ?? false,
  set: (v) => { settings.value.autosave = v; },
});
const autoCurlyQuotes = computed({
  get: () => settings.value.autoCurlyQuotes ?? false,
  set: (v) => { settings.value.autoCurlyQuotes = v; },
});

function getSelectionStorageKey(): string | null {
  const game = editorInstance.state.selectedGame;
  const mod = editorInstance.state.selectedMod;
  const dungeonId = localItem.value?.id;
  if (!game || !mod || !dungeonId) return null;
  return `${game}:${mod}:${dungeonId}`;
}
const blocksListRef = ref<HTMLElement | null>(null);
const tocListRef = ref<HTMLElement | null>(null);
const selectedIndex = ref<number | null>(null);

function ensureRequiredBlocks() {
  const blocks = doc.value.blocks;

  // Dedupe by predicate: keep first match, remove later duplicates.
  const dedupe = (pred: (b: Block) => boolean) => {
    let firstIdx = -1;
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i] && pred(blocks[i])) { firstIdx = i; break; }
    }
    if (firstIdx === -1) return -1;
    for (let i = blocks.length - 1; i > firstIdx; i--) {
      if (blocks[i] && pred(blocks[i])) blocks.splice(i, 1);
    }
    return firstIdx;
  };

  // $dungeon_name template — always present, deduped to one.
  const dungeonNameIdx = dedupe(
    (b) => b.kind === 'template' && (b as any).id === 'dungeon_name',
  );
  if (dungeonNameIdx === -1) blocks.unshift(tagBlock(newTemplate('dungeon_name')));

  // Screen-type dungeons — exactly one ^main room.
  if (localItem.value?.dungeon_type === 'screen') {
    const mainIdx = dedupe(
      (b) => b.kind === 'room' && (b as any).id === 'main',
    );
    if (mainIdx === -1) {
      const insertAt = blocks.findIndex(
        (b) => b.kind === 'template' && (b as any).id === 'dungeon_name',
      ) + 1;
      blocks.splice(insertAt, 0, tagBlock(newRoom('main')));
    }
  }
}

function isLockedBlock(block: Block): boolean {
  if (block.kind === 'template' && (block as any).id === 'dungeon_name') return true;
  if (localItem.value?.dungeon_type === 'screen' && block.kind === 'room' && (block as any).id === 'main') return true;
  return false;
}

const isScreenDungeon = computed(() => localItem.value?.dungeon_type === 'screen');

function replaceDocBlocks(source: string) {
  const next = parseToAst(source);
  tagBlocks(next.blocks);
  // Mutate in place so useSortable stays bound to the same array reference.
  doc.value.blocks.splice(0, doc.value.blocks.length, ...next.blocks);
  ensureRequiredBlocks();
}

watch(() => props.item, (v) => {
  localItem.value = v;
  replaceDocBlocks(v?.dungeon_content ?? '');
  restoreSelection();
}, { deep: false });

// In-popup dungeon switch: DungeonSelect already awaited `editor.setDungeon`
// (which loaded the new active object including its external `dungeon_content`
// from `content_raw.txt`). The popup's `props.item` is a deep-copy snapshot
// taken at openPopup time and won't update — so we re-bind localItem to the
// fresh active object here, then re-parse and restore selection.
function onDungeonChange() {
  const newItem = editorInstance.activeObject.value;
  if (!newItem || Array.isArray(newItem)) return;
  localItem.value = newItem;
  replaceDocBlocks(newItem.dungeon_content ?? '');
  restoreSelection();
}

let suppressSelectionPersist = false;

function restoreSelection() {
  const key = getSelectionStorageKey();
  suppressSelectionPersist = true;
  if (!key) {
    selectedIndex.value = null;
    nextTick(() => { suppressSelectionPersist = false; });
    return;
  }
  const saved = settings.value.selectedBlock[key];
  const idx = saved
    ? doc.value.blocks.findIndex(
      (b) => b.kind === saved.kind && (b as any).id === saved.id,
    )
    : -1;
  selectedIndex.value = idx >= 0 ? idx : null;
  nextTick(() => {
    suppressSelectionPersist = false;
    if (selectedIndex.value !== null) scrollToBlock(selectedIndex.value);
  });
}

onMounted(() => {
  restoreSelection();
});

const serialized = computed(() => serializeAst(doc.value));

function commit() {
  if (!localItem.value) return;
  localItem.value.dungeon_content = serialized.value;
  emit('update:item', localItem.value);
}

// Insert-after-quest helper: if `idx` is inside a quest group, return the
// group's `endIndex` (one past its last member) so callers splice the new
// block AFTER the whole quest. Otherwise return `idx + 1`.
function insertAfterQuestEnd(idx: number): number {
  for (const item of groupedItems.value) {
    if (item.kind === 'quest' && idx >= item.group.startIndex && idx < item.group.endIndex) {
      return item.group.endIndex;
    }
  }
  return idx + 1;
}

// After any structural mutation that might split a quest run (TOC drag,
// up/down arrows on adjacent non-quest blocks), pull each quest's members
// back into a contiguous block at the position of the FIRST member found.
// Title (`<id>.main`) is hoisted to the front of its run when present so the
// quest still leads with its title after the user dragged a stage.
//
// Selection is preserved by uid: capture the selected block's __uid before
// rewriting, then look it up in the new array.
function compactQuestGroups() {
  const blocks = doc.value.blocks;
  const selectedUid = selectedIndex.value !== null
    ? (blocks[selectedIndex.value] as any)?.__uid
    : null;

  const questIdToBlocks = new Map<string, Block[]>();
  blocks.forEach((b) => {
    if (!b || b.kind !== 'template') return;
    const qid = questIdOf((b as any).id);
    if (!qid) return;
    if (!questIdToBlocks.has(qid)) questIdToBlocks.set(qid, []);
    questIdToBlocks.get(qid)!.push(b);
  });

  // For each quest, hoist the title to the front (if present) and keep the
  // rest in their original relative order.
  for (const [qid, members] of questIdToBlocks) {
    const titleIdx = members.findIndex((b) => questKindOfUtil((b as any).id) === 'title');
    if (titleIdx > 0) {
      const [title] = members.splice(titleIdx, 1);
      members.unshift(title);
    }
    questIdToBlocks.set(qid, members);
  }

  const next: Block[] = [];
  const emitted = new Set<string>();
  for (const b of blocks) {
    if (!b) continue;
    if (b.kind === 'template') {
      const qid = questIdOf((b as any).id);
      if (qid) {
        if (emitted.has(qid)) continue;
        emitted.add(qid);
        for (const m of questIdToBlocks.get(qid)!) next.push(m);
        continue;
      }
    }
    next.push(b);
  }

  // No-op if order didn't change.
  let changed = next.length !== blocks.length;
  if (!changed) {
    for (let i = 0; i < next.length; i++) {
      if (next[i] !== blocks[i]) { changed = true; break; }
    }
  }
  if (!changed) return;

  // Mutate in place so useSortable's array reference stays bound.
  blocks.splice(0, blocks.length, ...next);

  // Restore selection by uid (the index moved).
  if (selectedUid !== undefined && selectedUid !== null) {
    const newIdx = blocks.findIndex((b) => (b as any)?.__uid === selectedUid);
    selectedIndex.value = newIdx >= 0 ? newIdx : null;
  }
}

function updateBlock(index: number, block: Block) {
  doc.value.blocks[index] = block;
  commit();
}

function removeBlock(index: number) {
  doc.value.blocks.splice(index, 1);
  if (selectedIndex.value === index) selectedIndex.value = null;
  else if (selectedIndex.value !== null && selectedIndex.value > index) selectedIndex.value--;
  commit();
}

function moveBlock(index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= doc.value.blocks.length) return;
  const blocks = doc.value.blocks;
  const moved = blocks.splice(index, 1)[0];
  if (!moved) return;
  blocks.splice(target, 0, moved);
  if (selectedIndex.value === index) selectedIndex.value = target;
  else if (selectedIndex.value === target) selectedIndex.value = index;
  compactQuestGroups();
  commit();
}

function addBlock(kind: 'room' | 'encounter' | 'scene' | 'template') {
  const insertAt = selectedIndex.value !== null
    ? insertAfterQuestEnd(selectedIndex.value)
    : doc.value.blocks.length;

  const toInsert: Block[] = [];
  switch (kind) {
    case 'room':
      toInsert.push(newRoom(), newEncounter('description'));
      break;
    case 'encounter': toInsert.push(newEncounter()); break;
    case 'scene': toInsert.push({ ...newScene(), paramsRaw: '{if: true}' }); break;
    case 'template': toInsert.push(newTemplate()); break;
  }
  tagBlocks(toInsert);

  doc.value.blocks.splice(insertAt, 0, ...toInsert);
  selectedIndex.value = insertAt + toInsert.length - 1;
  commit();
  nextTick(() => scrollToBlock(insertAt));
}

function addQuest() {
  // Generate a fresh quest id that doesn't collide with existing ones.
  const usedIds = new Set<string>();
  for (const b of doc.value.blocks) {
    if (b && b.kind === 'template') {
      const first = (b as any).id?.split('.')[0];
      if (first) usedIds.add(first);
    }
  }
  let n = 1;
  let questId = `quest_${n}`;
  while (usedIds.has(questId)) {
    n++;
    questId = `quest_${n}`;
  }
  const insertAt = selectedIndex.value !== null
    ? insertAfterQuestEnd(selectedIndex.value)
    : doc.value.blocks.length;
  const title = tagBlock(newTemplate(`${questId}.main`));
  const stage = tagBlock(newTemplate(`${questId}.main.stage_1`));
  doc.value.blocks.splice(insertAt, 0, title, stage);
  selectedIndex.value = insertAt;
  commit();
  nextTick(() => scrollToBlock(insertAt));
}

// QuestCard plumbing: insert a fully-tagged template block right after `afterIdx`.
function insertBlockAfter(afterIdx: number, block: Block) {
  doc.value.blocks.splice(afterIdx + 1, 0, block);
  commit();
}

// Move a quest's custom goal up or down past its adjacent goal (range swap).
// A goal's range is `[goal.blockIdx ... lastStageIdx]`. Main can't move and
// can't be the swap target. Both ranges are contiguous in `doc.blocks` (the
// quest is contiguous), so the swap is: remove one range, reinsert at the
// other range's start position.
function moveQuestGoal(questId: string, goalId: string, direction: -1 | 1) {
  const item = groupedItems.value.find(
    (it): it is { kind: 'quest'; group: import('../../../utility/dungeonEditor/quest').QuestGroup } =>
      it.kind === 'quest' && it.group.questId === questId,
  );
  if (!item) return;
  const goals = item.group.goals;
  const fromIdx = goals.findIndex((g) => g.goalId === goalId);
  if (fromIdx < 0) return;
  const toIdx = fromIdx + direction;
  if (toIdx < 0 || toIdx >= goals.length) return;

  const goalA = goals[fromIdx];
  const goalB = goals[toIdx];
  const rangeOf = (g: typeof goalA): [number, number] => {
    const last = g.stageIdxs.length > 0 ? g.stageIdxs[g.stageIdxs.length - 1] : g.blockIdx;
    return [g.blockIdx, last + 1]; // [start, endExclusive)
  };
  const [aStart, aEnd] = rangeOf(goalA);
  const [bStart, bEnd] = rangeOf(goalB);

  const blocks = doc.value.blocks;
  if (direction === -1) {
    // A is after B. Remove A, reinsert at bStart.
    if (aStart <= bStart) return; // sanity — A should be after B
    const aBlocks = blocks.splice(aStart, aEnd - aStart);
    blocks.splice(bStart, 0, ...aBlocks);
  } else {
    // A is before B. Remove A, reinsert at aStart + (bEnd - bStart).
    if (aStart >= bStart) return;
    const aBlocks = blocks.splice(aStart, aEnd - aStart);
    const insertAt = aStart + (bEnd - bStart);
    blocks.splice(insertAt, 0, ...aBlocks);
  }
  commit();
}

// Move an entire quest range up or down past its adjacent groupedItem
// (another quest or a single non-quest block). Both ranges are contiguous.
function moveQuest(questId: string, direction: -1 | 1) {
  const items = groupedItems.value;
  const fromPos = items.findIndex((it) => it.kind === 'quest' && it.group.questId === questId);
  if (fromPos < 0) return;
  const toPos = fromPos + direction;
  if (toPos < 0 || toPos >= items.length) return;

  const me = items[fromPos];
  if (me.kind !== 'quest') return;
  const other = items[toPos];

  const myStart = me.group.startIndex;
  const myEnd = me.group.endIndex; // exclusive
  const otherStart = other.kind === 'quest' ? other.group.startIndex : other.idx;
  const otherEnd = other.kind === 'quest' ? other.group.endIndex : other.idx + 1;

  const blocks = doc.value.blocks;
  if (direction === -1) {
    if (myStart <= otherStart) return;
    const myBlocks = blocks.splice(myStart, myEnd - myStart);
    blocks.splice(otherStart, 0, ...myBlocks);
  } else {
    if (myStart >= otherStart) return;
    const myBlocks = blocks.splice(myStart, myEnd - myStart);
    const insertAt = myStart + (otherEnd - otherStart);
    blocks.splice(insertAt, 0, ...myBlocks);
  }
  commit();
}

// Remove every block in a quest's range.
function removeQuest(questId: string) {
  const item = groupedItems.value.find(
    (it): it is { kind: 'quest'; group: import('../../../utility/dungeonEditor/quest').QuestGroup } =>
      it.kind === 'quest' && it.group.questId === questId,
  );
  if (!item) return;
  doc.value.blocks.splice(item.group.startIndex, item.group.endIndex - item.group.startIndex);
  commit();
}

// Rewrite every block whose id starts with `oldPrefix` so it now starts with
// `newPrefix`. Used by QuestCard to atomically rename a quest (or one of its
// goals — same operation).
function renameQuestPrefix(oldPrefix: string, newPrefix: string) {
  if (!oldPrefix || oldPrefix === newPrefix) return;
  for (let i = 0; i < doc.value.blocks.length; i++) {
    const b = doc.value.blocks[i];
    if (!b || b.kind !== 'template') continue;
    const id = (b as any).id as string | undefined;
    if (!id) continue;
    if (id === oldPrefix.slice(0, -1) /* exact match without trailing dot */) {
      // e.g. oldPrefix="rescue." matches a bare "rescue" only if user renamed
      // a goal whose id is exactly the prefix. Skip — not our case here.
      continue;
    }
    if (id.startsWith(oldPrefix)) {
      doc.value.blocks[i] = { ...b, id: newPrefix + id.slice(oldPrefix.length) };
    }
  }
  commit();
}

function onBlockClick(index: number, event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  if (target && target.closest('input, textarea, button, [contenteditable="true"]')) return;
  selectedIndex.value = selectedIndex.value === index ? null : index;
}

watch(selectedIndex, (idx) => {
  if (suppressSelectionPersist) return;
  const key = getSelectionStorageKey();
  if (!key) return;
  if (idx === null) {
    delete settings.value.selectedBlock[key];
    return;
  }
  const block = doc.value.blocks[idx];
  if (!block || block.kind === 'raw') return;
  settings.value.selectedBlock[key] = { kind: block.kind, id: (block as any).id };
});

function insertSceneAfter(blockIndex: number, sceneId: string) {
  const insertAt = blockIndex + 1;
  doc.value.blocks.splice(insertAt, 0, tagBlock(newScene(sceneId)));
  selectedIndex.value = insertAt;
  commit();
  nextTick(() => scrollToBlock(insertAt));
}

function onRawEdit(v: string) {
  replaceDocBlocks(v);
  if (localItem.value) {
    localItem.value.dungeon_content = v;
    emit('update:item', localItem.value);
  }
}

const copyFeedback = ref<'text' | 'html' | null>(null);
let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

function flashCopyFeedback(which: 'text' | 'html') {
  copyFeedback.value = which;
  if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
  copyFeedbackTimer = setTimeout(() => { copyFeedback.value = null; }, 1500);
}

async function copyAsText() {
  const text = exportDocumentAsText(serialized.value);
  try {
    await navigator.clipboard.writeText(text);
    flashCopyFeedback('text');
  } catch (err) {
    console.warn('[DungeonContentEditor] Copy-as-text failed:', err);
  }
}

async function copyAsHtml() {
  const html = exportDocumentAsHtml(doc.value);
  const textFallback = exportDocumentAsText(serialized.value);
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([textFallback], { type: 'text/plain' }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(html);
    }
    flashCopyFeedback('html');
  } catch (err) {
    console.warn('[DungeonContentEditor] Copy-as-html failed:', err);
  }
}

const stats = computed(() => {
  const counts: Record<string, number> = { room: 0, encounter: 0, scene: 0, template: 0, raw: 0 };
  for (const b of doc.value.blocks) counts[b.kind] = (counts[b.kind] ?? 0) + 1;
  return counts;
});

// Map each block index → its containing room id (most recent ^block above; '' before any room).
const roomByBlockIndex = computed<string[]>(() => {
  const out: string[] = [];
  let currentRoom = '';
  for (const b of doc.value.blocks) {
    if (b?.kind === 'room') currentRoom = (b as any).id || '';
    out.push(currentRoom);
  }
  return out;
});

// Scenes grouped by their containing room. Two scenes with the same id in
// different rooms are distinct (DryadScript scopes ids per room).
const scenesByRoom = computed<Map<string, Set<string>>>(() => {
  const map = new Map<string, Set<string>>();
  let currentRoom = '';
  for (const b of doc.value.blocks) {
    if (!b) continue;
    if (b.kind === 'room') { currentRoom = (b as any).id || ''; continue; }
    if (b.kind === 'scene' && (b as any).id) {
      let set = map.get(currentRoom);
      if (!set) { set = new Set(); map.set(currentRoom, set); }
      set.add((b as any).id);
    }
  }
  return map;
});

function sceneExistsForBlock(blockIndex: number, sceneId: string): boolean {
  const room = roomByBlockIndex.value[blockIndex] ?? '';
  return scenesByRoom.value.get(room)?.has(sceneId) ?? false;
}
provide('sceneExistsForBlock', sceneExistsForBlock);

const docIndex = computed(() => buildDocumentIndex(doc.value));

// Walk doc.blocks and group contiguous quest-shaped `$template` runs into
// QuestGroup entries; non-quest blocks pass through. Underlying AST
// unchanged — this is purely a render-time grouping.
const groupedItems = computed(() => groupQuestBlocks(doc.value));

// A grouped item is "visible" when any of its members would be visible by
// search/filter. Quest groups stay if any member matches; single blocks use
// the existing per-block visibility.
function isItemVisible(item: { kind: 'block'; idx: number } | { kind: 'quest'; group: { startIndex: number; endIndex: number } }): boolean {
  if (item.kind === 'block') return isBlockVisible(item.idx);
  const set = matchingBlockIndices.value;
  if (!set) return true;
  for (let i = item.group.startIndex; i < item.group.endIndex; i++) {
    if (set.has(i)) return true;
  }
  return false;
}

// Per-block-idx role for the TOC. The TOC's SortableJS bindings need the DOM
// to mirror `doc.blocks` 1:1, so we keep one toc-entry per block but mark
// non-canonical quest members as hidden via v-show. Only one entry per quest
// is `visible` — the first member found (typically the title) — and renders
// as "Quest: <id>" with stage / goal sub-entries.
type TocRole = { hidden: boolean; questGroup: import('../../../utility/dungeonEditor/quest').QuestGroup | null };

const tocRoles = computed<TocRole[]>(() => {
  const blocks = doc.value.blocks;
  const roles: TocRole[] = blocks.map(() => ({ hidden: false, questGroup: null }));
  for (const item of groupedItems.value) {
    if (item.kind !== 'quest') continue;
    const head = item.group.startIndex;
    roles[head] = { hidden: false, questGroup: item.group };
    for (let i = item.group.startIndex + 1; i < item.group.endIndex; i++) {
      roles[i] = { hidden: true, questGroup: null };
    }
  }
  return roles;
});

const filterBlockIndices = computed<Set<number> | null>(() => {
  const f = dungeonStructuredFilter.value;
  if (!f) return null;
  const entry = docIndex.value[f.kind].find((e) => e.name === f.name);
  return entry?.blockIndices ?? new Set<number>();
});

const matchingBlockIndices = computed<Set<number> | null>(() => {
  const q = searchQuery.value.trim();
  const filterSet = filterBlockIndices.value;
  if (!q && !filterSet) return null;
  const searchSet = q
    ? (() => {
      const out = new Set<number>();
      doc.value.blocks.forEach((b, i) => { if (blockMatches(b, q)) out.add(i); });
      return out;
    })()
    : null;
  if (searchSet && filterSet) {
    const intersected = new Set<number>();
    for (const i of searchSet) if (filterSet.has(i)) intersected.add(i);
    return intersected;
  }
  return searchSet ?? filterSet;
});

function clearStructuredFilter() {
  dungeonStructuredFilter.value = null;
}

function setStructuredFilter(kind: IndexCategory, name: string) {
  dungeonStructuredFilter.value = { kind, name };
}

const filterChipLabel = computed(() => {
  const f = dungeonStructuredFilter.value;
  if (!f) return '';
  return `${global.getString(`dungeon_editor.index.chip.${f.kind}`)}: ${f.name}`;
});

const indexActionsRef = ref<InstanceType<typeof IndexPopover> | null>(null);
const indexFlagsRef = ref<InstanceType<typeof IndexPopover> | null>(null);
const indexAnchorsRef = ref<InstanceType<typeof IndexPopover> | null>(null);

// Visibility set: search/filter matches plus the parent `^room` of any match,
// so authors see which room a hit belongs to (in both TOC and blocks list).
const visibleBlockSet = computed<Set<number> | null>(() => {
  const matching = matchingBlockIndices.value;
  if (!matching) return null;
  const out = new Set<number>(matching);
  const blocks = doc.value.blocks;
  let lastRoomIdx = -1;
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i]?.kind === 'room') {
      lastRoomIdx = i;
    } else if (matching.has(i) && lastRoomIdx >= 0) {
      out.add(lastRoomIdx);
    }
  }
  return out;
});

function isBlockVisible(idx: number): boolean {
  const set = visibleBlockSet.value;
  return !set || set.has(idx);
}

const indented = computed<boolean[]>(() => {
  const out: boolean[] = [];
  let insideRoom = false;
  for (const b of doc.value.blocks) {
    if (b.kind === 'room') {
      insideRoom = true;
      out.push(false);
    } else {
      out.push(insideRoom);
    }
  }
  return out;
});

function labelFor(block: Block): string {
  if (block.kind === 'raw') return block.text.split('\n')[0].slice(0, 40) || '(empty raw)';
  return block.id || `(unnamed ${block.kind})`;
}

type SceneSubEntry =
  | { kind: 'row'; rowIdx: number; label: string }
  | { kind: 'col'; rowIdx: number; colIdx: number; label: string };

// Build TOC sub-entries for a scene block.
// Rules: a 1×1 scene contributes nothing (most scenes are just a single `%`
// prose block). Otherwise emit one entry per row, plus one entry per column
// inside any row with 2+ columns. Rows with a single column get their row
// label only — the row entry IS the navigation target for that single column.
function sceneSubEntries(block: SceneBlock): SceneSubEntry[] {
  if (block.rows.length === 1 && block.rows[0].columns.length === 1) return [];
  const out: SceneSubEntry[] = [];
  block.rows.forEach((row, rowIdx) => {
    out.push({ kind: 'row', rowIdx, label: `Row ${rowIdx + 1}` });
    if (row.columns.length < 2) return;
    row.columns.forEach((col, colIdx) => {
      const label = col.kind === '%' ? '%' : '~' + (col.name || 'choice');
      out.push({ kind: 'col', rowIdx, colIdx, label });
    });
  });
  return out;
}

type QuestSubEntry =
  | { kind: 'goal'; blockIdx: number; label: string; isMain: boolean; goalKey: string; hasStages: boolean }
  | { kind: 'stage'; blockIdx: number; label: string; parentKey: string };

// Build TOC sub-entries for a quest group. Skip when the quest has only a
// title with no stages and no goals (rule mirrors `sceneSubEntries`).
// Goals are always emitted; stages are emitted with a `parentKey` so the
// template can show/hide them based on which goals the user expanded.
//
// `goalKey` is uid-stable (so renames don't reset the expanded set).
function goalKeyFor(blockIdx: number, fallback: string): string {
  const u = (doc.value.blocks[blockIdx] as any)?.__uid;
  return typeof u === 'number' ? `uid:${u}` : `fb:${fallback}`;
}

function questSubEntries(group: import('../../../utility/dungeonEditor/quest').QuestGroup): QuestSubEntry[] {
  const hasMainStages = group.mainStageIdxs.length > 0;
  const hasGoals = group.goals.length > 0;
  if (!hasMainStages && !hasGoals) return [];

  const out: QuestSubEntry[] = [];

  const mainBlockIdx = group.titleBlockIdx ?? group.startIndex;
  const mainKey = goalKeyFor(mainBlockIdx, 'main');
  out.push({
    kind: 'goal',
    blockIdx: mainBlockIdx,
    label: 'main',
    isMain: true,
    goalKey: mainKey,
    hasStages: hasMainStages,
  });
  for (const stageIdx of group.mainStageIdxs) {
    const stageId = ((doc.value.blocks[stageIdx] as any)?.id ?? '').split('.').pop() ?? '';
    out.push({ kind: 'stage', blockIdx: stageIdx, label: stageId, parentKey: mainKey });
  }

  for (const goal of group.goals) {
    const goalKey = goalKeyFor(goal.blockIdx, goal.goalId);
    out.push({
      kind: 'goal',
      blockIdx: goal.blockIdx,
      label: goal.goalId,
      isMain: false,
      goalKey,
      hasStages: goal.stageIdxs.length > 0,
    });
    for (const stageIdx of goal.stageIdxs) {
      const stageId = ((doc.value.blocks[stageIdx] as any)?.id ?? '').split('.').pop() ?? '';
      out.push({ kind: 'stage', blockIdx: stageIdx, label: stageId, parentKey: goalKey });
    }
  }
  return out;
}

// Goals collapsed by default. Tracks `goalKey`s that the user has expanded.
const expandedGoalKeys = ref(new Set<string>());

function isGoalExpanded(goalKey: string): boolean {
  return expandedGoalKeys.value.has(goalKey);
}

function toggleGoalExpanded(goalKey: string) {
  const next = new Set(expandedGoalKeys.value);
  if (next.has(goalKey)) next.delete(goalKey);
  else next.add(goalKey);
  expandedGoalKeys.value = next;
}

const lintIssues = ref<LintIssue[]>([]);
const lintBannerExpanded = ref(false);
const lintErrorMode = ref(false);

// While in error mode (activated by a failed save), re-lint on edits so the
// banner updates as the author fixes things. Once clean, exit error mode and
// stop watching so typing stays flash-free until the next save.
watchDebounced(
  serialized,
  () => {
    if (!lintErrorMode.value) return;
    lintIssues.value = lintDungeonContent(serialized.value, doc.value);
    if (lintIssues.value.length === 0) {
      lintErrorMode.value = false;
      lintBannerExpanded.value = false;
    }
  },
  { debounce: 300 },
);

watchDebounced(
  serialized,
  async () => {
    if (!autosave.value) return;
    if (!localItem.value) return;
    const ao = editorInstance.activeObject.value;
    if (!ao || Array.isArray(ao)) return;
    Object.assign(ao, localItem.value);
    editorInstance.hasUnsavedChanges.value = true;
    try {
      await editorInstance.saveActiveObject();
    } catch (err) {
      console.warn('[DungeonContentEditor] Autosave failed:', err);
    }
  },
  { debounce: 2000, maxWait: 10000 },
);

// Scroll to the first search match after Quill editors have applied the
// `.at-search` highlight spans. Debounced slightly longer than the
// RichContentEditor's highlight re-apply (200ms) so the DOM is settled.
watchDebounced(
  searchQuery,
  (q) => {
    if (!q || !q.trim()) return;
    nextTick(() => {
      const root = blocksListRef.value;
      if (!root) return;
      const first = root.querySelector('.at-search') as HTMLElement | null;
      if (first) first.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
  },
  { debounce: 260 },
);

function hasLintIssues(): boolean {
  lintIssues.value = lintDungeonContent(serialized.value, doc.value);
  if (lintIssues.value.length) {
    lintErrorMode.value = true;
    lintBannerExpanded.value = true;
  } else {
    lintErrorMode.value = false;
  }
  return lintIssues.value.length > 0;
}
defineExpose({ hasLintIssues });

function issuesForBlock(blockIndex: number): LintIssue[] {
  return lintIssues.value.filter((i) => i.blockIndex === blockIndex);
}

useSortable(tocListRef, doc.value.blocks, {
  animation: 150,
  handle: '.toc-handle',
  ghostClass: 'toc-ghost',
  filter: '.toc-locked',
  // Prevent dropping next to a locked entry (which would displace it).
  onMove: (evt: any) => {
    if (evt.related?.classList?.contains('toc-locked')) return false;
    return true;
  },
  onEnd: async (evt: any) => {
    const oldIdx = evt.oldIndex;
    const newIdx = evt.newIndex;
    if (typeof oldIdx === 'number' && typeof newIdx === 'number' && selectedIndex.value !== null) {
      if (oldIdx === selectedIndex.value) {
        selectedIndex.value = newIdx;
      } else if (oldIdx < selectedIndex.value && newIdx >= selectedIndex.value) {
        selectedIndex.value--;
      } else if (oldIdx > selectedIndex.value && newIdx <= selectedIndex.value) {
        selectedIndex.value++;
      }
    }
    // vueuse's moveArrayElement removes synchronously and re-inserts in a
    // nextTick microtask. Wait for that to land before serializing.
    await nextTick();
    // Re-merge any quest run that was split by the drag (only the visible
    // head moved; its hidden stages/goals stayed put). compactQuestGroups
    // pulls them back to be contiguous behind the head.
    compactQuestGroups();
    commit();
  },
});

function scrollToBlock(index: number) {
  const root = blocksListRef.value;
  if (!root) return;
  const el = root.querySelector(`[data-block-index="${index}"]`) as HTMLElement | null;
  if (!el) return;
  el.scrollIntoView({ behavior: 'instant', block: 'start' });
  el.classList.add('flash');
  window.setTimeout(() => el.classList.remove('flash'), 1200);
}

function jumpToBlock(index: number) {
  selectedIndex.value = index;
  scrollToBlock(index);
}

// Scroll to a specific scene row (and optionally column) inside the
// already-selected scene block. Selects the parent scene first (so its block
// card is in view + lazy-mounted), then on next tick targets the inner
// `[data-scene-row]` / `[data-scene-col]` element rendered by SceneEditor.
function jumpToSceneSub(blockIndex: number, rowIdx: number, colIdx?: number) {
  selectedIndex.value = blockIndex;
  scrollToBlock(blockIndex);
  nextTick(() => {
    const root = blocksListRef.value;
    if (!root) return;
    const blockEl = root.querySelector(`[data-block-index="${blockIndex}"]`);
    if (!blockEl) return;
    const rowEl = blockEl.querySelector(`[data-scene-row="${rowIdx}"]`) as HTMLElement | null;
    if (!rowEl) return;
    let target: HTMLElement = rowEl;
    if (colIdx !== undefined) {
      const colEl = rowEl.querySelector(`[data-scene-col="${colIdx}"]`) as HTMLElement | null;
      if (colEl) target = colEl;
    }
    target.scrollIntoView({ behavior: 'instant', block: 'start' });
    target.classList.add('flash');
    window.setTimeout(() => target.classList.remove('flash'), 1200);
  });
}

const kindSigil: Record<Block['kind'], string> = {
  room: '^',
  encounter: '@',
  scene: '#',
  template: '$',
  raw: '—',
};

type QuestKind = 'title' | 'main_stage' | 'goal' | 'goal_stage';

function questKindOf(id: string | undefined): QuestKind | null {
  if (!id) return null;
  const parts = id.split('.');
  if (parts.length === 2 && parts[1] === 'main') return 'title';
  if (parts.length === 2 && parts[1] && parts[1] !== 'main') return 'goal';
  if (parts.length === 3 && parts[1] === 'main') return 'main_stage';
  if (parts.length === 3 && parts[1] && parts[1] !== 'main') return 'goal_stage';
  return null;
}
</script>

<template>
  <div class="dungeon-content-editor">
    <div class="editor-toolbar">
      <div class="toolbar-left">
        <DungeonSelect class="popup-dungeon-select" @change="onDungeonChange" />
        <label class="auto-open-toggle" title="Open this popup automatically on Dungeon → Config">
          <ToggleSwitch v-model="autoOpen" />
          <span class="auto-open-label">Auto-open</span>
        </label>
        <label class="auto-open-toggle" title="Save to disk automatically on edit (skips error checking)">
          <ToggleSwitch v-model="autosave" />
          <span class="auto-open-label">Autosave</span>
        </label>
        <label class="auto-open-toggle" title="Convert straight quotes to curly quotes as you type (like Google Docs)">
          <ToggleSwitch v-model="autoCurlyQuotes" />
          <span class="auto-open-label">Curly quotes</span>
        </label>
        <!--
        <span class="counts">
          <span>^ {{ stats.room }}</span>
          <span>@ {{ stats.encounter }}</span>
          <span># {{ stats.scene }}</span>
          <span>$ {{ stats.template }}</span>
          <span v-if="stats.raw">raw {{ stats.raw }}</span>
        </span>
        -->
      </div>
      <div class="toolbar-right">
        <Button v-if="!isScreenDungeon" label="Room" icon="pi pi-plus" size="small" text class="room-btn"
          @click="addBlock('room')" />
        <Button label="Encounter" icon="pi pi-plus" size="small" text class="encounter-btn"
          @click="addBlock('encounter')" />
        <Button label="Scene" icon="pi pi-plus" size="small" text class="scene-btn" @click="addBlock('scene')" />
        <Button label="Template" icon="pi pi-plus" size="small" severity="secondary" text
          @click="addBlock('template')" />
        <span class="toolbar-divider" aria-hidden="true"></span>
        <Button label="Quest" icon="pi pi-plus" size="small" text class="quest-btn quest-btn--title"
          @click="addQuest" />
        <span class="toolbar-divider" aria-hidden="true"></span>
        <Button :label="copyFeedback === 'text' ? 'Copied!' : 'Copy text'"
          :icon="copyFeedback === 'text' ? 'pi pi-check' : 'pi pi-copy'" size="small" severity="secondary"
          v-tooltip.bottom="'Copy as plain DryadScript source. Paste anywhere (editors, chat, email) to share the raw dungeon text.'"
          @click="copyAsText" />
        <Button :label="copyFeedback === 'html' ? 'Copied!' : 'Copy tables'"
          :icon="copyFeedback === 'html' ? 'pi pi-check' : 'pi pi-table'" size="small" severity="secondary"
          v-tooltip.bottom="'Copy as Google Docs–ready tables. Paste into a Google Doc, share for collaboration, and import back via gdoc_id later.'"
          @click="copyAsHtml" />
        <span class="toolbar-divider" aria-hidden="true"></span>
        <Button :label="showRaw ? 'Visual' : 'Raw'" :icon="showRaw ? 'pi pi-th-large' : 'pi pi-code'" size="small"
          severity="secondary" @click="showRaw = !showRaw" />
      </div>
    </div>

    <div v-if="lintIssues.length" class="lint-banner" :class="{ 'lint-banner--expanded': lintBannerExpanded }"
      @click="lintBannerExpanded = !lintBannerExpanded">
      <div class="lint-banner-summary">
        <span class="lint-icon">⚠</span>
        <span>{{ lintIssues.length }} {{ lintIssues.length === 1 ? 'issue' : 'issues' }} — click to {{
          lintBannerExpanded ? 'hide' : 'review' }}</span>
      </div>
      <ul v-if="lintBannerExpanded" class="lint-list" @click.stop>
        <li v-for="(issue, i) in lintIssues" :key="i" class="lint-item" @click="jumpToBlock(issue.blockIndex)">
          <span class="lint-block-ref">
            {{ kindSigil[doc.blocks[issue.blockIndex]?.kind] }}{{ labelFor(doc.blocks[issue.blockIndex]) }}
          </span>
          <span class="lint-message">{{ issue.message }}</span>
        </li>
      </ul>
    </div>

    <div v-if="!showRaw" class="search-row">
      <i class="pi pi-search search-icon" />
      <input v-model="searchQuery" class="search-input" type="text" placeholder="Search…" />
      <button v-show="searchQuery" type="button" class="search-clear" @click="searchQuery = ''" title="Clear">
        <i class="pi pi-times" />
      </button>
      <span v-if="dungeonStructuredFilter" class="filter-chip" :title="filterChipLabel">
        <span class="filter-chip-label">{{ filterChipLabel }}</span>
        <button type="button" class="filter-chip-clear" @click="clearStructuredFilter"
          :title="global.getString('dungeon_editor.index.clear_filter')">
          <i class="pi pi-times" />
        </button>
      </span>
      <span class="search-divider" aria-hidden="true"></span>
      <Button :label="global.getString('dungeon_editor.index.actions')" icon="pi pi-bolt" size="small" text
        class="index-btn" @click="indexActionsRef?.toggle($event)" />
      <Button :label="global.getString('dungeon_editor.index.flags')" icon="pi pi-flag" size="small" text
        class="index-btn" @click="indexFlagsRef?.toggle($event)" />
      <Button :label="global.getString('dungeon_editor.index.anchors')" icon="pi pi-link" size="small" text
        class="index-btn" @click="indexAnchorsRef?.toggle($event)" />
      <IndexPopover ref="indexActionsRef" :entries="docIndex.action"
        :label="global.getString('dungeon_editor.index.actions')"
        :selected-name="dungeonStructuredFilter?.kind === 'action' ? dungeonStructuredFilter.name : null"
        @select="(name: string) => setStructuredFilter('action', name)" />
      <IndexPopover ref="indexFlagsRef" :entries="docIndex.flag" :label="global.getString('dungeon_editor.index.flags')"
        :selected-name="dungeonStructuredFilter?.kind === 'flag' ? dungeonStructuredFilter.name : null"
        @select="(name: string) => setStructuredFilter('flag', name)" />
      <IndexPopover ref="indexAnchorsRef" :entries="docIndex.anchor"
        :label="global.getString('dungeon_editor.index.anchors')"
        :selected-name="dungeonStructuredFilter?.kind === 'anchor' ? dungeonStructuredFilter.name : null"
        @select="(name: string) => setStructuredFilter('anchor', name)" />
    </div>

    <div class="editor-main">
      <aside v-if="!showRaw" class="toc-panel">
        <div class="toc-title">Contents</div>
        <div v-if="doc.blocks.length === 0" class="toc-empty">No blocks yet.</div>
        <div v-else-if="matchingBlockIndices && matchingBlockIndices.size === 0" class="toc-empty">
          No blocks match "{{ searchQuery }}".
        </div>
        <div ref="tocListRef" class="toc-list">
          <template v-for="(block, idx) in doc.blocks" :key="(block as any)">
            <div
              v-show="(tocRoles[idx].questGroup ? isItemVisible({ kind: 'quest', group: tocRoles[idx].questGroup! }) : isBlockVisible(idx)) && !tocRoles[idx].hidden"
              class="toc-entry toc-handle" :class="{
              'toc-entry--room': block.kind === 'room',
              'toc-entry--indented': indented[idx],
              'toc-selected': tocRoles[idx].questGroup
                ? (selectedIndex !== null && selectedIndex >= tocRoles[idx].questGroup!.startIndex && selectedIndex < tocRoles[idx].questGroup!.endIndex)
                : selectedIndex === idx,
              'toc-locked': isLockedBlock(block),
            }" @click="jumpToBlock(idx)">
              <span class="toc-sigil" :class="[
                `toc-sigil--${block.kind}`,
                block.kind === 'encounter' && (block as any).id === 'description' ? 'toc-sigil--description' : '',
                block.kind === 'scene' && !((block as any).id ?? '').includes('~') ? 'toc-sigil--scene-event' : '',
                block.kind === 'template' && questKindOf((block as any).id) && !tocRoles[idx].questGroup
                  ? `toc-sigil--quest-${questKindOf((block as any).id)!.replace('_', '-')}` : '',
                tocRoles[idx].questGroup ? 'toc-sigil--quest-title' : '',
              ]">{{ kindSigil[block.kind] }}</span>
              <span class="toc-label">{{ tocRoles[idx].questGroup ? `Quest: ${tocRoles[idx].questGroup!.questId}` : labelFor(block) }}</span>
              <template v-if="block.kind === 'scene'">
                <div v-for="sub in sceneSubEntries(block as SceneBlock)"
                  :key="sub.kind + '-' + sub.rowIdx + '-' + ('colIdx' in sub ? sub.colIdx : '')" class="toc-subentry"
                  :class="`toc-subentry--${sub.kind}`"
                  @click.stop="jumpToSceneSub(idx, sub.rowIdx, 'colIdx' in sub ? sub.colIdx : undefined)">
                  <span class="toc-subentry-label">{{ sub.label }}</span>
                </div>
              </template>
              <template v-if="tocRoles[idx].questGroup">
                <template v-for="sub in questSubEntries(tocRoles[idx].questGroup!)"
                  :key="`${sub.kind}-${sub.blockIdx}`">
                  <div v-if="sub.kind === 'goal'" class="toc-subentry toc-subentry--row"
                    @click.stop="jumpToBlock(sub.blockIdx)">
                    <button v-if="sub.hasStages" type="button" class="toc-subentry-toggle"
                      :aria-label="isGoalExpanded(sub.goalKey) ? 'Collapse stages' : 'Expand stages'"
                      @click.stop="toggleGoalExpanded(sub.goalKey)">
                      <i :class="isGoalExpanded(sub.goalKey) ? 'pi pi-chevron-down' : 'pi pi-chevron-right'"></i>
                    </button>
                    <span v-else class="toc-subentry-toggle toc-subentry-toggle--placeholder"></span>
                    <span class="toc-subentry-label">{{ sub.label }}</span>
                  </div>
                  <div v-else-if="isGoalExpanded(sub.parentKey)" class="toc-subentry toc-subentry--col"
                    @click.stop="jumpToBlock(sub.blockIdx)">
                    <span class="toc-subentry-label">{{ sub.label }}</span>
                  </div>
                </template>
              </template>
            </div>
          </template>
        </div>
      </aside>

      <div v-if="!showRaw" ref="blocksListRef" class="blocks-list">
        <div v-if="doc.blocks.length === 0" class="empty-state">
          <p>Empty dungeon. Start by adding a Room, Encounter, Scene, or Template above.</p>
        </div>
        <div v-else-if="matchingBlockIndices && matchingBlockIndices.size === 0" class="empty-state">
          <p>No blocks match "{{ searchQuery }}".</p>
        </div>
        <template v-for="item in groupedItems" :key="item.kind === 'quest'
          ? `quest:${(doc.blocks[item.group.startIndex] as any).__uid ?? item.group.startIndex}`
          : (doc.blocks[item.idx] as any).__uid ?? item.idx">
          <template v-if="item.kind === 'block'">
            <div v-if="isBlockVisible(item.idx)" v-bind="{ 'data-block-index': item.idx }" class="block-anchor"
              :class="{
                'block-anchor--selected': selectedIndex === item.idx,
                'block-anchor--indented': indented[item.idx],
              }" @click="(e: MouseEvent) => onBlockClick(item.idx, e)">
              <BlockCard :block="doc.blocks[item.idx]" :index="item.idx" :can-move-up="item.idx > 0"
                :can-move-down="item.idx < doc.blocks.length - 1" :issues="issuesForBlock(item.idx)"
                :locked="isLockedBlock(doc.blocks[item.idx])"
                @update:block="(b: Block) => updateBlock(item.idx, b)" @remove="removeBlock(item.idx)"
                @move-up="moveBlock(item.idx, -1)" @move-down="moveBlock(item.idx, 1)"
                @insert-scene="(id: string) => insertSceneAfter(item.idx, id)" />
            </div>
          </template>
          <template v-else>
            <div v-if="isItemVisible(item)" v-bind="{ 'data-block-index': item.group.startIndex }" class="block-anchor"
              :class="{
                'block-anchor--selected': selectedIndex !== null && selectedIndex >= item.group.startIndex && selectedIndex < item.group.endIndex,
                'block-anchor--indented': indented[item.group.startIndex],
              }" @click="(e: MouseEvent) => onBlockClick(item.group.startIndex, e)">
              <QuestCard :group="item.group" :blocks="doc.blocks"
                @update:block="(idx: number, b: Block) => updateBlock(idx, b)"
                @add-block-after="(afterIdx: number, b: Block) => insertBlockAfter(afterIdx, b)"
                @remove-block="(idx: number) => removeBlock(idx)"
                @rename-quest-prefix="(oldP: string, newP: string) => renameQuestPrefix(oldP, newP)"
                @move-block="(idx: number, dir: -1 | 1) => moveBlock(idx, dir)"
                @move-goal="(qid: string, gid: string, dir: -1 | 1) => moveQuestGoal(qid, gid, dir)"
                @move-quest="(qid: string, dir: -1 | 1) => moveQuest(qid, dir)"
                @remove-quest="(qid: string) => removeQuest(qid)" />
            </div>
          </template>
        </template>
      </div>

      <div v-else class="raw-view">
        <Textarea :model-value="serialized" @update:model-value="onRawEdit" class="raw-textarea" spellcheck="false"
          autoResize />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dungeon-content-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 0.5rem;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.5rem 0.25rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex: 0 0 auto;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.auto-open-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  user-select: none;
}

.auto-open-label {
  font-size: 0.82rem;
  color: #333;
}

.editor-title {
  font-size: 0.95rem;
}

.meta code {
  background: rgba(255, 255, 255, 0.06);
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  font-family: var(--font-family-mono, monospace);
  font-size: 0.85rem;
}

.counts {
  display: flex;
  gap: 0.75rem;
  font-family: var(--font-family-mono, monospace);
  font-size: 0.8rem;
  color: #888;
}

.toolbar-right {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
  align-items: center;
}

.lint-banner {
  background: #fdecea;
  border: 1px solid #f5b7b1;
  color: #b71c1c;
  padding: 0.4rem 0.75rem;
  border-radius: 4px;
  margin: 0 0.25rem 0.5rem;
  cursor: pointer;
  user-select: none;
  flex: 0 0 auto;
}

.lint-banner:hover {
  background: #fde5e1;
}

.lint-banner-summary {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.lint-icon {
  font-size: 1rem;
}

.lint-list {
  list-style: none;
  padding: 0.5rem 0 0;
  margin: 0.5rem 0 0;
  border-top: 1px solid rgba(183, 28, 28, 0.2);
  max-height: 180px;
  overflow-y: auto;
}

.lint-item {
  display: flex;
  gap: 0.6rem;
  padding: 0.25rem 0.35rem;
  border-radius: 3px;
  cursor: pointer;
  font-size: 0.82rem;
  align-items: baseline;
}

.lint-item:hover {
  background: rgba(183, 28, 28, 0.08);
}

.lint-block-ref {
  font-family: var(--font-family-mono, monospace);
  font-weight: 700;
  flex: 0 0 auto;
  color: #880e4f;
}

.lint-message {
  color: #b71c1c;
}

.toolbar-divider {
  width: 1px;
  height: 1.25rem;
  background: rgba(0, 0, 0, 0.15);
  margin: 0 0.25rem;
}

.quest-btn :deep(.p-button-label) {
  font-weight: 600;
}

.encounter-btn :deep(.p-button-label),
.encounter-btn :deep(.p-button-icon) {
  color: #9c27b0;
}

.room-btn :deep(.p-button-label),
.room-btn :deep(.p-button-icon) {
  color: #ef6c00;
}

.scene-btn :deep(.p-button-label),
.scene-btn :deep(.p-button-icon) {
  color: #1976d2;
}

.quest-btn--title :deep(.p-button-label),
.quest-btn--title :deep(.p-button-icon) {
  color: #00838f;
}

.quest-btn--main-stage :deep(.p-button-label),
.quest-btn--main-stage :deep(.p-button-icon) {
  color: #e65100;
}

.quest-btn--goal :deep(.p-button-label),
.quest-btn--goal :deep(.p-button-icon) {
  color: #c17900;
}

.quest-btn--goal-stage :deep(.p-button-label),
.quest-btn--goal-stage :deep(.p-button-icon) {
  color: #e65100;
}

.editor-main {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 0.75rem;
  overflow: hidden;
}

.toc-panel {
  flex: 0 0 350px;
  min-width: 180px;
  overflow-y: auto;
  padding: 0.5rem 0.25rem 0.5rem 0.5rem;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.toc-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #000;
  font-weight: 600;
  padding: 0.25rem 0.25rem 0.5rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.toc-empty {
  color: #555;
  font-style: italic;
  font-size: 0.85rem;
  padding: 0.5rem 0.25rem;
}

.toc-list {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.toc-entry {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  background: transparent;
  border: none;
  padding: 0.25rem 0.4rem;
  border-radius: 3px;
  color: #222;
  font-size: 0.82rem;
  cursor: grab;
  text-align: left;
  width: 100%;
  min-width: 0;
}

.toc-entry:hover {
  background: rgba(0, 0, 0, 0.06);
}

.toc-entry:active {
  cursor: grabbing;
}

.toc-entry--room {
  font-weight: 600;
  color: #000;
  font-size: 0.85rem;
  border-left: 2px solid transparent;
}

.toc-entry--indented {
  padding-left: 1.25rem;
}

.toc-ghost {
  opacity: 0.4;
  background: rgba(33, 150, 243, 0.15) !important;
}

.toc-room--none:hover {
  background: transparent;
}

.toc-sigil {
  font-family: var(--font-family-mono, monospace);
  font-weight: 700;
  font-size: 0.9rem;
  flex: 0 0 1rem;
  text-align: center;
}

.toc-sigil--room {
  color: #f57f17;
}

.toc-sigil--encounter {
  color: #9c27b0;
}

.toc-sigil--scene {
  color: #81c784;
}

.toc-sigil--scene-event {
  color: #1976d2;
}

.toc-sigil--template {
  color: #757575;
}

.toc-sigil--raw {
  color: #888;
}

.toc-sigil--description {
  color: #f57f17;
}

.toc-sigil--quest-title {
  color: #00838f;
}

.toc-sigil--quest-main-stage {
  color: #e65100;
}

.toc-sigil--quest-goal {
  color: #c17900;
}

.toc-sigil--quest-goal-stage {
  color: #e65100;
}

.toc-label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
  flex: 1 1 auto;
}

.toc-subentry {
  flex-basis: 100%;
  display: flex;
  align-items: center;
  margin-left: 1.5rem;
  padding: 0.1rem 0.45rem;
  font-size: 0.78rem;
  color: #666;
  cursor: pointer;
  border-radius: 3px;
}

.toc-subentry:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #000;
}

.toc-subentry--row {
  font-weight: 600;
  color: #555;
}

.toc-subentry--col {
  margin-left: 2.75rem;
  font-family: var(--font-family-mono, monospace);
}

.toc-subentry-toggle {
  flex: 0 0 auto;
  width: 1rem;
  height: 1rem;
  padding: 0;
  margin-right: 0.2rem;
  border: none;
  background: transparent;
  color: #888;
  cursor: pointer;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.toc-subentry-toggle:hover {
  background: rgba(0, 0, 0, 0.08);
  color: #000;
}

.toc-subentry-toggle .pi {
  font-size: 0.65rem;
}

/* Spacer for goals without stages — keeps labels aligned with goals that
   have a chevron. */
.toc-subentry-toggle--placeholder {
  cursor: default;
}

.toc-subentry-toggle--placeholder:hover {
  background: transparent;
}

.blocks-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.25rem;
}

.search-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.5rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  flex: 0 0 auto;
}

.search-icon {
  color: #888;
  font-size: 0.85rem;
}

.search-input {
  flex: 1;
  min-width: 0;
  border: 1px solid rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
  font-size: 0.9rem;
  color: #000;
  background: #fff;
  outline: none;
}

.search-input:focus {
  border-color: #1976d2;
  box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.15);
}

.search-clear {
  border: none;
  background: transparent;
  color: #888;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
}

.search-clear:hover {
  background: rgba(0, 0, 0, 0.06);
  color: #000;
}

.search-count {
  font-family: var(--font-family-mono, monospace);
  font-size: 0.8rem;
  color: #555;
  white-space: nowrap;
}

.search-divider {
  width: 1px;
  align-self: stretch;
  background: rgba(0, 0, 0, 0.12);
  margin: 0.1rem 0.25rem;
}

.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.25rem 0.15rem 0.55rem;
  background: rgba(25, 118, 210, 0.12);
  border: 1px solid rgba(25, 118, 210, 0.45);
  border-radius: 12px;
  font-size: 0.8rem;
  color: #0d47a1;
  white-space: nowrap;
  max-width: 18rem;
  overflow: hidden;
}

.filter-chip-label {
  font-family: var(--font-family-mono, monospace);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
}

.filter-chip-clear {
  border: none;
  background: transparent;
  color: #0d47a1;
  cursor: pointer;
  padding: 0.1rem 0.25rem;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  line-height: 1;
}

.filter-chip-clear:hover {
  background: rgba(25, 118, 210, 0.2);
}

.index-btn {
  flex: 0 0 auto;
}

.block-anchor {
  border-radius: 6px;
  transition: box-shadow 0.15s ease;
}

.block-anchor--selected {
  box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.6);
}

.block-anchor--indented {
  margin-left: 1.5rem;
  position: relative;
}

.block-anchor--indented::before {
  content: '';
  position: absolute;
  left: -0.9rem;
  top: 0;
  bottom: 0;
  width: 2px;
  background: rgba(245, 127, 23, 0.3);
  border-radius: 1px;
}

.block-anchor.flash :deep(.block-card) {
  animation: block-flash 1.2s ease-out;
}

.toc-selected {
  background: rgba(33, 150, 243, 0.18) !important;
}

@keyframes block-flash {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 235, 59, 0.5);
  }

  30% {
    box-shadow: 0 0 0 4px rgba(255, 235, 59, 0.35);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(255, 235, 59, 0);
  }
}

.empty-state {
  text-align: center;
  color: #888;
  padding: 3rem 1rem;
  font-style: italic;
}

.raw-view {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.25rem;
}

.raw-textarea {
  width: 100%;
  font-family: var(--font-family-mono, monospace);
  font-size: 0.85rem;
  min-height: 400px;
}
</style>
