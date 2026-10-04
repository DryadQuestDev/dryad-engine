import { ComputedRef } from "vue";
import { Game } from "../../game";

export class Choice {

  public id: string = "";
  public name: string = "";

  /**
   * Engine-authored label, as a locale key rather than a resolved string. The Dungeon a fabric
   * builds and the choices parked in `eventChoices` outlive a language switch, so a name resolved
   * at creation time would stay in the old language until the dungeon or the scene is re-entered.
   * `nameComputed` resolves this instead, inside the computed, where it tracks the locale map.
   */
  public nameKey?: string;
  public nameParams?: Record<string, string | number>;

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

  /**
   * Extra CSS class(es) on the choice's whole row — its number, hover arrow and label — where
   * `nameComputed` only reaches the label. A choice modifier sets it; a computed keeps it live.
   */
  public className?: ComputedRef<string> | string;


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

    // `{no_visited: true}` keeps a choice off the visited list — it never dims, for options meant
    // to be picked again and again (a stroke-the-statues sequence puzzle).
    if (this.id && !this.params.no_visited) {
      Game.getInstance().dungeonSystem.usedDungeonData.value.addVisitedChoice(this.id);
    }
    if (this.resumeSceneId) {
      Game.getInstance().dungeonSystem.noteBranchResume(this.resumeSceneId);
    }

    // Logged before the actions run: a choice that moves the story plays the next paragraph inside
    // resolveActions, and that paragraph logs itself, so a later log line lands after it.
    if (this.name || this.nameKey) {
      // Same proxy hazard as isChoiceAvailable: the views call do() on the reactive proxy, where
      // nameComputed is already unwrapped to the resolved string and `.value` is undefined.
      const label = typeof this.nameComputed === 'string'
        ? this.nameComputed
        : this.nameComputed?.value;
      Game.getInstance().dungeonSystem.addLog(label || this.name, true);
    }

    Game.getInstance().logicSystem.resolveActions(this.params);
  }

  public setParams(params: Record<string, any> | undefined) {
    this.params = params || {};
  }





}