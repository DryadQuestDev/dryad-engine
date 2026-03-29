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
  playerParty: string[];
  enemies?: RpgBattleEntry[];
  background?: string;
};

type StartBattleActionValue = string | StartRpgBattleParams;

// ── Battle State ──

type RpgBattlePhase = 'choosing_ability' | 'choosing_target' | 'resolving' | 'enemy_turn';

type RpgBattleResult = 'victory' | 'defeat';

type RpgBattle = {
  id: string;
  turn: number;
  phase: 'active' | 'finished';
  playerParty: string[];
  enemyParty: string[];
  turnOrder: string[];
  turnIndex: number;
  activeCharId: string | null;
  activeSide: 'player' | 'enemy';
  result: RpgBattleResult | null;
  battlePhase: RpgBattlePhase;
  selectedAbilityId: string | null;
  log: RpgBattleLogEntry[];
  backgroundAssetId: string | null;
  abilitiesState: Record<string, Record<string, RpgAbilityState>>;
  tokens: Record<string, Record<string, RpgTokenInstance[]>>;
  defeatedPlayer: string[];
  defeatedEnemy: string[];
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

type RpgFloatingText = {
  id: number;
  characterId: string;
  text: string;
  cssClass: string;
  icon: string | null;
  color?: string;
};

// ── Animation ──

type RpgBattleState = 'idle' | 'idle_wounded' | 'attack' | 'cast' | 'hit' | 'death';

// ── AI ──

type RpgAIAction = {
  abilityId: string;
  targetId: string;
};
