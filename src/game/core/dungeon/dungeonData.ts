import { Ref, ref } from "vue";
import { Populate, Skip } from "../../../utility/save-system";



export class DungeonData {


    public dungeonLvl: number = 1;

    public visitedRooms: Set<string> = new Set();
    public visibleRooms: Set<string> = new Set();

    public visitedEvents: Set<string> = new Set();
    public viewEvents: Set<string> = new Set();

    public visitedInventories: Set<string> = new Set();

    public uncoveredInteractions: Set<string> = new Set(); // for perception?? remove??


    public visitedChoices: Set<string> = new Set();

    public addVisitedChoice(choice: string) {
        const symbols = ['!', '>', '~'];
        let isSymbol = symbols.includes(choice.charAt(0));
        if (!isSymbol) {
            return
        }
        this.visitedChoices.add(choice);
    }

    public removeVisitedChoice(choice: string) {
        this.visitedChoices.delete(choice);
    }
    public removeVisitedRoom(room: string) {
        this.visitedRooms.delete(room);
    }

    @Populate(Map, { mode: 'merge' })
    public flags: Map<string, number> = new Map();





    public setFlag(id: string, value: number) {
        this.flags.set(id, value);
    }
    public getFlag(id: string): number {
        //console.log("test", this.flags)
        return this.flags.get(id) || 0;
    }
    public addFlag(id: string, value: number) {
        this.flags.set(id, this.getFlag(id) + value);
    }




    public removeFlag(id: string): boolean {
        return this.flags.delete(id);
    }


    private flashText: string = "";

    public addVisitedRoom(roomId: string) {
        this.visitedRooms.add(roomId);
        // console.log('visitedRooms', this.visitedRooms);
    }

    public addVisibleRoom(roomId: string) {
        this.visibleRooms.add(roomId);
        // console.log('visibleRooms', this.visibleRooms);
    }

    public isRoomVisited(roomId: string): boolean {
        return this.visitedRooms.has(roomId);
    }

    public isRoomVisible(roomId: string): boolean {
        return this.visibleRooms.has(roomId);
    }

    public isEventVisited(eventId: string): boolean {
        return this.visitedEvents.has(eventId);
    }
    public addVisitedEvent(eventId: string) {
        this.visitedEvents.add(eventId);
    }
    public removeVisitedEvent(eventId: string) {
        this.visitedEvents.delete(eventId);
    }

}