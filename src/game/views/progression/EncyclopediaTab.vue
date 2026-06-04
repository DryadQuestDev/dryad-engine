<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Game } from '../../game';

const game = Game.getInstance();
const narrative = game.narrativeSystem;

const trees = computed(() => game.getEncyclopediaTrees());

// Selection lives on narrativeSystem (auto-persisted by the save system). Aliased here
// for shorter access; template auto-unwraps top-level refs.
const selectedTreeId = narrative.selectedEncyclopediaTreeId;
const selectedRecordId = narrative.selectedEncyclopediaRecordId;
const collapsedGroups = ref<Set<string>>(new Set());
const searchQuery = ref('');

const isSearching = computed(() => searchQuery.value.trim().length > 0);

function stripHtml(s: string): string {
    return s.replace(/<[^>]*>/g, '');
}

// Search results across all trees, discovered records only. Each record is listed under
// its first owning tree (no duplicates).
const searchResults = computed((): { treeId: string; treeName: string; recordId: string }[] => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return [];
    const results: { treeId: string; treeName: string; recordId: string }[] = [];
    const seen = new Set<string>();
    for (const tree of trees.value) {
        for (const group of tree.groups || []) {
            for (const entry of group.records || []) {
                const recordId = entry.record;
                if (seen.has(recordId)) continue;
                if (!narrative.isRecordDiscovered(recordId)) continue;
                const r = narrative.getRecord(recordId);
                if (!r) continue;
                // Search only what the encyclopedia actually displays: content if present, else summary.
                const displayText = r.content || r.summary || '';
                const haystack = [
                    r.title,
                    stripHtml(displayText),
                    (r.tags || []).join(' '),
                ].join(' ').toLowerCase();
                if (haystack.includes(q)) {
                    seen.add(recordId);
                    results.push({ treeId: tree.id, treeName: tree.tab, recordId });
                }
            }
        }
    }
    return results;
});

const groupedSearchResults = computed(() => {
    const map = new Map<string, { treeName: string; records: string[] }>();
    for (const r of searchResults.value) {
        let bucket = map.get(r.treeId);
        if (!bucket) {
            bucket = { treeName: r.treeName, records: [] };
            map.set(r.treeId, bucket);
        }
        bucket.records.push(r.recordId);
    }
    return [...map.entries()].map(([treeId, b]) => ({ treeId, treeName: b.treeName, records: b.records }));
});

function clearSearch() {
    searchQuery.value = '';
}

// Browser-style back/forward navigation history.
type HistoryEntry = { treeId: string | null; recordId: string | null };
const history = ref<HistoryEntry[]>([]);
const historyIndex = ref(-1);
let isNavigatingHistory = false;

const canGoBack = computed(() => historyIndex.value > 0);
const canGoForward = computed(() => historyIndex.value < history.value.length - 1);

function pushHistory(entry: HistoryEntry) {
    if (isNavigatingHistory) return;
    history.value = history.value.slice(0, historyIndex.value + 1);
    const top = history.value[historyIndex.value];
    if (top && top.treeId === entry.treeId && top.recordId === entry.recordId) return;
    history.value.push(entry);
    historyIndex.value = history.value.length - 1;
}

function applyEntry(entry: HistoryEntry) {
    isNavigatingHistory = true;
    try {
        selectedTreeId.value = entry.treeId;
        selectedRecordId.value = entry.recordId;
    } finally {
        isNavigatingHistory = false;
    }
}

function goBack() {
    if (!canGoBack.value) return;
    historyIndex.value--;
    applyEntry(history.value[historyIndex.value]);
}

function goForward() {
    if (!canGoForward.value) return;
    historyIndex.value++;
    applyEntry(history.value[historyIndex.value]);
}

const selectedTree = computed(() => trees.value.find(t => t.id === selectedTreeId.value) || null);

const selectedRecord = computed(() => {
    if (!selectedRecordId.value) return null;
    return narrative.getRecord(selectedRecordId.value);
});

const isSelectedDiscovered = computed(() => {
    return selectedRecordId.value ? narrative.isRecordDiscovered(selectedRecordId.value) : false;
});

const contentSource = computed(() => {
    const r = selectedRecord.value;
    if (!r) return '';
    return r.content || r.summary || '';
});

// Validate the persisted selection against the current data. Tree falls back if missing;
// record id is cleared if the record was deleted or is no longer discovered.
// If no record ends up selected (fresh game, stale save, etc.), auto-pick the first
// discovered record in the current tree so the right pane isn't empty.
watch(trees, (list) => {
    if (!selectedTreeId.value || !list.some(t => t.id === selectedTreeId.value)) {
        selectedTreeId.value = list[0]?.id ?? null;
        selectedRecordId.value = null;
    }
    if (selectedRecordId.value) {
        const r = narrative.getRecord(selectedRecordId.value);
        if (!r || !narrative.isRecordDiscovered(selectedRecordId.value)) {
            selectedRecordId.value = null;
        }
    }
    if (selectedTreeId.value && !selectedRecordId.value) {
        selectedRecordId.value = findFirstDiscoveredRecord(selectedTreeId.value);
    }
}, { immediate: true });

// Seed the in-memory navigation history on first run with the current selection.
if (history.value.length === 0 && selectedTreeId.value) {
    pushHistory({ treeId: selectedTreeId.value, recordId: selectedRecordId.value });
}

/** First discovered record in this tree's groups, or null if none. */
function findFirstDiscoveredRecord(treeId: string): string | null {
    const tree = trees.value.find(t => t.id === treeId);
    if (!tree) return null;
    for (const group of tree.groups || []) {
        for (const entry of group.records || []) {
            if (narrative.isRecordDiscovered(entry.record)) return entry.record;
        }
    }
    return null;
}

function selectTree(treeId: string) {
    selectedTreeId.value = treeId;
    selectedRecordId.value = findFirstDiscoveredRecord(treeId);
    pushHistory({ treeId, recordId: selectedRecordId.value });
}

function selectRecord(recordId: string) {
    if (!narrative.isRecordDiscovered(recordId)) return;
    // If the record lives in a different tree, switch to that tree first so the
    // sidebar reflects where the entry actually sits. Owning tree is precomputed in narrativeSystem.encyclopediaRecordIndex.
    const currentTree = selectedTree.value;
    const inCurrent = currentTree?.groups?.some(g => (g.records || []).some(r => r.record === recordId)) ?? false;
    if (!inCurrent) {
        const owningTree = narrative.encyclopediaRecordIndex.get(recordId)?.treeId;
        if (owningTree) selectedTreeId.value = owningTree;
    }
    selectedRecordId.value = recordId;
    pushHistory({ treeId: selectedTreeId.value, recordId });
}

function toggleGroup(treeId: string, groupName: string) {
    const key = `${treeId}::${groupName}`;
    if (collapsedGroups.value.has(key)) {
        collapsedGroups.value.delete(key);
    } else {
        collapsedGroups.value.add(key);
    }
    collapsedGroups.value = new Set(collapsedGroups.value);
}

function isGroupCollapsed(treeId: string, groupName: string): boolean {
    return collapsedGroups.value.has(`${treeId}::${groupName}`);
}

function getRecordTitle(recordId: string): string {
    const r = narrative.getRecord(recordId);
    if (!r) return recordId;
    if (!narrative.isRecordDiscovered(recordId)) return '???';
    return r.title;
}

function onLinkNavigate(recordId: string) {
    selectRecord(recordId);
}
</script>

<template>
    <div class="encyclopedia-tab">
        <div class="encyclopedia-container">
            <div class="encyclopedia-sidebar">
                <div class="history-nav">
                    <button class="history-arrow" :disabled="!canGoBack" @click="goBack" aria-label="Back">
                        <i class="pi pi-arrow-left"></i>
                    </button>
                    <button class="history-arrow" :disabled="!canGoForward" @click="goForward" aria-label="Forward">
                        <i class="pi pi-arrow-right"></i>
                    </button>
                </div>
                <div class="search-bar">
                    <i class="pi pi-search search-icon"></i>
                    <input v-model="searchQuery" type="text" class="search-input"
                        placeholder="Search discovered entries..." />
                    <button v-if="isSearching" class="search-clear" @click="clearSearch" aria-label="Clear search">
                        <i class="pi pi-times"></i>
                    </button>
                </div>

                <div v-if="!isSearching" class="tab-badges">
                    <button v-for="tree in trees" :key="tree.id" class="tab-badge" v-bind="{ 'data-text': tree.tab }"
                        :class="{ selected: tree.id === selectedTreeId }" @click="selectTree(tree.id)">
                        {{ tree.tab }}
                    </button>
                </div>

                <div class="group-list">
                    <!-- Search results view -->
                    <template v-if="isSearching">
                        <div v-for="bucket in groupedSearchResults" :key="bucket.treeId" class="group">
                            <div class="group-header">
                                <span class="group-name">{{ bucket.treeName }}</span>
                            </div>
                            <div class="record-list">
                                <div v-for="recordId in bucket.records" :key="recordId" class="record-item"
                                    :class="{ selected: recordId === selectedRecordId }"
                                    @click="selectRecord(recordId)">
                                    {{ getRecordTitle(recordId) }}
                                </div>
                            </div>
                        </div>
                        <div v-if="groupedSearchResults.length === 0" class="empty">
                            No matches.
                        </div>
                    </template>

                    <!-- Default tree view -->
                    <template v-else-if="selectedTree">
                        <div v-for="group in selectedTree.groups || []" :key="group.name" class="group">
                            <div class="group-header"
                                :class="{ collapsed: isGroupCollapsed(selectedTree.id, group.name) }"
                                @click="toggleGroup(selectedTree.id, group.name)">
                                <span class="collapse-icon"></span>
                                <span class="group-name">{{ group.name }}</span>
                            </div>
                            <div v-if="!isGroupCollapsed(selectedTree.id, group.name)" class="record-list">
                                <div v-for="entry in group.records || []" :key="entry.record" class="record-item"
                                    :class="{
                                        selected: entry.record === selectedRecordId,
                                        locked: !narrative.isRecordDiscovered(entry.record),
                                    }" @click="selectRecord(entry.record)">
                                    {{ getRecordTitle(entry.record) }}
                                </div>
                            </div>
                        </div>
                    </template>

                    <div v-if="trees.length === 0" class="empty">
                        No encyclopedia entries yet.
                    </div>
                </div>
            </div>

            <div class="encyclopedia-content">
                <div v-if="selectedRecord && isSelectedDiscovered">
                    <img v-if="selectedRecord.image" :src="selectedRecord.image" class="record-image" />
                    <h2 class="record-title">{{ selectedRecord.title }}</h2>
                    <div v-script="{ html: contentSource, navMode: true, onNavigate: onLinkNavigate }"
                        class="record-body"></div>
                </div>
                <div v-else class="no-selection">
                    Select a record to view details.
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.encyclopedia-tab {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
}

.encyclopedia-container {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 20px;
    height: 100%;
    overflow: hidden;
}

.encyclopedia-sidebar {
    display: flex;
    flex-direction: column;
    background-color: #1a1a1a;
    border-right: 2px solid #3a3a3a;
    overflow: hidden;
}

.history-nav {
    display: flex;
    gap: 6px;
    padding: 8px 12px 0;
    background-color: #252525;
}

.history-arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background-color: #2a2a2a;
    color: #d1d5db;
    border: 1px solid #3a3a3a;
    cursor: pointer;
    transition: all 0.15s;
    font-size: 0.8em;
}

.history-arrow:hover:not(:disabled) {
    background-color: #333;
    border-color: var(--theme-primary, #5dadec);
    color: var(--theme-primary, #5dadec);
}

.history-arrow:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}

.search-bar {
    position: relative;
    display: flex;
    align-items: center;
    padding: 8px 12px;
    background-color: #252525;
}

.search-icon {
    position: absolute;
    left: 22px;
    color: #6b7280;
    font-size: 0.85em;
    pointer-events: none;
}

.search-input {
    flex: 1;
    padding: 6px 28px 6px 28px;
    border-radius: 6px;
    background-color: #2a2a2a;
    border: 1px solid #3a3a3a;
    color: #d1d5db;
    font-size: 0.85em;
    outline: none;
    transition: border-color 0.15s;
}

.search-input:focus {
    border-color: var(--theme-primary, #5dadec);
}

.search-input::placeholder {
    color: #6b7280;
}

.search-clear {
    position: absolute;
    right: 18px;
    background: transparent;
    border: none;
    color: #9ca3af;
    cursor: pointer;
    padding: 2px 4px;
    font-size: 0.8em;
    border-radius: 4px;
}

.search-clear:hover {
    color: var(--theme-primary, #5dadec);
    background-color: #333;
}

.tab-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 12px;
    border-bottom: 2px solid #3a3a3a;
    background-color: #252525;
}

.tab-badge {
    padding: 6px 12px;
    border-radius: 999px;
    background-color: #2a2a2a;
    color: #d1d5db;
    border: 1px solid #3a3a3a;
    font-size: 0.85em;
    cursor: pointer;
    transition: all 0.15s;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

/* Reserve width for the bold (selected) version of the label so the chip's
   width stays constant across selected / deselected states. The pseudo is
   zero-height and hidden, but its bold text still contributes to width. */
.tab-badge::before {
    content: attr(data-text);
    height: 0;
    visibility: hidden;
    overflow: hidden;
    user-select: none;
    pointer-events: none;
    font-weight: 600;
}

.tab-badge:hover {
    background-color: #333;
    border-color: var(--theme-primary, #5dadec);
}

.tab-badge.selected {
    background-color: var(--theme-primary, #5dadec);
    color: #1a1a1a;
    border-color: var(--theme-primary, #5dadec);
    font-weight: 600;
}

.group-list {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
}

.group {
    margin-bottom: 12px;
}

.group-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    background-color: #252525;
    border: 1px solid #3a3a3a;
    cursor: pointer;
    user-select: none;
}

.group-header:hover {
    background-color: #2a2a2a;
}

.collapse-icon {
    color: #9ca3af;
    font-size: 0.75em;
    min-width: 12px;
}

.collapse-icon::before {
    content: '▼';
}

.group-header.collapsed .collapse-icon::before {
    content: '▶';
}

.group-name {
    color: #e5e7eb;
    font-weight: 600;
}

.record-list {
    padding: 4px 0 4px 16px;
}

.record-item {
    padding: 6px 10px;
    margin: 2px 0;
    color: #d1d5db;
    cursor: pointer;
    border-left: 3px solid transparent;
    transition: all 0.15s;
}

.record-item:hover {
    background-color: #2a2a2a;
    border-left-color: var(--theme-primary, #5dadec);
}

.record-item.selected {
    background-color: #3a3a3a;
    border-left-color: var(--theme-primary, #5dadec);
}

.record-item.locked {
    color: #6b7280;
    font-style: italic;
    cursor: not-allowed;
}

.record-item.locked:hover {
    background-color: transparent;
    border-left-color: transparent;
}

.encyclopedia-content {
    max-width: 900px;
    overflow-y: auto;
    padding: 24px 28px;
    background-color: #1a1a1a;
}

.record-image {
    max-width: 100%;
    max-height: 300px;
    margin-bottom: 16px;
    border-radius: 6px;
    border: 1px solid #3a3a3a;
}

.record-title {
    font-size: 1.8em;
    color: var(--theme-primary, #5dadec);
    margin: 0 0 16px 0;
    padding-bottom: 10px;
    border-bottom: 2px solid #3a3a3a;
}

.record-body {
    color: #d1d5db;
    line-height: 1.7;
}

.no-selection,
.empty {
    color: #6b7280;
    font-style: italic;
    text-align: center;
    padding: 40px 20px;
}
</style>
