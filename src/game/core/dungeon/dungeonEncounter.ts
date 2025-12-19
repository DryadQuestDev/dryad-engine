import { Choice } from "../content/choice";
import { Game } from "../../game";
import { DungeonRoom } from "./dungeonRoom";
import { computed, ComputedRef } from "vue";

export class DungeonEncounter {

    public id: string = "";
    public room!: DungeonRoom;

    public x: number = 0;
    public y: number = 0;
    public z: number = 25;
    public scale: number = 1;
    public rotation: number = 0;
    public image: string = "";
    public polygon: string = "";

    // Added properties for Vue conversion
    public fadeTime: number = 300; // Default fade time in ms
    public fadeOutTime: number = 300; // Default fade out time in ms
    public scaleShadow: string = ""; // e.g., "filter: drop-shadow(0 0 5px black);"
    public imgLink: string = ""; // To be populated with the actual image path

    public type: string = "";

    public rawContent: string = "";

    /**
     * Check if this encounter is a prop (non-interactive decoration).
     * Props are not selectable and don't have active outlines.
     */
    public isProp(): boolean {
        return this.type === 'prop';
    }

    public init() {
        this.scaleShadow = `--scale-shadow: ${1 / this.scale}`;
    }

    public isClue(): boolean {
        // Stub: Implement actual clue logic
        return false;
    }

    public isHere(currentActiveRoom: DungeonRoom | undefined): boolean {
        // Stub: Implement actual logic to check if encounter is in the current room
        if (!this.room || !currentActiveRoom) return false;
        return this.room.id === currentActiveRoom.id;
    }

    /**
     * Get the visibility state of this encounter.
     * Handles both ComputedRef<boolean> and plain boolean types.
     * @returns true if the encounter is visible, false otherwise
     */
    public getVisibilityState(): boolean {
        // Handle both ComputedRef<boolean> and plain boolean
        // If it's a ComputedRef, access .value; if it's a plain boolean, use it directly
        if (typeof this.isVisible === 'boolean') {
            return this.isVisible;
        }
        return this.isVisible?.value ?? true;
    }


    public choices: Choice[] = []; // TODO: remove or not??



    public isVisible: ComputedRef<boolean> = computed(() => true);







}