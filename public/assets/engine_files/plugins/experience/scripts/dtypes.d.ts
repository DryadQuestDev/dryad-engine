// ── Experience Plugin Types ──

type XpService = {
  /** Add XP to a character. Triggers level-up automatically if threshold is reached. */
  addXp(characterId: string, amount: number): void;
  /** Get XP threshold for a given level. */
  getThreshold(level: number): number;
  /** Get remaining XP to next level for a character. */
  getXpToNext(characterId: string): number;
};

/** `trashed` is the panel's per-line take-it-back mark, cashed in by clearPending on continue. */
type RewardItemEntry = { id: string; name: string; image: string; quantity: number; trashed: boolean };

/** Stat changed by a level-up: shown as before → after (values from Character.getStat, names/colors
 *  resolved off character_stats definitions by the panel). */
type RewardStatChange = { id: string; before: number; after: number };

/** One character's XP progress for the reward display: gained XP, level range, and the xp-resource
 *  positions at both ends (for the animated bar; thresholds come from the xp service). */
type RewardCharacterEntry = {
  id: string;
  name: string;
  gained: number;
  levelFrom: number;
  levelTo: number;
  xpFrom: number;
  xpTo: number;
  stats: RewardStatChange[];
  items: { id: string; quantity: number }[];
};

type PendingReward = {
  items: RewardItemEntry[];
  /** Generic resource gains recorded by the GAME; rendered off character_stats. `characterId` is
   *  the recipient, so the panel can put the bar in that character's row. */
  resources: { id: string; amount: number; characterId: string }[];
  characters: RewardCharacterEntry[];
  /** Dev mode only: generator numbers for tuning, shown at the top of the panel. */
  debug: {
    battleId: string; level: number; scale: number; base: number; threat: number;
    threatXp: number; equipBudget: number; incomeBudget: number; currencyPayout: number;
  } | null;
};

/** One character block in the reward panel. Built by the panel, never recorded: a character who
 *  earned XP gets the full row, while one who only gained resources gets `hasXp: false` and none of
 *  the XP fields — the template gates every one of them on `hasXp`. */
type RewardRow = {
  id: string;
  name: string;
  character: Character | null;
  items: Item[];
  resources: any[];
  statLines: any[];
  hasXp: boolean;
  gained?: number;
  levelFrom?: number;
  levelTo?: number;
  xpFrom?: number;
  xpTo?: number;
  stats?: RewardStatChange[];
  shownLevel?: number;
  shownXp?: number;
  barPct?: number;
  leveled?: boolean;
  statsVisible?: boolean;
};

type RewardService = {
  /** Reactive pending-reward accumulator the RewardPanel renders. */
  getPending(): { value: PendingReward };
  /** Battle-definition threat × dungeon-level scale. */
  effectiveThreat(battleId: string): number;
  /** The current dungeon's level-group snapshot (MC level at first entry; default 1). */
  getDungeonLevel(): number;
  /** Reward multiplier for a dungeon level: 1 + power_scale_per_level × (level − 1). Also the curve of `flat`-scaling stats. */
  dungeonScale(level: number): number;
  /** Multiplier for `relative`-scaling stats: 1 + relative_scale_per_level × (level − 1). */
  relativeScale(level: number): number;
  /** Stats scaled to a level exactly as a levelled item's are: each stat's `scaling` meta picks the flat or relative curve; unset stays as authored. Returns a new object. */
  scaleStats(stats: Record<string, number>, level: number): Record<string, number>;
  /** Enemy health/power multiplier for a dungeon level, from the authored `enemy_scaling` pins (closest pin at or below the level; 1 when none). */
  enemyScale(level: number): number;
  /** Override the level equipment is created at (item_create). Pass a level, then null to clear. */
  setGenerationLevel(level: number | null): void;
  /** Record a resource gain (by the game's own stat id) for the reward display. */
  recordResource(statId: string, amount: number, characterId: string): void;
  clearPending(): void;
  /** Open the reward popup (guarded against double-open). */
  openRewardPopup(): void;
  /** Dry-roll a pool exactly as a container would (throwaway inventory, no side effects). One array of drop bricks per roll. */
  simulatePool(poolId: string, level: number, rolls?: number): { id: string, quantity: number, price: number, itemLevel?: number, source: string }[][];
  /** Dry-roll battle loot exactly as a victory would (reuses grantLoot; no side effects). */
  simulateBattleLoot(opts: { level: number, threat: number, rolls?: number, battleId?: string }): { level: number, threat: number, rolls: { id: string, quantity: number, price: number, itemLevel?: number, source: string }[][], budgets: any };
};

// ── Service overloads (declaration merging) ──

interface Game {
  getService(id: 'xp'): XpService;
  getService(id: 'reward'): RewardService;
}

// ── Emitter overloads ──

interface GameEvents {
  /**
   * Fired once per battle when its defeat reward is granted (loot moved to the party inventory).
   * source is 'battle' for a fight victory, 'scene' for a scripted defeat. Games hook
   * their own economics here (e.g. a resource refund) and record via the reward service.
   */
  reward_assemble: (ctx: { source: 'battle' | 'scene'; battleId: string; threat: number }) => void;
}

// ── Emitter overloads ──

interface GameEvents {
  /** Fired when a character levels up. */
  character_level_up: (character: Character, newLevel: number) => void;
}
