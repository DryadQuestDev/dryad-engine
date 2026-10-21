<script setup lang="ts">
import { ref, shallowRef, computed, watch, nextTick, onMounted, onBeforeUnmount, provide } from 'vue';
import { useSortable } from '@vueuse/integrations/useSortable';
import { useStorage, watchDebounced } from '@vueuse/core';
import {
  dungeonSearchQuery as searchQuery,
  dungeonStructuredFilter,
  dungeonStatusFilter,
} from './dungeonEditor/searchState';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import ToggleSwitch from 'primevue/toggleswitch';
import Popover from 'primevue/popover';
import { Editor } from '../../editor';
import type { EditorCustomPopupProps } from '../../editor';
import { startPlaytest, continuePlaytest, openLoadGamePopup } from '../editor-screen/usePlaytest';
import { Global } from '../../../global/global';
import { parseToAst } from '../../../utility/dungeonEditor/parseToAst';
import { serializeAst } from '../../../utility/dungeonEditor/serializeAst';
import { exportDocumentAsHtml, exportDocumentAsText } from '../../../utility/dungeonEditor/exportHtml';
import { lintDungeonContent, type LintIssue } from '../../../utility/dungeonEditor/lint';
import { buildLintContext, forDungeon } from '../../../utility/dungeonEditor/lintContext';
import { editTarget, withIgnore, withoutIgnore } from '../../../utility/dungeonEditor/applyFix';
import { blockScopes, indexDungeon, refLabel, type DungeonIndex, type LintContext, type RefFix } from '../../../utility/dungeonEditor/refs';
import type { AssistMode, AssistPlace, JumpTarget } from '../../../utility/dungeonEditor/assist';
import { CONTENT_ASSIST, type ContentAssist } from './dungeonEditor/useContentAssist';
import AssistLayer from './dungeonEditor/AssistLayer.vue';
import { EDITOR_TABS } from '../../editorTabs';
import { editorLintIO } from './dungeonEditor/editorLintIO';
import { blockStartLines, lineStartOffset } from '../../../utility/dungeonEditor/locate';
import { convertPov } from '../../../utility/dungeonEditor/povConvert';
import { buildDocumentIndex, type IndexCategory } from '../../../utility/dungeonEditor/index';
import {
  readMeta, writeMeta, isMetaStatus, visibleParams,
  META_STATUSES, META_STATUS_ICON, META_STATUS_LABEL,
  type MetaStatus,
} from '../../../utility/dungeonEditor/meta';
import type { StatusFilter } from './dungeonEditor/searchState';
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
import type { RevealRequest } from './dungeonEditor/reveal';
import { measureOffsetTop } from './dungeonEditor/textareaMeasure';
import { groupQuestBlocks, questIdOf, questKindOf as questKindOfUtil } from '../../../utility/dungeonEditor/quest';
const props = defineProps<EditorCustomPopupProps>();
const emit = defineEmits<{
  'update:item': [item: any];
  'request-save-jump': [payload: { mainTab: string; subTab: string; entityId: string }];
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

const kindSigil: Record<Block['kind'], string> = {
  room: '^',
  encounter: '@',
  scene: '#',
  template: '$',
  raw: '—',
};

function blockMatches(block: Block, needle: string): boolean {
  const q = needle.toLowerCase();
  if (block.kind === 'raw') return stripHtml(block.text).toLowerCase().includes(q);
  // Ids are stored bare (parse strips the sigil), but authors search the way
  // ids are written in source — `#introduction`. Matching against sigil+id
  // covers both the bare and the prefixed query in one check.
  if ((block as any).id && (kindSigil[block.kind] + String((block as any).id)).toLowerCase().includes(q)) return true;
  // Match the author's own params, not the `__meta` scaffolding — otherwise
  // searching "status" or "done" would hit every annotated block.
  if ('paramsRaw' in block && block.paramsRaw
    && visibleParams(block.paramsRaw).toLowerCase().includes(q)) return true;
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
    // Parked comments are real authored text the author can search for; they
    // used to live in a column's content and were findable there.
    if (block.preRows?.toLowerCase().includes(q)) return true;
    for (const row of block.rows) {
      if (row.preColumns?.toLowerCase().includes(q)) return true;
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
  liveChecks: boolean;
  suggest: boolean;
  autoCurlyQuotes: boolean;
  autoEnDash: boolean;
  selectedBlock: Record<string, BlockAnchor>;
  scrollPosition: Record<string, ScrollAnchor>;
};

// Block id alone is NOT unique across the doc — every room can have its own
// `@description` encounter, multiple rooms can declare `#scene1`, etc. The
// containing room id is part of the identity.
type BlockAnchor = { kind: string; id: string; roomId: string };
// Block-anchored scroll persistence: store the topmost visible block + the
// pixel offset of the scroll viewport's top relative to that block's top.
// Restoring against `block.offsetTop + offset` is robust against block-height
// changes between save and reload (trailing-empty strip on parse, lazy-mount
// activations, future content edits, etc.) — pixel `scrollTop` is not.
type ScrollAnchor = BlockAnchor & { offset: number };
const settings = useStorage<DungeonEditorSettings>('dungeonEditor_settings', {
  autoOpen: false,
  autosave: false,
  liveChecks: true,
  suggest: true,
  autoCurlyQuotes: false,
  autoEnDash: false,
  selectedBlock: {},
  scrollPosition: {},
}, undefined, { mergeDefaults: true });
const autoOpen = computed({
  get: () => settings.value.autoOpen,
  set: (v) => { settings.value.autoOpen = v; },
});
const autosave = computed({
  get: () => settings.value.autosave ?? false,
  set: (v) => { settings.value.autosave = v; },
});
const suggest = computed({
  get: () => settings.value.suggest ?? true,
  set: (v) => { settings.value.suggest = v; },
});
const typingMenuRef = ref<InstanceType<typeof Popover> | null>(null);
const liveChecks = computed({
  get: () => settings.value.liveChecks ?? true,
  set: (v) => { settings.value.liveChecks = v; },
});
const autoCurlyQuotes = computed({
  get: () => settings.value.autoCurlyQuotes ?? false,
  set: (v) => { settings.value.autoCurlyQuotes = v; },
});
const autoEnDash = computed({
  get: () => settings.value.autoEnDash ?? false,
  set: (v) => { settings.value.autoEnDash = v; },
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
  // Skip when the change came from our own `commit()` emit — `localItem` is
  // already this reference. Without this guard, the post-dungeon-switch
  // typing path would re-enter `replaceDocBlocks`, remounting every
  // BlockCard mid-keystroke and yanking focus.
  if (localItem.value === v) return;
  localItem.value = v;
  replaceDocBlocks(v?.dungeon_content ?? '');
  restoreSelection();
}, { deep: false });

// In-popup dungeon switch: DungeonSelect already awaited `editor.setDungeon`
// (which loaded the new active object including its external `dungeon_content`
// from `content_raw.txt`). The popup's `props.item` is a deep-copy snapshot
// taken at openPopup time and won't update — so we re-bind localItem to the
// fresh active object here, then re-parse and restore selection.
//
// Deep-clone (don't alias `activeObject`). If localItem and activeObject
// shared the same reference, popup mutations (commit() writes dungeon_content
// per keystroke) would mutate activeObject directly, fire the editor's deep
// watcher, and flip `hasUnsavedChanges` on every typed character. The
// wrapper does the same clone on initial open ([CustomPopupWrapper.vue]) —
// keeping consistency here.
function onDungeonChange() {
  const newItem = editorInstance.activeObject.value;
  if (!newItem || Array.isArray(newItem)) return;
  localItem.value = JSON.parse(JSON.stringify(newItem));
  // Push the fresh clone up to CustomPopupWrapper immediately. The wrapper's
  // own localItem (what its Save buttons Object.assign into activeObject) is
  // otherwise still the previous dungeon's snapshot until the first commit()
  // here — and a Save in that window merges the OLD dungeon's fields, id
  // included, into the new dungeon's config: the id-vs-folder save block,
  // deterministically, on every retry.
  emit('update:item', localItem.value);
  replaceDocBlocks(localItem.value.dungeon_content ?? '');
  restoreSelection();
}

let suppressSelectionPersist = false;

// Match a saved anchor against the current doc. Block id alone isn't unique
// (multiple rooms can have `@description`, `#scene1`, etc.) — the containing
// room id is part of the identity.
function findBlockIndexByAnchor(anchor: BlockAnchor): number {
  const blocks = doc.value.blocks;
  const rooms = roomByBlockIndex.value;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b || b.kind !== anchor.kind) continue;
    if ((b as any).id !== anchor.id) continue;
    if ((rooms[i] ?? '') !== (anchor.roomId ?? '')) continue;
    return i;
  }
  return -1;
}

function restoreSelection() {
  const key = getSelectionStorageKey();
  suppressSelectionPersist = true;
  if (!key) {
    selectedIndex.value = null;
    nextTick(() => { suppressSelectionPersist = false; });
    return;
  }
  const saved = settings.value.selectedBlock[key];
  const idx = saved ? findBlockIndexByAnchor(saved) : -1;
  selectedIndex.value = idx >= 0 ? idx : null;
  // Restore scroll position from the saved anchor (independent of selection).
  // Selection still highlights the previously-selected block; scroll lands
  // exactly where the user left off, regardless of where the selected block
  // sits in the doc.
  const savedScroll = settings.value.scrollPosition[key];
  nextTick(() => {
    suppressSelectionPersist = false;
    if (savedScroll && typeof savedScroll === 'object') {
      const idx = findBlockIndexByAnchor(savedScroll);
      const el = blocksListRef.value;
      if (idx >= 0 && el) {
        const target = el.querySelector(`[data-block-index="${idx}"]`) as HTMLElement | null;
        if (target) {
          el.scrollTop = target.offsetTop + savedScroll.offset;
          return;
        }
      }
    }
    // Fallback: scroll to the selected block if no anchor or anchor missing.
    if (selectedIndex.value !== null) scrollToBlock(selectedIndex.value);
  });
}

// Find the topmost visible block and return an anchor describing where the
// viewport's top is relative to that block.
function findTopBlockAnchor(): ScrollAnchor | null {
  const el = blocksListRef.value;
  if (!el) return null;
  const scrollTop = el.scrollTop;
  const children = el.querySelectorAll<HTMLElement>('[data-block-index]');
  const rooms = roomByBlockIndex.value;
  for (const child of Array.from(children)) {
    const top = child.offsetTop;
    const bottom = top + child.offsetHeight;
    if (bottom <= scrollTop) continue;
    const idx = Number(child.dataset.blockIndex);
    const block = doc.value.blocks[idx];
    if (!block || block.kind === 'raw') continue;
    const id = (block as any).id;
    if (!id) continue;
    return {
      kind: block.kind,
      id,
      roomId: rooms[idx] ?? '',
      offset: scrollTop - top,
    };
  }
  return null;
}

// Persist the blocks-list scroll position (per dungeon) on scroll.
function onBlocksListScroll() {
  const key = getSelectionStorageKey();
  if (!key) return;
  const anchor = findTopBlockAnchor();
  if (anchor) settings.value.scrollPosition[key] = anchor;
  else delete settings.value.scrollPosition[key];
}

const searchInputRef = ref<HTMLInputElement | null>(null);

// Ctrl+F / Cmd+F focuses the popup's search bar instead of the browser find.
// Ctrl+C / X / V copy, cut and paste the selected block card while no text field has focus.
function onGlobalKeydown(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || showRaw.value) return;
  const key = e.key.toLowerCase();
  if (key === 'f') {
    e.preventDefault();
    searchInputRef.value?.focus();
    searchInputRef.value?.select();
    return;
  }
  if (key !== 'c' && key !== 'x' && key !== 'v') return;
  const target = e.target as HTMLElement | null;
  if (target && (target.closest('input, textarea, select') || target.isContentEditable)) return;
  if (key === 'v') {
    if (e.repeat) return;
    e.preventDefault();
    pasteBlocks();
    return;
  }
  // Highlighted text copies as text, not as the block it sits in.
  if (key === 'c' && window.getSelection()?.isCollapsed === false) return;
  const range = selectedBlockRange();
  if (!range) return;
  e.preventDefault();
  copyBlocks(range, key === 'x');
}

// Last block text this popup copied: the paste source when the system clipboard can't be read,
// and the only text whose comment-only blocks paste (stray clipboard text must hold a real block).
let copiedBlocksText = '';

// A quest is selected as a whole, so it copies as a whole.
function selectedBlockRange(): [number, number] | null {
  const idx = selectedIndex.value;
  if (idx === null || !doc.value.blocks[idx]) return null;
  for (const item of groupedItems.value) {
    if (item.kind === 'quest' && idx >= item.group.startIndex && idx < item.group.endIndex) {
      return [item.group.startIndex, item.group.endIndex];
    }
  }
  return [idx, idx + 1];
}

function copyBlocks([start, end]: [number, number], cut: boolean) {
  const blocks = doc.value.blocks;
  copiedBlocksText = serializeAst({ blocks: blocks.slice(start, end) });
  navigator.clipboard.writeText(copiedBlocksText).catch((err) => {
    console.warn('[DungeonContentEditor] Block copy failed:', err);
  });
  if (!cut) return;
  let removed = false;
  for (let i = end - 1; i >= start; i--) {
    if (isLockedBlock(blocks[i])) continue;
    blocks.splice(i, 1);
    removed = true;
  }
  if (!removed) return;
  selectedIndex.value = null;
  commit();
}

async function pasteBlocks() {
  let text = copiedBlocksText;
  try {
    text = await navigator.clipboard.readText();
  } catch (err) {
    console.warn('[DungeonContentEditor] Clipboard read failed, pasting the last copied block:', err);
  }
  if (!text) return;
  // The required blocks already exist exactly once.
  const pasted = parseToAst(text).blocks.filter((b) => !isLockedBlock(b));
  if (pasted.length === 0) return;
  if (text !== copiedBlocksText && pasted.every((b) => b.kind === 'raw')) return;
  renameCollidingQuests(pasted);
  tagBlocks(pasted);
  const insertAt = selectedIndex.value !== null
    ? insertAfterQuestEnd(selectedIndex.value)
    : doc.value.blocks.length;
  doc.value.blocks.splice(insertAt, 0, ...pasted);
  selectedIndex.value = insertAt + pasted.length - 1;
  commit();
  nextTick(() => scrollToBlock(insertAt));
}

// A pasted copy of a quest already in the doc gets the next free `<id>_<n>`; keeping the id
// would merge both copies into one quest with two titles.
function renameCollidingQuests(pasted: Block[]) {
  const taken = new Set<string>();
  for (const b of doc.value.blocks) {
    if (b?.kind === 'template' && questIdOf(b.id)) taken.add(questIdOf(b.id));
  }
  const renames = new Map<string, string>();
  for (const b of pasted) {
    if (b.kind !== 'template' || questKindOfUtil(b.id) !== 'title') continue;
    const questId = questIdOf(b.id);
    if (!taken.has(questId) || renames.has(questId)) continue;
    let n = 2;
    while (taken.has(`${questId}_${n}`)) n++;
    renames.set(questId, `${questId}_${n}`);
    taken.add(`${questId}_${n}`);
  }
  for (const b of pasted) {
    if (b.kind !== 'template') continue;
    const renamed = renames.get(questIdOf(b.id));
    if (renamed) b.id = renamed + b.id.slice(questIdOf(b.id).length);
  }
}

onMounted(() => {
  restoreSelection();
  window.addEventListener('keydown', onGlobalKeydown);
});

onBeforeUnmount(() => {
  if (issueCopiedTimer !== null) window.clearTimeout(issueCopiedTimer);
  window.removeEventListener('keydown', onGlobalKeydown);
});

const serialized = computed(() => serializeAst(doc.value));

// Popup-local dirty flag. Typing in the popup mutates `localItem` (a clone)
// and `doc` — neither of those flip `editor.hasUnsavedChanges`. Without a
// separate flag, the Playtest / Load Save buttons would stay enabled while
// the popup has unsaved edits, and clicking either would reload and drop
// them. Set true on every `commit()` call, cleared after autosave / manual
// save (the latter flips `editor.hasUnsavedChanges` from true to false,
// which we observe with a watcher below).
const popupDirty = ref(false);

function commit() {
  if (!localItem.value) return;
  localItem.value.dungeon_content = serialized.value;
  popupDirty.value = true;
  emit('update:item', localItem.value);
}

// Clear `popupDirty` when a save lands. Manual saves go through the wrapper
// → `editor.saveActiveObject()` → `editor.hasUnsavedChanges = false`. We
// observe that transition here. (Autosave clears popupDirty inline below.)
watch(() => editorInstance.hasUnsavedChanges.value, (now, was) => {
  if (was && !now) popupDirty.value = false;
});

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
  const blocks = doc.value.blocks;
  const prev = blocks[index];
  blocks[index] = block;
  if (block.kind === 'room' && prev?.kind === 'room') {
    const before = readMeta(prev.paramsRaw)?.status;
    const after = readMeta(block.paramsRaw)?.status;
    if (before !== after) cascadeRoomStatus(index, isMetaStatus(after) ? after : undefined);
  }
  commit();
}

// A room's status applies to every block under it, up to the next `^room`.
// Only blocks with their own status grid are touched (see `statusControllable`):
// writing into a quest title or `raw` block would leave a status nothing can clear.
function cascadeRoomStatus(roomIndex: number, status: MetaStatus | undefined) {
  const blocks = doc.value.blocks;
  const controllable = statusControllable.value;
  for (let i = roomIndex + 1; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b) continue;
    if (b.kind === 'room') break;
    if (b.kind === 'raw' || !controllable[i]) continue;
    const next = writeMeta(b.paramsRaw, { ...(readMeta(b.paramsRaw) ?? {}), status });
    if (next !== b.paramsRaw) blocks[i] = { ...b, paramsRaw: next } as Block;
  }
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

// Stable wrappers for the v-for'd BlockCard event listeners. Inline arrows
// in the template create a new function reference per render and force every
// BlockCard to re-render on every keystroke; binding plain function refs
// here avoids that. BlockCard emits its `index` as the first event arg.
const onBlockUpdate = (idx: number, block: Block) => updateBlock(idx, block);
const onBlockRemove = (idx: number) => removeBlock(idx);
const onBlockMoveUp = (idx: number) => moveBlock(idx, -1);
const onBlockMoveDown = (idx: number) => moveBlock(idx, 1);
const onBlockInsertScene = (idx: number, sceneId: string) => insertSceneAfter(idx, sceneId);

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
  const id = (block as any).id;
  if (!id) return;
  settings.value.selectedBlock[key] = {
    kind: block.kind,
    id,
    roomId: roomByBlockIndex.value[idx] ?? '',
  };
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

// ── POV conversion (gender_pov plugin) ──

const isPovActive = computed(() =>
  editorInstance.pluginManager.pluginList.value.includes('gender_pov'));

const povFeedback = ref<number | null>(null);
let povFeedbackTimer: ReturnType<typeof setTimeout> | null = null;

// The MC id from the gender_pov plugin config — only that character's `id:` replicas
// convert (other characters' speech is their own first person, not the narrator's).
// Same _core→mod merge walk the runtime uses: last-defined mc_id wins.
async function readPovMcId(): Promise<string | undefined> {
  const game = editorInstance.selectedGame;
  if (!game) return undefined;
  let mcId: string | undefined;
  for (const mod of editorInstance.getModList(editorInstance.selectedMod || '_core')) {
    try {
      const config = await global.readJson(`games_files/${game}/${mod}/plugins_data/gender_pov/config.json`) as { mc_id?: string } | null;
      if (config?.mc_id) mcId = config.mc_id;
    } catch { /* no config in this mod */ }
  }
  return mcId;
}

async function convertPovDoc() {
  const mcId = await readPovMcId();
  const result = convertPov(serialized.value, { mcId });
  if (result.count > 0) {
    replaceDocBlocks(result.text);
    commit();
  }
  povFeedback.value = result.count;
  if (povFeedbackTimer) clearTimeout(povFeedbackTimer);
  povFeedbackTimer = setTimeout(() => { povFeedback.value = null; }, 1500);
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

// Debounced ref instead of computed: `buildDocumentIndex` does
// `jsonrepair` + `JSON.parse` for every `{...}` block (~1.8ms per keystroke
// on dense docs per profiler). Index dropdowns (Actions/Flags/Anchors) are
// fine with a 300ms staleness — no need to recompute live during typing.
const docIndex = ref(buildDocumentIndex(doc.value));
watchDebounced(
  () => doc.value.blocks,
  () => {
    docIndex.value = buildDocumentIndex(doc.value);
  },
  { debounce: 300, deep: true },
);

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

// Author status per block index. Read from `paramsRaw` rather than stored
// alongside, so it cannot drift from what the file actually says.
const blockStatuses = computed<(MetaStatus | null)[]>(() =>
  doc.value.blocks.map((b) => {
    const st = readMeta((b as any)?.paramsRaw)?.status;
    return isMetaStatus(st) ? st : null;
  }),
);

// A block is only "untriaged" if the author can actually give it a status.
// `raw` has no params at all; and inside a grouped quest only the STAGE rows
// get a MetaStatusGrid — QuestCard renders the title and goal headers without
// one — so counting those would put a floor under the "No status" chip that
// nothing can ever clear.
const statusControllable = computed<boolean[]>(() => {
  const blocks = doc.value.blocks;
  const out = blocks.map((b) => !!b && b.kind !== 'raw');
  for (const item of groupedItems.value) {
    if (item.kind !== 'quest') continue;
    const g = item.group;
    const stages = new Set<number>([
      ...g.mainStageIdxs,
      ...g.goals.flatMap((goal) => goal.stageIdxs),
    ]);
    for (let i = g.startIndex; i < g.endIndex; i++) if (!stages.has(i)) out[i] = false;
  }
  return out;
});

const STATUS_FILTERS: StatusFilter[] = [...META_STATUSES, 'none'];

const FILTER_ICON: Record<StatusFilter, string> = {
  ...META_STATUS_ICON,
  none: 'pi pi-minus-circle',
};

const FILTER_LABEL: Record<StatusFilter, string> = {
  ...META_STATUS_LABEL,
  none: 'No status',
};

const statusCounts = computed<Record<StatusFilter, number>>(() => {
  const out = { todo: 0, wip: 0, done: 0, broken: 0, none: 0 } as Record<StatusFilter, number>;
  const controllable = statusControllable.value;
  blockStatuses.value.forEach((st, i) => {
    if (st) out[st]++;
    else if (controllable[i]) out.none++;
  });
  return out;
});

const statusBlockIndices = computed<Set<number> | null>(() => {
  const want = dungeonStatusFilter.value;
  if (!want) return null;
  const controllable = statusControllable.value;
  const out = new Set<number>();
  blockStatuses.value.forEach((st, i) => {
    if (want === 'none' ? (!st && controllable[i]) : st === want) out.add(i);
  });
  return out;
});

function toggleStatusFilter(st: StatusFilter) {
  dungeonStatusFilter.value = dungeonStatusFilter.value === st ? null : st;
}

const filterBlockIndices = computed<Set<number> | null>(() => {
  const f = dungeonStructuredFilter.value;
  if (!f) return null;
  const entry = docIndex.value[f.kind].find((e) => e.name === f.name);
  return entry?.blockIndices ?? new Set<number>();
});

const matchingBlockIndices = computed<Set<number> | null>(() => {
  const q = searchQuery.value.trim();
  const searchSet = q
    ? (() => {
      const out = new Set<number>();
      doc.value.blocks.forEach((b, i) => { if (blockMatches(b, q)) out.add(i); });
      return out;
    })()
    : null;
  // Free text, structured filter and author status stack — each narrows the
  // last. All null means "no filtering at all", which is not the same as an
  // empty set (that one means "nothing matched").
  const sets = [searchSet, filterBlockIndices.value, statusBlockIndices.value].filter(
    (x): x is Set<number> => x !== null,
  );
  if (sets.length === 0) return null;
  return sets.reduce((acc, set) => {
    const out = new Set<number>();
    for (const i of acc) if (set.has(i)) out.add(i);
    return out;
  });
});

// Occurrence-level match state for the counter and the prev/next arrows.
// Source of truth is the rendered DOM in document order: `.at-search` prose
// spans (PlainEditor re-applies them ~200ms after query/content changes) plus
// `.input-search-hit` tinted inputs (block ids, params, choice/column names),
// so counts are read lazily (at jump time) or behind debounces, never
// synchronously.
const matchCount = ref(0);
const activeMatchPos = ref(0);

function collectMatchEls(): HTMLElement[] {
  const root = blocksListRef.value;
  if (!root) return [];
  // A hit crossing a style boundary renders as IMMEDIATELY adjacent spans —
  // count them as one. Separate hits always have at least one non-hit char
  // between them (a text node or a non-search span), so previousSibling —
  // not previousElementSibling, which would skip the text node — is the test.
  // Only spans need this dedup; tinted inputs are whole-field hits.
  return Array.from(root.querySelectorAll<HTMLElement>('.at-search, .input-search-hit'))
    .filter((el) => {
      if (!el.classList.contains('at-search')) return true;
      const prev = el.previousSibling;
      return !(prev instanceof HTMLElement && prev.classList.contains('at-search'));
    });
}

let activeMatchEl: HTMLElement | null = null;
function markActiveMatch(el: HTMLElement) {
  activeMatchEl?.classList.remove('at-search-active');
  el.classList.add('at-search-active');
  activeMatchEl = el;
}

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
/** What blocks ignore: listed in the Ignored tab, never counted as problems. */
const ignoredIssues = ref<LintIssue[]>([]);
const lintPanelOpen = ref(false);
/** The issues match the text as it is: false after an edit while live checks are off. */
const lintCurrent = ref(false);
// What the name checks read: the game's data, its scripts and every dungeon. Built in the
// background; until it lands only the syntax checks run.
const lintCtx = shallowRef<LintContext | null>(null);
const lintTexts = shallowRef<Map<string, string>>(new Map());
let lintCtxSeq = 0;
let lintCtxBuiltAt = 0;

async function refreshLintContext() {
  const id = localItem.value?.id;
  if (!id) return;
  const seq = ++lintCtxSeq;
  try {
    const built = await buildLintContext(editorLintIO(editorInstance), id);
    if (seq !== lintCtxSeq) return;
    lintCtx.value = built.ctx;
    lintTexts.value = built.texts;
    lintCtxBuiltAt = Date.now();
    if (liveChecks.value || lintCurrent.value) runLint();
  } catch (err) {
    console.warn('[DungeonContentEditor] Building the check context failed:', err);
  }
}

function runLint() {
  const ctx = lintCtx.value;
  const id = localItem.value?.id;
  const all = lintDungeonContent(serialized.value, doc.value, ctx && id ? forDungeon(ctx, id) : null);
  lintIssues.value = all.filter((i) => !i.ignored);
  ignoredIssues.value = all.filter((i) => i.ignored);
  lintCurrent.value = true;
}

// Scripts and the other dungeons change outside the popup: read them again when the window is back.
function onWindowFocus() {
  if (Date.now() - lintCtxBuiltAt > 3000) refreshLintContext();
}

watchDebounced(
  serialized,
  () => {
    if (liveChecks.value) {
      runLint();
    } else if (lintCurrent.value) {
      // Offsets of old results point at the wrong text now.
      lintIssues.value = [];
      lintCurrent.value = false;
    }
  },
  { debounce: 300 },
);
watch(() => localItem.value?.id, () => refreshLintContext());
watch(liveChecks, (on) => { if (on) runLint(); });
onMounted(() => {
  refreshLintContext();
  window.addEventListener('focus', onWindowFocus);
});
onBeforeUnmount(() => window.removeEventListener('focus', onWindowFocus));

const lintCounts = computed(() => {
  let errors = 0;
  let warnings = 0;
  for (const i of lintIssues.value) {
    if (i.severity === 'error') errors++;
    else warnings++;
  }
  return { errors, warnings };
});

const lintChipLabel = computed(() => {
  if (!lintCurrent.value) return 'Check';
  const { errors, warnings } = lintCounts.value;
  const parts: string[] = [];
  if (errors) parts.push(`${errors} ${errors === 1 ? 'error' : 'errors'}`);
  if (warnings) parts.push(`${warnings} ${warnings === 1 ? 'warning' : 'warnings'}`);
  return parts.length ? parts.join(' · ') : 'No problems';
});

function toggleLintPanel() {
  if (!lintCurrent.value) runLint();
  lintPanelOpen.value = !lintPanelOpen.value || !lintCurrent.value;
}

const sameIssue = (a: LintIssue, b: LintIssue) =>
  a.blockIndex === b.blockIndex && a.message === b.message && a.at?.target === b.at?.target
  && a.at?.rowIndex === b.at?.rowIndex && a.at?.colIndex === b.at?.colIndex;

/** Apply a one-click fix. The checks run again first, so the fix lands on the text as it is now. */
function applyLintFix(issue: LintIssue, fix: RefFix) {
  runLint();
  const fresh = lintIssues.value.find((i) => sameIssue(i, issue));
  const f = fresh?.fixes?.find((x) => x.text === fix.text);
  const block = fresh ? doc.value.blocks[fresh.blockIndex] : undefined;
  if (!fresh?.at || !f || !block) return;
  const next = editTarget(block, fresh.at, f.start, f.end, f.text);
  if (!next) return;
  updateBlock(fresh.blockIndex, next);
  runLint();
}

/** Whether "Ignore here" can be stored: it lives in the block's own `__meta`. */
function canIgnore(issue: LintIssue): boolean {
  const block = doc.value.blocks[issue.blockIndex];
  return !!issue.ignoreKey && !!block && block.kind !== 'raw';
}

function ignoreLintIssue(issue: LintIssue) {
  const block = doc.value.blocks[issue.blockIndex];
  if (!issue.ignoreKey || !block) return;
  const next = withIgnore(block, issue.ignoreKey);
  if (!next || next === block) return;
  updateBlock(issue.blockIndex, next);
  runLint();
}

// --- Check game: the same checks over every dungeon --------------------------------------------

type GameIssue = LintIssue & { dungeonId: string; label: string };
const gameIssues = shallowRef<GameIssue[] | null>(null);
const gameChecking = ref(false);
const lintScope = ref<'dungeon' | 'game' | 'ignored'>('dungeon');

type StaleIgnore = { blockIndex: number; key: string; line: number };

/** Ignores no check reports any more: the text was fixed or changed since. */
const staleIgnores = computed<StaleIgnore[]>(() => {
  // Without the name checks every ignore would look unused.
  if (!lintCtx.value || !lintCurrent.value) return [];
  const used = new Set(ignoredIssues.value.map((i) => `${i.blockIndex}|${i.ignoreKey}`));
  const starts = blockStartLines(doc.value);
  const out: StaleIgnore[] = [];
  doc.value.blocks.forEach((b, i) => {
    if (!b || !('paramsRaw' in b)) return;
    const ignore = readMeta(b.paramsRaw)?.ignore;
    if (!Array.isArray(ignore)) return;
    for (const key of ignore.map(String)) if (!used.has(`${i}|${key}`)) out.push({ blockIndex: i, key, line: starts[i] ?? 1 });
  });
  return out;
});

const ignoredCount = computed(() => ignoredIssues.value.length + staleIgnores.value.length);

const IGNORE_KIND: Record<string, string> = {
  flag: 'Flag', scene: 'Scene', anchor: 'Anchor', room: 'Room', dungeon: 'Dungeon', template: 'Template',
  quest: 'Quest log', attribute: 'Attribute', condition: 'Condition', placeholder: 'Placeholder',
  effect: 'Text effect', value: 'Value', key: 'Key', action: 'Action',
};

/** An ignore key's value and what it is: `assets:forrest` → forrest, Asset. */
function ignoreParts(key: string): { value: string; kind: string } {
  const at = key.indexOf(':');
  const kind = key.slice(0, at);
  return { value: key.slice(at + 1), kind: IGNORE_KIND[kind] ?? refLabel(kind) };
}

function blockLabel(index: number): string {
  const b = doc.value.blocks[index];
  return b ? `${kindSigil[b.kind]}${labelFor(b)}` : `block ${index}`;
}

/** Report an ignored value in its block again. */
function unignore(blockIndex: number, key: string | undefined) {
  const block = doc.value.blocks[blockIndex];
  if (!block || !key) return;
  const next = withoutIgnore(block, key);
  if (!next || next === block) return;
  updateBlock(blockIndex, next);
  runLint();
}

const gameIssueGroups = computed(() => {
  const groups = new Map<string, GameIssue[]>();
  for (const i of gameIssues.value ?? []) {
    if (!groups.has(i.dungeonId)) groups.set(i.dungeonId, []);
    groups.get(i.dungeonId)!.push(i);
  }
  return [...groups].map(([dungeonId, issues]) => ({ dungeonId, issues }));
});

async function checkGame() {
  if (gameChecking.value) return;
  gameChecking.value = true;
  lintPanelOpen.value = true;
  lintScope.value = 'game';
  try {
    await refreshLintContext();
    const ctx = lintCtx.value;
    if (!ctx) return;
    const current = localItem.value?.id;
    const out: GameIssue[] = [];
    for (const [id, text] of lintTexts.value) {
      // The open dungeon is checked from the editor, unsaved edits included.
      if (id === current) continue;
      const other = parseToAst(text);
      for (const i of lintDungeonContent(text, other, forDungeon(ctx, id))) {
        if (i.ignored) continue;
        const block = other.blocks[i.blockIndex];
        out.push({ ...i, dungeonId: id, label: block ? `${kindSigil[block.kind]}${labelFor(block)}` : '' });
      }
      // Let the panel paint between dungeons.
      await new Promise((r) => setTimeout(r));
    }
    runLint();
    for (const i of lintIssues.value) out.push({ ...i, dungeonId: current ?? '', label: issueLabel(i) });
    out.sort((a, b) => a.dungeonId.localeCompare(b.dungeonId) || a.line - b.line);
    gameIssues.value = out;
  } finally {
    gameChecking.value = false;
  }
}

/** Jump to an issue of any dungeon: another one opens first, which needs the current one saved. */
async function jumpToGameIssue(issue: GameIssue) {
  if (issue.dungeonId === localItem.value?.id) {
    runLint();
    const fresh = lintIssues.value.find((i) => i.line === issue.line && i.message === issue.message) ?? issue;
    jumpToIssue(fresh);
    return;
  }
  if (popupDirty.value || editorInstance.hasUnsavedChanges.value) {
    global.addNotification('Save your changes before opening another dungeon');
    return;
  }
  await editorInstance.setDungeon(issue.dungeonId);
  if (editorInstance.selectedDungeon !== issue.dungeonId) return;
  onDungeonChange();
  await nextTick();
  runLint();
  const fresh = lintIssues.value.find((i) => i.line === issue.line && i.message === issue.message);
  if (fresh) jumpToIssue(fresh);
}

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
      await editorInstance.saveActiveObject({ silent: true });
      popupDirty.value = false;
    } catch (err) {
      console.warn('[DungeonContentEditor] Autosave failed:', err);
    }
  },
  { debounce: 2000, maxWait: 10000 },
);

// Recount and jump to the first occurrence once PlainEditor overlays have
// re-rendered their `.at-search` spans (reactive on the query; the debounce
// is to avoid thrashing scroll position on every keystroke).
watchDebounced(
  [searchQuery, dungeonStructuredFilter, dungeonStatusFilter],
  () => {
    activeMatchPos.value = 0;
    if (!searchQuery.value.trim() && !dungeonStructuredFilter.value && !dungeonStatusFilter.value) {
      matchCount.value = 0;
      return;
    }
    nextTick(() => jumpToMatch(0));
  },
  { debounce: 260 },
);

// Live edits add/remove highlight spans; keep the counter honest without
// scrolling — the user is typing inside a block.
watchDebounced(
  () => doc.value.blocks,
  () => {
    if (!searchQuery.value.trim() && !dungeonStructuredFilter.value && !dungeonStatusFilter.value) return;
    const els = collectMatchEls();
    matchCount.value = els.length;
    if (activeMatchPos.value >= els.length) activeMatchPos.value = Math.max(0, els.length - 1);
  },
  { debounce: 400, deep: true },
);

// --- Completion and hover: what every editable of the popup reads -------------------------------

let assistCache: { key: string; self: DungeonIndex; scopes: ReturnType<typeof blockScopes> } | null = null;

/** The place of the text in `el`: its block (from the `data-block-index` around it) and the checks' context. */
function assistPlace(el: HTMLElement, mode: AssistMode): AssistPlace | null {
  const ctx = lintCtx.value;
  const id = localItem.value?.id;
  const holder = el.closest('[data-block-index]');
  if (!ctx || !id || !holder) return null;
  const index = Number(holder.getAttribute('data-block-index'));
  const key = serialized.value;
  if (!assistCache || assistCache.key !== key) {
    assistCache = { key, self: indexDungeon(doc.value, ctx.dungeons.get(id)?.rooms ?? []), scopes: blockScopes(doc.value) };
  }
  const scope = assistCache.scopes[index];
  return scope ? { mode, scope, lint: forDungeon(ctx, id), self: assistCache.self } : null;
}

/** The editor tab that holds a data file's entries: a core subtab, or a plugin's own tab. */
function tabForRef(ref: string): { mainTab: string; subTab: string } | null {
  for (const tab of EDITOR_TABS) {
    const sub = tab.subtabs.find((x) => x.file === ref);
    if (sub) return { mainTab: tab.id, subTab: sub.id };
  }
  const plugin = /^plugins_data\/([^/]+)\/(.+)$/.exec(ref);
  return plugin ? { mainTab: plugin[1], subTab: plugin[2] } : null;
}

/** The block a jump lands on in the open dungeon, or -1. */
function blockIndexFor(target: Exclude<JumpTarget, { kind: 'entity' }>): number {
  const blocks = doc.value.blocks;
  const rooms = roomByBlockIndex.value;
  return blocks.findIndex((b, i) => {
    if (!b) return false;
    if (target.kind === 'scene') return b.kind === 'scene' && b.id === target.scene && (rooms[i] ?? '') === target.room;
    if (target.kind === 'template') return b.kind === 'template' && b.id === target.id;
    if (target.kind === 'room') return b.kind === 'room' && b.id === target.room;
    if (b.kind !== 'scene') return false;
    return b.rows.some((r) => r.columns.some((c) => (c.content ?? '').split('\n').some((l) => l.trim() === `&${target.name}`)));
  });
}

/** Ctrl+click on an id: an entity opens its tab (saving first), a scene or anchor scrolls to its block. */
async function jumpToTarget(target: JumpTarget) {
  if (target.kind === 'entity') {
    const tab = tabForRef(target.ref);
    if (!tab) {
      global.addNotification(`No editor tab holds ${target.ref}`);
      return;
    }
    emit('request-save-jump', { mainTab: tab.mainTab, subTab: tab.subTab, entityId: target.id });
    return;
  }
  if (target.dungeon !== localItem.value?.id) {
    if (popupDirty.value || editorInstance.hasUnsavedChanges.value) {
      global.addNotification('Save your changes before opening another dungeon');
      return;
    }
    await editorInstance.setDungeon(target.dungeon);
    if (editorInstance.selectedDungeon !== target.dungeon) return;
    onDungeonChange();
    await nextTick();
  }
  const index = blockIndexFor(target);
  if (index >= 0) jumpToBlock(index);
}

const activeAssist = shallowRef<ContentAssist | null>(null);
provide(CONTENT_ASSIST, { place: assistPlace, autoOpen: suggest, jump: jumpToTarget, active: activeAssist });

/** Run the checks now and count the errors: the wrapper asks before saving past any. */
function lintErrorCount(): number {
  runLint();
  const errors = lintCounts.value.errors;
  if (errors) {
    lintScope.value = 'dungeon';
    lintPanelOpen.value = true;
  }
  return errors;
}
defineExpose({ lintErrorCount });

// A card's `issues` prop must keep its identity between lint passes: a
// fresh `.filter()` result per render would force every BlockCard with
// issues to re-render on every keystroke (Vue sees a different prop
// reference — ~13ms per card per the profiler). So the arrays are built
// once per lint pass and the shared empty array covers everyone else.
const EMPTY_ISSUES: LintIssue[] = [];
const issuesByBlock = computed(() => {
  const m = new Map<number, LintIssue[]>();
  for (const issue of lintIssues.value) {
    let list = m.get(issue.blockIndex);
    if (!list) {
      list = [];
      m.set(issue.blockIndex, list);
    }
    list.push(issue);
  }
  return m;
});
function issuesForBlock(blockIndex: number): LintIssue[] {
  return issuesByBlock.value.get(blockIndex) ?? EMPTY_ISSUES;
}
// Quest groups span a block range; memoized per range until the next lint pass.
const groupIssuesCache = new Map<string, LintIssue[]>();
watch(lintIssues, () => groupIssuesCache.clear(), { flush: 'sync' });
function issuesForGroup(group: { startIndex: number; endIndex: number }): LintIssue[] {
  if (lintIssues.value.length === 0) return EMPTY_ISSUES;
  const key = `${group.startIndex}:${group.endIndex}`;
  let list = groupIssuesCache.get(key);
  if (!list) {
    list = [];
    for (let b = group.startIndex; b < group.endIndex; b++) {
      list.push(...(issuesByBlock.value.get(b) ?? EMPTY_ISSUES));
    }
    if (list.length === 0) list = EMPTY_ISSUES;
    groupIssuesCache.set(key, list);
  }
  return list;
}

function issueLabel(issue: LintIssue): string {
  const block = doc.value.blocks[issue.blockIndex];
  return block ? `${kindSigil[block.kind]}${labelFor(block)}` : `block ${issue.blockIndex}`;
}

/** One issue as a copyable line: `L12 #scene_id: message`. */
function formatIssue(issue: LintIssue): string {
  return `L${issue.line} ${issueLabel(issue)}: ${issue.message}`;
}

const issueCopied = ref<number | 'all' | null>(null);
let issueCopiedTimer: number | null = null;

async function copyIssueText(text: string, which: number | 'all') {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.warn('[DungeonContentEditor] Copy failed:', err);
    return;
  }
  issueCopied.value = which;
  if (issueCopiedTimer !== null) window.clearTimeout(issueCopiedTimer);
  issueCopiedTimer = window.setTimeout(() => {
    issueCopied.value = null;
    issueCopiedTimer = null;
  }, 1200);
}

function copyIssue(issue: LintIssue, i: number) {
  copyIssueText(formatIssue(issue), i);
}

function copyAllIssues() {
  if (lintScope.value === 'game' && gameIssues.value) {
    copyIssueText(gameIssues.value.map((i) => `${i.dungeonId} L${i.line} ${i.label}: ${i.message}`).join('\n'), 'all');
    return;
  }
  if (lintScope.value === 'ignored') {
    const stale = staleIgnores.value.map((x) => `L${x.line} ${blockLabel(x.blockIndex)}: ignores ${x.key}, which nothing reports`);
    copyIssueText([...ignoredIssues.value.map(formatIssue), ...stale].join('\n'), 'all');
    return;
  }
  copyIssueText(lintIssues.value.map(formatIssue).join('\n'), 'all');
}

// The current reveal, handed only to the card that owns the target block —
// every other card keeps receiving `null`, so Vue's prop diffing skips them.
const revealRequest = shallowRef<RevealRequest | null>(null);
let revealSeq = 0;

function revealFor(blockIndex: number): RevealRequest | null {
  const r = revealRequest.value;
  return r && r.blockIndex === blockIndex ? r : null;
}

function revealForGroup(group: { startIndex: number; endIndex: number }): RevealRequest | null {
  const r = revealRequest.value;
  return r && r.blockIndex >= group.startIndex && r.blockIndex < group.endIndex ? r : null;
}

// Select the block, then let its card focus the exact input / textarea line.
// In the Raw view the issue's absolute line is selected in the textarea instead.
function jumpToIssue(issue: LintIssue) {
  if (showRaw.value) {
    revealRawLine(issue.line);
    return;
  }
  jumpToBlock(issue.blockIndex);
  if (!issue.at) return;
  revealRequest.value = { seq: ++revealSeq, blockIndex: issue.blockIndex, at: issue.at };
  // The request is index-keyed: consume it once the card has seen it, so a
  // later move/remove/insert can't replay it on whatever block lands there.
  nextTick(() => { revealRequest.value = null; });
}

const rawViewRef = ref<HTMLElement | null>(null);
const rawTextareaRef = ref<InstanceType<typeof Textarea> | null>(null);

function revealRawLine(line: number) {
  const ta = (rawTextareaRef.value as any)?.$el;
  const view = rawViewRef.value;
  if (!(ta instanceof HTMLTextAreaElement) || !view) return;
  const text = ta.value;
  const start = lineStartOffset(text, line);
  const nl = text.indexOf('\n', start);
  const end = nl === -1 ? text.length : nl;
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(start, end);
  // autoResize makes the textarea as tall as its content, so the scroll
  // container is the raw view around it.
  const y = measureOffsetTop(ta, start);
  const taRect = ta.getBoundingClientRect();
  const viewRect = view.getBoundingClientRect();
  view.scrollTop += (taRect.top + y) - (viewRect.top + view.clientHeight / 2);
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

// Keep the TOC viewport showing the currently-selected block. Triggered on
// selection change (clicking a block, jumping via lint banner, search hits)
// and on popup open / dungeon switch via the watcher below.
function scrollTocToSelected(index: number) {
  const root = tocListRef.value;
  if (!root) return;
  const el = root.querySelector(`[data-toc-index="${index}"]`) as HTMLElement | null;
  if (!el) return;
  el.scrollIntoView({ behavior: 'instant', block: 'nearest' });
}

watch(selectedIndex, (idx) => {
  if (idx === null) return;
  nextTick(() => scrollTocToSelected(idx));
});

function jumpToBlock(index: number) {
  selectedIndex.value = index;
  scrollToBlock(index);
}

// Jump to the pos-th highlighted occurrence. The DOM is queried fresh on
// every jump, so span re-renders between clicks can't leave stale references.
function jumpToMatch(pos: number) {
  const els = collectMatchEls();
  matchCount.value = els.length;
  if (!els.length) return;
  const p = ((pos % els.length) + els.length) % els.length;
  activeMatchPos.value = p;
  const el = els[p];
  el.scrollIntoView({ behavior: 'instant', block: 'center' });
  markActiveMatch(el);
  const anchor = el.closest('[data-block-index]') as HTMLElement | null;
  if (anchor) selectedIndex.value = Number(anchor.dataset.blockIndex);
}

function nextMatch() {
  jumpToMatch(activeMatchPos.value + 1);
}

function prevMatch() {
  jumpToMatch(activeMatchPos.value - 1);
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
        <DungeonSelect class="popup-dungeon-select" @change="onDungeonChange"
          :disabled="popupDirty || editorInstance.hasUnsavedChanges.value" v-tooltip.bottom="(popupDirty || editorInstance.hasUnsavedChanges.value)
            ? 'Save your changes before switching dungeons'
            : ''" />
        <label class="auto-open-toggle" v-tooltip.bottom="'Open this popup automatically on Dungeon → Config'">
          <ToggleSwitch v-model="autoOpen" />
          <span class="auto-open-label">Auto-open</span>
        </label>
        <label class="auto-open-toggle" v-tooltip.bottom="'Save to disk automatically on edit (skips error checking)'">
          <ToggleSwitch v-model="autosave" />
          <span class="auto-open-label">Autosave</span>
        </label>
        <Button icon="pi pi-sliders-h" label="Typing" size="small" text severity="secondary"
          v-tooltip.bottom="'Curly quotes, en dashes and suggestions while you type'"
          @click="(e: Event) => typingMenuRef?.toggle(e)" />
        <Popover ref="typingMenuRef">
          <div class="typing-menu">
            <label class="auto-open-toggle"
              v-tooltip.right="'Convert straight quotes to curly quotes as you type (like Google Docs)'">
              <ToggleSwitch v-model="autoCurlyQuotes" />
              <span class="auto-open-label">Curly quotes</span>
            </label>
            <label class="auto-open-toggle" v-tooltip.right="'Convert `--` to en dash `–` as you type'">
              <ToggleSwitch v-model="autoEnDash" />
              <span class="auto-open-label">En dash</span>
            </label>
            <label class="auto-open-toggle"
              v-tooltip.right="'Suggest ids and names as you type inside {…}, if{}, |, [[ and [. Ctrl+Space suggests anywhere; hover an id to see it, Ctrl+click to open it.'">
              <ToggleSwitch v-model="suggest" />
              <span class="auto-open-label">Suggestions</span>
            </label>
          </div>
        </Popover>
        <span class="toolbar-divider" aria-hidden="true"></span>
        <button type="button" class="lint-chip" :class="{
          'lint-chip--error': lintCurrent && lintCounts.errors,
          'lint-chip--warning': lintCurrent && !lintCounts.errors && lintCounts.warnings,
          'lint-chip--clean': lintCurrent && !lintIssues.length,
          'lint-chip--open': lintPanelOpen,
        }" v-tooltip.bottom="lintCurrent ? 'Problems in this dungeon: click for the list' : 'Check this dungeon'"
          @click="toggleLintPanel">
          <i class="pi" :class="!lintCurrent ? 'pi-search' : lintCounts.errors ? 'pi-times-circle'
            : lintCounts.warnings ? 'pi-exclamation-triangle' : 'pi-check-circle'" />
          <span>{{ lintChipLabel }}</span>
        </button>
        <span class="toolbar-divider" aria-hidden="true"></span>
        <Button icon="pi pi-play" label="Playtest" size="small"
          :disabled="!editorInstance.selectedGame || editorInstance.hasUnsavedChanges.value || popupDirty"
          v-tooltip.bottom="(editorInstance.hasUnsavedChanges.value || popupDirty)
            ? 'You have unsaved changes'
            : 'Start playtesting with dev mode (Ctrl/Cmd+P)'" @click="startPlaytest" />
        <Button icon="pi pi-replay" label="Continue" size="small" severity="success"
          :disabled="!editorInstance.selectedGame || editorInstance.hasUnsavedChanges.value || popupDirty"
          v-tooltip.bottom="(editorInstance.hasUnsavedChanges.value || popupDirty)
            ? 'You have unsaved changes'
            : 'Resume your last playtest and hard-reset the scene you were on — reloads with your latest content edits and re-plays the scene fresh (plain resume if you left outside a scene).'" @click="continuePlaytest" />
        <Button icon="pi pi-file-arrow-up" size="small" text
          :disabled="!editorInstance.selectedGame || editorInstance.hasUnsavedChanges.value || popupDirty"
          v-tooltip.bottom="(editorInstance.hasUnsavedChanges.value || popupDirty)
            ? 'You have unsaved changes'
            : 'Load save in dev mode'" @click="openLoadGamePopup" />
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
        <Button v-if="isPovActive" :label="povFeedback !== null ? `Converted ${povFeedback}` : '|I| POV'"
          :icon="povFeedback !== null ? 'pi pi-check' : undefined" size="small" severity="secondary"
          v-tooltip.bottom="'Convert first-person prose (I, me, my…) to POV |placeholders|. Skips dialogue in quotes, {params}, [code] and // lines. Of `id:` replicas, only the MC\'s convert (mc_id in the Gender & POV plugin config). Review before saving.'"
          @click="convertPovDoc" />
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

    <AssistLayer v-if="activeAssist" :state="activeAssist" />

    <div v-if="lintPanelOpen" class="lint-panel">
      <div class="lint-panel-header">
        <button type="button" class="lint-tab" :class="{ 'lint-tab--active': lintScope === 'dungeon' }"
          @click="lintScope = 'dungeon'">This dungeon ({{ lintIssues.length }})</button>
        <button type="button" class="lint-tab" :class="{ 'lint-tab--active': lintScope === 'game' }"
          :disabled="gameChecking" v-tooltip.bottom="'Run the same checks over every dungeon of the game'"
          @click="gameIssues && lintScope !== 'game' ? (lintScope = 'game') : checkGame()">
          <i v-if="gameChecking" class="pi pi-spin pi-spinner" />
          Whole game{{ gameIssues ? ` (${gameIssues.length})` : '' }}
        </button>
        <button v-if="lintScope === 'game' && gameIssues" type="button" class="lint-copy-all" :disabled="gameChecking"
          v-tooltip.bottom="'Check the whole game again'" @click="checkGame">
          <i class="pi pi-refresh" />
        </button>
        <button type="button" class="lint-tab" :class="{ 'lint-tab--active': lintScope === 'ignored' }"
          v-tooltip.bottom="'Warnings this dungeon ignores'" @click="lintScope = 'ignored'">Ignored ({{ ignoredCount }})</button>
        <span class="lint-spacer" />
        <label class="auto-open-toggle" v-tooltip.bottom="'Check as you type. Off: checks run on save and from the toolbar button.'">
          <ToggleSwitch v-model="liveChecks" />
          <span class="auto-open-label">Live checks</span>
        </label>
        <button type="button" class="lint-copy-all" @click.stop="copyAllIssues"
          v-tooltip.bottom="'Copy every issue as text: line, block, message'">
          <i :class="issueCopied === 'all' ? 'pi pi-check' : 'pi pi-copy'" />
          Copy all
        </button>
        <button type="button" class="lint-copy-all" title="Close" @click="lintPanelOpen = false">
          <i class="pi pi-times" />
        </button>
      </div>
      <ul v-if="lintScope === 'dungeon'" class="lint-list">
        <li v-if="!lintIssues.length" class="lint-empty">No problems found.</li>
        <!-- Inline spans with literal separators, so a drag-selection reads
             exactly like `formatIssue`; only the line/block refs jump, the
             message stays a plain selectable span. -->
        <li v-for="(issue, i) in lintIssues" :key="i" class="lint-item" :class="`lint-item--${issue.severity}`">
          <i class="lint-sev pi" :class="issue.severity === 'error' ? 'pi-times-circle' : 'pi-exclamation-triangle'" />
          <span class="lint-line" @click="jumpToIssue(issue)">L{{ issue.line }}</span> <span class="lint-block-ref" @click="jumpToIssue(issue)">{{ issueLabel(issue) }}</span>: <span class="lint-message">{{ issue.message }}</span>
          <span class="lint-actions">
            <button v-for="fix in issue.fixes ?? []" :key="fix.text" type="button" class="lint-fix"
              v-tooltip.top="`Replace with ${fix.text}`" @click.stop="applyLintFix(issue, fix)">→ {{ fix.label }}</button>
            <button v-if="canIgnore(issue)" type="button" class="lint-ignore"
              v-tooltip.top="'Stop reporting this value in this block'"
              @click.stop="ignoreLintIssue(issue)">Ignore here</button>
            <button type="button" class="lint-item-copy" @click.stop="copyIssue(issue, i)" title="Copy this issue">
              <i :class="issueCopied === i ? 'pi pi-check' : 'pi pi-copy'" />
            </button>
          </span>
        </li>
      </ul>
      <ul v-else-if="lintScope === 'ignored'" class="lint-list">
        <li v-if="!ignoredCount" class="lint-empty">Nothing is ignored in this dungeon.</li>
        <li v-for="(issue, i) in ignoredIssues" :key="`i${i}`" class="lint-item lint-item--ignored">
          <i class="lint-sev pi pi-eye-slash" />
          <span class="lint-line" @click="jumpToIssue(issue)">L{{ issue.line }}</span> <span class="lint-block-ref" @click="jumpToIssue(issue)">{{ issueLabel(issue) }}</span>: <span class="lint-message">{{ issue.message }}</span>
          <span class="lint-actions">
            <button type="button" class="lint-ignore" @click.stop="unignore(issue.blockIndex, issue.ignoreKey)">Stop ignoring</button>
          </span>
        </li>
        <li v-for="(stale, i) in staleIgnores" :key="`s${i}`" class="lint-item lint-item--ignored">
          <i class="lint-sev pi pi-eye-slash" />
          <span class="lint-line" @click="jumpToBlock(stale.blockIndex)">L{{ stale.line }}</span> <span class="lint-block-ref" @click="jumpToBlock(stale.blockIndex)">{{ blockLabel(stale.blockIndex) }}</span>: <span class="lint-message">{{ ignoreParts(stale.key).kind }} '{{ ignoreParts(stale.key).value }}' is ignored, but nothing reports it any more</span>
          <span class="lint-actions">
            <button type="button" class="lint-ignore" @click.stop="unignore(stale.blockIndex, stale.key)">Remove</button>
          </span>
        </li>
      </ul>
      <div v-else class="lint-list">
        <div v-if="gameChecking && !gameIssues" class="lint-empty">Checking every dungeon…</div>
        <div v-else-if="gameIssues && !gameIssues.length" class="lint-empty">No problems in the whole game.</div>
        <template v-for="group in gameIssueGroups" :key="group.dungeonId">
          <div class="lint-group">{{ group.dungeonId }} <span class="lint-group-count">{{ group.issues.length }}</span></div>
          <div v-for="(issue, i) in group.issues" :key="i" class="lint-item" :class="`lint-item--${issue.severity}`">
            <i class="lint-sev pi" :class="issue.severity === 'error' ? 'pi-times-circle' : 'pi-exclamation-triangle'" />
            <span class="lint-line" @click="jumpToGameIssue(issue)">L{{ issue.line }}</span> <span class="lint-block-ref" @click="jumpToGameIssue(issue)">{{ issue.label }}</span>: <span class="lint-message">{{ issue.message }}</span>
          </div>
        </template>
      </div>
    </div>

    <div v-if="!showRaw" class="search-row">
      <i class="pi pi-search search-icon" />
      <input ref="searchInputRef" v-model="searchQuery" class="search-input" type="text" placeholder="Search…" />
      <span v-if="matchingBlockIndices" class="search-count">{{ matchCount ? activeMatchPos + 1 : 0 }}/{{
        matchCount }}</span>
      <button v-if="matchingBlockIndices" type="button" class="search-nav" :disabled="!matchCount"
        @click="prevMatch" title="Previous match">
        <i class="pi pi-chevron-left" />
      </button>
      <button v-if="matchingBlockIndices" type="button" class="search-nav" :disabled="!matchCount"
        @click="nextMatch" title="Next match">
        <i class="pi pi-chevron-right" />
      </button>
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
      <span class="search-divider" aria-hidden="true"></span>
      <button v-for="st in STATUS_FILTERS" :key="st" type="button" class="status-filter"
        :class="[`status-filter--${st}`, { 'status-filter--active': dungeonStatusFilter === st }]"
        :disabled="!statusCounts[st] && dungeonStatusFilter !== st"
        v-tooltip.top="`${FILTER_LABEL[st]} — ${statusCounts[st]} block(s)`"
        @click="toggleStatusFilter(st)">
        <i :class="FILTER_ICON[st]" />
        <span class="status-filter-count">{{ statusCounts[st] }}</span>
      </button>
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
              v-bind="{ 'data-toc-index': idx }" class="toc-entry toc-handle" :class="{
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
              <i v-if="blockStatuses[idx]" class="toc-status"
                :class="[META_STATUS_ICON[blockStatuses[idx]!], `toc-status--${blockStatuses[idx]}`]"
                v-tooltip.top="META_STATUS_LABEL[blockStatuses[idx]!]" />
              <span class="toc-label">{{ tocRoles[idx].questGroup ? `Quest: ${tocRoles[idx].questGroup!.questId}` :
                labelFor(block) }}</span>
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
                    <i v-if="blockStatuses[sub.blockIdx]" class="toc-status"
                      :class="[META_STATUS_ICON[blockStatuses[sub.blockIdx]!], `toc-status--${blockStatuses[sub.blockIdx]}`]"
                      v-tooltip.top="META_STATUS_LABEL[blockStatuses[sub.blockIdx]!]" />
                    <span class="toc-subentry-label">{{ sub.label }}</span>
                  </div>
                  <div v-else-if="isGoalExpanded(sub.parentKey)" class="toc-subentry toc-subentry--col"
                    @click.stop="jumpToBlock(sub.blockIdx)">
                    <i v-if="blockStatuses[sub.blockIdx]" class="toc-status"
                      :class="[META_STATUS_ICON[blockStatuses[sub.blockIdx]!], `toc-status--${blockStatuses[sub.blockIdx]}`]"
                      v-tooltip.top="META_STATUS_LABEL[blockStatuses[sub.blockIdx]!]" />
                    <span class="toc-subentry-label">{{ sub.label }}</span>
                  </div>
                </template>
              </template>
            </div>
          </template>
        </div>
      </aside>

      <div v-if="!showRaw" ref="blocksListRef" class="blocks-list" @scroll.passive="onBlocksListScroll">
        <div v-if="doc.blocks.length === 0" class="empty-state">
          <p>Empty dungeon. Start by adding a Room, Encounter, Scene, or Template above.</p>
        </div>
        <template v-for="item in groupedItems" :key="item.kind === 'quest'
          ? `quest:${(doc.blocks[item.group.startIndex] as any).__uid ?? item.group.startIndex}`
          : (doc.blocks[item.idx] as any).__uid ?? item.idx">
          <template v-if="item.kind === 'block'">
            <div v-bind="{ 'data-block-index': item.idx }" class="block-anchor" :class="{
              'block-anchor--selected': selectedIndex === item.idx,
              'block-anchor--indented': indented[item.idx],
            }" @click="(e: MouseEvent) => onBlockClick(item.idx, e)">
              <BlockCard :block="doc.blocks[item.idx]" :index="item.idx" :can-move-up="item.idx > 0"
                :can-move-down="item.idx < doc.blocks.length - 1" :issues="issuesForBlock(item.idx)"
                :reveal="revealFor(item.idx)"
                :locked="isLockedBlock(doc.blocks[item.idx])" @update:block="onBlockUpdate" @remove="onBlockRemove"
                @move-up="onBlockMoveUp" @move-down="onBlockMoveDown" @insert-scene="onBlockInsertScene" />
            </div>
          </template>
          <template v-else>
            <div v-bind="{ 'data-block-index': item.group.startIndex }" class="block-anchor" :class="{
                'block-anchor--selected': selectedIndex !== null && selectedIndex >= item.group.startIndex && selectedIndex < item.group.endIndex,
                'block-anchor--indented': indented[item.group.startIndex],
              }" @click="(e: MouseEvent) => onBlockClick(item.group.startIndex, e)">
              <QuestCard :group="item.group" :blocks="doc.blocks" :issues="issuesForGroup(item.group)"
                :reveal="revealForGroup(item.group)"
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

      <div v-else ref="rawViewRef" class="raw-view">
        <Textarea ref="rawTextareaRef" :model-value="serialized" @update:model-value="onRawEdit"
          class="raw-textarea" spellcheck="false" autoResize />
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
  gap: 0;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 5px;
  flex-wrap: wrap;
  padding: 0.5rem 0.25rem;
  border-bottom: 1px solid var(--editor-border);
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
  color: var(--editor-text);
}

.editor-title {
  font-size: 0.95rem;
}

.meta code {
  background: var(--editor-surface-hover);
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
  color: var(--editor-text-faint);
}

.toolbar-right {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
  align-items: center;
}

.typing-menu {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.2rem 0.1rem;
}

.lint-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--editor-border);
  background: var(--editor-surface);
  color: var(--editor-text-muted);
  cursor: pointer;
  white-space: nowrap;
}

.lint-chip:hover,
.lint-chip--open {
  border-color: var(--editor-border-strong);
}

.lint-chip--clean {
  color: var(--editor-fg-success);
  background: var(--editor-tint-success);
}

.lint-chip--warning {
  color: var(--editor-fg-warning);
  background: var(--editor-tint-warning);
  border-color: var(--editor-ink-amber);
}

.lint-chip--error {
  color: var(--editor-fg-danger);
  background: var(--editor-tint-danger);
  border-color: var(--editor-ink-red);
}

.lint-panel {
  background: var(--editor-surface-raised);
  border: 1px solid var(--editor-border);
  color: var(--editor-text);
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  margin: 0 0.25rem 0.5rem;
  flex: 0 0 auto;
}

.lint-panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.lint-tab {
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--editor-text-muted);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 0.15rem 0.3rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.lint-tab--active {
  color: var(--editor-text);
  border-bottom-color: var(--editor-accent);
}

.lint-sev {
  font-size: 0.75rem;
  margin-right: 0.3rem;
  vertical-align: -0.05em;
}

.lint-item--error .lint-sev {
  color: var(--editor-ink-red);
}

.lint-item--ignored .lint-sev,
.lint-item--ignored .lint-message {
  color: var(--editor-text-muted);
}

.lint-item--warning .lint-sev {
  color: var(--editor-ink-amber);
}

.lint-actions {
  display: inline-flex;
  gap: 0.3rem;
  margin-left: 0.5rem;
  vertical-align: middle;
}

.lint-fix,
.lint-ignore {
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 3px;
  padding: 0.05rem 0.45rem;
  cursor: pointer;
  border: 1px solid var(--editor-border);
  background: var(--editor-surface);
}

.lint-fix {
  color: var(--editor-ink-green);
  font-family: var(--font-family-mono, monospace);
}

.lint-ignore {
  color: var(--editor-text-muted);
}

.lint-fix:hover,
.lint-ignore:hover {
  border-color: var(--editor-border-strong);
  background: var(--editor-surface-hover);
}

.lint-empty {
  padding: 0.35rem;
  font-size: 0.82rem;
  color: var(--editor-text-muted);
}

.lint-group {
  margin-top: 0.4rem;
  padding: 0.15rem 0.35rem;
  font-family: var(--font-family-mono, monospace);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--editor-text);
  border-bottom: 1px solid var(--editor-border);
}

.lint-group-count {
  color: var(--editor-text-muted);
  font-weight: 600;
}

.lint-spacer {
  flex: 1 1 0;
}

.lint-copy-all,
.lint-item-copy {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--editor-text-muted);
  background: var(--editor-surface);
  border: 1px solid var(--editor-border);
  border-radius: 3px;
  padding: 0.15rem 0.5rem;
  cursor: pointer;
}

.lint-copy-all:hover,
.lint-item-copy:hover {
  background: var(--editor-surface-hover);
  border-color: var(--editor-border-strong);
}

/* The list is the part a dev drags across to copy — keep it selectable. */
.lint-list {
  list-style: none;
  padding: 0.5rem 0 0;
  margin: 0.5rem 0 0;
  border-top: 1px solid var(--editor-border);
  max-height: 240px;
  overflow-y: auto;
  user-select: text;
  cursor: text;
}

.lint-item {
  display: block;
  position: relative;
  padding: 0.25rem 0.35rem;
  border-radius: 3px;
  font-size: 0.82rem;
}

.lint-item:hover {
  background: var(--editor-surface-hover);
}

.lint-line {
  display: inline-block;
  font-family: var(--font-family-mono, monospace);
  color: var(--editor-ink-brown);
  min-width: 3.5ch;
  text-align: right;
  cursor: pointer;
}

.lint-block-ref {
  font-family: var(--font-family-mono, monospace);
  font-weight: 700;
  color: var(--editor-ink-pink);
  cursor: pointer;
}

.lint-line:hover,
.lint-block-ref:hover {
  text-decoration: underline;
}

.lint-message {
  color: var(--editor-ink-red);
}

.lint-item--warning .lint-message {
  color: var(--editor-fg-warning);
}

.lint-item-copy {
  padding: 0.05rem 0.35rem;
  opacity: 0;
}

.lint-item:hover .lint-item-copy,
.lint-item-copy:focus-visible {
  opacity: 1;
}

.toolbar-divider {
  width: 1px;
  height: 1.25rem;
  background: var(--editor-surface-hover);
  margin: 0 0.25rem;
}

.quest-btn :deep(.p-button-label) {
  font-weight: 600;
}

.encounter-btn :deep(.p-button-label),
.encounter-btn :deep(.p-button-icon) {
  color: var(--editor-ink-purple);
}

.room-btn :deep(.p-button-label),
.room-btn :deep(.p-button-icon) {
  color: var(--editor-ink-orange);
}

.scene-btn :deep(.p-button-label),
.scene-btn :deep(.p-button-icon) {
  color: var(--editor-ink-blue);
}

.quest-btn--title :deep(.p-button-label),
.quest-btn--title :deep(.p-button-icon) {
  color: var(--editor-ink-teal);
}

.quest-btn--main-stage :deep(.p-button-label),
.quest-btn--main-stage :deep(.p-button-icon) {
  color: var(--editor-ink-orange);
}

.quest-btn--goal :deep(.p-button-label),
.quest-btn--goal :deep(.p-button-icon) {
  color: var(--editor-ink-amber);
}

.quest-btn--goal-stage :deep(.p-button-label),
.quest-btn--goal-stage :deep(.p-button-icon) {
  color: var(--editor-ink-orange);
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
  border-right: 1px solid var(--editor-border);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.toc-title {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--editor-text);
  font-weight: 600;
  padding: 0.25rem 0.25rem 0.5rem;
  border-bottom: 1px solid var(--editor-border);
}

.toc-empty {
  color: var(--editor-text-muted);
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
  color: var(--editor-text);
  font-size: 0.82rem;
  cursor: grab;
  text-align: left;
  width: 100%;
  min-width: 0;
}

.toc-entry:hover {
  background: var(--editor-surface-hover);
}

.toc-entry:active {
  cursor: grabbing;
}

.toc-entry--room {
  font-weight: 600;
  color: var(--editor-text);
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
  color: var(--editor-ink-amber);
}

.toc-sigil--encounter {
  color: var(--editor-ink-purple);
}

.toc-sigil--scene {
  color: var(--editor-ink-green);
}

.toc-sigil--scene-event {
  color: var(--editor-ink-blue);
}

.toc-sigil--template {
  color: var(--editor-text-faint);
}

.toc-sigil--raw {
  color: var(--editor-text-faint);
}

.toc-sigil--description {
  color: var(--editor-ink-amber);
}

.toc-sigil--quest-title {
  color: var(--editor-ink-teal);
}

.toc-sigil--quest-main-stage {
  color: var(--editor-ink-orange);
}

.toc-sigil--quest-goal {
  color: var(--editor-ink-amber);
}

.toc-sigil--quest-goal-stage {
  color: var(--editor-ink-orange);
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
  color: var(--editor-text-muted);
  cursor: pointer;
  border-radius: 3px;
}

.toc-subentry:hover {
  background: var(--editor-surface-hover);
  color: var(--editor-text);
}

.toc-subentry--row {
  font-weight: 600;
  color: var(--editor-text-muted);
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
  color: var(--editor-text-faint);
  cursor: pointer;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.toc-subentry-toggle:hover {
  background: var(--editor-surface-hover);
  color: var(--editor-text);
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
  border-bottom: 1px solid var(--editor-border);
  flex: 0 0 auto;
}

.search-icon {
  color: var(--editor-text-faint);
  font-size: 0.85rem;
}

.search-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--editor-border);
  border-radius: 4px;
  padding: 0.3rem 0.5rem;
  font-size: 0.9rem;
  color: var(--editor-text);
  background: var(--editor-surface);
  outline: none;
}

.search-input:focus {
  border-color: var(--editor-ink-blue);
  box-shadow: 0 0 0 2px rgba(25, 118, 210, 0.15);
}

.search-clear {
  border: none;
  background: transparent;
  color: var(--editor-text-faint);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
}

.search-clear:hover {
  background: var(--editor-surface-hover);
  color: var(--editor-text);
}

.search-nav {
  border: none;
  background: transparent;
  color: var(--editor-text-faint);
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
}

.search-nav:hover:not(:disabled) {
  background: var(--editor-surface-hover);
  color: var(--editor-text);
}

.search-nav:disabled {
  opacity: 0.4;
  cursor: default;
}

.blocks-list :deep(.at-search-active) {
  outline: 2px solid #e8823d;
  outline-offset: 1px;
  border-radius: 2px;
}

.search-count {
  font-family: var(--font-family-mono, monospace);
  font-size: 0.8rem;
  color: var(--editor-text-muted);
  white-space: nowrap;
}

.search-divider {
  width: 1px;
  align-self: stretch;
  background: var(--editor-surface-hover);
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
  color: var(--editor-ink-blue);
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
  color: var(--editor-ink-blue);
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

.status-filter {
  display: inline-flex;
  align-items: center;
  gap: 0.22rem;
  padding: 0.18rem 0.4rem;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 0.72rem;
  line-height: 1;
  opacity: 0.55;
  transition: opacity 0.15s, background 0.15s;
}

.status-filter:hover:not(:disabled) { opacity: 1; background: var(--editor-surface-hover); }
.status-filter:disabled { opacity: 0.2; cursor: default; }
.status-filter--active {
  opacity: 1;
  background: var(--editor-surface-hover);
  border-color: currentColor;
}

.status-filter--todo { color: #d8a657; }
.status-filter--wip { color: #7daea3; }
.status-filter--done { color: #89b482; }
.status-filter--broken { color: #d3869b; }
.status-filter--none { color: var(--p-text-muted-color); }

.status-filter-count { font-variant-numeric: tabular-nums; }

.toc-status {
  flex: 0 0 auto;
  margin-right: 0.25rem;
  font-size: 0.65rem;
}

.toc-status--todo { color: #d8a657; }
.toc-status--wip { color: #7daea3; }
.toc-status--done { color: #89b482; }
.toc-status--broken { color: #d3869b; }

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

/*
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
*/
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
  color: var(--editor-text-faint);
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
