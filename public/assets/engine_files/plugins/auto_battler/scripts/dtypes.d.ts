type BattleActor = {
  characterId: string,
  side: 'player' | 'enemy',
  speed: number,
  gauge: number,
}

type AbilitySnapshot = {
  id: string,
  name: string,
  icon: string | null,
  cooldown: number,
  charges: number,
  usable: boolean,
  chosen: boolean,
}

type TokenEffect = {
  type: 'dot' | 'hot' | 'absorb' | 'death_defiance' | 'stun',
  value: number,
  damage_type?: string,
}

type TokenDefinition = {
  id: string,
  name: string,
  description?: string,
  icon?: string,
  color?: string,
  max_stacks: number,
  polarity: 'positive' | 'negative' | 'neutral',
  power_scaling?: boolean,
  effects: TokenEffect[],
  source?: string,
}

type TokenInstance = { stacks: number, duration?: number, source: string }

type EffectResult = {
  type: 'damage' | 'heal' | 'shield' | 'steal' | 'move' | 'token_apply' | 'token_dot' | 'token_hot' | 'death_defiance' | 'cleanse' | 'dodge' | 'status_apply',
  targetId?: string,
  amount?: number,
  rawAmount?: number,
  damageType?: string,
  shieldAbsorbed?: number,
  defeated?: boolean,
  isCrit?: boolean,
  tokenId?: string,
  stacks?: number,
  statusId?: string,
  statusName?: string,
  duration?: number,
}

type BattleLogEntry = {
  turn: number,
  actorId: string,
  text?: string,
  effect?: EffectResult,
  abilityId?: string,
  type?: 'turn_start',
  abilitiesSnapshot?: AbilitySnapshot[],
}

type AbilityState = {
  cooldown: number,   // turns remaining (0 = ready)
  charges: number,    // remaining charges (-1 = unlimited)
}

type Battle = {
  id: string,
  turn: number,
  phase: 'active' | 'finished',
  playerGrid: Record<string, string>,   // "row_col" -> characterId
  enemyGrid: Record<string, string>,    // "row_col" -> characterId
  initiative: BattleActor[],            // all actors in the battle
  activeActorId: string | null,         // characterId of the actor whose turn it is
  actionCount: number,                  // total actions taken so far
  turnGauge: number,                    // virtual turn clock gauge
  log: BattleLogEntry[],
  result: 'victory' | 'defeat' | 'retreat' | null,
  prevDisableSaves: boolean,            // saved state to restore on end
  prevGameState: string,                // saved game_state to restore on end
  abilitiesState: Record<string, Record<string, AbilityState>>,  // charId -> abilityId -> state
  tokens: Record<string, Record<string, TokenInstance[]>>,       // charId -> tokenId -> instances[]
  chosenAction?: { abilityId: string, targetPos: string } | null,
  defeatedPlayer: string[],              // character IDs defeated on player side
  defeatedEnemy: string[],               // character IDs defeated on enemy side
  noRetreat: boolean,                    // if true, retreat button is hidden
  retreating: boolean,                   // true after player clicks Retreat
  retreated: string[],                   // character IDs that have successfully retreated
  _firstAction?: boolean,
  _pendingTurnStart?: boolean,
}

type EffectStep = {
  execute: () => EffectResult[],
  aspects: Record<string, any> | null,
  cells: string[],
}

type FloatingText = {
  id: number,
  characterId: string,
  text: string,
  cssClass: string,
  icon: string,
  color?: string,
}

type TargetHighlight = {
  side: string,
  primary: string,
  cells: string[],
  isFriendly: boolean,
  borderOnly?: boolean,
}

type TurnPreviewActorEntry = { type: 'actor', characterId: string, side: 'player' | 'enemy' }
type TurnPreviewTurnEntry = { type: 'turn', turn: number }
type TurnPreviewEntry = TurnPreviewActorEntry | TurnPreviewTurnEntry

type LeadershipCheck = {
  leaderId: string | null,
  budget: number,
  total: number,
  overflow: boolean,
}

type StartBattleResult = {
  ok: boolean,
  reason?: string,
}

type EnemyPosition = {
  row: number,
  col: number,
  characterId: string,
}

type StartBattleParams = {
  enemies: string[] | EnemyPosition[],
  noRetreat?: boolean,
}
