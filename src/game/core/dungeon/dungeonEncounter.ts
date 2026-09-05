import { Choice } from "../content/choice";
import { Game } from "../../game";
import { Global } from "../../../global/global";
import { DungeonRoom } from "./dungeonRoom";
import { computed, ComputedRef } from "vue";

export class DungeonEncounter {

    public id: string = "";
    public room!: DungeonRoom;
    public additionalRoomIds: string[] = [];

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
     * Stat threshold that permanently reveals this encounter, from
     * `@x{discover: "perception#6"}`. Checked against the whole party on room entry.
     * Undefined = the encounter was never hidden.
     */
    public discoverSpec?: string;

    /**
     * Item spec granted by this encounter's Collect choice (add_item grammar,
     * e.g. "healing_herb#2"), from the encounter's collect_item/collect_quantity
     * fields. Undefined = not a collectable.
     */
    public collectSpec?: string;

    /**
     * Regrow interval stamped into the collected countdown when this is collected.
     * Carried for time-system plugins — the engine itself never reads a clock.
     * 0/undefined = collected for good.
     */
    public regrowTurns?: number;

    /** Give the synthesized Collect choice a clue glow until taken. */
    public collectClue?: boolean;

    /**
     * This encounter has no authored sprite and falls back to the granted item's icon.
     * Icons are full-size item art, so the map view tags them with `.item_icon` to size
     * them down instead of drawing them at their natural width.
     */
    public usesItemIcon: boolean = false;

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

    /**
     * Does this encounter still hold a hint the player hasn't followed? Lights the
     * encounter up on the map for as long as one of its visible `{clue: true}` choices
     * is untaken.
     */
    public isClue(): boolean {
        return this.choices.some(choice => choice.isClue() && choice.isChoiceVisible());
    }

    public isHere(currentActiveRoom: DungeonRoom | undefined): boolean {
        if (!currentActiveRoom) return false;
        if (this.room && this.room.id === currentActiveRoom.id) return true;
        return this.additionalRoomIds.includes(currentActiveRoom.id);
    }

    /**
     * "Perception[6] check success" — the cue for an encounter that was hidden behind a
     * `discover:` threshold. It is only on screen at all once the party met that threshold,
     * so its presence IS the success. Empty for encounters that were never hidden.
     */
    public getDiscoverCue(): string {
        if (!this.discoverSpec) {
            return "";
        }
        const game = Game.getInstance();
        const stats = game.characterSystem.statsMap;
        const checks = game.dungeonSystem
            .parseDiscoverSpec(this.discoverSpec, this.id)
            .map(({ statId, threshold }) => `${stats?.get(statId)?.name || statId}[${threshold}]`)
            .join(', ');
        return checks ? Global.getInstance().getString('encounter.discovered', { checks }) : "";
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