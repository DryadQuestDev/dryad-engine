// ── Experience Plugin Types ──

type XpService = {
  /** Add XP to a character. Triggers level-up automatically if threshold is reached. */
  addXp(characterId: string, amount: number): void;
  /** Get XP threshold for a given level. */
  getThreshold(level: number): number;
  /** Get remaining XP to next level for a character. */
  getXpToNext(characterId: string): number;
};

// ── Service overloads (declaration merging) ──

interface Game {
  getService(id: 'xp'): XpService;
}

// ── Emitter overloads ──

interface GameEvents {
  /** Fired when a character levels up. */
  character_level_up: (character: Character, newLevel: number) => void;
}
