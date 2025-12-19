import { Schema } from "../utility/schema";
import { Global } from "../global/global";
import { EditorTab } from "./editorTabs";
import { Ref, ref } from "vue";
import { ManifestObject } from "../schemas/manifestSchema";
import { Editor } from "./editor";
import { PluginObject } from "../schemas/pluginShema";


export class PluginManager {

    public pluginList: Ref<string[]> = ref([]);

    // list of active plugins
    public plugins: Ref<PluginObject[]> = ref([]);

    // list of plugin tabs
    public pluginTabs: Ref<EditorTab[]> = ref([]);

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

    private async getAllPlugins(basePath: string): Promise<Array<{ value: string, label: string }>> {

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
        const allPlugins: Array<{ value: string, label: string }> = [];

        for (const pluginId of allPluginIds) {
            let label: string;
            let pluginJson: any = null;

            // Try to load plugin.json from global plugins first
            const globalPath = `engine_files/plugins/${pluginId}/plugin.json`;
            const modPath = `${basePath}/plugins/${pluginId}/plugin.json`;

            try {
                pluginJson = await Global.getInstance().readJson(globalPath);
                // readJson might return null instead of throwing, check for it
                if (!pluginJson) {
                    throw new Error('readJson returned null');
                }
                console.log(`[PluginManager] Loaded ${pluginId} from global`);
            } catch (e) {
                // If not in global, try mod plugins
                try {
                    pluginJson = await Global.getInstance().readJson(modPath);
                    if (!pluginJson) {
                        throw new Error('readJson returned null');
                    }
                    console.log(`[PluginManager] Loaded ${pluginId} from mod`);
                } catch (e2) {
                    console.warn(`[PluginManager] Could not load plugin.json for ${pluginId} from either ${globalPath} or ${modPath}`);
                    // Plugin.json not found, will use fallback
                }
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

            allPlugins.push({ value: pluginId, label });
        }

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

        // 3. init plugin tabs
        await this.initPluginTabs();

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
                let baseSchema: Schema = {};
                if (tab.schema && Array.isArray(tab.schema)) {
                    // Schema is in array format, convert to object
                    tab.schema.forEach((prop: any) => {
                        if (prop.propertyId || prop.id) {
                            const propertyId = prop.propertyId || prop.id;
                            const { propertyId: _pid, id: _id, uid: _uid, ...schemaDef } = prop;
                            baseSchema[propertyId] = schemaDef;
                        }
                    });
                } else if (tab.schema && typeof tab.schema === 'object') {
                    // Already in object format
                    baseSchema = tab.schema as Schema;
                }

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
                name: plugin.meta?.name && plugin.meta.name.trim() !== '' ? plugin.meta.name : plugin.id,
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

        const pluginObject: PluginObject = {
            uid: json.uid || this.generateUid(),
            id: pluginId,
            meta: {
                name: json.name,
                description: json.description,
                author: json.author,
                version: json.version,
            },
            tabs: convertedTabs,
            data: dataArray
        };

        //console.log('[PluginManager] Converted plugin:', pluginId, JSON.stringify(pluginObject, null, 2));

        return pluginObject;
    }

    /**
     * Converts PluginObject (new format) back to plugin.json format (old format)
     */
    private convertPluginObjectToJson(pluginObject: PluginObject): any {
        // Convert tabs schema from array format back to object format
        const convertedTabs = (pluginObject.tabs || []).map((tab: any) => {
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

        const json: any = {
            id: pluginObject.id,
            name: pluginObject.meta?.name,
            description: pluginObject.meta?.description,
            author: pluginObject.meta?.author,
            version: pluginObject.meta?.version,
            tabs: convertedTabs
        };

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