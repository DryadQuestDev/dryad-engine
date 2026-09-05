import { ComputedRef } from "vue";
import { Game } from "../../game";

export class Choice {

  public id: string = "";
  public name: string = "";
  public params: Record<string, any> = {};

  /**
   * Where the story resumes after this choice's delayed action finishes (battle, exchange…).
   * Set on `~` branch choices that carry a delayed action: without it the resume falls
   * through to the row's FIRST branch instead of the one the player actually took.
   */
  public resumeSceneId?: string;

  public isVisible: ComputedRef<boolean>; //  if
  public isAvailable: ComputedRef<boolean>; // active

  /**
   * Locale string id shown when the player clicks this choice while it is grayed out
   * (e.g. "recipe_already_learned"). Without one the generic "items_no_use" shows.
   */
  public unavailableNotificationId?: string;

  /**
   * A synthetic `delayed_action` continue: its actions run ONCE and the story is expected to
   * move on afterwards (a battle, an overlay, a reward popup). Anything that parks the scene
   * on a popup instead of navigating leaves this choice live underneath, so without the latch
   * a repeated advance re-fires it — unlimited XP from a held Space bar.
   * Ordinary `>` choices are deliberately repeatable (one that doesn't navigate fires its
   * actions and stays on the paragraph), so they never set this.
   */
  public oneShot: boolean = false;

  private spent: boolean = false;

  public nameComputed: ComputedRef<string>;


  public isChoiceAvailable(): boolean {
    // Handle both ComputedRef (from creation) and primitive boolean (Vue unwrapped)
    return typeof this.isAvailable === 'boolean'
      ? this.isAvailable
      : this.isAvailable.value;
  }

  public isChoiceVisible(): boolean {
    // Same hazard as isChoiceAvailable: reached through Vue's reactive proxy the ref is
    // already unwrapped, reached raw it is a ComputedRef — and a ComputedRef is a truthy
    // object, so a bare `&& choice.isVisible` would always pass.
    return typeof this.isVisible === 'boolean'
      ? this.isVisible
      : this.isVisible?.value ?? true;
  }

  /**
   * A `{clue: true}` choice the player hasn't taken yet — a hint worth highlighting.
   * It stops being a clue the moment it is picked, and stays taken across saves
   * (visitedChoices is persisted).
   */
  public isClue(): boolean {
    if (!this.params.clue || !this.id) {
      return false;
    }
    return !Game.getInstance().dungeonSystem.usedDungeonData.value.visitedChoices.has(this.id);
  }



  public do() {
    // if the choice is not available(active), don't do it
    if (!this.isChoiceAvailable()) {
      return;
    }

    if (this.oneShot && this.spent) {
      return;
    }
    // Latched before the actions run: one of them may synchronously reach back into the UI.
    this.spent = true;

    if (this.id) {
      Game.getInstance().dungeonSystem.usedDungeonData.value.addVisitedChoice(this.id);
    }
    if (this.resumeSceneId) {
      Game.getInstance().dungeonSystem.noteBranchResume(this.resumeSceneId);
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