import { ComputedRef } from "vue";
import { Game } from "../../game";

export class Choice {

  public id: string = "";
  public name: string = "";
  public params: Record<string, any> = {};

  public isVisible: ComputedRef<boolean>; //  if
  public isAvailable: ComputedRef<boolean>; // active

  public nameComputed: ComputedRef<string>;


  public isChoiceAvailable(): boolean {
    // Handle both ComputedRef (from creation) and primitive boolean (Vue unwrapped)
    return typeof this.isAvailable === 'boolean'
      ? this.isAvailable
      : this.isAvailable.value;
  }



  public do() {
    // if the choice is not available(active), don't do it
    if (!this.isChoiceAvailable()) {
      return;
    }

    if (this.id) {
      Game.getInstance().dungeonSystem.usedDungeonData.value.addVisitedChoice(this.id);
    }
    Game.getInstance().logicSystem.resolveActions(this.params);

    // add log for the choice
    if (this.name) {
      Game.getInstance().dungeonSystem.addLog(this.nameComputed.value || this.name, true);
    }

  }

  public setParams(params: Record<string, any> | undefined) {
    this.params = params || {};
  }





}