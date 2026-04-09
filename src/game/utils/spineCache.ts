/**
 * Spine animation sync service.
 *
 * Tracks animation time per character+view so multiple spine instances
 * of the same character stay in sync across remounts.
 */

class SpineCache {
  private animTimers = new Map<string, number>();

  getAnimTime(characterId: string, view: string): number {
    return this.animTimers.get(`${characterId}:${view}`) || 0;
  }

  setAnimTime(characterId: string, view: string, time: number): void {
    this.animTimers.set(`${characterId}:${view}`, time);
  }

  clear(): void {
    this.animTimers.clear();
  }
}

export const spineCache = new SpineCache();
