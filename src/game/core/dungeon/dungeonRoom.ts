import { Game } from "../../game";
import { DungeonEncounter } from "./dungeonEncounter";
import { ROOM_SIZE } from "../../../editor/editorMap";
import { DungeonRoomObject } from "../../../schemas/dungeonRoomSchema";
import { DungeonEvent } from "./dungeonEvent";
//export type Direction = 'n' | 'e' | 's' | 'w' | 'ne' | 'se' | 'sw' | 'nw' ;
export type NeighborRoom = {
    room: DungeonRoom;
    //direction?:Direction;
    angle: number;
}

export type FogMask = {
    shape: 'circle' | 'polygon';
    points?: string;
    radius?: number;
    center_x?: number;
    center_y?: number;
}

export class DungeonRoom {


    descriptionEncounter: DungeonEncounter;

    id: string = "";

    x: number = 0;
    y: number = 0;
    xCenter: number = 0;
    yCenter: number = 0;
    xCompass: number = 0;
    yCompass: number = 0;
    xCircleWithPadding: number = 0;
    yCircleWithPadding: number = 0;

    public fogMaskMain: FogMask;
    public fogMaskShadow: FogMask;
    public fogMaskShadowNeighbor: boolean = false;

    public neighborsWithDirection: NeighborRoom[] = [];
    public neighbors: DungeonRoom[] = [];



    public fogMasksMain = 0
    public fogMasksShadow = 0

    public movementEncounter: DungeonEncounter
    public events: DungeonEvent[] = [];

    public defaultAssets: string[] = [];

    public actions: any = {};

    public getDescriptionId() {
        return `@${this.id}.description`;
    }

    public setXY(x: number, y: number, padding: number) {
        this.x = x;
        this.y = y;
        this.xCenter = x + ROOM_SIZE / 2;
        this.yCenter = y + ROOM_SIZE / 2;
        this.xCircleWithPadding = this.x + padding + 5;
        this.yCircleWithPadding = this.y + padding + 5;
        this.xCompass = this.x - 5;
        this.yCompass = this.y - 5;
    }

    public setFog(fog: DungeonRoomObject['fog'], fogDefault: number, fogShadowCoef: number, padding: number) {

        if (!fogDefault) {
            return;
        }


        if (fogShadowCoef < 1) {
            fogShadowCoef = 1;
        }

        if (fogDefault < 1) {
            fogDefault = 1;
        }


        if (!fog) {

            this.fogMaskMain = {
                shape: 'circle',
                radius: fogDefault,
                center_x: this.xCenter + padding,
                center_y: this.yCenter + padding
            }


            this.fogMaskShadow = {
                shape: 'circle',
                radius: fogDefault * fogShadowCoef,
                center_x: this.xCenter + padding,
                center_y: this.yCenter + padding
            }

        }


        if (fog?.shape === 'circle') {

            this.fogMaskMain = {
                shape: 'circle',
                radius: fog.radius ?? fogDefault,
                center_x: (fog.center_x ?? this.xCenter) + padding,
                center_y: (fog.center_y ?? this.yCenter) + padding
            }


            this.fogMaskShadow = {
                shape: 'circle',
                radius: (fog.radius ?? fogDefault) * fogShadowCoef,
                center_x: (fog.center_x ?? this.xCenter) + padding,
                center_y: (fog.center_y ?? this.yCenter) + padding
            }

        }

        else if (fog?.shape === 'polygon') {
            let fogPointsPaddingAdjusted = "";

            let fogPoints = fog.points?.split(' ');
            if (fogPoints) {
                for (let point of fogPoints) {
                    let xy = point.split(',');
                    let x = Number(xy[0]);
                    let y = Number(xy[1]);
                    fogPointsPaddingAdjusted = fogPointsPaddingAdjusted + (x + padding) + "," + (y + padding) + " ";
                }

                this.fogMaskMain = {
                    shape: 'polygon',
                    points: fogPointsPaddingAdjusted.trim()
                }
                this.fogMaskShadow = this.fogMaskMain;
            }

            //console.log(this.fogMaskMain);
            //console.log(this.fogMaskShadow);
        }
    }
    /*
        public getDirection(targetRoom: DungeonRoom): Direction | undefined {
            const dx = targetRoom.xCenter - this.xCenter;
            const dy = targetRoom.yCenter - this.yCenter;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    
            if (angle >= -22.5 && angle < 22.5) return 'e';
            if (angle >= 22.5 && angle < 67.5) return 'se';
            if (angle >= 67.5 && angle < 112.5) return 's';
            if (angle >= 112.5 && angle < 157.5) return 'sw';
            if (angle >= 157.5 || angle < -157.5) return 'w';
            if (angle >= -157.5 && angle < -112.5) return 'nw';
            if (angle >= -112.5 && angle < -67.5) return 'n';
            if (angle >= -67.5 && angle < -22.5) return 'ne';
    
            return undefined; // Should not happen with the current logic
        }
    */
    public getAngle(targetRoom: DungeonRoom): number {
        if (!targetRoom) {
            throw new Error(`Neighbor room not found for room '${this.id}'. Make sure the 'doors' value is correct in the editor.`);
        }
        const dx = targetRoom.xCenter - this.xCenter;
        const dy = targetRoom.yCenter - this.yCenter;
        // Math.atan2 returns angle in radians, convert to degrees
        // Adjust so 0° is north (up) instead of east (right)
        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        angle = (angle + 90) % 360; // Rotate by 90° to make north = 0°
        if (angle < 0) angle += 360; // Ensure positive angle
        return angle;
    }

    public isVisited(): boolean {
        return Game.getInstance().dungeonSystem.currentDungeonData.value.isRoomVisited(this.id);
    }

    public isVisible(): boolean {
        return Game.getInstance().dungeonSystem.currentDungeonData.value.isRoomVisible(this.id);
    }




}