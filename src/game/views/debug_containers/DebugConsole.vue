<script setup lang="ts">
import { ref, computed, onMounted, shallowRef, watch, nextTick } from 'vue';
import { useStorage } from '@vueuse/core';
import { jsonrepair } from 'jsonrepair';
import Textarea from 'primevue/textarea';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import { Game } from '../../game';
import { liveAssist, type LiveAssist } from '../../utils/liveAssist';
import { devLogConsoleRun, type DevLogEvent } from '../../utils/devLog';
import type { ConditionExplanation } from '../../systems/logicSystem';
import { CHOICE_KEYS } from '../../../utility/contentVocabulary';
import type { AssistMode } from '../../../utility/dungeonEditor/assist';
import { useContentAssist, type ContentAssist, type ContentAssistProvider } from '../../../editor/views/customPopups/dungeonEditor/useContentAssist';
import AssistLayer from '../../../editor/views/customPopups/dungeonEditor/AssistLayer.vue';
import DebugClauses from './DebugClauses.vue';

type Mode = 'action' | 'condition' | 'text';

/** One line of what an action run did. */
type DoneLine =
  | { t: 'var'; kind: string; key: string; where?: string; old: string; new: string }
  | { t: 'action' | 'problem' | 'para'; text: string };

type Outcome =
  | { mode: 'action'; lines: DoneLine[]; error: string }
  | { mode: 'condition'; explanation: ConditionExplanation }
  | { mode: 'text'; speaker: string | null; html: string; actions: string[] };

type HistoryEntry = { mode: Mode; input: string; summary: string; failed?: boolean; pass?: boolean };

const MODES: { id: Mode; label: string; placeholder: string }[] = [
  { id: 'action', label: 'Action', placeholder: '{flag: "trust += 1", flash: "Hello world"}' },
  { id: 'condition', label: 'Condition', placeholder: 'trust >= 2, door_open' },
  { id: 'text', label: 'Text', placeholder: 'Trust is |flag(trust)|.if{door_open} The door is open.fi{}' },
];
const MODE_LABEL: Record<Mode, string> = { action: 'Action', condition: 'Condition', text: 'Text' };
const ASSIST_MODE: Record<Mode, AssistMode> = { action: 'actions', condition: 'condition', text: 'prose' };
const HISTORY_SIZE = 50;

const game = Game.getInstance();

const mode = useStorage<Mode>('debug-console:mode', 'action');
// A draft per mode, so switching modes does not lose what was typed.
const drafts = useStorage<Record<Mode, string>>('debug-console:drafts', { action: '', condition: '', text: '' }, localStorage, { mergeDefaults: true });
const history = useStorage<HistoryEntry[]>(`debug-console-history:${game.coreSystem.gameId}`, []);

const input = computed({
  get: () => drafts.value[mode.value] ?? '',
  set: (value: string) => { drafts.value[mode.value] = value; },
});
const outcome = shallowRef<Outcome | null>(null);

const actionNames = ref<string[]>([]);
/** Each chip's hover card: the help line and examples its action registered with. */
const actionTips = new Map<string, { value: string; escape: false; class: string }>();
const searchQuery = ref<string>('');
const filteredActionNames = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return actionNames.value;
  return actionNames.value.filter(name => name.toLowerCase().includes(query));
});

// The content editor's suggestions and hover, over what the running game knows.
// PrimeVue's Textarea renders the native element as its root.
const inputRef = ref<{ $el: HTMLTextAreaElement } | null>(null);
const inputEl = computed(() => inputRef.value?.$el ?? null);
const live = shallowRef<LiveAssist | null>(null);
const activeAssist = shallowRef<ContentAssist | null>(null);
const provider: ContentAssistProvider = {
  place: (_el, assistMode) => live.value?.place(assistMode) ?? null,
  autoOpen: ref(true),
  active: activeAssist,
};
useContentAssist(inputEl, () => ASSIST_MODE[mode.value], provider);

onMounted(() => {
  for (const [name, action] of game.logicSystem.actionRegistry) {
    const help = action.help ? escapeHtml(action.help) : '';
    const examples = action.examples?.length ? `<code class="action-tip-examples">${escapeHtml(action.examples.join('\n'))}</code>` : '';
    if (help || examples) actionTips.set(name, { value: help + examples, escape: false, class: 'action-chip-tip' });
  }
  actionNames.value = Array.from(game.logicSystem.actionRegistry.keys()).sort();
  liveAssist(game).then((l) => { live.value = l; });
});

const placeholder = computed(() => MODES.find(m => m.id === mode.value)!.placeholder);
const hint = 'Ctrl+Enter runs · ↑↓ history · Ctrl+Space suggests';

function setMode(next: Mode) {
  if (mode.value === next) return;
  mode.value = next;
  outcome.value = null;
  resetRecall();
}

// --- running ---

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

function closestAction(name: string): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const candidate of game.logicSystem.actionRegistry.keys()) {
    const distance = levenshtein(name.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= Math.max(2, Math.floor(name.length / 3)) ? best : null;
}

function describe(events: DevLogEvent[]): DoneLine[] {
  const lines: DoneLine[] = [];
  const vars = new Map<string, Extract<DoneLine, { t: 'var' }>>();
  for (const event of events) {
    if (event.t === 'var') {
      const id = `${event.kind}|${event.key}|${event.where ?? ''}`;
      const line = vars.get(id);
      if (line) {
        line.new = event.new;
      } else {
        const next = { t: 'var' as const, kind: event.kind, key: event.key, where: event.where, old: event.old, new: event.new };
        vars.set(id, next);
        lines.push(next);
      }
    } else if (event.t === 'action') {
      lines.push({ t: 'action', text: `${event.key} ${event.value}${event.same ? ' (no change)' : ''}` });
    } else if (event.t === 'problem') {
      lines.push({ t: 'problem', text: event.message });
    } else {
      lines.push({ t: 'para', text: `played ${event.sceneId}` });
    }
  }
  return lines;
}

function lineText(line: DoneLine): string {
  return line.t === 'var' ? `${line.key} ${line.old} → ${line.new}` : line.text;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runAction(text: string): HistoryEntry {
  let params: unknown;
  try {
    params = JSON.parse(jsonrepair(text));
  } catch (error) {
    return failAction(text, errorText(error));
  }
  if (!params || typeof params !== 'object' || Array.isArray(params)) {
    return failAction(text, 'Write an action object, like {flag: "met_riko = 1"}.');
  }
  const unknown = Object.keys(params).filter(key => !game.logicSystem.actionRegistry.has(key) && !(key in CHOICE_KEYS));
  if (unknown.length) {
    return failAction(text, unknown.map((key) => {
      const guess = closestAction(key);
      return `Unknown action '${key}'.${guess ? ` Did you mean ${guess}?` : ''}`;
    }).join(' '));
  }
  let thrown = '';
  const events = devLogConsoleRun(text, () => {
    try {
      game.execute(params as Record<string, any>);
    } catch (error) {
      thrown = errorText(error);
    }
  });
  const lines = describe(events);
  outcome.value = { mode: 'action', lines, error: thrown };
  const summary = thrown || (lines.length ? lines.slice(0, 3).map(lineText).join(' · ') + (lines.length > 3 ? ' …' : '') : 'Nothing changed');
  return { mode: 'action', input: text, summary, failed: !!thrown || lines.some(l => l.t === 'problem') };
}

function failAction(text: string, error: string): HistoryEntry {
  outcome.value = { mode: 'action', lines: [], error };
  return { mode: 'action', input: text, summary: error, failed: true };
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'unset';
  if (value === '') return '""';
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function runCondition(text: string): HistoryEntry {
  // `{if: …, ifOr: …}` reads as a choice's params would; anything else is one `if` clause list.
  let expression: string | Record<string, any> = text;
  if (text.startsWith('{')) {
    try {
      expression = JSON.parse(jsonrepair(text));
    } catch { /* read as a plain clause list */ }
  }
  const explanation = game.logicSystem.explainCondition(expression);
  outcome.value = { mode: 'condition', explanation };
  const clauses = explanation.groups.flatMap(g => g.clauses);
  const error = clauses.find(c => c.error && !c.skipped)?.error;
  if (explanation.throws || (error && !clauses.length)) {
    return { mode: 'condition', input: text, summary: error ?? 'Error', failed: true };
  }
  const read = clauses.filter(c => !c.skipped && !c.error).map(c => formatValue(c.value));
  const summary = `${explanation.pass ? 'True' : 'False'}${read.length ? ` · read ${read.join(', ')}` : ''}`;
  return { mode: 'condition', input: text, summary, pass: explanation.pass };
}

let plainTemplate: HTMLTemplateElement | null = null;

function plainText(html: string): string {
  plainTemplate ??= document.createElement('template');
  plainTemplate.innerHTML = html;
  return (plainTemplate.content.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function runText(text: string): HistoryEntry {
  // A record link read here must not count as the player finding it.
  const { output, actions } = game.logicSystem.resolveString(text.replace(/\[\[!/g, '[['), true);
  const talk = game.logicSystem.resolveTalkingCharacter(output);
  outcome.value = { mode: 'text', speaker: talk.id, html: talk.text, actions: Object.keys(actions) };
  const plain = plainText(talk.text);
  const summary = (talk.id ? `${talk.id}: ` : '') + (plain || '(no text)');
  return { mode: 'text', input: text, summary: summary.length > 120 ? summary.slice(0, 119) + '…' : summary };
}

function remember(entry: HistoryEntry) {
  const rest = history.value.filter(h => h.mode !== entry.mode || h.input !== entry.input);
  history.value = [entry, ...rest].slice(0, HISTORY_SIZE);
}

function run() {
  const text = input.value.trim();
  if (!text) return;
  let entry: HistoryEntry;
  try {
    entry = mode.value === 'action' ? runAction(text) : mode.value === 'condition' ? runCondition(text) : runText(text);
  } catch (error) {
    outcome.value = mode.value === 'action'
      ? { mode: 'action', lines: [], error: errorText(error) }
      : null;
    entry = { mode: mode.value, input: text, summary: errorText(error), failed: true };
  }
  remember(entry);
  resetRecall();
}

function recall(entry: HistoryEntry) {
  mode.value = entry.mode;
  input.value = entry.input;
  outcome.value = null;
  resetRecall(entry.input);
  nextTick(() => inputEl.value?.focus());
}

function rerun(entry: HistoryEntry) {
  mode.value = entry.mode;
  input.value = entry.input;
  run();
}

function clearHistory() {
  history.value = [];
}

// --- ↑/↓ through this mode's history, while the input is empty or still the entry recalled ---

const cursor = ref(-1);
const recalled = ref('');
const modeHistory = computed(() => history.value.filter(h => h.mode === mode.value));

function resetRecall(text = '') {
  cursor.value = -1;
  recalled.value = text;
}

watch(input, (text) => {
  if (text !== recalled.value) resetRecall();
});

function onKeydown(event: KeyboardEvent) {
  // The suggestion list took the key.
  if (event.defaultPrevented) return;
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    run();
    return;
  }
  if (event.key === 'Escape') {
    // Handled here: the game opens its menu on an Escape left unhandled.
    event.preventDefault();
    (event.target as HTMLElement).blur();
    return;
  }
  if ((event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const text = input.value;
  if (text !== '' && text !== recalled.value) return;
  const list = modeHistory.value;
  if (!list.length) return;
  event.preventDefault();
  const next = Math.min(list.length - 1, cursor.value + (event.key === 'ArrowUp' ? 1 : -1));
  if (next < 0) {
    resetRecall();
    input.value = '';
    return;
  }
  const entry = list[next];
  recalled.value = entry.input;
  input.value = entry.input;
  cursor.value = next;
}

// --- the action list ---

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function insertAction(name: string) {
  const text = input.value.trim();
  if (!text) {
    input.value = `{ ${name}: "_placeholder_" }`;
    return;
  }
  try {
    const obj = JSON.parse(jsonrepair(text));
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      obj[name] = '_placeholder_';
      input.value = JSON.stringify(obj, null, 2);
      return;
    }
  } catch { }
  input.value = `${text}\n${name}: "_placeholder_"`;
}

const groupsLabel = computed(() => {
  if (outcome.value?.mode !== 'condition') return '';
  const groups = outcome.value.explanation.groups;
  if (groups.length !== 1) return 'every group must hold';
  return groups[0].mode === 'all' ? 'every clause must hold' : 'one clause is enough';
});
</script>

<template>
  <div class="debug-console">
    <div class="modes" role="tablist">
      <button v-for="m in MODES" :key="m.id" role="tab" class="mode" :class="{ active: mode === m.id }"
        :aria-selected="mode === m.id" @click="setMode(m.id)">{{ m.label }}</button>
    </div>

    <Textarea ref="inputRef" v-model="input" rows="3" autoResize class="console-input" spellcheck="false"
      :placeholder="placeholder" @focus="live?.refresh()" @keydown="onKeydown" />
    <AssistLayer v-if="activeAssist" :state="activeAssist" />
    <div class="console-hint">{{ hint }}</div>
    <div>
      <Button label="Run" size="small" severity="success" :disabled="!input.trim()" @click="run" />
    </div>

    <!-- What the last run did -->
    <div v-if="outcome?.mode === 'action'" class="result" :class="outcome.error ? 'result-fail' : 'result-pass'">
      <div v-if="outcome.error" class="result-error">{{ outcome.error }}</div>
      <div v-for="(line, i) in outcome.lines" :key="i" class="done-line" :class="`done-${line.t}`">
        <template v-if="line.t === 'var'">
          <span class="tag">{{ line.kind }}</span>
          <span class="done-body">{{ line.key }} <s class="old">{{ line.old }}</s> → <strong>{{ line.new }}</strong>
            <span v-if="line.where" class="faint where">· {{ line.where }}</span></span>
        </template>
        <span v-else class="done-body">{{ line.text }}</span>
      </div>
      <div v-if="!outcome.error && !outcome.lines.length" class="faint">Ran. Nothing changed.</div>
    </div>

    <div v-else-if="outcome?.mode === 'condition'" class="result"
      :class="outcome.explanation.pass ? 'result-pass' : 'result-fail'">
      <div class="result-top">
        <span class="pill" :class="outcome.explanation.pass ? 'pill-pass' : 'pill-fail'">
          {{ outcome.explanation.throws ? 'Error' : outcome.explanation.pass ? 'True' : 'False' }}</span>
        <span class="faint">{{ groupsLabel }}</span>
      </div>
      <DebugClauses :groups="outcome.explanation.groups" />
    </div>

    <div v-else-if="outcome?.mode === 'text'" class="result result-text">
      <div class="rendered">
        <strong v-if="outcome.speaker" class="speaker">{{ outcome.speaker }}: </strong>
        <span v-if="outcome.html" v-html="outcome.html"></span>
        <span v-else class="faint">(no text)</span>
      </div>
      <div v-if="outcome.actions.length" class="faint">Not run: {{ outcome.actions.join(', ') }}</div>
    </div>

    <template v-if="history.length">
      <div class="section-head">
        <span>History</span>
        <button class="link-button" @click="clearHistory">Clear</button>
      </div>
      <div class="history">
        <div v-for="(entry, i) in history" :key="i" class="history-entry" title="Put it back in the input"
          @click="recall(entry)">
          <div class="history-top">
            <span class="mode-chip" :class="`chip-${entry.mode}`">{{ MODE_LABEL[entry.mode] }}</span>
            <code class="history-input">{{ entry.input }}</code>
            <button class="icon-button" v-tooltip.left="'Run again'" @click.stop="rerun(entry)">
              <i class="pi pi-replay"></i>
            </button>
          </div>
          <div class="history-summary" :class="{ failed: entry.failed, passed: entry.pass }">→ {{ entry.summary }}</div>
        </div>
      </div>
    </template>

    <details v-if="mode === 'action'" class="all-actions">
      <summary>All actions ({{ actionNames.length }})</summary>
      <div class="search-toolbar">
        <InputText v-model="searchQuery" class="search-input" placeholder="Search actions" />
        <span v-if="searchQuery" class="search-clear" @click="searchQuery = ''">✕</span>
      </div>
      <div class="action-list">
        <button v-for="name in filteredActionNames" :key="name" type="button" class="action-chip"
          v-tooltip.top="actionTips.get(name)" @click="insertAction(name)">
          {{ name }}
        </button>
        <div v-if="!filteredActionNames.length" class="faint">No actions match your search</div>
      </div>
    </details>

    <p class="footer-hint">History is kept per game, the last {{ HISTORY_SIZE }}.</p>
  </div>
</template>

<style scoped>
/* Painted against the host debug panel (Debug.vue), which follows the editor's theme. */
.debug-console {
  --pass: #3c9a5f;
  --fail: #d9534f;

  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  color: var(--editor-text);
  font-size: 0.875rem;
}

.modes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid var(--editor-border-strong);
  border-radius: 6px;
  overflow: hidden;
}

.mode {
  padding: 0.35rem 0.5rem;
  border: none;
  border-left: 1px solid var(--editor-border-strong);
  background: var(--dp-control, var(--editor-surface-sunken));
  color: var(--editor-text);
  font-weight: 600;
  cursor: pointer;
}

.mode:first-child {
  border-left: none;
}

.mode:hover {
  background: var(--dp-control-hover, var(--editor-surface));
}

.mode.active {
  background: var(--editor-text);
  color: var(--dp-content-bg, var(--editor-surface));
}

.console-input {
  width: 100%;
  font-family: monospace;
  font-size: 0.85rem;
}

.console-hint,
.faint {
  color: var(--editor-text-faint);
  font-size: 0.85em;
}

.result {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.45rem 0.5rem;
  border: 1px solid var(--dp-border, var(--editor-border));
  border-left: 4px solid var(--editor-border-strong);
  border-radius: 4px;
  background: var(--dp-control, var(--editor-surface-sunken));
  min-width: 0;
}

.result-pass {
  border-left-color: var(--pass);
}

.result-fail {
  border-left-color: var(--fail);
}

.result-text {
  border-left-color: var(--editor-ink-blue);
}

.result-error {
  color: var(--fail);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.result-top {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.pill {
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
}

.pill-pass {
  background: var(--pass);
}

.pill-fail {
  background: var(--fail);
}

.done-line {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  min-width: 0;
}

.done-body {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.done-problem {
  color: var(--fail);
}

.done-para {
  color: var(--editor-text-muted);
}

.tag {
  flex-shrink: 0;
  padding: 0 0.3rem;
  border-radius: 3px;
  background: color-mix(in srgb, var(--editor-ink-blue) 14%, transparent);
  color: var(--editor-ink-blue);
  font-family: monospace;
  font-size: 0.9em;
  font-weight: 700;
}

.old {
  color: var(--editor-text-faint);
}

.where {
  margin-left: 0.3em;
}

.rendered {
  overflow-wrap: anywhere;
  line-height: 1.45;
}

.speaker {
  color: var(--editor-ink-teal);
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: 0.4rem;
  color: var(--editor-text-muted);
  font-size: 0.8em;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.link-button {
  border: none;
  background: transparent;
  color: var(--editor-text-faint);
  font-size: 0.95em;
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
  cursor: pointer;
}

.link-button:hover {
  color: var(--editor-text);
  text-decoration: underline;
}

.history {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.history-entry {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--dp-border, var(--editor-border));
  border-radius: 4px;
  background: var(--dp-control, var(--editor-surface-sunken));
  cursor: pointer;
  min-width: 0;
}

.history-entry:hover {
  border-color: var(--dp-border-hover, var(--editor-border-strong));
}

.history-top {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  min-width: 0;
}

.mode-chip {
  flex-shrink: 0;
  padding: 0 0.4rem;
  border-radius: 999px;
  color: #fff;
  font-size: 0.75em;
  font-weight: 700;
  line-height: 1.5;
}

.chip-action {
  background: var(--editor-ink-purple);
}

.chip-condition {
  background: var(--editor-ink-blue);
}

.chip-text {
  background: #64748b;
}

.editor-dark .mode-chip {
  color: #111;
}

.editor-dark .chip-text {
  background: #94a3b8;
}

.history-input {
  flex: 1;
  min-width: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 0.85em;
  word-break: break-all;
}

.history-summary {
  padding-left: 0.2rem;
  color: var(--editor-text-muted);
  overflow-wrap: anywhere;
}

.history-summary.passed {
  color: var(--pass);
}

.history-summary.failed {
  color: var(--fail);
}

.icon-button {
  flex-shrink: 0;
  padding: 0.1rem 0.3rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--editor-text-muted);
  font-size: 0.85em;
  cursor: pointer;
}

.icon-button:hover {
  background: var(--editor-surface-hover);
  color: var(--editor-text);
}

.all-actions summary {
  color: var(--editor-text-muted);
  cursor: pointer;
  user-select: none;
}

.search-toolbar {
  position: relative;
  display: flex;
  align-items: center;
  margin-top: 0.4rem;
}

.search-input {
  width: 100%;
  padding-right: 2rem;
}

.search-clear {
  position: absolute;
  right: 0.75rem;
  cursor: pointer;
  color: var(--editor-text-faint);
  padding: 0.25rem;
  line-height: 1;
  user-select: none;
}

.search-clear:hover {
  color: var(--editor-text);
}

.action-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.4rem;
}

.action-chip {
  padding: 0.2rem 0.5rem;
  background: var(--dp-control, var(--editor-surface-sunken));
  color: var(--editor-text);
  border: 1px solid var(--dp-border, var(--editor-border));
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-family: monospace;
  cursor: pointer;
}

.action-chip:hover {
  border-color: var(--dp-border-hover, var(--editor-border-strong));
  background: var(--dp-control-hover, var(--editor-surface));
}

.footer-hint {
  margin: 0;
  color: var(--editor-text-muted);
  font-size: 0.85em;
}
</style>

<style>
/* The chip's hover card is teleported out of this component. */
.p-tooltip.action-chip-tip {
  max-width: 26rem;
}

.action-chip-tip .action-tip-examples {
  display: block;
  margin-top: 0.45rem;
  font-family: monospace;
  font-size: 0.85em;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
