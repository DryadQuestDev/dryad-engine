import { reactive } from 'vue';
import { Game } from '../game/game';
import { Global } from '../global/global';
import { Item } from '../game/core/character/item';
import { Editor } from './editor';

/**
 * Data-only hydration of the (hollow) Game singleton so game-side presentation
 * components (AbilityCard) can render inside the editor exactly like in-game.
 *
 * SAFE ONLY BECAUSE every editor→game transition is a full page reload
 * (usePlaytest.ts writes localStorage flags then window.location.reload()), so
 * nothing assigned here can reach a real game session. The hydrator must never
 * grow beyond pure data assignment: no coreSystem.init(), no Global.initGame /
 * loadExternalFiles / loadScript / loadCss, no window.engine, and never a write
 * to localStorage or IndexedDB — those two DO survive the reload.
 */

export interface AbilityPreviewData {
  templates: any[];
  definitions: any[];
  groups: any[];
  stats: any[];
  statuses: any[];
  characterTemplates: any[];
  itemTemplates: any[];
  skillSlots: any[];
}

const toMap = (arr: any[]): Map<string, any> => {
  const map = new Map<string, any>();
  for (const obj of arr) {
    if (obj && obj.id !== undefined) map.set(obj.id, { ...obj });
  }
  return map;
};

/**
 * Fills exactly the data slots ability rendering reads, from the editor's own
 * plugin-aware merged loader (plugin data → _core → selected mod — the same
 * precedence the runtime uses). Called on every popup open so freshly saved
 * edits show up; the maps are non-reactive statics, staleness between opens is
 * harmless and any real game boot rebuilds them from scratch after the reload.
 *
 * narrativeSystem.recordsMap is deliberately left EMPTY: with no records,
 * lore-link resolution falls back to plain labels and never reaches the
 * discover/state paths that need a booted game.
 */
export async function hydrateAbilityPreview(): Promise<AbilityPreviewData> {
  if (Global.getInstance().engineState.value === 'game') {
    throw new Error('[gamePreviewHydration] refusing to hydrate: a live game session owns the singleton');
  }

  const editor = Editor.getInstance();
  const game = Game.getInstance();

  const [templates, definitions, stats, statuses, characterTemplates, groups, itemTemplates, skillSlots, locale] =
    await Promise.all([
      editor.loadFullData('ability_templates'),
      editor.loadFullData('ability_definitions'),
      editor.loadFullData('character_stats'),
      editor.loadFullData('character_statuses'),
      editor.loadFullData('character_templates'),
      editor.loadFullData('ability_groups'),
      editor.loadFullData('item_templates'),
      editor.loadFullData('skill_slots'),
      editor.loadFullData('locale'),
    ]);

  game.characterSystem.abilityTemplatesMap = toMap(templates);
  game.characterSystem.abilityDefinitionsMap = toMap(definitions);
  game.characterSystem.statsMap = toMap(stats);
  // Status hover cards read statsVisibleMap when the show-hidden-stats dev toggle is
  // off. is_hidden is a PLAYER-facing filter; the editor is a dev surface, so the
  // preview shows everything — same as the game's own dev view (e.g. hidden passive_*
  // stats on a status must be visible to the author).
  game.characterSystem.statsVisibleMap = game.characterSystem.statsMap;
  game.coreSystem.localeMap = toMap(locale);

  // getData() throws on unregistered paths, and the description builders reach
  // these registry keys ([v:status], [v:character], [[item:...]] links).
  const registry = game.coreSystem.dataRegistry;
  registry.set('ability_templates', toMap(templates));
  registry.set('ability_definitions', toMap(definitions));
  registry.set('character_stats', toMap(stats));
  registry.set('character_stats_visible', game.characterSystem.statsVisibleMap);
  registry.set('character_statuses', toMap(statuses));
  registry.set('character_templates', toMap(characterTemplates));
  registry.set('ability_groups', toMap(groups));
  registry.set('item_templates', toMap(itemTemplates));

  // resolveAspectValue dereferences any definition's fromFile through getData —
  // register every one the merged definitions name (empty map when the file is
  // absent in this game), so a new definition never crashes the preview.
  const fromFiles = new Set<string>(
    definitions.map((d: any) => d?.fromFile).filter((f: any): f is string => typeof f === 'string' && f.length > 0)
  );
  for (const fileName of fromFiles) {
    if (registry.has(fileName)) continue;
    let data: any[] = [];
    try {
      data = await editor.loadFullData(fileName);
    } catch {
      // absent file → empty registry entry keeps getData from throwing
    }
    registry.set(fileName, toMap(data));
  }

  // Plugin editor-preview hooks (plugin.json `editor_preview`): register aspect
  // renderers etc. on the hydrated singleton and inject scope-wrapped preview css,
  // so cards read exactly like in-game. In-memory only — the playtest reload wipes it.
  await editor.pluginManager.initEditorPreview(game);

  return { templates, definitions, groups, stats, statuses, characterTemplates, itemTemplates, skillSlots };
}

/**
 * Ability hydration plus the item slots the game's item card reads: templates, traits,
 * categories and equip slots. Same rules as hydrateAbilityPreview — pure data assignment.
 */
export async function hydrateItemPreview(): Promise<AbilityPreviewData> {
  const preview = await hydrateAbilityPreview();
  const editor = Editor.getInstance();
  const game = Game.getInstance();
  const load = (file: string) => editor.loadFullData(file).catch(() => [] as any[]);
  const [traits, categories, slots] = await Promise.all([load('item_traits'), load('item_categories'), load('item_slots')]);

  game.itemSystem.itemTemplatesMap = toMap(preview.itemTemplates);
  game.itemSystem.itemTraitsMap = toMap(traits);
  game.itemSystem.itemCategoriesMap = toMap(categories);
  game.itemSystem.itemSlotsMap = toMap(slots);

  const registry = game.coreSystem.dataRegistry;
  registry.set('item_traits', toMap(traits));
  registry.set('item_categories', toMap(categories));
  registry.set('item_slots', toMap(slots));
  return preview;
}

/**
 * A live Item built from a hydrated template, for the item card: ItemSystem.createItem minus its
 * side effects — the template's `item_create` script never runs and no `item_create` event fires.
 * Returns null when no template has the id.
 */
export function createPreviewItem(itemId: string): Item | null {
  const template = Game.getInstance().itemSystem.itemTemplatesMap.get(itemId);
  return template ? createPreviewItemFrom(template) : null;
}

/** Same, from a template object the caller holds — an item editor's unsaved copy. */
export function createPreviewItemFrom(template: any): Item {
  const game = Game.getInstance();
  const obj = JSON.parse(JSON.stringify(template ?? {}));
  const item = reactive(new Item()) as Item;
  item.uid = `editor_preview_${obj.id ?? 'unsaved'}`;
  item.id = obj.id ?? '';
  item.traits = obj.traits || {};
  game.itemSystem.applyTemplateFields(item, obj);
  return item;
}

