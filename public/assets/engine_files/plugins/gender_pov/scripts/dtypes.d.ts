// ── Pronoun Resolution ──

type PronounMap = {
  he: string; his: string; him: string; himself: string;
  "he's": string; "he'd": string; "he'll": string;
  He: string; His: string; Him: string; Himself: string;
  "He's": string; "He'd": string; "He'll": string;
};

type PovMap = {
  i: string; I: string; me: string; Me: string;
  my: string; My: string; mine: string; Mine: string;
  myself: string; Myself: string;
  we: string; We: string; us: string; Us: string;
  our: string; Our: string; ours: string; Ours: string;
  ourselves: string; Ourselves: string;
  am: string; Am: string; was: string; Was: string;
  "i'm": string; "I'm": string; "i've": string; "I've": string;
  "i'd": string; "I'd": string; "i'll": string; "I'll": string;
  "we're": string; "We're": string; "we've": string; "We've": string;
};

// ── Service Type ──

type GenderPovService = {
  resolvePronouns(charId: string): PronounMap;
  resolvePOV(): PovMap;
  PRONOUN_KEYS: string[];
  POV_KEYS: string[];
};

// ── Service overload (declaration merging) ──

interface Game {
  getService(id: 'gender_pov'): GenderPovService;
}
