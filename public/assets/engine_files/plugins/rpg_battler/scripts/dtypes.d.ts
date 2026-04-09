// ── Battle Setup ──

type RpgBattleEntry = {
  character_id: string;
  is_live_instance: boolean;
  amount: number;
};

type RpgBattleDefinition = {
  id: string;
  name?: string;
  background?: string;
  enemies: RpgBattleEntry[];
};

type StartRpgBattleParams = {
  battleId?: string;
  playerParty?: string[];
  enemies?: RpgBattleEntry[];
  background?: string;
};

type StartBattleActionValue = string | StartRpgBattleParams;

// ── Battle State ──

type RpgBattlePhase = 'choosing_ability' | 'choosing_target' | 'resolving' | 'enemy_turn';

type RpgBattleResult = 'victory' | 'defeat';

type RpgCharacterBattleState = {
  side: 'player' | 'enemy';
  battleIndex: number;
  abilities: Record<string, RpgAbilityState>;
  tokens: Record<string, RpgTokenInstance[]>;
  defeated: boolean;
  bonusUsed: number;
};

type RpgBattle = {
  id: string;
  battleId: string | null;
  turn: number;
  phase: 'active' | 'finished';
  playerParty: string[];
  enemyParty: string[];
  turnOrder: string[];
  actorTurn: number;
  activeCharId: string | null;
  activeSide: 'player' | 'enemy';
  result: RpgBattleResult | null;
  battlePhase: RpgBattlePhase;
  selectedAbilityId: string | null;
  log: RpgBattleLogEntry[];
  backgroundAssetId: string | null;
  charState: Record<string, RpgCharacterBattleState>;
  prevDisableSaves: boolean;
  prevBlockInventory: boolean;
  prevGameState: string;
  prevHideEvents: boolean;
};

// ── Ability State ──

type RpgAbilityState = {
  cooldown: number;
  charges: number;
};

// ── Token System ──

type RpgTokenInstance = {
  stacks: number;
  duration?: number;
  source: string;
};

type RpgTokenEffect = {
  type: 'dot' | 'hot' | 'absorb' | 'death_defiance' | 'stun' | 'taunt' | 'thorns';
  value: number;
  damage_type?: string;
};

type RpgTokenDefinition = {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  max_stacks: number;
  polarity: 'positive' | 'negative' | 'neutral';
  power_scaling?: boolean;
  effects: RpgTokenEffect[];
  source?: string;
};

// ── Effect Results ──

type RpgEffectResultType =
  'damage' | 'heal' | 'steal' | 'thorns' |
  'token_apply' | 'token_dot' | 'token_hot' |
  'cleanse' | 'dodge' | 'status_apply' | 'status_remove';

type RpgEffectResult = {
  type: RpgEffectResultType;
  targetId?: string;
  amount?: number;
  rawAmount?: number;
  damageType?: string;
  shieldAbsorbed?: number;
  defeated?: boolean;
  isCrit?: boolean;
  tokenId?: string;
  stacks?: number;
  statusId?: string;
  statusName?: string;
  duration?: number;
};

// ── Battle Log ──

type RpgBattleLogEntry = {
  turn: number;
  actorId?: string;
  text?: string;
  effect?: RpgEffectResult;
  abilityId?: string;
  type?: 'turn_start' | 'char_turn_start';
};

// ── Floating Text ──

type RpgFloatingTextOpts = {
  characterId: string;
  text: string;
  cssClass: string;
  icon?: string | null;
  color?: string;
};

type RpgFloatingText = RpgFloatingTextOpts & {
  id: number;
};

// ── Service Types ──

type RpgFloatingTextService = {
  add(opts: RpgFloatingTextOpts): void;
};

type RpgTokensService = {
  getStacks(characterId: string, tokenId: string): number;
  removeStacks(characterId: string, tokenId: string, stacks: number): void;
  apply(characterId: string, tokenId: string, stacks: number, duration?: number, source?: string): { applied: number; tokenName: string } | null;
  getDefinitions(): Map<string, RpgTokenDefinition>;
};

type RpgPartyService = {
  getMaxPartySize(): number;
  isPartyFull(): boolean;
};

type StartBattleResult = { ok: true; battle: RpgBattle } | { ok: false; reason: string };

type RpgBattleService = {
  start(params: StartRpgBattleParams): StartBattleResult;
  end(result: RpgBattleResult): void;
  /** Manually mark a battle as defeated (by definition ID). */
  addDefeated(battleId: string): void;
};

type RpgBattleLogService = {
  /** Push a text entry to the battle log for a character. Turn is auto-filled. targetId optionally shows that character's face. */
  push(actorId: string, text: string, targetId?: string): void;
};

// ── Service overloads (declaration merging) ──

interface Game {
  getService(id: 'rpg_floating_text'): RpgFloatingTextService;
  getService(id: 'rpg_tokens'): RpgTokensService;
  getService(id: 'rpg_party'): RpgPartyService;
  getService(id: 'rpg_battle'): RpgBattleService;
  getService(id: 'rpg_battle_log'): RpgBattleLogService;
}

// ── Animation ──

type RpgBattleState = 'idle' | 'idle_wounded' | 'attack' | 'cast' | 'hit' | 'death';

// ── Action Events ──

type RpgActionStartEvent = {
  abilityId: string;
  targetId: string;
  power: number;
};

type RpgActionApplyEvent = {
  effectId: string;
  targetId: string;
  damage: number;
  rawDamage: number;
  damageType: string;
  isCrit: boolean;
  isDodged: boolean;
  healing: number;
  tokenId: string | null;
  tokenStacks: number;
  tokenDuration?: number;
  statusApply: string[];
  statusDuration?: number;
  statusRemove: string[];
  cleanse: boolean;
  cooldownChange: number;
  chargesChange: number;
};

// ── AI ──

type RpgAIAction = {
  abilityId: string;
  targetId: string;
};
