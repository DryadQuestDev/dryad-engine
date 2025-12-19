import { ItemSlotObject } from "../../../schemas/itemSlotSchema";
import { Game } from "../../game";

export class ItemSlot {
    public slotId: string = "";
    public id: string = "";

    // slot's postion atop the character doll
    public x: number = 0;
    public y: number = 0;

    // reference to the item uid when item is equipped
    public itemUid: string = "";

    public getSlotObject(): ItemSlotObject {
        const slotObject = Game.getInstance().itemSystem.itemSlotsMap.get(this.slotId);
        if (!slotObject) {
            throw new Error(`Item slot ${this.slotId} not found`);
        }
        return slotObject;
    }

}