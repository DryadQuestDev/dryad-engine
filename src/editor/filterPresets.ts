import { computed, ComputedRef, ref, Ref, shallowRef, ShallowRef } from 'vue';
import type { Editor } from './editor';
import { Global } from '../global/global';
import { Sifter } from '../utility/sifterManager';

/** Mod-relative file the presets live in, one array for every tab (`dev/filter_presets.json`). */
export const FILTER_PRESETS_FILE = 'dev/filter_presets';

/** One entry of `dev/filter_presets.json`. Matches `DevFilterPresetSchema`. */
export interface FilterPresetEntry {
  uid: string;
  id: string;
  name: string;
  scope: string;
  sifter: Sifter;
}

/** A preset as loaded into the editor: the file entry plus the mod folder it came from. */
export type FilterPreset = FilterPresetEntry & { source: string };

/**
 * One filter form's view of the presets: the store narrowed to the form's scope, the sifter the
 * form last applied, and the chip state derived from the two. Dsearch creates one per instance,
 * so the tab's own list and an embedded form (the ability picker sifting `ability_templates`
 * from a character template) each keep their own chips and never overwrite each other's state.
 */
export class FilterPresetSession {
  private manager: FilterPresetManager;
  private applyHandler: (preset: FilterPreset) => void;

  /** Scope the form filters under: the tab's unresolved file, or null while presets are off. */
  public scope: Ref<string | null>;
  /** The sifter the form last applied; the form publishes it after every sift. */
  public currentSifter: Ref<Sifter | null> = ref(null);
  /** Presets of this scope, alphabetical. */
  public presets: ComputedRef<FilterPreset[]>;
  /** The preset whose conditions equal the form's current sifter, if any. */
  public activePresetId: ComputedRef<string | null>;
  /** The form holds conditions that match no saved preset. */
  public canSaveCurrent: ComputedRef<boolean>;
  /** The chip row has something to show: saved presets, or the Save button. */
  public hasChipRow: ComputedRef<boolean>;

  constructor(manager: FilterPresetManager, scope: Ref<string | null>, applyHandler: (preset: FilterPreset) => void) {
    this.manager = manager;
    this.scope = scope;
    this.applyHandler = applyHandler;

    this.presets = computed(() => manager.presetsFor(this.scope.value));

    this.activePresetId = computed(() => {
      const current = this.currentSifter.value;
      if (!current || !hasConditions(current)) return null;
      const key = canonicalSifter(current);
      return this.presets.value.find(preset => canonicalSifter(preset.sifter) === key)?.id ?? null;
    });

    this.canSaveCurrent = computed(() => {
      const current = this.currentSifter.value;
      return !!this.scope.value && !!current && hasConditions(current) && this.activePresetId.value === null;
    });

    this.hasChipRow = computed(() => this.presets.value.length > 0 || this.canSaveCurrent.value);
  }

  public isWritable(preset: FilterPreset): boolean {
    return this.manager.isWritable(preset);
  }

  /** The preset a save under `name` would replace or override in this scope. */
  public findByName(name: string): FilterPreset | undefined {
    const scope = this.scope.value;
    if (!scope) return undefined;
    const id = this.manager.presetId(scope, name);
    return this.presets.value.find(preset => preset.id === id);
  }

  /** Saves the form's current sifter under `name` into the writable mod's file. */
  public async saveCurrent(name: string): Promise<FilterPreset | null> {
    const scope = this.scope.value;
    const sifter = this.currentSifter.value;
    if (!scope || !sifter) return null;
    return this.manager.save(scope, name, sifter);
  }

  public async remove(preset: FilterPreset): Promise<void> {
    await this.manager.remove(preset);
  }

  /** Writes the preset into the owning form. */
  public apply(preset: FilterPreset): void {
    this.applyHandler(preset);
  }
}

/**
 * Saved filter-form values, per editor tab, stored with the game or mod under `dev/`.
 *
 * The scope of a preset is the tab's unresolved file (`items/templates`, `[dungeon]/encounters`,
 * `plugins_data/<plugin>/<tab>`), so a dungeon preset serves every dungeon. With a mod selected
 * the list is the core file plus the mod file, last wins by id; core presets are read-only there
 * and a mod overrides one by saving the same name in the same scope.
 *
 * This class owns the store and the file IO. Each filter form works through its own
 * `FilterPresetSession`; the bookmark column's flyout reads the tab's own form via `mainSession`.
 */
export class FilterPresetManager {
  private editor: Editor;
  private global: Global;

  /** Every preset of the selected game and mod, merged. */
  public presets: Ref<FilterPreset[]> = ref([]);
  /** Session of the tab's own list form, registered by Dsearch; drives the bookmark column's flyout. */
  public mainSession: ShallowRef<FilterPresetSession | null> = shallowRef(null);

  constructor(editor: Editor) {
    this.editor = editor;
    this.global = Global.getInstance();
  }

  public createSession(scope: Ref<string | null>, applyHandler: (preset: FilterPreset) => void): FilterPresetSession {
    return new FilterPresetSession(this, scope, applyHandler);
  }

  /** Presets of one scope, alphabetical. Reactive when read from a computed. */
  public presetsFor(scope: string | null): FilterPreset[] {
    if (!scope) return [];
    return this.presets.value
      .filter(preset => preset.scope === scope)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The folder a save writes to: the selected mod, or `_core`. */
  private get writableMod(): string {
    return this.editor.selectedMod || '_core';
  }

  private filePath(mod: string): string {
    return `games_files/${this.editor.selectedGame}/${mod}/${FILTER_PRESETS_FILE}.json`;
  }

  private async readFile(mod: string): Promise<FilterPresetEntry[]> {
    try {
      const data = await this.global.readJson(this.filePath(mod));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  /** Reload from disk for the selected game and mod. */
  public async load(): Promise<void> {
    if (!this.editor.selectedGame) {
      this.presets.value = [];
      return;
    }
    const mods = this.writableMod === '_core' ? ['_core'] : ['_core', this.writableMod];
    const merged = new Map<string, FilterPreset>();
    for (const mod of mods) {
      for (const entry of await this.readFile(mod)) {
        if (!entry || typeof entry !== 'object' || !entry.id || !entry.scope) continue;
        merged.set(entry.id, { ...entry, name: entry.name || entry.id, sifter: entry.sifter ?? {}, source: mod });
      }
    }
    this.presets.value = [...merged.values()];
  }

  public isWritable(preset: FilterPreset): boolean {
    return preset.source === this.writableMod;
  }

  public presetId(scope: string, name: string): string {
    return `${slug(scope)}__${slug(name)}`;
  }

  /** Upserts a preset (by scope and name) into the writable mod's file and reloads. */
  public async save(scope: string, name: string, sifter: Sifter): Promise<FilterPreset | null> {
    const trimmed = name.trim();
    if (!scope || !trimmed || !this.editor.selectedGame) return null;

    const id = this.presetId(scope, trimmed);
    const mod = this.writableMod;
    // Read fresh rather than reusing the merged list: the Dev tab form edits the same file
    const entries = await this.readFile(mod);
    const existing = entries.find(entry => entry.id === id);
    const entry: FilterPresetEntry = {
      uid: existing?.uid ?? this.editor.createUid(),
      id,
      name: trimmed,
      scope,
      // Plain clone: the sifter comes out of a reactive form, and proxies do not survive IPC
      sifter: JSON.parse(JSON.stringify(sifter)),
    };
    const next = existing ? entries.map(item => (item.id === id ? entry : item)) : [...entries, entry];
    await this.global.writeJson(this.filePath(mod), next);
    await this.load();
    return this.presets.value.find(preset => preset.id === id) ?? null;
  }

  public async remove(preset: FilterPreset): Promise<void> {
    if (!this.isWritable(preset) || !this.editor.selectedGame) return;
    const mod = this.writableMod;
    const entries = await this.readFile(mod);
    await this.global.writeJson(this.filePath(mod), entries.filter(entry => entry.id !== preset.id));
    await this.load();
  }
}

function slug(text: string): string {
  const ascii = text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (ascii) return ascii;
  // A name without latin letters or digits would slug to nothing and collide with every other
  // such name in the scope, so fall back to a hash of the raw text
  let hash = 0;
  for (const char of text) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return hash.toString(36);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * A stable string for comparing sifters: empty parts dropped, entries sorted by key, values
 * sorted and stringified. Values compare as strings because the Dev tab form stores every
 * option as a string while the filter form keeps a numeric option numeric.
 */
export function canonicalSifter(sifter: Sifter | null | undefined): string {
  if (!sifter) return '{}';
  const out: Record<string, unknown> = {};
  const text = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
  const byKey = (a: { key: string }, b: { key: string }) => a.key.localeCompare(b.key);

  if (text(sifter.id)) out.id = text(sifter.id);
  if (text(sifter.search)) out.search = text(sifter.search);
  if (text(sifter.key)) out.key = text(sifter.key);

  const range = (sifter.range ?? [])
    .filter(entry => entry?.key && (isNumber(entry.min) || isNumber(entry.max)))
    .map(entry => ({ key: entry.key, min: isNumber(entry.min) ? entry.min : null, max: isNumber(entry.max) ? entry.max : null }))
    .sort(byKey);
  if (range.length) out.range = range;

  const selected = (sifter.selected ?? [])
    .filter(entry => entry?.key && Array.isArray(entry.values) && entry.values.length > 0)
    .map(entry => ({ key: entry.key, values: entry.values.map(String).sort() }))
    .sort(byKey);
  if (selected.length) out.selected = selected;

  const tag = (sifter.tag ?? [])
    .filter(entry => entry?.key && Array.isArray(entry.values) && entry.values.length > 0)
    .map(entry => ({ key: entry.key, logic: entry.logic === 'and' ? 'and' : 'or', values: entry.values.map(String).sort() }))
    .sort(byKey);
  if (tag.length) out.tag = tag;

  return JSON.stringify(out);
}

export function hasConditions(sifter: Sifter | null | undefined): boolean {
  return canonicalSifter(sifter) !== '{}';
}

/** One-line summary of a sifter for tooltips: `rarity = quest · tags: fire | ice`. */
export function describeSifter(sifter: Sifter | null | undefined): string {
  if (!sifter) return '';
  const parts: string[] = [];
  if (sifter.id?.trim()) parts.push(`id ~ "${sifter.id.trim()}"`);
  if (sifter.search?.trim()) parts.push(`search ~ "${sifter.search.trim()}"`);
  if (sifter.key?.trim()) parts.push(`key ${sifter.key.trim()}`);
  for (const entry of sifter.range ?? []) {
    if (!entry?.key || (!isNumber(entry.min) && !isNumber(entry.max))) continue;
    const min = isNumber(entry.min) ? String(entry.min) : '';
    const max = isNumber(entry.max) ? String(entry.max) : '';
    parts.push(`${entry.key}: ${min}–${max}`);
  }
  for (const entry of sifter.selected ?? []) {
    if (!entry?.key || !entry.values?.length) continue;
    parts.push(`${entry.key} = ${entry.values.join(' | ')}`);
  }
  for (const entry of sifter.tag ?? []) {
    if (!entry?.key || !entry.values?.length) continue;
    parts.push(`${entry.key}: ${entry.values.join(entry.logic === 'and' ? ' & ' : ' | ')}`);
  }
  return parts.join(' · ');
}
