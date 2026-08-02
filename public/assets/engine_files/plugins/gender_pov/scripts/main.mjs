const { game } = window.engine;

// ============================================================================
// Pronoun lookup — [male, female] pairs from locale
// ============================================================================

const PRONOUNS = {
    "he":      [game.getLine("he"),      game.getLine("she")],
    "his":     [game.getLine("his"),     game.getLine("her")],
    "him":     [game.getLine("him"),     game.getLine("her")],
    "himself": [game.getLine("himself"), game.getLine("herself")],
    "he's":    [game.getLine("he's"),    game.getLine("she's")],
    "he'd":    [game.getLine("he'd"),    game.getLine("she'd")],
    "he'll":   [game.getLine("he'll"),   game.getLine("she'll")],
    "He":      [game.getLine("He"),      game.getLine("She")],
    "His":     [game.getLine("His"),     game.getLine("Her")],
    "Him":     [game.getLine("Him"),     game.getLine("Her")],
    "Himself": [game.getLine("Himself"), game.getLine("Herself")],
    "He's":    [game.getLine("He's"),    game.getLine("She's")],
    "He'd":    [game.getLine("He'd"),    game.getLine("She'd")],
    "He'll":   [game.getLine("He'll"),   game.getLine("She'll")],
};

/**
 * Resolve all pronouns for a character.
 * @param {string} charId
 */
function resolvePronouns(charId) {
    const f = game.getCharacter(charId)?.getAttribute("gender") === "female" ? 1 : 0;
    return {
        "he": PRONOUNS["he"][f], "his": PRONOUNS["his"][f],
        "him": PRONOUNS["him"][f], "himself": PRONOUNS["himself"][f],
        "he's": PRONOUNS["he's"][f], "he'd": PRONOUNS["he'd"][f], "he'll": PRONOUNS["he'll"][f],
        "He": PRONOUNS["He"][f], "His": PRONOUNS["His"][f],
        "Him": PRONOUNS["Him"][f], "Himself": PRONOUNS["Himself"][f],
        "He's": PRONOUNS["He's"][f], "He'd": PRONOUNS["He'd"][f], "He'll": PRONOUNS["He'll"][f],
    };
}

// Register generic pronoun placeholders (resolve by character ID)
for (const key of Object.keys(PRONOUNS)) {
    game.registerPlaceholder(key, (charId) => resolvePronouns(charId)[key]);
}

// ============================================================================
// POV lookup — [1st, 2nd] pairs (hardcoded, English-only)
// ============================================================================

const POV = {
    // Singular
    "i":         ["I",         "you"],
    "I":         ["I",         "You"],
    "me":        ["me",        "you"],
    "Me":        ["Me",        "You"],
    "my":        ["my",        "your"],
    "My":        ["My",        "Your"],
    "mine":      ["mine",      "yours"],
    "Mine":      ["Mine",      "Yours"],
    "myself":    ["myself",    "yourself"],
    "Myself":    ["Myself",    "Yourself"],
    // Plural (MC + others)
    "we":        ["we",        "you"],
    "We":        ["We",        "You"],
    "us":        ["us",        "you"],
    "Us":        ["Us",        "You"],
    "our":       ["our",       "your"],
    "Our":       ["Our",       "Your"],
    "ours":      ["ours",      "yours"],
    "Ours":      ["Ours",      "Yours"],
    "ourselves": ["ourselves", "yourselves"],
    "Ourselves": ["Ourselves", "Yourselves"],
    // Verb: to be
    "am":        ["am",        "are"],
    "Am":        ["Am",        "Are"],
    "was":       ["was",       "were"],
    "Was":       ["Was",       "Were"],
    "wasn't":    ["wasn't",    "weren't"],
    "Wasn't":    ["Wasn't",    "Weren't"],
    // Contractions — lowercase key = mid-sentence, uppercase key = sentence start
    "i'm":       ["I'm",       "you're"],
    "I'm":       ["I'm",       "You're"],
    "i've":      ["I've",      "you've"],
    "I've":      ["I've",      "You've"],
    "i'd":       ["I'd",       "you'd"],
    "I'd":       ["I'd",       "You'd"],
    "i'll":      ["I'll",      "you'll"],
    "I'll":      ["I'll",      "You'll"],
    "we're":     ["we're",     "you're"],
    "We're":     ["We're",     "You're"],
    "we've":     ["we've",     "you've"],
    "We've":     ["We've",     "You've"],
    "we'll":     ["we'll",     "you'll"],
    "We'll":     ["We'll",     "You'll"],
    "we'd":      ["we'd",      "you'd"],
    "We'd":      ["We'd",      "You'd"],
};

/** Resolve all POV words based on game setting. */
function resolvePOV() {
    const pov = game.getGameSetting("point_of_view") === "2nd" ? 1 : 0;
    const result = {};
    for (const key in POV) result[key] = POV[key][pov];
    return result;
}

// Register POV placeholders (no args — global setting)
for (const key of Object.keys(POV)) {
    game.registerPlaceholder(key, () => resolvePOV()[key]);
}

// Export for other scripts
game.registerService('gender_pov', {
    resolvePronouns, PRONOUN_KEYS: Object.keys(PRONOUNS),
    resolvePOV, POV_KEYS: Object.keys(POV),
});
