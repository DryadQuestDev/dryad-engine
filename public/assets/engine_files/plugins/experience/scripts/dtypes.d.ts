// ── Experience Plugin Types ──

type XpService = {
  /** Add XP to a character. Triggers level-up automatically if threshold is reached. */
  addXp(characterId: string, amount: number): void;
  /** Get XP threshold for a given level. */
  getThreshold(level: number): number;
  /** Get remaining XP to next level for a character. */
  getXpToNext(characterId: string): number;
};

type RewardItemEntry = { id: string; name: string; image: string; quantity: number };

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
};

type PendingReward = {
  items: RewardItemEntry[];
  /** Generic resource gains recorded by the GAME ({ stat id, amount }); rendered off character_stats. */
  resources: { id: string; amount: number }[];
  characters: RewardCharacterEntry[];
  /** Dev mode only: generator numbers for tuning, shown at the top of the panel. */
  debug: {
    battleId: string; level: number; scale: number; base: number; threat: number;
    threatXp: number; equipBudget: number; incomeBudget: number; currencyPayout: number;
  } | null;
};

type RewardService = {
  /** Reactive pending-reward accumulator the RewardPanel renders. */
  getPending(): { value: PendingReward };
  /** Battle-definition threat × dungeon-level scale. */
  effectiveThreat(battleId: string): number;
  /** The current dungeon's level-group snapshot (MC level at first entry; default 1). */
  getDungeonLevel(): number;
  /** Reward multiplier for a dungeon level: 1 + scale_per_level × (level − 1). */
  dungeonScale(level: number): number;
  /** Record a resource gain (by the game's own stat id) for the reward display. */
  recordResource(statId: string, amount: number): void;
  clearPending(): void;
  /** Open the reward popup (guarded against double-open). */
  openRewardPopup(): void;
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
