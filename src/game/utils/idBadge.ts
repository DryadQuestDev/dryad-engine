import { Global } from '../../global/global';
import { Game } from '../game';

/**
 * Whether entity-id badges render next to card titles: always in the editor (a dev
 * surface — game cards there are preview contexts), in-game only with the
 * show_hidden_stats dev toggle. Read inside a computed — engineState and
 * debugSettings are reactive refs.
 */
export function shouldShowEntityIds(): boolean {
  if (Global.getInstance().engineState.value === 'editor') return true;
  return !!Game.getInstance().coreSystem.getDebugSetting('show_hidden_stats');
}
