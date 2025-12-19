import { Dungeon } from "./dungeon";
import { gameLogger } from "../../utils/logger";
import { Global } from "../../../global/global";
import { Game } from "../../../game/game";
import { DungeonLine } from "../../types";
import { DungeonRoom } from "./dungeonRoom";
import { DungeonEncounter } from "./dungeonEncounter";
import { DungeonRoomObject } from "../../../schemas/dungeonRoomSchema";
import { DungeonConfigObject } from "../../../schemas/dungeonConfigSchema";
import { getImageDimensions } from "../../../utility/functions";
import { DungeonEncounterObject } from "../../../schemas/dungeonEncounterSchema";
import { DungeonEvent } from "./dungeonEvent";
import { DungeonConfigParsed } from "../../../editor/editor";


export class DungeonFabric {
    dungeonLines!: Map<string, DungeonLine>;
    dungeonConfig!: DungeonConfigParsed;



    public createDungeon(dungeonId: string): Dungeon {
        let game = Game.getInstance();

        let dungeon = new Dungeon();

        dungeon.id = dungeonId;

        this.dungeonLines = game.dungeonSystem.dungeonLines.get(dungeon.id)!;
        if (!this.dungeonLines) {
            throw new Error(`Dungeon Lines not found for dungeon ${dungeon.id}`);
        }

        // set dungeon config
        this.dungeonConfig = this.dungeonLines.get('_config_')?.params as DungeonConfigParsed;

        dungeon.dungeon_type = this.dungeonConfig.dungeon_type as 'map' | 'screen' || 'map';
        dungeon.image = this.dungeonConfig.image || '';
        dungeon.image_scaling = this.dungeonConfig.image_scaling || 1;

        if (this.dungeonConfig.dungeon_type === 'map') {
            dungeon.padding = this.dungeonConfig.padding || 0;
            dungeon.fog_default = this.dungeonConfig.fog_default || 0;
            dungeon.fog_shadow_coef = this.dungeonConfig.fog_shadow_coef || 0;
        } else {
            dungeon.indent = this.dungeonConfig.indent || 0;
            dungeon.fog_default = 0;
            dungeon.fog_shadow_coef = 0;
        }

        dungeon.music = this.dungeonConfig.music || '';
        dungeon.actions = this.dungeonConfig.actions || {};


        // TODO: move assets load later to when entering Adventure Screen, not when creating a dungeon
        // including map and its dimensions
        // assets load


        this.loadAssets(dungeon); // very important to load assets before showing the map. TODO: fix it later.


        dungeon.rooms = this.createDungeonRooms(dungeonId);
        dungeon.encounters = this.createDungeonEncounters(dungeon);

        this.initDungeonLines(dungeon);

        // Debug: console.log(dungeon.encounters);
        // Debug: console.log(this.dungeonConfig);


        gameLogger.info(`Triggering dungeon_create for: ${dungeon.id}`);
        if (dungeon.actions?.dungeon_create) {
            game.logicSystem.resolveActions(dungeon.actions.dungeon_create);
        }
        game.trigger('dungeon_create', dungeon);
        return dungeon;
    }

    private loadAssets(dungeon: Dungeon) {

        const width = this.dungeonConfig.map_width ?? 0;
        const height = this.dungeonConfig.map_height ?? 0;
        const scale = dungeon.image_scaling;

        dungeon.widthBackground = (width * scale);
        dungeon.heightBackground = (height * scale);

        dungeon.widthBackgroundWithPadding = dungeon.widthBackground + (dungeon.padding) * 2;
        dungeon.heightBackgroundWithPadding = dungeon.heightBackground + (dungeon.padding) * 2;

        if (this.dungeonConfig.fog_image) {
            dungeon.fog_image = this.dungeonConfig.fog_image;
        } else {
            dungeon.fog_image = 'assets/engine_assets/ui/fog.png';
        }

        // load fog image
        //await getImageDimensions(dungeon.fog_image);

        // TODO: load encounters images
    }

    private createDungeonRooms(dungeonId: string): Map<string, DungeonRoom> {
        let game = Game.getInstance();
        //let roomsObjects = await game.coreSystem.fetchArrayFile<DungeonRoomObject>("rooms", dungeonId);
        let roomsObjects = Array.from(game.dungeonSystem.dungeonRooms.get(dungeonId)?.values() || []);
        let rooms: Map<string, DungeonRoom> = new Map();

        // if dungeon is vn-like screen, create only 'main' room
        if (this.dungeonConfig.dungeon_type === 'screen') {
            let roomObject: DungeonRoomObject = {
                id: "main",
                uid: "main",
            }
            roomsObjects = [roomObject];
        }
        //console.log("roomsObjects", roomsObjects);

        for (let roomObject of roomsObjects) {

            // create room
            let room = new DungeonRoom();
            room.id = roomObject.id;
            room.x = roomObject.x ?? 0;
            room.y = roomObject.y ?? 0;
            room.setXY(room.x, room.y, this.dungeonConfig?.padding || 0);
            room.movementEncounter = new DungeonEncounter();
            rooms.set(room.id, room);

            // set fog
            room.setFog(roomObject.fog, this.dungeonConfig?.fog_default || 0, this.dungeonConfig?.fog_shadow_coef || 0, this.dungeonConfig?.padding || 0);
            room.fogMaskShadowNeighbor = roomObject.fog?.neighbor_shadow ?? false;

            // set default assets
            room.defaultAssets = roomObject.default_assets || [];

            // set actions
            room.actions = roomObject.actions || {};
        }

        for (let roomObject of roomsObjects) {
            let room = rooms.get(roomObject.id)!;

            // set doors
            if (roomObject.doors) {
                for (let door of roomObject.doors) {
                    let neighborRoom = rooms.get(door)!;
                    //const direction = room.getDirection(neighborRoom);
                    const angle = room.getAngle(neighborRoom);
                    room.neighborsWithDirection.push({ room: neighborRoom, angle: angle });
                    room.neighbors.push(neighborRoom);
                }
            }
        }
        return rooms;
    }


    private createDungeonEncounters(dungeon: Dungeon): Map<string, DungeonEncounter> {
        let game = Game.getInstance();
        let encountersObjects = Array.from(game.dungeonSystem.dungeonEncounters.get(dungeon.id)?.values() || []);
        let encounters: Map<string, DungeonEncounter> = new Map();
        for (let encounterObject of encountersObjects) {
            let encounter = new DungeonEncounter();
            encounter.id = encounterObject.id;
            //console.log("encounterObject.id", encounterObject.id);

            let roomId = encounterObject.id.split('.')[0];

            encounter.room = dungeon.getRoomById(roomId)!;
            encounter.x = encounterObject.x ?? 0;
            encounter.y = encounterObject.y ?? 0;
            encounter.z = encounterObject.z ?? 25;
            encounter.scale = encounterObject.scale ?? 1;
            encounter.rotation = encounterObject.rotation ?? 0;
            encounter.image = encounterObject.image ?? '';
            encounter.type = encounterObject.type ?? 'encounter';
            // Debug: console.warn(encounterObject.image);


            encounter.polygon = encounterObject.polygon ?? '';
            encounter.init();
            encounters.set(encounter.id, encounter);
        }
        return encounters;
    }

    private initDungeonLines(dungeon: Dungeon) {
        let game = Game.getInstance();
        let dungeonLines = this.dungeonLines;

        let choicesLines: DungeonLine[] = [];
        let encounterOrder: string[] = [];
        for (let [id, line] of dungeonLines) {
            let firstChar = id.charAt(0);
            let params = line.params;
            let parts = id.split(".");
            switch (firstChar) {
                case '#': {
                    // events
                    if (params && (params.if || params.ifOr)) {
                        let roomIds: string[] = [];
                        let repeatable = params.repeat || false;
                        let mainRoom = parts[0].substring(1);
                        roomIds.push(mainRoom);

                        if (params.rooms) {
                            let paramsRooms = params.rooms.split(",").map((x: string) => x.trim());
                            roomIds.push(...paramsRooms);
                        }

                        let event = new DungeonEvent();
                        event.id = line.id;
                        event.repeatable = repeatable;
                        event.object = params;
                        for (let roomId of roomIds) {
                            try {
                                let room = dungeon.getRoomById(roomId);
                                if (room) {
                                    room.events.push(event);
                                }
                            } catch (e) {
                                gameLogger.error(`Error setting event ${event.id} for room ${roomId}: ${e}`);
                            }
                        }
                    }
                } break;
                case '@': {
                    // encounters
                    let encounterId = line.id.substring(1);
                    let encounter: DungeonEncounter | undefined = undefined;
                    let roomId = parts[0].substring(1);

                    // description
                    if (parts[1] === "description") {
                        encounter = new DungeonEncounter();
                        encounter.id = encounterId;
                        try {
                            dungeon.getRoomById(roomId)!.descriptionEncounter = encounter;
                        } catch (e) {
                            gameLogger.warn(`Error setting description room for ${encounterId}: ${e}`);
                        }
                    } else {
                        encounter = dungeon.encounters.get(encounterId);

                        // For text-based dungeons, create encounters on-the-fly from dungeon lines
                        if (!encounter && dungeon.dungeon_type === 'text') {
                            encounter = new DungeonEncounter();
                            encounter.id = encounterId;
                            encounter.room = dungeon.getRoomById(roomId)!;
                            encounter.init();
                            dungeon.encounters.set(encounterId, encounter);
                        }

                        // Collect encounter IDs in dungeonLines order
                        if (encounter && !encounterOrder.includes(encounterId)) {
                            encounterOrder.push(encounterId);
                        }
                    }


                    if (encounter) {
                        encounter.rawContent = line.val;
                        if (params) {
                            // Debug: console.warn("ENCOUNTER PARAMS");
                            // Debug: console.warn(params);
                            let computed = game.logicSystem.buildComputed(params);
                            encounter.isVisible = computed;
                        }
                    }
                } break;

                case '!': {
                    choicesLines.push(line);
                } break;
            }
        }

        // Rebuild encounters Map in dungeonLines order
        let sortedEncounters = new Map<string, DungeonEncounter>();
        for (let encounterId of encounterOrder) {
            sortedEncounters.set(encounterId, dungeon.encounters.get(encounterId)!);
        }
        // Add any encounters not in dungeonLines (shouldn't happen, but safe)
        for (let [id, encounter] of dungeon.encounters) {
            if (!sortedEncounters.has(id)) {
                sortedEncounters.set(id, encounter);
            }
        }
        dungeon.encounters = sortedEncounters;

        // init !choices
        for (let [id, encounter] of dungeon.encounters) {
            this.initChoices(encounter, choicesLines, dungeon.id);
        }

        for (let [id, room] of dungeon.rooms) {
            this.initChoices(room.descriptionEncounter, choicesLines, dungeon.id);
        }

    }

    private initChoices(encounter: DungeonEncounter, choicesLines: DungeonLine[], dungeonId: string) {
        let game = Game.getInstance();
        let parts = encounter.id.split(".");
        let pattern = "^!" + parts[0] + "\." + parts[1] + "\.";
        // Debug: console.warn(encounter.id);
        // Debug: console.warn(pattern);
        let re = new RegExp(pattern);
        for (let line of choicesLines) {

            if (re.test(line.id)) {
                // Debug: console.warn(line.id);

                // Extract/format the choice name
                let choiceName: string;
                let matchTitle = line.val.match(/__Default__:(.*)/);
                if (matchTitle) {
                    let fName = matchTitle[1].split(".")[0];
                    let partsName = fName.split("_");
                    for (let i = 0; i < partsName.length; i++) {
                        partsName[i] = partsName[i].charAt(0).toUpperCase() + partsName[i].slice(1);
                    }
                    choiceName = partsName.join(" ");
                } else {
                    choiceName = line.val;
                }

                // Build params object
                let params = line.params ? JSON.parse(JSON.stringify(line.params)) : {};

                // add default action
                let eventDelayed = game.logicSystem.getDelayedActions(params);
                if (!Object.keys(eventDelayed).length) {
                    let choiceParts = line.id.split(".");
                    let sceneId = "#" + choiceParts[0].slice(1) + "." + choiceParts[1] + "~" + choiceParts[2] + ".1.1.1";
                    let sceneLine = game.dungeonSystem.getLineByDungeonId(sceneId, dungeonId);
                    if (sceneLine) {
                        params["scene"] = sceneId;
                    }
                }

                // Create choice using createCustomChoice
                let choice = game.logicSystem.createCustomChoice({
                    id: line.id,
                    name: choiceName,
                    params: params
                });

                encounter.choices.push(choice);
            }
        }
    }










}