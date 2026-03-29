/**
 * Spine animation sync + canvas pool service.
 *
 * Animation sync: tracks animation time per character+view so multiple
 * SpinePlayer instances of the same character stay in sync.
 *
 * Canvas pool: keeps recently unmounted SpinePlayer instances alive in a
 * hidden container. On remount, reparent the canvas for instant display
 * instead of recreating the WebGL context (~500ms saved).
 */

import type { SpinePlayer } from '@esotericsoftware/spine-player';

interface PoolEntry {
  player: SpinePlayer;
  key: string;
  lastUsed: number;
}

class SpineCache {
  // ── Animation Sync ──

  private animTimers = new Map<string, number>();

  getAnimTime(characterId: string, view: string): number {
    return this.animTimers.get(`${characterId}:${view}`) || 0;
  }

  setAnimTime(characterId: string, view: string, time: number): void {
    this.animTimers.set(`${characterId}:${view}`, time);
  }

  // ── Canvas Pool ──

  private pool: PoolEntry[] = [];
  private poolContainer: HTMLDivElement | null = null;
  private maxPoolSize = 8;

  private getPoolContainer(): HTMLDivElement {
    if (!this.poolContainer) {
      this.poolContainer = document.createElement('div');
      this.poolContainer.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;visibility:hidden';
      document.body.appendChild(this.poolContainer);
    }
    return this.poolContainer;
  }

  private makeKey(atlasUrl: string, skelUrl: string): string {
    return `${atlasUrl}|${skelUrl}`;
  }

  /**
   * Try to acquire a pooled SpinePlayer matching the given atlas+skeleton.
   * Returns the player if found, or null if no match in pool.
   * The caller is responsible for reparenting `player.dom` into their container.
   */
  acquire(atlasUrl: string, skelUrl: string): SpinePlayer | null {
    const key = this.makeKey(atlasUrl, skelUrl);
    const idx = this.pool.findIndex(e => e.key === key);
    if (idx === -1) return null;

    const entry = this.pool.splice(idx, 1)[0];
    entry.lastUsed = Date.now();
    return entry.player;
  }

  /**
   * Return a SpinePlayer to the pool instead of disposing it.
   * Moves player.dom to the hidden pool container.
   */
  release(player: SpinePlayer, atlasUrl: string, skelUrl: string): void {
    const key = this.makeKey(atlasUrl, skelUrl);

    // Move to hidden container
    try {
      this.getPoolContainer().appendChild(player.dom);
    } catch {
      // If reparenting fails, just dispose
      player.dispose();
      return;
    }

    // Evict LRU if pool is full
    if (this.pool.length >= this.maxPoolSize) {
      let oldestIdx = 0;
      for (let i = 1; i < this.pool.length; i++) {
        if (this.pool[i].lastUsed < this.pool[oldestIdx].lastUsed) oldestIdx = i;
      }
      const evicted = this.pool.splice(oldestIdx, 1)[0];
      evicted.player.dispose();
    }

    this.pool.push({ player, key, lastUsed: Date.now() });
  }

  // ── Cleanup ──

  /** Dispose all pooled players and clear sync timers */
  clear(): void {
    this.animTimers.clear();
    for (const entry of this.pool) {
      entry.player.dispose();
    }
    this.pool.length = 0;
  }
}

export const spineCache = new SpineCache();
