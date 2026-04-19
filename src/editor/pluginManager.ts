import { Schema } from "../utility/schema";
import { Global } from "../global/global";
import { EditorTab } from "./editorTabs";
import { Ref, ref } from "vue";
import * as Vue from "vue";
import { ManifestObject } from "../schemas/manifestSchema";
import { loadCharacterImages } from "../shared/utils/characterImageLoader";
import EditorCharacterPreview from "./views/shared/EditorCharacterPreview.vue";
import { Editor } from "./editor";
import { PluginObject } from "../schemas/pluginShema";
import { jsonrepair } from "jsonrepair";


export class PluginManager {

    public pluginList: Ref<string[]> = ref([]);

    // list of active plugins
    public plugins: Ref<PluginObject[]> = ref([]);

    // list of plugin tabs
    public pluginTabs: Ref<EditorTab[]> = ref([]);

    // plugin popup IDs per subtab (e.g., "character_templates" → ["rpg-overlay-tuner"])
    private pluginPopupsByTab = new Map<string, string[]>();

    // EDITOR LOGIC
    public async processSchema(currentSchema: Schema | null, basePath: string): Promise<Schema | null> {

        if (currentSchema) {
            for (const key in currentSchema) {
                if (currentSchema[key].isFromPlugins) {
                    currentSchema[key].options = await this.getAllPlugins(basePath);
                    currentSchema[key].optionLabel = 'label';
                    currentSchema[key].optionValue = 'value';
                }
            }
        }
        return currentSchema;
    }

    private async getAllPlugins(basePath: string): Promise<Array<{ value: string, label: string, order: number }>> {

        // 1. fetch a list of global plugins
        const plugins = await Global.getInstance().listFolders(`engine_files/plugins`);

        let allPluginIds;
        if (Editor.getInstance().mainTab !== "new") {
            // 2. fetch a list of mod plugins
            const modPlugins = await Global.getInstance().listFolders(`${basePath}/plugins`);

            // 3. merge the two lists
            allPluginIds = [...plugins, ...modPlugins];
        } else {
            allPluginIds = plugins;
        }

        // 4. if there are duplicates console.error the duplicates
        const duplicates = allPluginIds.filter((plugin, index, self) =>
            self.indexOf(plugin) !== index
        );
        if (duplicates.length > 0) {
            console.error("Duplicate plugins found:", duplicates);
            console.error("Make sure the custom plugins don't have the same id as the global plugins");
        }

        // 5. Create options array with labels by loading plugin.json for each plugin
        const allPlugins: Array<{ value: string, label: string, order: number }> = [];

        for (const pluginId of allPluginIds) {
            let label: string;
            let pluginJson: any = null;

            // Pick the right source before touching the network. pathExists
            // resolves against the cached files_tree.json in web mode, so
            // probing the global path for a game-scoped plugin no longer
            // fires a 404 fetch (which Nuxt's dev server logs as a Vue Router
            // "no match found" warning).
            const globalPath = `engine_files/plugins/${pluginId}/plugin.json`;
            const modPath = `${basePath}/plugins/${pluginId}/plugin.json`;
            const isGlobal = await Global.getInstance().pathExists(globalPath);
            const pluginJsonPath = isGlobal ? globalPath : modPath;

            try {
                pluginJson = await Global.getInstance().readJson(pluginJsonPath);
            } catch {
                // readJson threw; leave pluginJson null and fall through to
                // the warn below.
            }
            if (!pluginJson) {
                console.warn(`[PluginManager] Could not load plugin.json for ${pluginId} at ${pluginJsonPath}`);
            }

            // Create label from plugin.json metadata or fallback
            if (pluginJson?.name) {
                if (pluginJson.description) {
                    label = `${pluginJson.name} [${pluginJson.description}]`;
                } else {
                    label = pluginJson.name;
                }
                //console.log(`[PluginManager] Using name from JSON for ${pluginId}: ${label}`);
            } else {
                // Fallback to plugin ID
                label = pluginId;
                //console.log(`[PluginManager] Using formatted ID for ${pluginId}: ${label}`);
            }

            allPlugins.push({ value: pluginId, label, order: pluginJson?.order || 0 });
        }

        allPlugins.sort((a, b) => a.order - b.order);
        return allPlugins;
    }


    public async initActivePlugins(gameId: string, modId: string): Promise<void> {
        this.pluginList.value = [];
        this.plugins.value = [];


        // 0. fetch game manifest for turned on plugins
        for (const modItterator of Editor.getInstance().getModList(modId)) {
            const gameManifest = await Global.getInstance().readJson(`games_files/${gameId}/${modItterator}/manifest.json`) as ManifestObject;
            if (gameManifest.plugins) {
                this.pluginList.value = [...this.pluginList.value, ...gameManifest.plugins];
            }
        }

        // 1. Look inside global plugins
        const globalPlugins = await Global.getInstance().listFolders(`engine_files/plugins`);
        for (const plugin of globalPlugins) {
            if (!this.pluginList.value.includes(plugin)) {
                continue;
            }

            let pluginJson = await Global.getInstance().readJson(`engine_files/plugins/${plugin}/plugin.json`);
            if (pluginJson) {
                const pluginObject = this.convertJsonToPluginObject(pluginJson, plugin);
                this.plugins.value.push(pluginObject);
            } else {
                console.error(`Plugin manifest not found for global plugin '${plugin}': engine_files/plugins/${plugin}/plugin.json`);
            }
        }

        // 2. Look inside mod plugins
        for (const modItterator of Editor.getInstance().getModList(modId)) {
            const basePath = `games_files/${gameId}/${modItterator}`;
            const modPlugins = await Global.getInstance().listFolders(`${basePath}/plugins`);
            for (const plugin of modPlugins) {
                if (!this.pluginList.value.includes(plugin)) {
                    continue;
                }

                // remove the manifest from list with this id(in case both _core and mod have the same plugin)
                this.plugins.value = this.plugins.value.filter(my_plugin => my_plugin.id !== plugin);

                let pluginJson = await Global.getInstance().readJson(`${basePath}/plugins/${plugin}/plugin.json`);
                if (pluginJson) {
                    const pluginObject = this.convertJsonToPluginObject(pluginJson, plugin);
                    this.plugins.value.push(pluginObject);
                } else {
                    console.error(`Plugin manifest not found for mod plugin '${plugin}': ${basePath}/plugins/${plugin}/plugin.json`);
                }

            }
        }
        //console.log('[PluginManager] Plugins:', this.plugins.value);

        // 3. Sort plugins by order before creating tabs
        this.plugins.value.sort((a, b) => (a.order || 0) - (b.order || 0));

        // 4. init plugin tabs
        await this.initPluginTabs();

        // 5. Load plugin editor popups
        await this.initPluginPopups();

    }

    /**
     * Returns plugin popup IDs registered for a given subtab.
     */
    public getPopupsForTab(subtabId: string): string[] {
        return this.pluginPopupsByTab.get(subtabId) || [];
    }

    /**
     * Loads editor popup components declared in plugin.json `editor_popups`.
     * Each popup's .mjs script is dynamically imported and registered with the editor.
     */
    private async initPluginPopups(): Promise<void> {
        this.pluginPopupsByTab.clear();
        const editor = Editor.getInstance();

        // Expose Vue and editor utilities so plugin editor scripts can access them without bare imports
        (window as any).__editorVue = Vue;
        (window as any).__editorUtils = { loadCharacterImages, editor, EditorCharacterPreview };

        for (const plugin of this.plugins.value) {
            const popups = (plugin as any).editor_popups;
            if (!Array.isArray(popups) || popups.length === 0) continue;

            // Resolve plugin path (same logic as initActivePlugins)
            const pluginPath = await this.resolvePluginPath(plugin.id);
            if (!pluginPath) continue;

            for (const popup of popups) {
                if (!popup.id || !popup.script || !popup.tab) continue;
                try {
                    // Load optional CSS
                    if (popup.css) {
                        this.loadPluginCss(`assets/${pluginPath}/${popup.css}`);
                    }
                    const mod = await this.importPluginScript(`assets/${pluginPath}/${popup.script}`);
                    const component = mod.default || mod[Object.keys(mod)[0]];
                    if (!component) {
                        console.error(`[PluginManager] No component exported from ${popup.script} (plugin: ${plugin.id})`);
                        continue;
                    }
                    editor.registerCustomComponent({
                        id: popup.id,
                        name: popup.name || popup.id,
                        component,
                    });
                    const existing = this.pluginPopupsByTab.get(popup.tab) || [];
                    existing.push(popup.id);
                    this.pluginPopupsByTab.set(popup.tab, existing);
                } catch (e) {
                    console.error(`[PluginManager] Failed to load editor popup '${popup.id}' from ${popup.script}:`, e);
                }
            }
        }
    }

    /**
     * Dynamically imports an .mjs file from /public via fetch + blob URL
     * (bypasses Vite's transform pipeline which rejects /public imports).
     */
    private async importPluginScript(url: string): Promise<any> {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
        const source = await response.text();
        const blob = new Blob([source], { type: 'text/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        try {
            return await import(/* @vite-ignore */ blobUrl);
        } finally {
            URL.revokeObjectURL(blobUrl);
        }
    }

    /**
     * Loads a CSS file by injecting a <link> tag into the document head.
     */
    private loadPluginCss(url: string): void {
        if (document.querySelector(`link[href="${url}"]`)) return; // already loaded
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        document.head.appendChild(link);
    }

    /**
     * Resolves the base path for a plugin (global or mod-specific).
     */
    private async resolvePluginPath(pluginId: string): Promise<string | null> {
        const editor = Editor.getInstance();
        const gameId = editor.selectedGame;
        const modId = editor.selectedMod;

        // Check mod plugins first (they override global)
        if (gameId && modId) {
            for (const modIt of editor.getModList(modId)) {
                const path = `games_files/${gameId}/${modIt}/plugins/${pluginId}`;
                const json = await Global.getInstance().readJson(`${path}/plugin.json`);
                if (json) return path;
            }
        }

        // Fall back to global
        const globalPath = `engine_files/plugins/${pluginId}`;
        const json = await Global.getInstance().readJson(`${globalPath}/plugin.json`);
        if (json) return globalPath;

        return null;
    }

    /**
     * Parses JSON string properties that should be objects (fromFileTypeAnd, fromFileTypeOr).
     * These are stored as textarea fields in plugin schemas but need to be objects for filtering.
     * Uses jsonrepair for more robust parsing of potentially malformed JSON.
     */
    private parseJsonSchemaProperties(schemaDef: any): void {
        if (schemaDef.fromFileTypeAnd && typeof schemaDef.fromFileTypeAnd === 'string') {
            try {
                schemaDef.fromFileTypeAnd = JSON.parse(jsonrepair(schemaDef.fromFileTypeAnd));
            } catch (e) {
                console.warn(`[PluginManager] Failed to parse fromFileTypeAnd: ${schemaDef.fromFileTypeAnd}`);
            }
        }
        if (schemaDef.fromFileTypeOr && typeof schemaDef.fromFileTypeOr === 'string') {
            try {
                schemaDef.fromFileTypeOr = JSON.parse(jsonrepair(schemaDef.fromFileTypeOr));
            } catch (e) {
                console.warn(`[PluginManager] Failed to parse fromFileTypeOr: ${schemaDef.fromFileTypeOr}`);
            }
        }
    }

    /**
     * Recursively converts schema arrays (with propertyId) to object format.
     * Handles nested 'objects' properties inside schema[] fields.
     */
    private convertSchemaArrayToObject(schema: any): Schema {
        if (!schema || typeof schema !== 'object') return schema;

        // If it's an array with propertyId, convert to object
        if (Array.isArray(schema)) {
            const result: Schema = {};
            schema.forEach((prop: any) => {
                if (prop.propertyId || prop.id) {
                    const propertyId = prop.propertyId || prop.id;
                    const { propertyId: _pid, id: _id, uid: _uid, ...schemaDef } = prop;
                    // Recursively convert nested objects
                    if (schemaDef.objects) {
                        schemaDef.objects = this.convertSchemaArrayToObject(schemaDef.objects);
                    }
                    // Parse JSON string properties
                    this.parseJsonSchemaProperties(schemaDef);
                    result[propertyId] = schemaDef;
                }
            });
            return result;
        }

        // If it's an object, check each property for nested objects
        const result: Schema = {};
        for (const [key, value] of Object.entries(schema)) {
            const schemaDef = { ...(value as any) };
            if (schemaDef.objects) {
                schemaDef.objects = this.convertSchemaArrayToObject(schemaDef.objects);
            }
            // Parse JSON string properties
            this.parseJsonSchemaProperties(schemaDef);
            result[key] = schemaDef;
        }
        return result;
    }

    private async initPluginTabs(): Promise<void> {

        this.pluginTabs.value = [];
        for (const plugin of this.plugins.value) {

            if (!plugin.tabs?.length) {
                continue;
            }



            let subtabs: any[] = [];
            plugin.tabs.forEach(tab => {
                // Convert schema from array format back to object format for runtime use
                // This recursively handles nested 'objects' inside schema[] fields
                let baseSchema: Schema = this.convertSchemaArrayToObject(tab.schema);

                let schema: Schema;
                if (tab.isArray) {
                    schema = Object.assign({
                        id: {
                            type: 'string',
                            required: true,
                        },
                        uid: {
                            type: 'uid',
                            required: true,
                        },
                    }, baseSchema) as Schema;
                } else {
                    schema = baseSchema;
                }
                subtabs.push({
                    id: tab.id,
                    schema: schema,
                    file: `plugins_data/${plugin.id}/${tab.id}`,
                    title: tab.id,
                    name: tab.name && tab.name.trim() !== '' ? tab.name : tab.id,
                    isArray: tab.isArray,
                    requiresMod: true,
                    disabled: false,
                });
            });

            let tab: EditorTab = {
                id: plugin.id,
                name: plugin.name && plugin.name.trim() !== '' ? plugin.name : plugin.id,
                subtabs: subtabs,
            };
            this.pluginTabs.value.push(tab);
        }


    }

    public getPluginDataList(key: string): object[] {
        const result: object[] = [];
        for (const plugin of this.plugins.value) {
            if (plugin.data && Array.isArray(plugin.data)) {
                for (const dataItem of plugin.data) {
                    if (dataItem.fileName === key && dataItem.fileData) {
                        try {
                            const parsedData = JSON.parse(dataItem.fileData);
                            if (Array.isArray(parsedData)) {
                                result.push(...parsedData);
                            }
                        } catch (e) {
                            console.error('Failed to parse plugin fileData:', e);
                        }
                    }
                }
            }
        }
        return result;
    }

    /**
     * Converts plugin.json (old format with records) to PluginObject (new format with arrays)
     */
    private convertJsonToPluginObject(json: any, pluginId: string): PluginObject {
        // Convert tabs schema from object format to array format
        const convertedTabs = (json.tabs || []).map((tab: any) => {
            if (tab.schema && typeof tab.schema === 'object' && !Array.isArray(tab.schema)) {
                // Convert schema from object to array format
                const schemaArray = Object.entries(tab.schema).map(([propertyId, schemaDef]: [string, any]) => ({
                    ...schemaDef,
                    uid: schemaDef.uid || this.generateUid(),
                    propertyId,
                    id: propertyId  // Use id field for form labels - MUST be after spread to override
                }));
                console.log('[PluginManager] Converting tab schema:', tab.id, 'from:', tab.schema, 'to:', schemaArray);
                return { ...tab, schema: schemaArray };
            }
            return tab;
        });

        // Convert data from object format to array format
        // From: { "character_traits": [...], "character_traits": [...] }
        // To: [{ uid: "...", fileName: "character_properties", fileData: "[...]" }, { uid: "...", fileName: "character_traits", fileData: "[...]" }]
        const dataArray = [];
        if (json.data && typeof json.data === 'object') {
            for (const [fileName, fileData] of Object.entries(json.data)) {
                dataArray.push({
                    uid: this.generateUid(),
                    fileName,
                    fileData: JSON.stringify(fileData, null, 2)
                });
            }
        }

        // Start with shallow copy of all top-level fields (future-proof - new fields automatically included)
        // Then override specific fields that need special handling
        const pluginObject: PluginObject = {
            ...json,
            uid: this.generateUid(),  // Always generate new uid (editor-only field)
            id: pluginId,              // Use parameter (folder name) as id
            tabs: convertedTabs,       // Use converted tabs
            data: dataArray            // Use converted data
        };

        //console.log('[PluginManager] Converted plugin:', pluginId, JSON.stringify(pluginObject, null, 2));

        return pluginObject;
    }

    /**
     * Converts PluginObject (new format) back to plugin.json format (old format)
     */
    private convertPluginObjectToJson(pluginObject: PluginObject): any {
        // Start with shallow copy of all top-level fields (future-proof - new fields automatically included)
        const json: any = { ...pluginObject };

        // Remove editor-only field
        delete json.uid;

        // Convert tabs schema from array format back to object format
        if (pluginObject.tabs && Array.isArray(pluginObject.tabs)) {
            json.tabs = pluginObject.tabs.map((tab: any) => {
                if (tab.schema && Array.isArray(tab.schema)) {
                    // Convert schema from array to object format
                    const schemaObject: any = {};
                    tab.schema.forEach((prop: any) => {
                        const { propertyId, id, uid, ...schemaDef } = prop;
                        if (propertyId) {
                            schemaObject[propertyId] = schemaDef;
                        }
                    });
                    return { ...tab, schema: schemaObject };
                }
                return tab;
            });
        }

        // Convert data from array format back to object format
        // From: [{ fileName: "character_properties", fileData: "[...]" }]
        // To: { "character_properties": [...] }
        if (pluginObject.data && Array.isArray(pluginObject.data) && pluginObject.data.length > 0) {
            json.data = {};
            for (const dataItem of pluginObject.data) {
                if (dataItem.fileName && dataItem.fileData) {
                    try {
                        json.data[dataItem.fileName] = JSON.parse(dataItem.fileData);
                    } catch (e) {
                        console.error(`Failed to parse fileData for ${dataItem.fileName}:`, e);
                    }
                }
            }
        }

        return json;
    }

    private generateUid(): string {
        //return Math.random().toString(36).substring(2, 15);
        return Editor.getInstance().createUid();
    }

    /**
     * Load all plugins from plugins folder for dev/plugins tab
     */
    public async loadPluginsForDevTab(gameId: string, modId: string): Promise<PluginObject[]> {
        const plugins: PluginObject[] = [];
        const basePath = `games_files/${gameId}/${modId}/plugins`;

        try {
            const pluginFolders = await Global.getInstance().listFolders(basePath);

            for (const pluginFolder of pluginFolders) {
                try {
                    const pluginJsonPath = `${basePath}/${pluginFolder}/plugin.json`;
                    const pluginJson = await Global.getInstance().readJson(pluginJsonPath);

                    if (pluginJson) {
                        const pluginObject = this.convertJsonToPluginObject(pluginJson, pluginFolder);
                        plugins.push(pluginObject);
                    }
                } catch (error) {
                    console.warn(`Failed to load plugin from ${pluginFolder}:`, error);
                }
            }
        } catch (error) {
            console.warn(`No plugins folder found at ${basePath}:`, error);
        }

        return plugins;
    }

    /**
     * Save plugins from dev/plugins tab to plugin.json files
     */
    public async savePluginsFromDevTab(gameId: string, modId: string, plugins: PluginObject[]): Promise<void> {
        const basePath = `games_files/${gameId}/${modId}/plugins`;

        // Get existing plugin folders to detect deletions
        let existingFolders: string[] = [];
        try {
            existingFolders = await Global.getInstance().listFolders(basePath);
        } catch (error) {
            // Plugins folder doesn't exist yet, will be created
        }

        const pluginIds = plugins.map(p => p.id);

        // Delete removed plugins
        console.log('[PluginManager] Existing folders:', existingFolders);
        console.log('[PluginManager] Current plugin IDs:', pluginIds);
        for (const folder of existingFolders) {
            if (!pluginIds.includes(folder)) {
                const folderPath = `${basePath}/${folder}`;
                console.log(`[PluginManager] Deleting plugin folder: ${folderPath}`);
                try {
                    await Global.getInstance().deleteFile(folderPath, true); // Pass recursive=true for directories
                    console.log(`[PluginManager] Successfully deleted plugin folder: ${folder}`);
                } catch (error) {
                    console.error(`[PluginManager] Failed to delete plugin folder ${folder}:`, error);
                }
            }
        }

        // Create/update plugins
        for (const plugin of plugins) {
            const pluginPath = `${basePath}/${plugin.id}`;

            try {
                // Create plugin folder structure
                await Global.getInstance().createDir(pluginPath);
                await Global.getInstance().createDir(`${pluginPath}/scripts`);
                await Global.getInstance().createDir(`${pluginPath}/css`);

                // Convert and save plugin.json
                const pluginJson = this.convertPluginObjectToJson(plugin);
                await Global.getInstance().writeJson(`${pluginPath}/plugin.json`, pluginJson);

                console.log(`Saved plugin: ${plugin.id}`);
            } catch (error) {
                console.error(`Failed to save plugin ${plugin.id}:`, error);
            }
        }
    }


    // GAME LOGIC




}