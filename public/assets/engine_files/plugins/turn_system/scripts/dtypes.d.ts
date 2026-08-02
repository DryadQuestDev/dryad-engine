// ── Turn System Plugin Types ──

type TurnsService = {
    /** Current global turn number. */
    getTurn(): number;
    /**
     * Advance the clock by N turns (default 1): increments the counter, ticks limited
     * status durations on all characters, re-runs the discover scan, and fires `turn_advanced`.
     * @returns the new turn number
     */
    advance(turns?: number): number;
};

// ── Service overloads (declaration merging) ──
interface Game {
    getService(id: 'turns'): TurnsService;
}

// ── Emitter overloads ──
interface GameEvents {
    /** Fired after the turn counter advances and limited status durations have ticked. */
    turn_advanced: (newTurn: number, turnsElapsed: number) => void;
}
