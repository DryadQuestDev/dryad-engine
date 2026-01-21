import { Global } from "../global/global";
import { DungeonLine } from "../game/systems/dungeonSystem";
import { DungeonEncounterObject } from "../schemas/dungeonEncounterSchema";
import { DungeonRoomObject } from "../schemas/dungeonRoomSchema";
import { Editor } from "../editor/editor";
import { ref, Ref } from "vue";
import { DevEncountersDefaultObject } from "../schemas/devEncountersDefaultSchema";
import { DungeonConfigObject } from "../schemas/dungeonConfigSchema";

type Encounter = {
    id: string;
    roomId: string;
}

export class Analyser {
    private global: Global;
    private editor: Editor;

    private dungeonLines: DungeonLine[] = [];
    private dungeonRoomsMod: DungeonRoomObject[] = [];
    private dungeonRoomsAll: DungeonRoomObject[] = [];
    private dungeonEncountersMod: DungeonEncounterObject[] = [];
    private dungeonEncountersAll: DungeonEncounterObject[] = [];

    public analized: Ref<boolean> = ref(false);

    public missingRooms: Ref<Set<string>> = ref(new Set<string>()); // go over the doc and check if the room is in rooms file. If not, add to missingRooms
    public redundantRooms: Ref<Set<string>> = ref(new Set<string>()); // go over the rooms file and check if the room is in doc. If not, add to redundantRooms

    public missingEncounters: Ref<Encounter[]> = ref([]);
    public redundantEncounters: Ref<Encounter[]> = ref([]);

    public config: DungeonConfigObject;

    constructor() {
        this.global = Global.getInstance();
        this.editor = Editor.getInstance();
    }

    public async analyse() {

        this.analized.value = false;
        this.missingRooms.value = new Set<string>();
        this.redundantRooms.value = new Set<string>();
        this.missingEncounters.value = [];
        this.redundantEncounters.value = [];

        this.dungeonLines = [];
        this.dungeonRoomsAll = [];
        this.dungeonEncountersAll = [];
        this.dungeonEncountersMod = [];

        this.config = this.editor.activeObject.value as DungeonConfigObject;

        this.dungeonEncountersMod = await this.global.readJson(this.editor.getDungeonPath('encounters')) as DungeonEncounterObject[] || [];
        this.dungeonRoomsMod = await this.global.readJson(this.editor.getDungeonPath('rooms')) as DungeonRoomObject[] || [];
        if (this.editor.selectedMod === "_core") {
            this.dungeonLines = await this.global.readJson(this.editor.getDungeonPath('content_parsed')) as DungeonLine[] || [];
            this.dungeonRoomsAll = this.dungeonRoomsMod || [];
            this.dungeonEncountersAll = this.dungeonEncountersMod || [];
        } else {
            this.dungeonLines = await this.global.loadAndMergeArrayFile<DungeonLine>(this.editor.selectedGame!, `dungeons/${this.editor.selectedDungeon}/content_parsed`, ["_core", this.editor.selectedMod!]) as DungeonLine[] || [];
            this.dungeonRoomsAll = await this.global.loadAndMergeArrayFile<DungeonRoomObject>(this.editor.selectedGame!, `dungeons/${this.editor.selectedDungeon}/rooms`, ["_core", this.editor.selectedMod!]) as DungeonRoomObject[] || [];
            this.dungeonEncountersAll = await this.global.loadAndMergeArrayFile<DungeonEncounterObject>(this.editor.selectedGame!, `dungeons/${this.editor.selectedDungeon}/encounters`, ["_core", this.editor.selectedMod!]) as DungeonEncounterObject[] || [];
        }


        if (!this.dungeonLines || !this.dungeonLines.length) {
            this.global.addNotificationId("add_dungeon_content_first");
            return;
        }

        let docRoomsIds: Set<string> = new Set<string>();
        let docEncounters: Set<Encounter> = new Set<Encounter>();

        for (let line of this.dungeonLines) {
            let firstChar = line.id.charAt(0);
            if (firstChar != "@") {
                continue;
            }

            let parts = line.id.slice(1).split(".");
            let roomId = parts[0];
            let encounterName = parts[1];
            let encounterId = roomId + "." + encounterName;
            docRoomsIds.add(roomId);
            if (encounterName != "description") {
                docEncounters.add({ id: encounterId, roomId: roomId });
                // Skip encounter sync for text-based dungeons (no map to place encounters on)
                if (this.config.dungeon_type !== 'text') {
                    let isEncounterInFile = this.dungeonEncountersAll.find(e => e.id === encounterId);
                    if (!isEncounterInFile) {
                        this.missingEncounters.value.push({ id: encounterId, roomId: roomId });
                    }
                }
            }


            if (this.config.dungeon_type === 'map' || this.config.dungeon_type === 'text') {
                let isRoomInFile = this.dungeonRoomsAll.find(r => r.id === roomId);
                if (!isRoomInFile) {
                    this.missingRooms.value.add(roomId);
                }
            }

        }

        for (let room of this.dungeonRoomsAll) {
            if (!docRoomsIds.has(room.id)) {
                this.redundantRooms.value.add(room.id);
            }
        }

        // Skip redundant encounter check for text-based dungeons (no map to place encounters on)
        if (this.config.dungeon_type !== 'text') {
            for (const encounterFromFile of this.dungeonEncountersAll) {

                // Skip prop encounters - they don't need associated content
                if (encounterFromFile.type === 'prop') {
                    continue;
                }

                let isPresentInDoc = false;
                // Iterate over docEncounters to check for an object with the same id and roomId
                for (const docEncounter of docEncounters) {
                    if (docEncounter.id === encounterFromFile.id) {
                        isPresentInDoc = true;
                        break;
                    }
                }
                if (!isPresentInDoc) {
                    this.redundantEncounters.value.push({ id: encounterFromFile.id, roomId: "" });
                }
            }
        }


        this.analized.value = true;
    }

    public async deleteRedundantRooms() {
        // delete the rooms in the dungeonRooms array and assosiated doors in other rooms
        for (let room of this.dungeonRoomsMod) {
            if (this.redundantRooms.value.has(room.id)) {
                // delete the room
                this.dungeonRoomsMod = this.dungeonRoomsMod.filter(r => r.id !== room.id);
            }

            if (room.doors) {
                for (let redundantRoom of this.redundantRooms.value) {
                    if (room.doors.find(door => door === redundantRoom)) {
                        // delete the door
                        room.doors = room.doors.filter(d => d !== redundantRoom);
                    }
                }
            }

        }

        console.log(this.dungeonRoomsMod);
        await this.global.writeJson(this.editor.getDungeonPath('rooms'), this.dungeonRoomsMod);

        this.global.addNotificationId("redundant_rooms_deleted");

        // Clear the redundant rooms list to update the UI
        this.redundantRooms.value = new Set<string>();
    }

    public async createMissingEncounters() {
        const basePath = `games_files/${this.editor.selectedGame}/${this.editor.selectedMod}`;
        let defaultIcons = await this.editor.loadAndMergeFromFileData('dev/encounters_default', basePath) as DevEncountersDefaultObject[];

        if (!defaultIcons) {
            defaultIcons = []
        }

        let currentRoom: string = "";
        let xStart: number = 80;
        let dx: number = 0;

        for (let encounter of this.missingEncounters.value) {
            let room = this.dungeonRoomsAll.find(r => r.id === encounter.roomId);
            if (currentRoom != encounter.roomId) {
                currentRoom = encounter.roomId;
                dx = 0;
            } else {
                dx += 80;
            }

            let id = encounter.id;
            let name = encounter.id.split(".")[1];
            let newEncounter: DungeonEncounterObject = { id: id, uid: this.editor.createUid() };
            let defaultIcon = defaultIcons.find(icon => icon.id === name);
            if (defaultIcon) {
                newEncounter.image = defaultIcon.image;
            }

            newEncounter.x = (room?.x ?? 100) + xStart + dx;
            newEncounter.y = (room?.y ?? 100);
            newEncounter.type = 'encounter';

            this.dungeonEncountersMod.push(newEncounter);
        }

        await this.global.writeJson(this.editor.getDungeonPath('encounters'), this.dungeonEncountersMod);
        this.global.addNotificationId("missing_encounters_created");

        // Clear the missing encounters list to update the UI
        this.missingEncounters.value = [];
    }

    public async deleteRedundantEncounters() {

        for (let encounter of this.dungeonEncountersMod) {
            if (this.redundantEncounters.value.find(e => e.id === encounter.id)) {
                this.dungeonEncountersMod = this.dungeonEncountersMod.filter(e => e.id !== encounter.id);
            }
        }

        await this.global.writeJson(this.editor.getDungeonPath('encounters'), this.dungeonEncountersMod);

        this.global.addNotificationId("redundant_encounters_deleted");

        // Clear the redundant encounters list to update the UI
        this.redundantEncounters.value = [];
    }


}