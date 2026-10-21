const { reactive } = window.engine.vue;

/** Transient UI state shared by the dialogue note and the debug tab. Reputation itself lives on the characters. */
export const store = reactive({
    /** @type {ReputationNoteEntry[]} the current paragraph's notes, one per character */
    notes: [],
    /** @type {ReputationLogEntry[]} changes this session, newest first (debug tab) */
    log: [],
});

/** The debug tab's history keeps this many changes. */
export const LOG_LIMIT = 40;
