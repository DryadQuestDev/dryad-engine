// Converts plain first-person prose into gender_pov |placeholders|:
//   "I approach the cliff. My hands shake." -> "|I| approach the cliff. |My| hands shake."
//
// The word list mirrors the gender_pov plugin's POV table — only words with a
// registered placeholder are converted (keep the two in sync). Notably absent:
// bare `was`/`wasn't` are converted ONLY right after a converted first-person
// subject ("The door was shut" must not become 2nd-person "were shut"), and
// `weren't`/`were` are identity pairs the plugin deliberately doesn't register.
//
// Emitted placeholders always use straight apostrophes (|i'm|) — the registered
// keys — even when the prose used curly ones.

import { findBraceRanges } from './lint';

// Case-fixed words: the placeholder key is the word exactly as written.
const DIRECT_WORDS = [
    "ourselves", "Ourselves", "myself", "Myself", "we're", "We're", "we've", "We've",
    "we'll", "We'll", "we'd", "We'd", "mine", "Mine", "ours", "Ours", "our", "Our",
    "me", "Me", "my", "My", "we", "We", "us", "Us", "am", "Am",
];

// I-forms depend on sentence position: |I| / |I'm| at a sentence start, |i| / |i'm|
// mid-sentence (the lowercase keys resolve to lowercase "you're" etc. in 2nd person).
const I_FORMS = ["I'm", "I've", "I'd", "I'll", "I"];

// Longest-first so I'm wins over I, ourselves over our. Apostrophes match curly too.
const escapeWord = (w: string) => w.replace(/'/g, "['’]");
const DIRECT_RE = new RegExp(
    `(?<![\\w|'’])(${DIRECT_WORDS.map(escapeWord).join('|')})(?![\\w|'’])`, 'g');
const I_RE = new RegExp(
    `(?<![\\w|'’])(${I_FORMS.map(escapeWord).join('|')})(?![\\w|'’])`, 'g');

// `was`/`wasn't` directly after a converted first-person subject placeholder.
const WAS_RE = /(\|(?:i|I|we|We)(?:'\w+)?\|\s+)(was|wasn['’]t)(?![\w|'’])/g;

const SENTENCE_END_RE = /[.!?…](?:[)\]"'”’]*)?\s*$/;

/** Straight-apostrophe canonical form of a matched word. */
function canonical(word: string): string {
    return word.replace(/’/g, "'");
}

/**
 * Convert one clean prose segment (no braces, no quotes, no code).
 * `atSentenceStart` is the position state carried in; returns the state going out.
 */
function convertSegment(
    segment: string,
    atSentenceStart: boolean,
    bump: () => void,
): { text: string; atSentenceStart: boolean } {
    let out = segment.replace(DIRECT_RE, (m) => {
        bump();
        return `|${canonical(m)}|`;
    });

    // I-forms need left-to-right position tracking, so walk matches manually.
    let result = '';
    let last = 0;
    let sentenceStart = atSentenceStart;
    I_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = I_RE.exec(out)) !== null) {
        const before = out.slice(last, m.index);
        result += before;
        // Anything but whitespace/openers between the last match and this one means
        // we're past the carried-in state — recompute from the text before the match.
        if (/\S/.test(before)) {
            sentenceStart = SENTENCE_END_RE.test(before.trimEnd()) ||
                /[.!?…][)\]"'”’]*\s+$/.test(before);
        } else if (last > 0) {
            // Whitespace only since the previous I-form: that one was mid-sentence prose.
            sentenceStart = false;
        }
        const word = canonical(m[1]);
        const key = sentenceStart ? word : word.charAt(0).toLowerCase() + word.slice(1);
        result += `|${key}|`;
        bump();
        last = m.index + m[0].length;
        sentenceStart = false;
    }
    result += out.slice(last);

    // Trailing state for the next segment on this line.
    const tail = result.trimEnd();
    const outState = tail === '' ? atSentenceStart : SENTENCE_END_RE.test(tail);

    const withWas = result.replace(WAS_RE, (_full, subject, word) => {
        bump();
        return `${subject}|${canonical(word)}|`;
    });

    return { text: withWas, atSentenceStart: outState };
}

// Mirrors resolveTalkingCharacter (logicSystem.ts) — a `speaker_id: replica` line.
const SPEAKER_RE = /^(\w+):\s*/;

// A matched inline HTML pair: <tag …>…</tag>. Its inner content is the author's
// escape hatch — wrap a literal word in any tag (<span>mine</span>) and the converter
// leaves it alone. Raw HTML in prose is rare and deliberate (house emphasis is
// **markdown**), so reaching for a tag is itself the signal "this text is literal".
const HTML_PAIR_RE = /<(\w+)[^<>]*>.*?<\/\1\s*>/g;

/**
 * Convert one prose line: braces, quoted dialogue and tag-wrapped text are
 * protected, everything else runs through the word conversion with a per-line
 * sentence tracker.
 */
function convertProseLine(line: string, bump: () => void): string {
    // Protected ranges: balanced braces + quoted dialogue + matched HTML pairs.
    // Braces and tags are structural, so they leave the sentence state alone;
    // quotes are spoken content, so what follows is mid-sentence unless the
    // quote ended with .!? itself.
    type Protected = { start: number; end: number; kind: 'brace' | 'quote' };
    const protectedRanges: Protected[] =
        findBraceRanges(line).map(([start, end]) => ({ start, end, kind: 'brace' as const }));

    HTML_PAIR_RE.lastIndex = 0;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = HTML_PAIR_RE.exec(line)) !== null) {
        protectedRanges.push({ start: tagMatch.index, end: tagMatch.index + tagMatch[0].length, kind: 'brace' });
    }
    let quoteStart = -1;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (quoteStart === -1 && (c === '“' || c === '"')) {
            quoteStart = i;
        } else if (quoteStart !== -1 && (c === '”' || c === '"')) {
            protectedRanges.push({ start: quoteStart, end: i + 1, kind: 'quote' });
            quoteStart = -1;
        }
    }
    // Unclosed quote: protect to end of line.
    if (quoteStart !== -1) protectedRanges.push({ start: quoteStart, end: line.length, kind: 'quote' });
    protectedRanges.sort((a, b) => a.start - b.start);

    let converted = '';
    let pos = 0;
    let sentenceStart = true; // each line/paragraph starts a sentence
    for (const { start, end, kind } of protectedRanges) {
        if (start > pos) {
            const seg = convertSegment(line.slice(pos, start), sentenceStart, bump);
            converted += seg.text;
            sentenceStart = seg.atSentenceStart;
        }
        const protectedText = line.slice(Math.max(start, pos), end);
        converted += protectedText;
        if (kind === 'quote') {
            sentenceStart = /[.!?…]["”]\s*$/.test(protectedText);
        }
        pos = Math.max(pos, end);
    }
    if (pos < line.length) {
        converted += convertSegment(line.slice(pos), sentenceStart, bump).text;
    }
    return converted;
}

/**
 * Convert a full DryadScript source. Skips `[code]…[/code]` blocks, `//` comment
 * lines, balanced `{…}` ranges (params/conditions), and quoted dialogue (`“…”`
 * pairs and straight-`"` toggling; quote state resets per line, like the original
 * Google-Docs macro).
 *
 * VN-style speaker replicas (`character_id: blah blah`) are another character's own
 * first person, not the narrator's — they convert only when the speaker is the MC
 * (`options.mcId`, from the gender_pov plugin config). With no mcId configured,
 * every speaker line is left alone; narration always converts.
 */
export function convertPov(text: string, options: { mcId?: string } = {}): { text: string; count: number } {
    let count = 0;
    const bump = () => { count++; };

    // Pull code blocks out behind placeholders (the same trick parseText uses) —
    // conversion changes text length, so positional restore would drift.
    const codeBlocks: string[] = [];
    const masked = text.replace(/\[code\][\s\S]*?\[\/code\]/gi, (m) => {
        codeBlocks.push(m);
        return `__POV_CODE_${codeBlocks.length - 1}__`;
    });

    const lines = masked.split('\n');
    const outLines: string[] = [];

    for (const line of lines) {
        if (line.trimStart().startsWith('//')) {
            outLines.push(line);
            continue;
        }

        // Speaker replica? Someone else's speech stays literal; only the MC talks in
        // the narrator's POV. For the MC, convert the replica alone — the `mc: `
        // prefix must not feed the sentence tracker (a colon reads as mid-sentence).
        // (Sigil lines never match — they start with ^@#$!~>%.)
        const speaker = SPEAKER_RE.exec(line);
        if (speaker) {
            if (speaker[1] === options.mcId) {
                outLines.push(line.slice(0, speaker[0].length) + convertProseLine(line.slice(speaker[0].length), bump));
            } else {
                outLines.push(line);
            }
            continue;
        }

        outLines.push(convertProseLine(line, bump));
    }

    let result = outLines.join('\n');
    codeBlocks.forEach((block, i) => {
        result = result.replace(`__POV_CODE_${i}__`, () => block);
    });

    return { text: result, count };
}
