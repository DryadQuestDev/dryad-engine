<script setup lang="ts">
import { Global } from '../global';
import { Editor as EngineEditor } from '../../editor/editor';
import { Game } from '../../game/game';
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useStorage } from '@vueuse/core';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';
import Select from 'primevue/select';

const global = Global.getInstance();

// Initialize markdown parser with syntax highlighting
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value;
      } catch (__) { }
    }
    return ''; // use external default escaping
  }
});

// Normalize text for search/highlight (handles Unicode characters like non-breaking hyphens)
function normalizeForSearch(text: string): string {
  return text
    .replace(/[\u2010-\u2015\u2212]/g, '-') // various hyphens → regular hyphen
    .replace(/[\u2018\u2019]/g, "'")        // smart quotes → straight
    .replace(/[\u201C\u201D]/g, '"')        // smart double quotes
    .replace(/\u00A0/g, ' ')                // non-breaking space
    .toLowerCase();
}

// Plugin docs entry
interface DocPlugin {
  id: string;
  name: string;
  basePath: string;
  order: number;
  isActive: boolean;
}

// Viewer type from global state
const viewerType = computed(() => global.openViewer.value || 'docs');
const isChangelog = computed(() => viewerType.value === 'changelog');
const isDocsMode = computed(() => !isChangelog.value);

// Plugin docs state
const availableDocPlugins = ref<DocPlugin[]>([]);
const selectedPluginId = useStorage('docs-selected-plugin', '');
const selectedPlugin = computed(() => availableDocPlugins.value.find(p => p.id === selectedPluginId.value));

// Tree and headers (loaded dynamically per plugin or auto-discovered for changelog)
const currentTree = ref<Record<string, string[]>>({});
const headersMap = ref<Record<string, string>>({});

// Active tab storage (per-plugin key for docs, hardcoded key for changelog)
const docsActiveTab = ref('');
const changelogActiveTab = useStorage('changelog-active-tab', '');

function getDocsStorageKey(): string {
  return `docs-active-tab-${selectedPluginId.value || 'default'}`;
}

function saveDocsActiveTab(val: string) {
  docsActiveTab.value = val;
  try { localStorage.setItem(getDocsStorageKey(), val); } catch {}
}

function restoreDocsActiveTab() {
  try {
    docsActiveTab.value = localStorage.getItem(getDocsStorageKey()) || '';
  } catch {
    docsActiveTab.value = '';
  }
}

const activeTab = computed({
  get: () => isChangelog.value ? changelogActiveTab.value : docsActiveTab.value,
  set: (val) => {
    if (isChangelog.value) {
      changelogActiveTab.value = val;
    } else {
      saveDocsActiveTab(val);
    }
  }
});

// State management
const collapsedGroups = ref(new Set<string>());
const docContent = ref('');
const isLoading = ref(false);
const loadError = ref('');
const contentContainerRef = ref<HTMLElement | null>(null);
const sidebarRef = ref<HTMLElement | null>(null);

// Language state
const pluginLanguages = ref<string[]>([]);
const docsLanguage = useStorage('docs-language', '');
const isLoadingTree = ref(false);

const currentLanguage = computed(() => {
  return docsLanguage.value || global.selectedLanguage || 'en';
});

// Filesystem validation state
const existingPages = ref<Set<string>>(new Set());
const orphanedFiles = ref<string[]>([]);

// Search state
const searchQuery = ref('');
const searchResults = ref<any[]>([]);
const isSearching = ref(false);
const showSearchResults = ref(false);
const highlightTerm = ref('');
const searchContainerRef = ref<HTMLElement | null>(null);

// Title: plugin name for docs, locale string for changelog
const viewerTitle = computed(() => {
  if (isChangelog.value) return global.getString('changelog') || 'Changelog';
  return selectedPlugin.value?.name || 'Documentation';
});

// Pick the best language from available languages
function pickBestLanguage(available: string[]): string {
  if (!available.length) return 'en';
  const preferred = docsLanguage.value || global.selectedLanguage || 'en';
  if (available.includes(preferred)) return preferred;
  if (available.includes('en')) return 'en';
  return available[0];
}

// Get header display text for a category or page
function getHeader(key: string): string {
  return headersMap.value[key] || key;
}

// Get base path for the current doc content (for readDocFile/searchDocs)
function getCurrentBasePath(): string {
  if (isChangelog.value) return 'engine_files/changelog';
  return selectedPlugin.value?.basePath || '';
}

// ============================================
// Plugin Discovery
// ============================================

async function loadAvailableDocPlugins() {
  const plugins: DocPlugin[] = [];
  const engineState = global.engineState.value;

  // Get activated plugin IDs
  let activatedIds: string[] = [];
  if (engineState === 'editor') {
    try {
      activatedIds = EngineEditor.getInstance().pluginManager.pluginList.value || [];
    } catch { activatedIds = []; }
  } else if (engineState === 'game') {
    try {
      activatedIds = Game.getInstance().coreSystem.mergedManifest?.plugins || [];
    } catch { activatedIds = []; }
  }

  // Scan global plugins for docs/ subfolder
  try {
    const globalPluginIds = await global.listFolders('engine_files/plugins');
    for (const pluginId of globalPluginIds) {
      const docsPath = `engine_files/plugins/${pluginId}/docs`;
      const hasDocs = await global.pathExists(docsPath);
      if (hasDocs) {
        let name = pluginId;
        let order = 0;
        try {
          const json = await global.readJson(`engine_files/plugins/${pluginId}/plugin.json`);
          if (json?.name) name = json.name;
          if (json?.order) order = json.order;
        } catch { }
        plugins.push({ id: pluginId, name, basePath: docsPath, order, isActive: activatedIds.includes(pluginId) });
      }
    }
  } catch { }

  // Scan game/mod plugins for docs/ subfolder (editor/game context only)
  if (engineState === 'editor') {
    try {
      const editor = EngineEditor.getInstance();
      if (editor.selectedGame && editor.selectedMod) {
        for (const modId of editor.getModList(editor.selectedMod)) {
          const basePath = `games_files/${editor.selectedGame}/${modId}/plugins`;
          const modPluginIds = await global.listFolders(basePath);
          for (const pluginId of modPluginIds) {
            // Skip if already found as global plugin
            if (plugins.some(p => p.id === pluginId)) continue;
            const docsPath = `${basePath}/${pluginId}/docs`;
            const hasDocs = await global.pathExists(docsPath);
            if (hasDocs) {
              let name = pluginId;
              let order = 0;
              try {
                const json = await global.readJson(`${basePath}/${pluginId}/plugin.json`);
                if (json?.name) name = json.name;
                if (json?.order) order = json.order;
              } catch { }
              plugins.push({ id: pluginId, name, basePath: docsPath, order, isActive: activatedIds.includes(pluginId) });
            }
          }
        }
      }
    } catch { }
  }

  // Sort: activated first (by order), then non-activated (by order)
  plugins.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    return (a.order || 0) - (b.order || 0);
  });

  availableDocPlugins.value = plugins;

  // Restore last selected plugin, or fall back to first
  if (plugins.length > 0) {
    if (!selectedPluginId.value || !plugins.some(p => p.id === selectedPluginId.value)) {
      selectedPluginId.value = plugins[0].id;
    }
  }
}

// ============================================
// Changelog Auto-discovery
// ============================================

async function loadChangelogTree() {
  isLoadingTree.value = true;
  currentTree.value = {};
  headersMap.value = {};

  try {
    const basePath = 'engine_files/changelog';
    try { pluginLanguages.value = await global.listFolders(basePath); }
    catch { pluginLanguages.value = ['en']; }
    const lang = currentLanguage.value;
    let versionFolders: string[] = [];
    try {
      versionFolders = await global.listFolders(`${basePath}/${lang}`);
    } catch {
      // Try 'en' fallback
      versionFolders = await global.listFolders(`${basePath}/en`);
    }

    // Sort by semver descending (latest first)
    versionFolders.sort((a, b) => {
      const partsA = a.split('.').map(Number);
      const partsB = b.split('.').map(Number);
      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const diff = (partsB[i] || 0) - (partsA[i] || 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });

    const tree: Record<string, string[]> = {};
    for (const folder of versionFolders) {
      try {
        const files = await global.listFiles(`${basePath}/${lang}/${folder}`);
        const pages = files
          .filter((f: string) => f.endsWith('.md'))
          .map((f: string) => f.replace('.md', ''))
          .sort((a: string, b: string) => {
            // Sort sub-versions descending
            const partsA = a.split('.').map(Number);
            const partsB = b.split('.').map(Number);
            for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
              const diff = (partsB[i] || 0) - (partsA[i] || 0);
              if (diff !== 0) return diff;
            }
            return 0;
          });
        if (pages.length > 0) {
          tree[folder] = pages;
        }
      } catch { }
    }

    currentTree.value = tree;

    // Populate existingPages so nav items don't get inactive styling
    existingPages.value = new Set();
    for (const [folder, pages] of Object.entries(tree)) {
      pages.forEach(page => existingPages.value.add(`${folder}/${page}`));
    }

    // Auto-select first entry if no active tab
    if (!changelogActiveTab.value || !Object.keys(tree).length) {
      const firstCategory = Object.keys(tree)[0];
      const firstPage = tree[firstCategory]?.[0];
      if (firstCategory && firstPage) {
        changelogActiveTab.value = `${firstCategory}/${firstPage}`;
      }
    }
  } catch (error) {
    console.error('Error loading changelog tree:', error);
  } finally {
    isLoadingTree.value = false;
  }
}

// ============================================
// Plugin Selection & Tree Loading
// ============================================

async function onPluginSelected() {
  const plugin = selectedPlugin.value;
  if (!plugin) return;

  isLoadingTree.value = true;

  try {
    // Load available languages for this plugin
    pluginLanguages.value = await global.listFolders(plugin.basePath);
    const lang = pickBestLanguage(pluginLanguages.value);

    // Load tree.json
    try {
      currentTree.value = await global.readJson(`${plugin.basePath}/tree.json`) || {};
    } catch {
      currentTree.value = {};
    }

    // Load headers.json
    try {
      headersMap.value = await global.readJson(`${plugin.basePath}/${lang}/headers.json`) || {};
    } catch {
      headersMap.value = {};
    }

    // Validate tree against filesystem
    await validateDocsTree();

    // Restore saved tab for this plugin, fall back to first doc if invalid
    restoreDocsActiveTab();
    const [category, page] = docsActiveTab.value.split('/');
    const treePages = currentTree.value[category];
    if (!treePages || !treePages.includes(page)) {
      const firstCategory = Object.keys(currentTree.value)[0];
      const firstPage = currentTree.value[firstCategory]?.[0];
      if (firstCategory && firstPage) {
        saveDocsActiveTab(`${firstCategory}/${firstPage}`);
      }
    }

    // Always reload content — plugin changed even if activeTab didn't
    await loadDocumentation();
  } catch (error) {
    console.error('Error loading plugin docs:', error);
  } finally {
    isLoadingTree.value = false;
  }
}

// Watch plugin selection changes
watch(selectedPluginId, () => {
  if (isDocsMode.value) {
    onPluginSelected();
  }
});

// ============================================
// Language Handling
// ============================================

async function changeDocsLanguage(lang: string) {
  docsLanguage.value = lang;
  if (isChangelog.value) {
    await loadChangelogTree();
  } else {
    await onPluginSelected();
  }
}

// ============================================
// Filesystem Validation
// ============================================

async function validateDocsTree() {
  existingPages.value = new Set();
  orphanedFiles.value = [];

  try {
    const basePath = getCurrentBasePath();
    if (!basePath) return;
    const lang = currentLanguage.value;
    const categories = await global.listFolders(`${basePath}/${lang}`);

    if (!categories || categories.length === 0) return;

    const foundFiles = new Map<string, string[]>();

    for (const category of categories) {
      // Skip non-category entries (like tree.json, headers.json)
      if (category.includes('.')) continue;
      const files = await global.listFiles(`${basePath}/${lang}/${category}`);
      if (files && files.length > 0) {
        const pages = files
          .filter((file: string) => file.endsWith('.md'))
          .map((file: string) => file.replace('.md', ''));
        if (pages.length > 0) {
          foundFiles.set(category, pages);
          pages.forEach(page => existingPages.value.add(`${category}/${page}`));
        }
      }
    }

    // Find orphaned files
    const orphaned: string[] = [];
    for (const [category, pages] of foundFiles.entries()) {
      const expectedPages = currentTree.value[category] || [];
      for (const page of pages) {
        if (!expectedPages.includes(page)) {
          orphaned.push(`${category}/${page}.md`);
        }
      }
    }
    orphanedFiles.value = orphaned;
  } catch (error) {
    console.error('Error validating docs tree:', error);
  }
}

function pageExists(category: string, page: string): boolean {
  return existingPages.value.has(`${category}/${page}`);
}

// ============================================
// Navigation
// ============================================

function toggleGroup(groupId: string) {
  if (collapsedGroups.value.has(groupId)) {
    collapsedGroups.value.delete(groupId);
  } else {
    collapsedGroups.value.add(groupId);
  }
  collapsedGroups.value = new Set(collapsedGroups.value);
}

function isGroupCollapsed(groupId: string): boolean {
  return collapsedGroups.value.has(groupId);
}

function setActiveTab(category: string, page: string) {
  activeTab.value = `${category}/${page}`;
}

function isTabActive(category: string, page: string): boolean {
  return activeTab.value === `${category}/${page}`;
}

// ============================================
// Content Loading
// ============================================

async function loadDocumentation() {
  const [category, page] = activeTab.value.split('/');
  if (!category || !page) {
    docContent.value = '';
    return;
  }

  isLoading.value = true;
  loadError.value = '';

  try {
    const result = await global.readDocFile(category, page, currentLanguage.value, getCurrentBasePath());

    if (result.error || !result.content) {
      throw new Error(result.error || 'No content returned');
    }

    docContent.value = md.render(result.content);
    isLoading.value = false;

    await nextTick();
    addCopyButtons();
    processCustomSyntax();

    if (highlightTerm.value) {
      highlightSearchTerm();
    }
  } catch (error) {
    console.error('Error loading documentation:', error);
    loadError.value = error instanceof Error ? error.message : 'Failed to load documentation';
    docContent.value = '';
    isLoading.value = false;
  }
}

// ============================================
// Search
// ============================================

async function searchDocs() {
  const query = searchQuery.value.trim();
  if (query.length < 2) {
    searchResults.value = [];
    showSearchResults.value = false;
    return;
  }

  isSearching.value = true;
  showSearchResults.value = true;

  try {
    const result = await global.searchDocs(query, currentLanguage.value, getCurrentBasePath());
    if (result.error) {
      searchResults.value = [];
    } else {
      const results = result.results || [];
      const [currentCategory, currentPage] = activeTab.value.split('/');
      results.sort((a: any, b: any) => {
        const aIsCurrent = a.category === currentCategory && a.page === currentPage;
        const bIsCurrent = b.category === currentCategory && b.page === currentPage;
        if (aIsCurrent && !bIsCurrent) return -1;
        if (!aIsCurrent && bIsCurrent) return 1;
        return 0;
      });
      searchResults.value = results;
    }
  } catch (error) {
    console.error('Error searching docs:', error);
    searchResults.value = [];
  } finally {
    isSearching.value = false;
  }
}

async function goToSearchResult(result: any) {
  highlightTerm.value = searchQuery.value.trim();
  const targetTab = `${result.category}/${result.page}`;
  const isAlreadyActive = activeTab.value === targetTab;

  setActiveTab(result.category, result.page);
  showSearchResults.value = false;
  searchQuery.value = '';
  searchResults.value = [];

  if (isAlreadyActive) {
    await nextTick();
    highlightSearchTerm();
  }
}

function clearSearch() {
  searchQuery.value = '';
  searchResults.value = [];
  showSearchResults.value = false;
}

function highlightInText(text: string, query: string): string {
  if (!query || !text) return text;

  const normalizedText = normalizeForSearch(text);
  const normalizedQuery = normalizeForSearch(query.trim());

  let result = '';
  let lastIndex = 0;
  let currentIndex = normalizedText.indexOf(normalizedQuery);

  while (currentIndex !== -1) {
    result += text.substring(lastIndex, currentIndex);
    result += `<mark class="search-highlight-result">${text.substring(currentIndex, currentIndex + normalizedQuery.length)}</mark>`;
    lastIndex = currentIndex + normalizedQuery.length;
    currentIndex = normalizedText.indexOf(normalizedQuery, lastIndex);
  }

  result += text.substring(lastIndex);
  return result;
}

// ============================================
// Custom Syntax Processing
// ============================================

function processCustomSyntax() {
  if (!contentContainerRef.value) return;
  const markdownContent = contentContainerRef.value.querySelector('.markdown-content');
  if (!markdownContent) return;

  const combinedPattern = /->(\w+)\.(\w+)|@([\w\-\/]+\.\w+)/g;

  const walker = document.createTreeWalker(markdownContent, NodeFilter.SHOW_TEXT, null);
  const nodesToProcess: { node: Text; matches: RegExpMatchArray[] }[] = [];

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (node.parentElement?.closest('code, pre')) continue;
    const text = node.textContent || '';
    const matches = [...text.matchAll(combinedPattern)];
    if (matches.length > 0) {
      nodesToProcess.push({ node, matches });
    }
  }

  nodesToProcess.reverse().forEach(({ node, matches }) => {
    const text = node.textContent || '';
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    matches.forEach((match) => {
      const [fullMatch, linkCategory, linkPage, imagePath] = match;
      const matchIndex = match.index!;

      if (matchIndex > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, matchIndex)));
      }

      if (linkCategory && linkPage) {
        const span = document.createElement('span');
        span.className = 'docs-internal-link';
        span.textContent = getHeader(`${linkCategory}.${linkPage}`) || `${linkCategory}/${linkPage}`;
        span.addEventListener('click', () => {
          setActiveTab(linkCategory, linkPage);
        });
        fragment.appendChild(span);
      } else if (imagePath) {
        const img = document.createElement('img');
        img.src = `./assets/${getCurrentBasePath()}/${imagePath}`;
        img.alt = imagePath;
        img.className = 'docs-image';
        fragment.appendChild(img);
      }

      lastIndex = matchIndex + fullMatch.length;
    });

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    node.parentNode?.replaceChild(fragment, node);
  });
}

// ============================================
// Copy Buttons
// ============================================

function addCopyButtons() {
  if (!contentContainerRef.value) return;
  const markdownContent = contentContainerRef.value.querySelector('.markdown-content');
  if (!markdownContent) return;

  const codeBlocks = markdownContent.querySelectorAll('pre code');
  codeBlocks.forEach((codeElement) => {
    const pre = codeElement.parentElement;
    if (!pre || pre.querySelector('.copy-button')) return;

    const button = document.createElement('button');
    button.className = 'copy-button';
    button.textContent = 'Copy';
    button.setAttribute('type', 'button');

    button.onclick = async () => {
      try {
        await navigator.clipboard.writeText(codeElement.textContent || '');
        button.textContent = 'Copied!';
        button.classList.add('copied');
        setTimeout(() => {
          button.textContent = 'Copy';
          button.classList.remove('copied');
        }, 2000);
      } catch (err) {
        button.textContent = 'Failed';
        setTimeout(() => {
          button.textContent = 'Copy';
        }, 2000);
      }
    };

    pre.appendChild(button);
  });
}

// ============================================
// Search Term Highlighting
// ============================================

function highlightSearchTerm() {
  if (!contentContainerRef.value || !highlightTerm.value) return;
  const markdownContent = contentContainerRef.value.querySelector('.markdown-content');
  if (!markdownContent) return;

  const existingHighlights = markdownContent.querySelectorAll('.search-highlight');
  existingHighlights.forEach(mark => {
    const textNode = document.createTextNode(mark.textContent || '');
    mark.parentNode?.replaceChild(textNode, mark);
  });
  markdownContent.normalize();

  const fullTerm = normalizeForSearch(highlightTerm.value);
  let searchTerms = [fullTerm];

  function highlightInTextNode(node: Node, terms: string[]): boolean {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent) return false;

    const text = node.textContent;
    const normalizedText = normalizeForSearch(text);

    const matches: { start: number; end: number }[] = [];
    for (const term of terms) {
      let idx = normalizedText.indexOf(term);
      while (idx !== -1) {
        matches.push({ start: idx, end: idx + term.length });
        idx = normalizedText.indexOf(term, idx + 1);
      }
    }

    if (matches.length === 0) return false;

    matches.sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [];
    for (const m of matches) {
      if (merged.length === 0 || m.start > merged[merged.length - 1].end) {
        merged.push({ ...m });
      } else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, m.end);
      }
    }

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    for (const { start, end } of merged) {
      if (start > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, start)));
      }
      const mark = document.createElement('mark');
      mark.className = 'search-highlight';
      mark.textContent = text.substring(start, end);
      fragment.appendChild(mark);
      lastIndex = end;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    node.parentNode?.replaceChild(fragment, node);
    return true;
  }

  function walkNodes(node: Node, terms: string[]) {
    if (node.nodeType === Node.TEXT_NODE) {
      highlightInTextNode(node, terms);
    } else {
      const children = Array.from(node.childNodes);
      children.forEach(child => walkNodes(child, terms));
    }
  }

  walkNodes(markdownContent, searchTerms);

  let scrollTarget: Element | null = markdownContent.querySelector('.search-highlight');

  if (!scrollTarget && highlightTerm.value) {
    const queryWords = normalizeForSearch(highlightTerm.value).split(/\s+/);
    for (let len = queryWords.length; len >= 2 && !scrollTarget; len--) {
      const searchStr = queryWords.slice(-len).join(' ');
      const walker = document.createTreeWalker(markdownContent, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (normalizeForSearch(node.textContent || '').includes(searchStr)) {
          scrollTarget = node.parentElement;
          break;
        }
      }
    }
  }

  if (scrollTarget) {
    scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  highlightTerm.value = '';
}

// ============================================
// Sidebar scroll
// ============================================

async function scrollSidebarToActive() {
  await nextTick();
  if (!sidebarRef.value) return;
  const activeItem = sidebarRef.value.querySelector('.nav-item.active');
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// ============================================
// Watchers
// ============================================

watch(activeTab, async () => {
  const [category] = activeTab.value.split('/');
  if (collapsedGroups.value.has(category)) {
    collapsedGroups.value.delete(category);
    collapsedGroups.value = new Set(collapsedGroups.value);
  }
  await loadDocumentation();
  scrollSidebarToActive();
}, { immediate: true });

// Watch viewer type changes
watch(viewerType, async (newType) => {
  if (newType === 'changelog') {
    await loadChangelogTree();
  } else if (newType === 'docs') {
    await loadAvailableDocPlugins();
    if (selectedPluginId.value) {
      await onPluginSelected();
    }
  }
});

// ============================================
// Events
// ============================================

function handleClickOutside(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    global.closeViewer();
  }
}

function handleEscKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    global.closeViewer();
  }
}

// ============================================
// Initialize
// ============================================

onMounted(async () => {
  window.addEventListener('keydown', handleEscKey);

  if (isChangelog.value) {
    await loadChangelogTree();
  } else {
    await loadAvailableDocPlugins();
    if (selectedPluginId.value) {
      await onPluginSelected();
    }
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleEscKey);
});
</script>

<template>
  <div class="docs-container">
    <div class="docs-container-bg" @click="handleClickOutside">
      <div class="docs-container-content">
        <div class="docs-header">
          <h1 v-if="isChangelog">{{ viewerTitle }}</h1>

          <!-- Plugin selector (docs mode only) -->
          <div v-if="isDocsMode && availableDocPlugins.length > 0" class="plugin-selector">
            <Select
              v-model="selectedPluginId"
              :options="availableDocPlugins"
              optionLabel="name"
              optionValue="id"
              filter
              :resetFilterOnHide="true"
              filterPlaceholder="Find plugin docs..."
              emptyFilterMessage="No plugins found"
              scrollHeight="250px"
              class="plugin-select"
            >
              <template #option="{ option }">
                <span :style="{ fontWeight: option.isActive ? 'bold' : 'normal' }">
                  {{ option.name }}
                </span>
              </template>
              <template #value>
                <span v-if="selectedPlugin">{{ selectedPlugin.name }}</span>
              </template>
            </Select>
          </div>

          <!-- Language selector -->
          <div class="language-selector">
            <select v-model="docsLanguage" @change="changeDocsLanguage(docsLanguage)" class="language-select">
              <option value="">Auto ({{ global.selectedLanguage || 'en' }})</option>
              <option v-for="lang in pluginLanguages" :key="lang" :value="lang">
                {{ lang.toUpperCase() }}
              </option>
            </select>
          </div>

          <!-- Search bar -->
          <div class="search-container">
            <input v-model="searchQuery" @input="searchDocs" @keydown.escape="clearSearch" type="text"
              class="search-input" placeholder="Search documentation... (min 2 chars)" />
            <button v-if="searchQuery" class="clear-search-button" @click="clearSearch">&#10005;</button>
            <span v-if="isSearching" class="search-spinner">&#9203;</span>

            <!-- Search results dropdown -->
            <div v-if="showSearchResults" class="search-results-dropdown">
              <div class="search-results-header">
                <span class="results-count">{{ searchResults.length }} result{{ searchResults.length !== 1 ? 's' : ''
                }}</span>
              </div>

              <div v-if="isSearching" class="search-loading">
                <div class="loading-spinner"></div>
                <p>Searching...</p>
              </div>

              <div v-else-if="searchResults.length === 0" class="search-empty">
                <p>No results found for "{{ searchQuery }}"</p>
              </div>

              <div v-else class="search-results-list">
                <div v-for="(result, index) in searchResults" :key="index" class="search-result-item"
                  @click="goToSearchResult(result)">
                  <div class="search-result-title" v-html="highlightInText(result.title, searchQuery)"></div>
                  <div class="search-result-path">{{ result.category }} &rsaquo; {{ result.page }}</div>
                  <div class="search-result-context" v-html="highlightInText(result.context, searchQuery)"></div>
                </div>
              </div>
            </div>
          </div>

          <button class="close-button" @click="global.closeViewer()">&#10005;</button>
        </div>

        <div class="docs-body">
          <!-- Orphaned files warning -->
          <div v-if="orphanedFiles.length > 0" class="orphaned-warning">
            <strong>Warning:</strong> Found {{ orphanedFiles.length }} documentation file(s) not in tree:
            <ul>
              <li v-for="file in orphanedFiles" :key="file">{{ file }}</li>
            </ul>
          </div>

          <!-- Two-column layout -->
          <div class="docs-layout">
            <!-- Left navigation sidebar -->
            <div class="docs-sidebar" ref="sidebarRef">
              <!-- Loading tree state -->
              <div v-if="isLoadingTree" class="sidebar-loading">
                <div class="loading-spinner"></div>
                <p>Loading navigation...</p>
              </div>

              <!-- Navigation tree -->
              <div v-else v-for="(pages, category) in currentTree" :key="category" class="nav-group">
                <div class="nav-group-header" @click="toggleGroup(category)">
                  <span class="collapse-icon">{{ isGroupCollapsed(category) ? '&#9654;' : '&#9660;' }}</span>
                  <span class="nav-group-title">{{ getHeader(category) }}</span>
                </div>
                <div v-if="!isGroupCollapsed(category)" class="nav-group-items">
                  <div v-for="page in pages" :key="page" class="nav-item"
                    :class="{ active: isTabActive(category, page), inactive: !pageExists(category, page) }"
                    @click="setActiveTab(category, page)">
                    {{ isChangelog ? page : getHeader(category + '.' + page) }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Right content area -->
            <div class="docs-content" ref="contentContainerRef">
              <!-- Loading state -->
              <div v-if="isLoading" class="docs-loading">
                <div class="loading-spinner"></div>
                <p>Loading documentation...</p>
              </div>

              <!-- Error state -->
              <div v-else-if="loadError" class="docs-error">
                <h2>Error Loading Documentation</h2>
                <p>{{ loadError }}</p>
                <p class="error-hint">
                  Make sure the documentation file exists at:
                  <code>/assets/{{ getCurrentBasePath() }}/{{ currentLanguage }}/{{ activeTab }}.md</code>
                </p>
              </div>

              <!-- Markdown content -->
              <div v-else-if="docContent" class="markdown-content" v-html="docContent"></div>

              <!-- No content state -->
              <div v-else class="docs-empty">
                <h2>Select a Topic</h2>
                <p>Choose a documentation topic from the sidebar to get started.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.docs-container {
  position: absolute;
  z-index: 1250;
}

.docs-container-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.docs-container-content {
  width: 80vw;
  max-width: 1200px;
  height: 90vh;
  background-color: #ffffff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.docs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem 2rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-bottom: 2px solid #5568d3;
}

.docs-header h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  white-space: nowrap;
}

/* Plugin selector */
.plugin-selector {
  display: flex;
  align-items: center;
}

.plugin-select {
  min-width: 200px;
}

/* Language selector */
.language-selector {
  display: flex;
  align-items: center;
}

.language-select {
  padding: 0.5rem 2rem 0.5rem 0.75rem;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='white' d='M6 9L1 4h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.5rem center;
  min-width: 120px;
}

.language-select:hover {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.5);
}

.language-select:focus {
  outline: none;
  background: rgba(255, 255, 255, 0.35);
  border-color: rgba(255, 255, 255, 0.6);
}

.language-select option {
  background: #667eea;
  color: white;
  padding: 0.5rem;
}

/* Search container */
.search-container {
  position: relative;
  flex: 1;
  max-width: 500px;
  z-index: 100;
}

.search-input {
  width: 100%;
  padding: 0.75rem 2.5rem 0.75rem 1rem;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.15);
  color: white;
  font-size: 0.95rem;
  outline: none;
  transition: all 0.2s ease;
  backdrop-filter: blur(10px);
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.7);
}

.search-input:focus {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.6);
}

.clear-search-button {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.9rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
}

.clear-search-button:hover {
  background: rgba(255, 255, 255, 0.3);
}

.search-spinner {
  position: absolute;
  right: 2.5rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1.2rem;
}

/* Search results dropdown */
.search-results-dropdown {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  background: white;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 200;
  animation: slideDown 0.2s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.search-results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
}

.results-count {
  font-size: 0.85rem;
  color: #6c757d;
  font-weight: 500;
}

.search-loading,
.search-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  color: #6c757d;
  font-size: 0.9rem;
}

.search-results-list {
  overflow-y: auto;
  padding: 0.5rem;
}

.search-result-item {
  padding: 0.75rem;
  margin-bottom: 0.5rem;
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.search-result-item:last-child {
  margin-bottom: 0;
}

.search-result-item:hover {
  background: #e7f1ff;
  border-color: #667eea;
  transform: translateX(2px);
}

.search-result-title {
  font-weight: 600;
  color: #667eea;
  font-size: 1.1rem;
  margin-bottom: 0.25rem;
}

.search-result-path {
  font-size: 0.85rem;
  color: #6c757d;
  margin-bottom: 0.5rem;
}

.search-result-context {
  font-size: 0.9rem;
  color: #495057;
  line-height: 1.5;
}

/* Highlight matched text in search results */
.search-highlight-result {
  background-color: #ffeb3b;
  padding: 2px 4px;
  border-radius: 3px;
  font-weight: 600;
  color: #333;
}

.close-button {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: white;
  font-size: 1.5rem;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease;
}

.close-button:hover {
  background: rgba(255, 255, 255, 0.3);
}

.docs-body {
  flex: 1;
  overflow: hidden;
  color: #333;
}

/* Two-column layout */
.docs-layout {
  display: flex;
  height: 100%;
}

/* Left sidebar navigation */
.docs-sidebar {
  width: 280px;
  min-width: 280px;
  background: #f8f9fa;
  border-right: 1px solid #dee2e6;
  overflow-y: auto;
  padding: 1rem 0;
}

.sidebar-loading,
.sidebar-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: #6c757d;
  font-size: 0.9rem;
  text-align: center;
}

.sidebar-loading .loading-spinner {
  margin-bottom: 1rem;
}

.nav-group {
  margin-bottom: 0.5rem;
}

.nav-group-header {
  display: flex;
  align-items: center;
  padding: 0.75rem 1rem;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s ease;
  font-weight: 600;
  color: #495057;
}

.nav-group-header:hover {
  background: #e9ecef;
}

.collapse-icon {
  width: 16px;
  font-size: 0.75rem;
  color: #6c757d;
  margin-right: 0.5rem;
  transition: transform 0.2s ease;
}

.nav-group-title {
  flex: 1;
  font-size: 0.95rem;
}

.nav-group-items {
  padding-left: 1.5rem;
}

.nav-item {
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-size: 0.9rem;
  color: #6c757d;
  transition: all 0.2s ease;
  border-left: 3px solid transparent;
}

.nav-item:hover {
  background: #e9ecef;
  color: #495057;
}

.nav-item.active {
  background: #e7f1ff;
  color: #667eea;
  border-left-color: #667eea;
  font-weight: 500;
}

.nav-item.inactive {
  color: #adb5bd;
  opacity: 0.6;
  cursor: not-allowed;
  font-style: italic;
}

.nav-item.inactive:hover {
  background: transparent;
  color: #adb5bd;
}

/* Orphaned files warning */
.orphaned-warning {
  margin: 1rem 2rem;
  padding: 1rem 1.5rem;
  background: #fff3cd;
  border: 2px solid #ffc107;
  border-radius: 8px;
  color: #856404;
  font-size: 0.9rem;
  line-height: 1.6;
}

.orphaned-warning strong {
  display: block;
  margin-bottom: 0.5rem;
  font-size: 1rem;
  color: #664d03;
}

.orphaned-warning ul {
  margin: 0.5rem 0 0 0;
  padding-left: 1.5rem;
}

.orphaned-warning li {
  margin-bottom: 0.25rem;
  font-family: var(--font-family-mono);
  color: #664d03;
}

/* Right content area */
.docs-content {
  flex: 1;
  padding: 2rem;
  overflow-y: auto;
}

/* Loading state */
.docs-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: #6c757d;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e9ecef;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Error state */
.docs-error {
  padding: 2rem;
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 6px;
  color: #856404;
}

.docs-error h2 {
  margin-top: 0;
  color: #856404;
}

.error-hint {
  margin-top: 1rem;
  font-size: 0.9rem;
  opacity: 0.8;
}

.error-hint code {
  background: rgba(0, 0, 0, 0.1);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.85rem;
}

/* Empty state */
.docs-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: #6c757d;
  text-align: center;
}

/* Scrollbar styling for sidebar */
.docs-sidebar::-webkit-scrollbar {
  width: 6px;
}

.docs-sidebar::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.docs-sidebar::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}

.docs-sidebar::-webkit-scrollbar-thumb:hover {
  background: #999;
}

/* Scrollbar styling for content */
.docs-content::-webkit-scrollbar {
  width: 8px;
}

.docs-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.docs-content::-webkit-scrollbar-thumb {
  background: #888;
  border-radius: 4px;
}

.docs-content::-webkit-scrollbar-thumb:hover {
  background: #555;
}
</style>

<!-- Unscoped styles for dynamically created elements -->
<style>
/* Pre element needs position: relative for absolute positioned button */
/* Markdown content styles */
.markdown-content {
  line-height: 1.6;
  color: #333;
}

.markdown-content h1 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #e9ecef;
  color: #667eea;
  font-size: 2rem;
  font-weight: 600;
}

.markdown-content h2 {
  margin-top: 2rem;
  margin-bottom: 1rem;
  color: #667eea;
  font-size: 1.5rem;
  font-weight: 600;
}

.markdown-content h3 {
  margin-top: 1.5rem;
  margin-bottom: 0.75rem;
  color: #764ba2;
  font-size: 1.25rem;
  font-weight: 600;
}

.markdown-content h4 {
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  color: #495057;
  font-size: 1.1rem;
  font-weight: 600;
}

.markdown-content p {
  margin-bottom: 1rem;
}

.markdown-content ul,
.markdown-content ol {
  margin-bottom: 1rem;
  padding-left: 2rem;
  line-height: 1.8;
}

.markdown-content li {
  margin-bottom: 0.5rem;
}

.markdown-content a {
  color: #667eea;
  text-decoration: none;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s ease;
}

.markdown-content a:hover {
  border-bottom-color: #667eea;
}

.markdown-content code {
  padding: 2px 6px;
  border-radius: 3px;
  font-family: var(--font-family-mono);
  font-size: 0.9em;
}

.markdown-content pre {
  position: relative;
  margin: 1.5rem 0;
  padding: 1rem;
  background: #1e1e1e;
  border-radius: 6px;
  overflow-x: auto;
}

.markdown-content pre code {
  background: transparent;
  padding: 0;
  color: #d4d4d4;
  font-size: 0.875rem;
  line-height: 1.5;
  display: block;
}

.markdown-content blockquote {
  margin: 1.5rem 0;
  padding: 1rem 1.5rem;
  border-left: 4px solid #667eea;
  background: #f8f9fa;
  color: #495057;
}

.markdown-content table {
  width: 100%;
  margin: 1.5rem 0;
  border-collapse: collapse;
}

.markdown-content th,
.markdown-content td {
  padding: 0.75rem;
  border: 1px solid #dee2e6;
  text-align: left;
}

.markdown-content th {
  background: #f8f9fa;
  font-weight: 600;
  color: #495057;
}

.markdown-content tr:nth-child(even) {
  background: #f8f9fa;
}

/* Copy button for code blocks (unscoped for JS-created elements) */
.markdown-content pre .copy-button {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  padding: 0.375rem 0.75rem;
  background: #495057;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  opacity: 0.7;
  z-index: 10;
}

.markdown-content pre:hover .copy-button {
  opacity: 1;
}

.markdown-content pre .copy-button:hover {
  background: #667eea;
  transform: scale(1.05);
}

.markdown-content pre .copy-button.copied {
  background: #28a745;
}

.markdown-content pre .copy-button:active {
  transform: scale(0.95);
}

/* Search term highlighting */
.markdown-content .search-highlight {
  background-color: #ffeb3b;
  padding: 2px 0;
  border-radius: 2px;
  font-weight: 500;
  animation: pulse-highlight 1s ease-in-out;
}

@keyframes pulse-highlight {

  0%,
  100% {
    background-color: #ffeb3b;
  }

  50% {
    background-color: #fdd835;
  }
}

/* Internal documentation links (non-anchor clickable elements) */
.markdown-content .docs-internal-link {
  color: #667eea;
  cursor: pointer;
  border-bottom: 1px solid transparent;
  transition: border-color 0.2s ease;
}

.markdown-content .docs-internal-link:hover {
  border-bottom-color: #667eea;
}

/* Documentation images */
.markdown-content .docs-image {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 1rem 0;
  display: block;
}
</style>
