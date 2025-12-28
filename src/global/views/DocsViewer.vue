<script setup lang="ts">
import { Global } from '../global';
import { ref, computed, onMounted, onUnmounted, watch, nextTick, Ref } from 'vue';
import { useStorage } from '@vueuse/core';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark.css';

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

// Hardcoded documentation tree structure (for ordering)
const DOCS_TREE: Record<string, string[]> = {
  'introduction': ['overview', 'getting_started', 'creating_new_game'],
  'dungeons': ['what_is_dungeon', 'dungeon_template', 'google_docs_integration', 'quests', 'glossary'],
  'characters': ['characters_overview', 'actor_slots', 'skills', 'characters_computed', 'abilities', 'characters_api'],
  'items': ['items_overview', 'exchange', 'apply', 'items_api'],
  'resources': ['audio', 'assets', 'galleries', 'file_browser'],
  'miscellaneous': ['properties', 'store', 'data'],
  'advanced': ['set_up_coding', 'vue', '3rd_party', 'registry', 'debugging', 'plugins', 'releasing_game'],
  'builtins': ['actions', 'placeholders', 'conditions', 'game_events', 'states', 'components_export', 'component_slots'],
};

const CHANGELOG_TREE: Record<string, string[]> = {
  '0.2': ['0.2.0'],
};

// Viewer configuration - all settings for each viewer type
const VIEWER_CONFIG: Record<string, {
  tree: Record<string, string[]>;
  basePath: string;
  title: string;
  storageKey: string;
  defaultTab: string;
  useLocale: boolean;
}> = {
  docs: {
    tree: DOCS_TREE,
    basePath: 'engine_files/docs',
    title: '📚 Dryad Engine Documentation',
    storageKey: 'docs-active-tab',
    defaultTab: 'introduction/overview',
    useLocale: true
  },
  changelog: {
    tree: CHANGELOG_TREE,
    basePath: 'engine_files/changelog',
    title: '📋 Changelog',
    storageKey: 'changelog-active-tab',
    defaultTab: '0.2/0.2.0',
    useLocale: false
  }
};

// Computed properties for current viewer
const viewerType = computed(() => global.openViewer.value || 'docs');
const currentConfig = computed(() => VIEWER_CONFIG[viewerType.value] || VIEWER_CONFIG.docs);
const currentTree = computed(() => currentConfig.value.tree);

// Create storages from config (use / as separator for clarity with version numbers)
const activeTabStorages: Record<string, Ref<string>> = Object.fromEntries(
  Object.entries(VIEWER_CONFIG).map(([key, config]) => [
    key,
    useStorage(config.storageKey, config.defaultTab)
  ])
);

// Get current active tab based on viewer type
const activeTab = computed({
  get: () => activeTabStorages[viewerType.value]?.value || VIEWER_CONFIG.docs.defaultTab,
  set: (val) => {
    if (activeTabStorages[viewerType.value]) {
      activeTabStorages[viewerType.value].value = val;
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

// Documentation language and state
const availableLanguages = ref<string[]>([]);
const docsLanguage = useStorage('docs-language', ''); // Empty means use global.selectedLanguage
const isLoadingTree = ref(false);

// Filesystem validation state
const existingPages = ref<Set<string>>(new Set());
const orphanedFiles = ref<string[]>([]);

// Search state
const searchQuery = ref('');
const searchResults = ref<any[]>([]);
const isSearching = ref(false);
const showSearchResults = ref(false);
const highlightTerm = ref(''); // Term to highlight in content
const searchContainerRef = ref<HTMLElement | null>(null);

// Computed: Current language (with fallback to global.selectedLanguage)
const currentLanguage = computed(() => {
  return docsLanguage.value || global.selectedLanguage || 'en';
});

// Load available documentation languages
async function loadAvailableLanguages() {
  try {
    const languages = await global.listFolders(currentConfig.value.basePath);

    if (languages && languages.length > 0) {
      availableLanguages.value = languages;
    } else {
      availableLanguages.value = ['en']; // Fallback
    }
  } catch (error) {
    console.error('Error loading languages:', error);
    availableLanguages.value = ['en'];
  }
}

// Validate documentation files against hardcoded tree
async function validateDocsTree() {
  isLoadingTree.value = true;
  existingPages.value = new Set();
  orphanedFiles.value = [];

  try {
    const basePath = currentConfig.value.basePath;
    const categories = await global.listFolders(`${basePath}/${currentLanguage.value}`);

    if (!categories || categories.length === 0) {
      return;
    }

    const foundFiles = new Map<string, string[]>();

    // Scan filesystem to find all .md files
    for (const category of categories) {
      const files = await global.listFiles(`${basePath}/${currentLanguage.value}/${category}`);

      if (files && files.length > 0) {
        const pages = files
          .filter((file: string) => file.endsWith('.md'))
          .map((file: string) => file.replace('.md', ''));

        if (pages.length > 0) {
          foundFiles.set(category, pages);
          // Mark pages as existing
          pages.forEach(page => existingPages.value.add(`${category}/${page}`));
        }
      }
    }

    // Find orphaned files (files that exist but aren't in current tree)
    const orphaned: string[] = [];
    const tree = currentTree.value;

    for (const [category, pages] of foundFiles.entries()) {
      const expectedPages = tree[category] || [];

      for (const page of pages) {
        if (!expectedPages.includes(page)) {
          orphaned.push(`${category}/${page}.md`);
        }
      }
    }

    orphanedFiles.value = orphaned;

  } catch (error) {
    console.error('Error validating docs tree:', error);
  } finally {
    isLoadingTree.value = false;
  }
}

// Check if a page exists in the filesystem
function pageExists(category: string, page: string): boolean {
  return existingPages.value.has(`${category}/${page}`);
}

// Change documentation language
async function changeDocsLanguage(lang: string) {
  docsLanguage.value = lang;
  await validateDocsTree();

  // Reset to first available tab if current tab doesn't exist in new language
  const [category, page] = activeTab.value.split('/');
  if (!pageExists(category, page)) {
    const tree = currentTree.value;
    const firstCategory = Object.keys(tree)[0];
    const firstPage = tree[firstCategory]?.[0];
    if (firstCategory && firstPage) {
      activeTab.value = `${firstCategory}/${firstPage}`;
    }
  }
}

// Toggle group collapse
function toggleGroup(groupId: string) {
  if (collapsedGroups.value.has(groupId)) {
    collapsedGroups.value.delete(groupId);
  } else {
    collapsedGroups.value.add(groupId);
  }
  // Force reactivity
  collapsedGroups.value = new Set(collapsedGroups.value);
}

// Check if group is collapsed
function isGroupCollapsed(groupId: string): boolean {
  return collapsedGroups.value.has(groupId);
}

// Set active tab
function setActiveTab(category: string, page: string) {
  activeTab.value = `${category}/${page}`;
}

// Check if tab is active
function isTabActive(category: string, page: string): boolean {
  return activeTab.value === `${category}/${page}`;
}

// Load and render markdown content
async function loadDocumentation() {
  const [category, page] = activeTab.value.split('/');

  if (!category || !page) {
    docContent.value = '';
    return;
  }

  isLoading.value = true;
  loadError.value = '';

  try {
    const result = await global.readDocFile(category, page, currentLanguage.value, currentConfig.value.basePath);

    if (result.error || !result.content) {
      throw new Error(result.error || 'No content returned');
    }

    docContent.value = md.render(result.content);
    isLoading.value = false;

    // Add copy buttons and process custom syntax after DOM updates (must wait for isLoading to be false)
    await nextTick();
    addCopyButtons();
    processCustomSyntax();

    // Highlight search term if present
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

// Search documentation
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
    const result = await global.searchDocs(query, currentLanguage.value, currentConfig.value.basePath);

    if (result.error) {
      console.error('Search error:', result.error);
      searchResults.value = [];
    } else {
      const results = result.results || [];
      // Sort results so current page appears first
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

// Navigate to a search result
async function goToSearchResult(result: any) {
  // Store the search term for highlighting
  highlightTerm.value = searchQuery.value.trim();

  const targetTab = `${result.category}/${result.page}`;
  const isAlreadyActive = activeTab.value === targetTab;

  setActiveTab(result.category, result.page);
  showSearchResults.value = false;
  searchQuery.value = '';
  searchResults.value = [];

  // If already on this tab, manually trigger highlighting since watch won't fire
  if (isAlreadyActive) {
    await nextTick();
    highlightSearchTerm();
  }
}

// Clear search
function clearSearch() {
  searchQuery.value = '';
  searchResults.value = [];
  showSearchResults.value = false;
}

// Highlight search query in text (for search results display)
function highlightInText(text: string, query: string): string {
  if (!query || !text) return text;

  const normalizedText = normalizeForSearch(text);
  const normalizedQuery = normalizeForSearch(query.trim());

  let result = '';
  let lastIndex = 0;
  let currentIndex = normalizedText.indexOf(normalizedQuery);

  while (currentIndex !== -1) {
    // Add text before match
    result += text.substring(lastIndex, currentIndex);

    // Add highlighted match (use original text for display)
    result += `<mark class="search-highlight-result">${text.substring(currentIndex, currentIndex + normalizedQuery.length)}</mark>`;

    lastIndex = currentIndex + normalizedQuery.length;
    currentIndex = normalizedText.indexOf(normalizedQuery, lastIndex);
  }

  // Add remaining text
  result += text.substring(lastIndex);

  return result;
}

// Process custom markdown syntax in a single pass
// Handles: ->category.page (internal links) and @path/image.png (doc images)
function processCustomSyntax() {
  if (!contentContainerRef.value) return;

  const markdownContent = contentContainerRef.value.querySelector('.markdown-content');
  if (!markdownContent) return;

  // Combined pattern: capture both link and image syntax
  // Group 1: link category, Group 2: link page, Group 3: image path
  const combinedPattern = /->(\w+)\.(\w+)|@([\w\-\/]+\.\w+)/g;

  // Walk through all text nodes (single pass)
  const walker = document.createTreeWalker(
    markdownContent,
    NodeFilter.SHOW_TEXT,
    null
  );

  const nodesToProcess: { node: Text; matches: RegExpMatchArray[] }[] = [];

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent || '';
    const matches = [...text.matchAll(combinedPattern)];
    if (matches.length > 0) {
      nodesToProcess.push({ node, matches });
    }
  }

  // Process nodes (in reverse to avoid DOM mutation issues)
  nodesToProcess.reverse().forEach(({ node, matches }) => {
    const text = node.textContent || '';
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    matches.forEach((match) => {
      const [fullMatch, linkCategory, linkPage, imagePath] = match;
      const matchIndex = match.index!;

      // Add text before match
      if (matchIndex > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, matchIndex)));
      }

      if (linkCategory && linkPage) {
        // Internal link: ->category.page
        const span = document.createElement('span');
        span.className = 'docs-internal-link';
        span.textContent = global.getString(`docs.${linkCategory}.${linkPage}`) || `${linkCategory}/${linkPage}`;
        span.addEventListener('click', () => {
          setActiveTab(linkCategory, linkPage);
        });
        fragment.appendChild(span);
      } else if (imagePath) {
        // Doc image: @path/to/image.png
        const img = document.createElement('img');
        img.src = `./assets/engine_assets/docs/${imagePath}`;
        img.alt = imagePath;
        img.className = 'docs-image';
        fragment.appendChild(img);
      }

      lastIndex = matchIndex + fullMatch.length;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    // Replace the text node with the fragment
    node.parentNode?.replaceChild(fragment, node);
  });
}

// Add copy buttons to code blocks
function addCopyButtons() {
  if (!contentContainerRef.value) {
    console.warn('contentContainerRef is null');
    return;
  }

  // Query within .markdown-content specifically
  const markdownContent = contentContainerRef.value.querySelector('.markdown-content');
  if (!markdownContent) {
    console.warn('No .markdown-content found');
    return;
  }

  const codeBlocks = markdownContent.querySelectorAll('pre code');
  //console.log('Found code blocks:', codeBlocks.length);

  codeBlocks.forEach((codeElement, index) => {
    const pre = codeElement.parentElement;
    if (!pre) {
      //console.warn('No parent pre element for code block', index);
      return;
    }

    // Check if button already exists
    if (pre.querySelector('.copy-button')) {
      //console.log('Button already exists for code block', index);
      return;
    }

    // Create copy button
    const button = document.createElement('button');
    button.className = 'copy-button';
    button.textContent = '📋 Copy';
    button.setAttribute('type', 'button');
    //console.log('Creating button for code block', index);

    button.onclick = async () => {
      try {
        await navigator.clipboard.writeText(codeElement.textContent || '');
        button.textContent = '✅ Copied!';
        button.classList.add('copied');

        setTimeout(() => {
          button.textContent = '📋 Copy';
          button.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
        button.textContent = '❌ Failed';
        setTimeout(() => {
          button.textContent = '📋 Copy';
        }, 2000);
      }
    };

    pre.appendChild(button);
    //console.log('Button appended to code block', index);
  });
}

// Highlight search term in content
function highlightSearchTerm() {
  if (!contentContainerRef.value || !highlightTerm.value) {
    return;
  }

  const markdownContent = contentContainerRef.value.querySelector('.markdown-content');
  if (!markdownContent) {
    return;
  }

  // Clear any existing highlights first
  const existingHighlights = markdownContent.querySelectorAll('.search-highlight');
  existingHighlights.forEach(mark => {
    const textNode = document.createTextNode(mark.textContent || '');
    mark.parentNode?.replaceChild(textNode, mark);
  });

  // Normalize text nodes after removing marks to merge adjacent text nodes
  markdownContent.normalize();

  // Get search terms to highlight - try full phrase first, then individual words
  const fullTerm = normalizeForSearch(highlightTerm.value);
  let searchTerms = [fullTerm];

  // Function to highlight text in a single text node for given terms
  function highlightInTextNode(node: Node, terms: string[]): boolean {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent) {
      return false;
    }

    const text = node.textContent;
    const normalizedText = normalizeForSearch(text);

    // Find all matches for all terms
    const matches: { start: number; end: number }[] = [];
    for (const term of terms) {
      let idx = normalizedText.indexOf(term);
      while (idx !== -1) {
        matches.push({ start: idx, end: idx + term.length });
        idx = normalizedText.indexOf(term, idx + 1);
      }
    }

    if (matches.length === 0) {
      return false;
    }

    // Sort matches by start position and merge overlapping
    matches.sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [];
    for (const m of matches) {
      if (merged.length === 0 || m.start > merged[merged.length - 1].end) {
        merged.push({ ...m });
      } else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, m.end);
      }
    }

    // Create a document fragment with highlighted text
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    for (const { start, end } of merged) {
      // Add text before match
      if (start > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, start)));
      }

      // Add highlighted match (use original text for display)
      const mark = document.createElement('mark');
      mark.className = 'search-highlight';
      mark.textContent = text.substring(start, end);
      fragment.appendChild(mark);

      lastIndex = end;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    // Replace the text node with the fragment
    node.parentNode?.replaceChild(fragment, node);
    return true;
  }

  // Walk through all text nodes
  function walkNodes(node: Node, terms: string[]) {
    if (node.nodeType === Node.TEXT_NODE) {
      highlightInTextNode(node, terms);
    } else {
      // Process child nodes (create array copy since we're modifying DOM)
      const children = Array.from(node.childNodes);
      children.forEach(child => walkNodes(child, terms));
    }
  }

  // Try to find and highlight the full search term
  walkNodes(markdownContent, searchTerms);

  // Scroll to first highlight
  let scrollTarget: Element | null = markdownContent.querySelector('.search-highlight');

  // Fallback: if no highlight, use search query to find scroll location
  if (!scrollTarget && highlightTerm.value) {
    const queryWords = normalizeForSearch(highlightTerm.value).split(/\s+/);

    // Try progressively shorter portions of the query (from end first)
    for (let len = queryWords.length; len >= 2 && !scrollTarget; len--) {
      const searchStr = queryWords.slice(-len).join(' '); // Last N words

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

  // Clear after use
  highlightTerm.value = '';
}

// Scroll sidebar to active item
async function scrollSidebarToActive() {
  await nextTick();
  if (!sidebarRef.value) return;

  const activeItem = sidebarRef.value.querySelector('.nav-item.active');
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

// Watch for tab changes and load content
watch(activeTab, async () => {
  // Expand the group containing the active tab
  const [category] = activeTab.value.split('/');
  if (collapsedGroups.value.has(category)) {
    collapsedGroups.value.delete(category);
    collapsedGroups.value = new Set(collapsedGroups.value);
  }

  await loadDocumentation();
  scrollSidebarToActive();
}, { immediate: true });

// Watch for language changes
watch(currentLanguage, async () => {
  await validateDocsTree();
});

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

// Initialize on mount
onMounted(async () => {
  window.addEventListener('keydown', handleEscKey);

  // Load available languages and validate tree
  await loadAvailableLanguages();
  await validateDocsTree();
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
          <h1>{{ currentConfig.title }}</h1>

          <!-- Language selector -->
          <div class="language-selector">
            <select v-model="docsLanguage" @change="changeDocsLanguage(docsLanguage)" class="language-select">
              <option value="">Auto ({{ global.selectedLanguage || 'en' }})</option>
              <option v-for="lang in availableLanguages" :key="lang" :value="lang">
                {{ lang.toUpperCase() }}
              </option>
            </select>
          </div>

          <!-- Search bar -->
          <div class="search-container">
            <input v-model="searchQuery" @input="searchDocs" @keydown.escape="clearSearch" type="text"
              class="search-input" placeholder="Search documentation... (min 2 chars)" />
            <button v-if="searchQuery" class="clear-search-button" @click="clearSearch">✕</button>
            <span v-if="isSearching" class="search-spinner">⏳</span>

            <!-- Search results dropdown (positioned below search input) -->
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
                  <div class="search-result-path">{{ result.category }} › {{ result.page }}</div>
                  <div class="search-result-context" v-html="highlightInText(result.context, searchQuery)"></div>
                </div>
              </div>
            </div>
          </div>

          <button class="close-button" @click="global.closeViewer()">✕</button>
        </div>

        <div class="docs-body">
          <!-- Orphaned files warning -->
          <div v-if="orphanedFiles.length > 0" class="orphaned-warning">
            <strong>⚠️ Warning:</strong> Found {{ orphanedFiles.length }} documentation file(s) not in tree:
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
                  <span class="collapse-icon">{{ isGroupCollapsed(category) ? '▶' : '▼' }}</span>
                  <span class="nav-group-title">{{ currentConfig.useLocale ? global.getString('docs.' + category) :
                    category }}</span>
                </div>
                <div v-if="!isGroupCollapsed(category)" class="nav-group-items">
                  <div v-for="page in pages" :key="page" class="nav-item"
                    :class="{ active: isTabActive(category, page), inactive: !pageExists(category, page) }"
                    @click="setActiveTab(category, page)">
                    {{ currentConfig.useLocale ? global.getString('docs.' + category + '.' + page) : page }}
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
                <h2>⚠️ Error Loading Documentation</h2>
                <p>{{ loadError }}</p>
                <p class="error-hint">
                  Make sure the documentation file exists at:
                  <code>/assets/{{ currentConfig.basePath }}/{{ currentLanguage }}/{{ activeTab }}.md</code>
                </p>
              </div>

              <!-- Markdown content -->
              <div v-else-if="docContent" class="markdown-content" v-html="docContent"></div>

              <!-- No content state -->
              <div v-else class="docs-empty">
                <h2>📚 Select a Topic</h2>
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
  /* Ensure dropdown appears above other elements */
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

.markdown-content pre {
  position: relative;
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
