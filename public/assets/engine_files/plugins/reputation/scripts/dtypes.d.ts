// ── Reputation Plugin Types ──

/** A "will remember that" note under the current paragraph. */
type ReputationNoteEntry = {
    id: string;
    /** Net change this paragraph made to the character. */
    delta: number;
};

/** One change in this session's history (debug tab). */
type ReputationLogEntry = {
    id: string;
    name: string;
    before: number;
    after: number;
    delta: number;
    /** Scene id the change happened in, '' outside a scene. */
    scene: string;
    time: number;
};

type ReputationService = {
    /** Current reputation; an untracked character reads 0. */
    get(characterId: string): number;
    /** True when the character carries a reputation value. */
    isTracked(characterId: string): boolean;
    /**
     * Change by delta (clamped to the configured min/max) and note it under the dialogue unless `silent`.
     * Creates the character from its template if the story has not made it yet.
     * @returns the new value, or null for an unknown character
     */
    add(characterId: string, delta: number, opts?: { silent?: boolean }): number | null;
    /** Set the value, silently. @returns the new value, or null for an unknown character */
    set(characterId: string, value: number): number | null;
    /** Every live character that carries a reputation value. */
    getTracked(): Character[];
    getBounds(): { min: number; max: number };
};

// ── Service overloads (declaration merging) ──
interface Game {
    getService(id: 'reputation'): ReputationService;
}

// ── Emitter overloads ──
interface GameEvents {
    /** Fired after a character's reputation changes. */
    reputation_change: (character: Character, oldValue: number, newValue: number, delta: number) => void;
}
