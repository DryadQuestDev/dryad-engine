import { Global } from "../global/global";
import { DungeonConfigObject } from "../schemas/dungeonConfigSchema";
import { DungeonEncounterObject } from "../schemas/dungeonEncounterSchema";
import { DungeonRoomObject } from "../schemas/dungeonRoomSchema";
import { Editor } from "./editor";
import { getImageDimensions } from "../utility/functions";
import { mergeById, mergeObjectArraySequentially } from "../functions/mergeById";
import { ref, Ref, reactive } from "vue";


// Represents a connection line between two rooms
export type MapConnection = {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export type EditorMapObject = {

    config: DungeonConfigObject | null;
    rooms: {
        mod: string,
        val: DungeonRoomObject[]
    }[];
    encounters: {
        mod: string,
        val: DungeonEncounterObject[]
    }[];
    doors: {
        mod: string,
        val: MapConnection[]
    }[]

}

export type EditorMapState = {
    tab: string
    states: string[]
}

export type StateIconMap = {
    [key: string]: string;
}

export const ROOM_SIZE = 40;

export class EditorMap {

    private global: Global;
    private editor: Editor;
    constructor(editorInstance: Editor) {
        this.global = Global.getInstance();
        this.editor = editorInstance;
    }

    mapStates: EditorMapState[] = [
        {
            tab: 'rooms',
            states: ['drag', 'add', 'connect', 'fog_polygon', 'delete']
        },
        {
            tab: 'encounters',
            states: ['drag', 'add', 'set_image', 'set_polygon', 'delete']
        }
    ];

    stateIcons: StateIconMap = {
        'rooms.drag': 'pi-arrows-alt',
        'rooms.add': 'pi-plus',
        'rooms.connect': 'pi-link',
        'rooms.fog_polygon': 'pi-eye-slash',
        'rooms.delete': 'pi-trash',
        'encounters.drag': 'pi-arrows-alt',
        'encounters.add': 'pi-plus',
        'encounters.set_image': 'pi-image',
        'encounters.set_polygon': 'pi-pencil',
        'encounters.delete': 'pi-trash',
    };

    currentStates: Ref<string[]> = ref([]);
    activeState: Ref<string> = ref<string>('');



    public room_size = ROOM_SIZE;
    public room_size_halfed = this.room_size / 2;

    zoomFactor: Ref<number> = ref(1);
    widthBackground: number = 0;
    heightBackground: number = 0;

    width: number = 0;
    height: number = 0;
    padding: number = 0;
    indent: number = 0;
    indentYvalue: number = 0;
    screen_width: number = 0;
    screen_height: number = 0;



    editorObject: EditorMapObject = reactive({ config: null, rooms: [], encounters: [], doors: [] });


    //private roomMaps: Map<string, Map<string, DungeonRoomObject>> = new Map();
    //private roomMap: Map<string, DungeonRoomObject> = new Map(); // For quick lookups


    public isLoaded: Ref<boolean> = ref(false);
    public loadFailed: Ref<boolean> = ref(false);

    // Fog
    isFogVisible: Ref<boolean> = ref(false);

    // scroll coordinates of the map
    scrollX: number = 0;
    scrollY: number = 0;

    async init() {

        this.isLoaded.value = false;
        this.loadFailed.value = false;

        // alert('init');
        const selectedGame = this.editor.selectedGame;
        const selectedMod = this.editor.selectedMod;
        const selectedDungeon = this.editor.selectedDungeon;



        // Ensure required selections exist
        if (!selectedGame || !selectedMod || !selectedDungeon) {
            console.warn('[EditorMap] Cannot init map without selected game, mod, and dungeon.');
            // Clear existing data if selections are missing
            this.editorObject.config = null;
            this.editorObject.rooms = [];
            this.editorObject.encounters = [];
            this.editorObject.doors = [];
            //this.roomMap.clear();
            this.width = 0;
            this.height = 0;
            this.zoomFactor.value = 1;
            // Potentially notify listeners or handle the empty state appropriately
            return; // Stop initialization
        }

        this.editorObject.config = null;
        this.editorObject.rooms = [];
        this.editorObject.encounters = [];
        this.editorObject.doors = [];
        //this.roomMap.clear(); // Clear lookup map

        let mods = [selectedMod];
        if (selectedMod != "_core") {
            mods.unshift("_core");
        }

        let loadedConfigs: DungeonConfigObject[] = [];

        for (let mod of mods) {

            let rooms: DungeonRoomObject[];
            let encounters: DungeonEncounterObject[];

            if (mod === selectedMod) {

                // load rooms
                if (this.editor.secondaryTab === 'rooms') {
                    rooms = this.editor.activeObject.value as DungeonRoomObject[];
                } else {
                    rooms = await this.global.readJson(`games_files/${selectedGame}/${mod}/dungeons/${selectedDungeon}/rooms.json`) as DungeonRoomObject[];
                }

                // load encounters
                if (this.editor.secondaryTab === 'encounters') {
                    encounters = this.editor.activeObject.value as DungeonEncounterObject[];
                } else {
                    encounters = await this.global.readJson(`games_files/${selectedGame}/${mod}/dungeons/${selectedDungeon}/encounters.json`) as DungeonEncounterObject[];
                }

            } else {
                // load everything if another mod
                rooms = await this.global.readJson(`games_files/${selectedGame}/${mod}/dungeons/${selectedDungeon}/rooms.json`) as DungeonRoomObject[];
                encounters = await this.global.readJson(`games_files/${selectedGame}/${mod}/dungeons/${selectedDungeon}/encounters.json`) as DungeonEncounterObject[];
            }

            if (!rooms) {
                rooms = [];
            }
            if (!encounters) {
                encounters = [];
            }


            // load config
            let config = await this.global.readJson(`games_files/${selectedGame}/${mod}/dungeons/${selectedDungeon}/config.json`) as DungeonConfigObject;
            loadedConfigs.push(config);

            this.editorObject.rooms.push({
                mod: mod,
                val: rooms
            });
            this.editorObject.encounters.push({
                mod: mod,
                val: encounters
            });

        }

        let config: DungeonConfigObject | null = null; // Initialize as null

        if (loadedConfigs.length === 0) {
            console.error("[EditorMap] No configurations loaded.");
            // config remains null
        } else if (loadedConfigs.length === 1) {
            config = loadedConfigs[0];
        } else {
            // Use the function that directly returns a single merged object or null
            config = mergeObjectArraySequentially(loadedConfigs)
        }

        // Assign the final merged config (or null if none loaded/merged) to the editorObject
        this.editorObject.config = config;

        // Ensure config exists before proceeding
        if (!config) {
            console.error("[EditorMap] Configuration could not be determined.");
            this.width = 0;
            this.height = 0;
            return;
        }

        if (!config.dungeon_type) {
            this.loadFailed.value = true;
            return;
        }

        if (config.dungeon_type === 'text') {
            // Text-based dungeons use map_width and map_height from config
            this.widthBackground = config.map_width ?? 800;
            this.heightBackground = config.map_height ?? 600;
            this.padding = config.padding ?? 0;
            this.indent = 0;
        } else {
            // Map and screen types require an image
            if (!config.image) {
                this.loadFailed.value = true;
                return;
            }

            const { width, height } = await getImageDimensions(config.image);
            const scale = config.image_scaling ?? 1; // Get scale factor, default to 1

            this.widthBackground = (width * scale);
            this.heightBackground = (height * scale);

            if (config.dungeon_type === 'map') {
                this.padding = config.padding ?? 0;
                this.indent = 0;
            } else if (config.dungeon_type === 'screen') {
                this.padding = 5;
                this.indent = config.indent ?? 0;
                let screenHeight = this.widthBackground * 9 / 16;

                let leftOver = this.heightBackground - screenHeight;
                this.indentYvalue = this.indent * 9 / 16 / 2 + leftOver / 2;

                this.screen_width = this.widthBackground - this.indent;
                this.screen_height = this.heightBackground - this.indent;
            }
        }

        this.width = this.widthBackground + this.padding * 2;
        this.height = this.heightBackground + this.padding * 2;







        this.buildDoors(); // Build doors after loading all data

        this.isLoaded.value = true;

        //console.warn("scrollX", this.scrollX);
        //console.warn("scrollY", this.scrollY);
        /*
        setTimeout(() => {
            if(this.editor.mapContainer){
                this.editor.mapContainer.nativeElement.scrollLeft = this.scrollX;
                this.editor.mapContainer.nativeElement.scrollTop = this.scrollY;
            }
        }, 0)
        */
    }

    buildDoors() {
        this.editorObject.doors = []; // Clear previous doors
        //this.roomMaps.clear();
        //let rooms = this.editorObject.rooms.find(r => r.mod === this.selectedMod)?.val;

        for (let mod of this.editorObject.rooms) {
            let rooms = mod.val;
            if (!rooms) {
                continue;
            }
            let roomMap = new Map<string, DungeonRoomObject>();
            for (let room of rooms) {
                roomMap.set(room.id, room);
            }

            for (const sourceRoom of roomMap.values()) {
                if (!sourceRoom.doors || sourceRoom.doors.length === 0) {
                    continue; // No doors defined for this room
                }

                const sourceX = sourceRoom.x ?? 0;
                const sourceY = sourceRoom.y ?? 0;
                const sourceCenterX = sourceX + this.room_size_halfed;
                const sourceCenterY = sourceY + this.room_size_halfed;

                for (const targetRoomId of sourceRoom.doors) {
                    const targetRoom = roomMap.get(targetRoomId);

                    // Check if target exists and ensure IDs are defined before comparing
                    // Also avoid duplicate connections (process only if sourceId < targetId)
                    if (!targetRoom || !sourceRoom.id || !targetRoom.id || sourceRoom.id >= targetRoom.id) {
                        continue;
                    }

                    const targetX = targetRoom.x ?? 0;
                    const targetY = targetRoom.y ?? 0;
                    const targetCenterX = targetX + this.room_size_halfed;
                    const targetCenterY = targetY + this.room_size_halfed;

                    const dx = targetCenterX - sourceCenterX;
                    const dy = targetCenterY - sourceCenterY;

                    let x1: number, y1: number, x2: number, y2: number;

                    // Determine connection points based on relative positions
                    if (Math.abs(dx) > Math.abs(dy)) {
                        // Connect horizontally (left/right sides)
                        if (dx > 0) { // Target is to the right
                            x1 = sourceX + this.room_size; // Source right-middle
                            y1 = sourceCenterY;
                            x2 = targetX;                 // Target left-middle
                            y2 = targetCenterY;
                        } else { // Target is to the left
                            x1 = sourceX;                 // Source left-middle
                            y1 = sourceCenterY;
                            x2 = targetX + this.room_size; // Target right-middle
                            y2 = targetCenterY;
                        }
                    } else {
                        // Connect vertically (top/bottom sides)
                        if (dy > 0) { // Target is below
                            x1 = sourceCenterX;
                            y1 = sourceY + this.room_size; // Source bottom-middle
                            x2 = targetCenterX;
                            y2 = targetY;                 // Target top-middle
                        } else { // Target is above
                            x1 = sourceCenterX;
                            y1 = sourceY;                 // Source top-middle
                            x2 = targetCenterX;
                            y2 = targetY + this.room_size; // Target bottom-middle
                        }
                    }

                    this.editorObject.doors.push({ mod: mod.mod, val: [{ x1, y1, x2, y2 }] });
                }
            }

        }



        console.log('[EditorMap] Built doors:', this.editorObject.doors); // For debugging
    }




    handleZoom(event: WheelEvent) {
        event.preventDefault(); // Prevent default scroll behavior
        const zoomSpeed = 0.1;
        const direction = event.deltaY > 0 ? -1 : 1; // -1 for zoom out, 1 for zoom in
        this.zoomFactor.value += direction * zoomSpeed;
        // Clamp zoom factor to reasonable limits (e.g., 0.1 to 5)
        this.zoomFactor.value = Math.max(0.1, Math.min(this.zoomFactor.value, 5));
        // Round to avoid floating point inaccuracies causing long decimals
        this.zoomFactor.value = parseFloat(this.zoomFactor.value.toFixed(3));

        // console.log(`Zoom factor: ${this.zoomFactor.value}`); // For debugging
        // TODO: Add logic to apply the zoom visually (e.g., using CSS transform: scale())
    }


}

