import { effectScope, shallowRef, toRaw, triggerRef, watch } from 'vue';
import { Game } from '../game';
import { DungeonData } from '../core/dungeon/dungeonData';
import { onCheckpointEvent, currentRunId, type CheckpointEvent } from '../../services/devCheckpoints';
import { listSnapshots } from '../../services/devSnapshots';
import { devProblems, type DevProblem, type DevProblemKind } from './devProblems';

/**
 * Dev playtests only: what happened while playing, for the debug panel's Log tab. Every paragraph
 * that plays opens a group; the choices picked, the variables changed, the other actions run and
 * the problems reported land in the group that was open. Kept per game in sessionStorage for the
 * current run (currentRunId), so it survives the reloads a dev run goes through.
 *
 * The recorder arms itself on the checkpoint ring's events (a new run, a dev load), which every
 * dev playtest goes through and nothing else does. Until then `devLogOn` stays false and every
 * hook is a single boolean test.
 */

export type DevLogVarKind = 'flag' | 'property' | 'attr' | 'stat' | 'resource' | 'trait' | 'status' | 'skin' | 'item';

export type DevLogRow =
  /** `where` is the inventory an item count changed in. */
  | { t: 'var'; kind: DevLogVarKind; key: string; where?: string; old: string; new: string; n: number }
  /** `same`: a variable-changing action that changed nothing. */
  | { t: 'action'; key: string; value: string; same?: boolean; n: number }
  | { t: 'problem'; kind: DevProblemKind; message: string; n: number };

export type DevLogGroup = {
  id: number;
  t: 'para' | 'choice' | 'console' | 'system';
  at: number;
  rows: DevLogRow[];
  /** Rows past the per-group cap. */
  more?: number;
  // A paragraph: its id and dungeon, speaker and first line, and the checkpoint taken before it ran.
  sceneId?: string;
  dungeonId?: string | null;
  speaker?: string | null;
  text?: string;
  cp?: number;
  // A choice
  label?: string;
  choiceId?: string;
  // A console run, or an edit made in another debug tab (`source` names it; Console when absent)
  input?: string;
  source?: string;
  // A system line: what happened, where, how (Shift+R…), and how many times in a row.
  note?: string;
  place?: string;
  via?: string;
  n?: number;
};

/** What a console run did, in order, before rows merge. */
export type DevLogEvent = DevLogRow | { t: 'para'; sceneId: string };

type StoredLog = {
  gameId: string;
  runId: string;
  nextId: number;
  groups: DevLogGroup[];
  /** Set as the page goes: whether it left for the editor, and from inside a scene. */
  toEditor?: boolean;
  leftInScene?: boolean;
};

const STORE_PREFIX = 'dev_log_';
const REPLAY_VIA_KEY = 'dev_log_replay_via';
const MAX_PARAGRAPHS = 300;
const MAX_GROUPS = 900;
const MAX_ROWS = 150;
const SAVE_DELAY = 400;

/** Actions whose effect shows as variable rows: their own row shows only when they changed nothing. */
const WRITER_ACTIONS = new Set(['flag', 'property', 'char', 'attr', 'trait', 'stat', 'resource', 'status', 'skin',
  'add_item', 'remove_item', 'transfer_item', 'consume_item']);
/** Jumps: the paragraph they land on opens its own group, which says it better. */
const JUMP_ACTIONS = new Set(['scene', 'redirect']);

export let devLogOn = false;

let log: StoredLog | null = null;
let saveTimer = 0;
let capture: DevLogEvent[] | null = null;
let varSeq = 0;
let paraSeq = 0;
let itemSnapshot: Map<string, Map<string, number>> | null = null;

/** The current run's groups, oldest first. Mutated in place; the ref is triggered on each change. */
export const devLogGroups = shallowRef<DevLogGroup[]>([]);

// --- formatting ---

function clip(text: string, max = 60): string {
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function jsonReplacer(_key: string, value: unknown) {
  if (value instanceof Map) return Object.fromEntries(value);
  if (value instanceof Set) return [...value];
  return value;
}

function fmt(value: unknown): string {
  if (value === undefined || value === null) return 'unset';
  if (typeof value === 'string') return value === '' ? '""' : clip(value);
  if (typeof value !== 'object') return String(value);
  try {
    return clip(JSON.stringify(value, jsonReplacer) ?? String(value));
  } catch {
    return String(value);
  }
}

let textTemplate: HTMLTemplateElement | null = null;

/** Rendered paragraph HTML as one line of plain text. A template parses without loading images. */
function plainLine(html: string, max = 140): string {
  if (!html) return '';
  textTemplate ??= document.createElement('template');
  textTemplate.innerHTML = html.replace(/<br\s*\/?>/gi, '\n');
  const text = textTemplate.content.textContent ?? '';
  const line = text.split('\n').map(l => l.trim()).find(Boolean) ?? '';
  return clip(line.replace(/\s+/g, ' '), max);
}

/** A status as its stack count reads: off, on, or ×N for a multi-stack one. */
export function devLogStacks(stacks: number | null | undefined): string {
  if (!stacks || stacks <= 0) return 'off';
  return stacks === 1 ? 'on' : `×${stacks}`;
}

// --- storage ---

function storeKey(gameId: string): string {
  return `${STORE_PREFIX}${gameId}`;
}

function readStored(gameId: string): StoredLog | null {
  try {
    const stored = JSON.parse(sessionStorage.getItem(storeKey(gameId)) || 'null');
    return stored && Array.isArray(stored.groups) ? stored : null;
  } catch {
    return null;
  }
}

function persist(): void {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (!log) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      sessionStorage.setItem(storeKey(log.gameId), JSON.stringify(log));
      return;
    } catch {
      // Over the quota: drop the older half and try again.
      log.groups.splice(0, Math.ceil(log.groups.length / 2));
    }
  }
}

function changed(): void {
  triggerRef(devLogGroups);
  if (!saveTimer) saveTimer = window.setTimeout(persist, SAVE_DELAY);
}

function setLog(next: StoredLog): void {
  log = next;
  devLogGroups.value = next.groups;
}

function onPageHide(): void {
  if (!log) return;
  log.toEditor = localStorage.getItem('returning_to_editor') === 'true';
  try {
    log.leftInScene = !!Game.getInstance().dungeonSystem.currentSceneId.value;
  } catch { /* no game */ }
  persist();
}

// --- groups and rows ---

function current(): DevLogGroup {
  const groups = log!.groups;
  if (!groups.length) pushGroup({ t: 'system', note: 'Log continues' });
  return groups[groups.length - 1];
}

function pushGroup(group: Omit<DevLogGroup, 'id' | 'at' | 'rows'>): DevLogGroup {
  const full: DevLogGroup = { ...group, id: log!.nextId++, at: Date.now(), rows: [] };
  const groups = log!.groups;
  groups.push(full);
  let paragraphs = 0;
  for (const g of groups) if (g.t === 'para') paragraphs++;
  while ((paragraphs > MAX_PARAGRAPHS || groups.length > MAX_GROUPS) && groups.length > 1) {
    if (groups.shift()!.t === 'para') paragraphs--;
  }
  changed();
  return full;
}

function sameRow(a: DevLogRow, b: DevLogRow): boolean {
  if (a.t === 'var' && b.t === 'var') return a.kind === b.kind && a.key === b.key && a.where === b.where;
  if (a.t === 'action' && b.t === 'action') return a.key === b.key && a.value === b.value;
  if (a.t === 'problem' && b.t === 'problem') return a.kind === b.kind && a.message === b.message;
  return false;
}

// Repeats merge into one row, so a battle's hundred health ticks read as one `old → new ×N`. A
// change that only continues the chain merges: one that lands back on the row's starting value
// would read as `a → a`, so it gets a row of its own. A system line (a load, a new run) instead
// says what the game settled into: there everything merges, and a value back where it started is
// no change – a load re-applying every character's statuses would otherwise fill the line.
function addRow(group: DevLogGroup, row: DevLogRow): void {
  capture?.push({ ...row });
  const settles = group.t === 'system';
  const twin = group.rows.find(r => sameRow(r, row)
    && (settles || !(r.t === 'var' && row.t === 'var' && (r.new !== row.old || r.old === row.new))));
  if (twin) {
    twin.n++;
    if (twin.t === 'var' && row.t === 'var') {
      twin.new = row.new;
      if (settles && twin.old === twin.new) group.rows.splice(group.rows.indexOf(twin), 1);
    }
  } else if (group.rows.length >= MAX_ROWS) {
    group.more = (group.more ?? 0) + 1;
  } else {
    group.rows.push(row);
  }
  changed();
}

function currentPlace(): string {
  try {
    const ds = Game.getInstance().dungeonSystem;
    return [ds.currentDungeonId.value, ds.currentRoomId.value].filter(Boolean).join(' › ');
  } catch {
    return '';
  }
}

// --- items: counted per inventory and diffed, which catches every way a count can change ---

function countItems(): Map<string, Map<string, number>> | null {
  try {
    // Raw reads: a count taken inside a render or computed must not subscribe it to every item.
    const out = new Map<string, Map<string, number>>();
    for (const [id, inventory] of toRaw(Game.getInstance().itemSystem.inventories.value)) {
      const counts = new Map<string, number>();
      for (const item of toRaw(toRaw(inventory).items)) {
        const raw = toRaw(item);
        counts.set(raw.id, (counts.get(raw.id) ?? 0) + (raw.quantity ?? 0));
      }
      out.set(id, counts);
    }
    return out;
  } catch {
    return null;
  }
}

function flushItems(): void {
  const now = countItems();
  const before = itemSnapshot;
  itemSnapshot = now;
  if (!before || !now || !log) return;
  for (const [inventoryId, counts] of now) {
    // A new inventory (a chest's loot, a new character's bag) starts as the baseline.
    const was = before.get(inventoryId);
    if (!was) continue;
    for (const [itemId, count] of counts) {
      const old = was.get(itemId) ?? 0;
      if (old !== count) devLogVar('item', itemId, old, count, inventoryId);
    }
    for (const [itemId, old] of was) {
      if (!counts.has(itemId)) devLogVar('item', itemId, old, 0, inventoryId);
    }
  }
}

// --- the run ---

function arm(): boolean {
  if (localStorage.getItem('devMode') !== 'true') return false;
  if (!devLogOn) {
    devLogOn = true;
    window.addEventListener('pagehide', onPageHide);
    // Detached: arming can happen while a component sets up, and the mirror must outlive it.
    effectScope(true).run(() => watch(devProblems, mirrorProblem, { flush: 'sync' }));
    DungeonData.onFlagChange = onFlagChange;
  }
  return true;
}

// A dungeon's data does not know its own id.
function onFlagChange(data: DungeonData, flag: string, oldValue: number | undefined, newValue: number | undefined): void {
  if (!log) return;
  const raw = toRaw(data);
  for (const [dungeonId, candidate] of Game.getInstance().dungeonSystem.dungeonDatas.value) {
    if (toRaw(candidate) === raw) {
      devLogVar('flag', `${dungeonId}.${flag}`, oldValue ?? 0, newValue ?? 0);
      return;
    }
  }
}

function loadedNote(gameId: string, slot: string): string {
  const snapshot = listSnapshots(gameId).find(s => s.slot === slot);
  if (snapshot) return `Loaded snapshot "${snapshot.name}"`;
  return slot.startsWith('__') ? 'Loaded a dev save' : `Loaded save "${slot}"`;
}

function startRun(gameId: string, note: string, place = ''): void {
  setLog({ gameId, runId: currentRunId(gameId), nextId: 1, groups: [] });
  pushGroup({ t: 'system', note, place });
  persist();
}

function replayVia(event: Extract<CheckpointEvent, { type: 'load' }>, stored: StoredLog): string {
  const marked = sessionStorage.getItem(REPLAY_VIA_KEY);
  sessionStorage.removeItem(REPLAY_VIA_KEY);
  if (marked) return marked;
  if (stored.toEditor) return 'Continue';
  // Shift+R outside a scene reloads the auto-save; PageUp there replays the newest checkpoint.
  if (event.replay === null) return 'Shift+R';
  if (event.back === 0) return stored.leftInScene === false ? 'PageUp' : 'Shift+R';
  if (event.back === 1) return 'PageUp';
  return '';
}

function onLoad(event: Extract<CheckpointEvent, { type: 'load' }>): void {
  const stored = log?.gameId === event.gameId ? log : readStored(event.gameId);
  if (!stored || stored.runId !== currentRunId(event.gameId)) {
    sessionStorage.removeItem(REPLAY_VIA_KEY);
    startRun(event.gameId, 'Log started', currentPlace());
    return;
  }
  setLog(stored);
  const via = replayVia(event, stored);
  stored.toEditor = false;
  stored.leftInScene = undefined;

  let note = 'Reloaded';
  let sceneId: string | undefined;
  if (event.replay !== null) {
    // What came after the replayed paragraph is no longer true: the replay plays it again.
    // Serials only grow along the log, so this finds the replayed paragraph, or what followed it.
    const replayed = event.replay;
    const at = stored.groups.findIndex(g => g.t === 'para' && g.cp !== undefined && g.cp >= replayed);
    if (at >= 0) {
      if (stored.groups[at].cp === replayed) sceneId = stored.groups[at].sceneId;
      stored.groups.splice(at);
    }
    note = 'Replayed';
    sceneId ??= Game.getInstance().dungeonSystem.currentSceneId.value ?? undefined;
  }
  const last = stored.groups[stored.groups.length - 1];
  if (last?.t === 'system' && last.note === note && last.place === sceneId && last.via === via) {
    last.n = (last.n ?? 1) + 1;
    last.at = Date.now();
    changed();
  } else {
    pushGroup({ t: 'system', note, place: sceneId, via });
  }
  persist();
}

onCheckpointEvent((event) => {
  if (!arm()) return;
  if (event.type === 'checkpoint') {
    if (log?.gameId !== event.gameId) return;
    const last = log.groups[log.groups.length - 1];
    if (last?.t === 'para' && last.cp === undefined) {
      last.cp = event.serial;
      changed();
    }
    return;
  }
  itemSnapshot = countItems();
  if (event.type === 'run') {
    startRun(event.gameId, event.slot ? loadedNote(event.gameId, event.slot) : 'New game', event.slot ? currentPlace() : '');
  } else {
    onLoad(event);
  }
});

function mirrorProblem(list: DevProblem[]): void {
  // Each report puts its row first: a new one, or a repeat with its count raised.
  const problem = list[0];
  if (!log || !problem) return;
  addRow(current(), { t: 'problem', kind: problem.kind, message: problem.message, n: 1 });
}

// --- hooks ---

/** A paragraph committed to play, before its actions run. */
export function devLogParagraph(sceneId: string, dungeonId: string | null, speaker: string | null, html: string): void {
  if (!log) return;
  flushItems();
  const last = log.groups[log.groups.length - 1];
  if (last?.t === 'system' && last.note === 'New game' && !last.place) last.place = currentPlace();
  paraSeq++;
  capture?.push({ t: 'para', sceneId });
  pushGroup({ t: 'para', sceneId, dungeonId, speaker, text: plainLine(html) });
}

/** A choice picked, before its actions run. */
export function devLogChoice(choiceId: string, label: string): void {
  if (!log) return;
  flushItems();
  pushGroup({ t: 'choice', choiceId, label: plainLine(label, 100) || choiceId });
}

/** A variable changed. Values compare as shown, so an equal copy of an array is no change. */
let paused = 0;

/**
 * Stop recording while a load restores the game: save migrations and `game_initiated` listeners
 * re-apply what the save already holds (every character's statuses off and on again), which is no
 * news. The replayed paragraph's own actions run before the pause, inside the core load.
 */
export function devLogPause(): void {
  paused++;
}

export function devLogResume(): void {
  if (paused) paused--;
  if (!paused && log) itemSnapshot = countItems();
}

export function devLogVar(kind: DevLogVarKind, key: string, oldValue: unknown, newValue: unknown, where?: string): void {
  if (!log || paused) return;
  const old = fmt(oldValue);
  const next = fmt(newValue);
  if (old === next) return;
  varSeq++;
  addRow(current(), { t: 'var', kind, key, where, old, new: next, n: 1 });
}

export type DevLogActionMark = { group: DevLogGroup; key: string; values: string[]; vars: number; paras: number };

/** An action about to be dispatched. Returns a mark for devLogActionEnd when its row waits on the outcome. */
export function devLogActionStart(key: string, value: unknown): DevLogActionMark | null {
  if (!log || paused) return null;
  const values = (Array.isArray(value) ? value : [value]).map(v => clip(typeof v === 'string' ? v : fmt(v), 100));
  const group = current();
  if (WRITER_ACTIONS.has(key) || JUMP_ACTIONS.has(key)) {
    return { group, key, values, vars: varSeq, paras: paraSeq };
  }
  for (const v of values) addRow(group, { t: 'action', key, value: v, n: 1 });
  return null;
}

export function devLogActionEnd(mark: DevLogActionMark): void {
  if (!log) return;
  if (JUMP_ACTIONS.has(mark.key)) {
    if (paraSeq !== mark.paras) return;
    for (const v of mark.values) addRow(mark.group, { t: 'action', key: mark.key, value: v, n: 1 });
    return;
  }
  flushItems();
  if (varSeq !== mark.vars) return;
  for (const v of mark.values) addRow(mark.group, { t: 'action', key: mark.key, value: v, same: true, n: 1 });
}

/** Count item changes made outside any action (a script, the loot screen) into the open group. */
export function devLogFlush(): void {
  if (log) flushItems();
}

/**
 * Run console input as its own group and return what it did. Without a recording run (dev mode
 * off) it just runs.
 */
export function devLogConsoleRun(input: string, run: () => void, source?: string): DevLogEvent[] {
  if (!log) {
    run();
    return [];
  }
  flushItems();
  pushGroup({ t: 'console', input: clip(input.replace(/\s+/g, ' ').trim(), 200), source });
  const events: DevLogEvent[] = [];
  const outer = capture;
  capture = events;
  try {
    run();
    flushItems();
  } finally {
    capture = outer;
  }
  return events;
}

/** Name the next replay in the log ("Back to here"), for a replay the ring alone cannot tell apart. */
export function markDevLogReplay(via: string): void {
  sessionStorage.setItem(REPLAY_VIA_KEY, via);
}

/** Shared with the Variables tab, which opens the log on a variable's history. */
export const DEV_LOG_FILTERS_KEY = 'debug-log-filters';
export type DevLogKind = 'para' | 'choice' | 'var' | 'action' | 'problem';
export const DEV_LOG_KINDS: DevLogKind[] = ['para', 'choice', 'var', 'action', 'problem'];
export const devLogFilterDefaults = () => ({ search: '', kinds: [...DEV_LOG_KINDS] });
