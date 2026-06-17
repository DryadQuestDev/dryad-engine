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
  /** Ids of mid-battle summoned combatants — deleted from the game on battle end. */
  summoned: string[];
  spawnedEnemies: string[];
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
  prevAssets: Asset[];
};

// ── Ability State ──

type RpgAbilityState = {
  cooldown: number;
  charges: number;
};

// ── Status meta (rpg_battler-consumed flags on character_statuses) ──

type RpgStatusMeta = {
  is_battle?: boolean;
  power_scaling?: boolean;
  dot_damage_type?: string;
  source?: string;
};

// ── Effect Results ──

type RpgEffectResultType =
  'damage' | 'heal' | 'steal' | 'thorns' |
  'status_apply' | 'status_remove' | 'status_dot' | 'status_hot' | 'status_dot_heal' |
  'cleanse' | 'dodge' | 'summon';

type RpgEffectResult = {
  type: RpgEffectResultType;
  targetId?: string;
  amount?: number;
  rawAmount?: number;
  damageType?: string;
  shieldAbsorbed?: number;
  defeated?: boolean;
  isCrit?: boolean;
  stacks?: number;
  statusId?: string;
  statusName?: string;
  duration?: number;
};

// ── Battle Log ──

type RpgBattleLogEntry = {
  turn: number;
  actorId?: string;
  /** For text entries, renders this character's face inline before the line (like effect entries). */
  targetId?: string;
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
  /** Stagger threshold check — strips all stagger and applies stun+braced if threshold crossed. */
  checkStaggerThreshold(charId: string): void;
  /** Effective (amplifier-aware) power for a character. Stateless — safe to call outside battle (UI/character sheet). */
  effectivePower(character: Character, ability?: { meta?: any }): number;
  /** Whether a battle is currently active. */
  isActive(): boolean;
  /** Enemy character ids (copy). */
  getEnemyParty(): string[];
  /** Player character ids (copy). */
  getPlayerParty(): string[];
  /** All combatant ids, players then enemies (copy). */
  getCombatants(): string[];
  /** Current turn number (0 if no battle). */
  getTurn(): number;
  /** Id of the character whose turn it is, or null. */
  getActiveCharId(): string | null;
  /** True if an apply event represents a damage hit that landed (damage > 0, not dodged). Pure. */
  eventDealtDamage(event: RpgActionApplyEvent): boolean;
  /** Deal a one-off damage instance to the active battle's target through the full pipeline (defenses, shields, floating text, log, death). For scripted effects like elemental reactions. */
  dealDamage(casterId: string, targetId: string, amount: number, damageType: string): void;
  /** Apply N stacks of a status to a target in the active battle through the pipeline (floating text, log, stagger check). Stacks taken as-is (no power-scaling). */
  applyStatus(casterId: string, targetId: string, statusId: string, stacks: number, duration?: number): void;
  /** Add an already-created character to the active battle on `side` as a combatant; it joins the turn order and acts this round by speed. Not added to the persistent party. Returns the combatant id (or null). */
  summon(character: Character, side: 'player' | 'enemy'): string | null;
};

type RpgBattleLogService = {
  /** Push a text entry to the battle log for a character. Turn is auto-filled. targetId optionally shows that character's face. */
  push(actorId: string, text: string, targetId?: string): void;
};

// ── Service overloads (declaration merging) ──

interface Game {
  getService(id: 'rpg_floating_text'): RpgFloatingTextService;
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
  statusApply: string[];
  statusStacks: number;
  statusDuration?: number;
  statusRemove: string[];
  statusRemoveStacks?: number;
  cleanse: boolean;
  cooldownChange: number;
  chargesChange: number;
};

// ── AI ──

type RpgAIAction = {
  abilityId: string;
  targetId: string;
};
