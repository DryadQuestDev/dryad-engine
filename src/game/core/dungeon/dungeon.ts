
import { Ref } from "vue";
import { ref } from "vue";
import { DungeonEncounter } from "./dungeonEncounter";
import { DungeonRoom } from "./dungeonRoom";
import { Game } from "../../game";
import { DungeonEvent } from "./dungeonEvent";

export class Dungeon {

    // config
    public id!: string;
    public dungeon_type!: 'map' | 'screen' | 'text';
    public image!: string;
    public image_scaling!: number;

    public music!: string;
    public fog_default!: number;
    public fog_shadow_coef!: number;
    public fog_image!: string;

    // init
    widthBackground: number = 0;
    heightBackground: number = 0;


    widthBackgroundWithPadding: number = 0;
    heightBackgroundWithPadding: number = 0;

    padding: number = 0;
    indent: number = 0;


    public rooms: Map<string, DungeonRoom> = new Map();
    public encounters: Map<string, DungeonEncounter> = new Map();

    public actions: any = {};

    public getRoomById(id: string): DungeonRoom | null {
        if (!id) {
            return null;
        }

        let room = this.rooms.get(id);
        if (!room) {
            throw new Error(`Room ${id} not found in dungeon ${this.id}`);
        }
        return room;
    }

    public getVisitedRooms(): DungeonRoom[] {
        return Array.from(this.rooms.values()).filter(room => room.isVisited());
    }

    public getVisibleRooms(): DungeonRoom[] {
        return Array.from(this.rooms.values()).filter(room => room.isVisible());
    }


    public getDungeonName(): string {
        let data = Game.getInstance().dungeonSystem.getLineByDungeonId("$dungeon_name", this.id);
        return data.val;
    }



}