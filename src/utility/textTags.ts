/**
 * Square-bracket text tags shared by the runtime resolver (LogicSystem) and the content editor's
 * syntax overlay (PlainEditor). See docs: dungeons/text_tags.md.
 */

/** `[name]…[/name]` letter effects. Each has a `.fx-<name>` rule in style.css. */
export const TEXT_EFFECTS = ['shake', 'wave', 'bounce', 'pulse', 'rainbow', 'glow', 'spooky', 'flicker', 'blur', 'glitch'] as const;

/** `[green]…[/green]` named colours. Each renders as `.text-<name>`, a shade tuned in style.css. */
export const TEXT_COLORS = ['green', 'red', 'gold', 'pink', 'purple', 'blue', 'grey'] as const;

/** Names the non-effect tags below already own, so a game's own effect can never take one. */
export const RESERVED_TEXT_TAGS = ['br', 'code', 'w', 'p', 'nw', 'fast', 'cps', 'color', 'size', ...TEXT_COLORS];

/**
 * Every non-effect text tag as written: layout (`[br]`, `[code]`), pacing (`[w]`, `[p]`, `[nw]`,
 * `[fast]`, `[cps]`) and styling (`[color]`, `[size]`, the named colours). Optional `=value` on the
 * tags that take one.
 */
export const TEXT_TAG_REGEX_SOURCE = String.raw`\[(?:br|\/?code|(?:w|p|nw)(?:=\d*\.?\d+)?|fast|cps=\*?\d*\.?\d+|\/cps|color=[^\]\s'"<>]+|\/color|size=\d*\.?\d+(?:px|em|rem|%)?|\/size|\/?(?:${TEXT_COLORS.join('|')}))\]`;

/** A valid effect name, built-in or registered through game.registerTextEffect. */
export const TEXT_EFFECT_NAME_REGEX = /^[a-z][a-z0-9_-]*$/;
