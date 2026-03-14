import { Directive } from 'vue';
import { Game } from '../game';

/**
 * Vue directive that keeps images in browser memory cache.
 * Prevents browser from evicting decoded image data when elements are removed from DOM.
 *
 * Usage: <img :src="iconPath" v-persist />
 */
export const persistImage: Directive<HTMLImageElement> = {
  mounted(el) {
    el.addEventListener('load', () => {
      Game.getInstance().coreSystem.persistImage(el.src);
    });
    // Handle images that loaded before the listener was attached
    if (el.complete && el.src) {
      Game.getInstance().coreSystem.persistImage(el.src);
    }
  }
};
