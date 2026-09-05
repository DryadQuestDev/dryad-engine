import { Schema, SchemaToType } from '../utility/schema';

export const AccoladeSchema = {
    uid: { type: 'uid', required: true },
    id: { type: 'string', required: true, tooltip: 'Accolade id — referenced by game scripts when progressing it. Keep it stable once shipped.' },
    name: { type: 'string', required: true, tooltip: 'Display name on the card and the unlock notification.' },
    description: { type: 'textarea', tooltip: 'One-line unlock condition as the player reads it ("Take fifty loads up the ass.").' },
    tier: { type: 'chooseOne', fromFile: 'accolade_tiers', tooltip: 'Prestige tier. Card and notification styling (colors, icon fallback) come from the tier entry.' },
    group: { type: 'chooseOne', fromFile: 'accolade_groups', tooltip: 'Category section the accolade is listed under on the Accolades tab.' },
    icon: { type: 'file', fileType: 'image', tooltip: 'Card icon. Optional — falls back to the tier icon.' },
    hidden: { type: 'boolean', defaultValue: false, tooltip: 'Mask name and description until earned (spoilers, surprises). The tier stays visible.' },
    target: { type: 'number', tooltip: 'Progress needed to complete: 1 for a simple flag, N for counters ("50 loads"). Leave 0/empty when the game supplies it at runtime instead (e.g. "wear every outfit" — the script counts outfits in data and sets the target via code); the accolade cannot complete until a target exists.' },
    points: { type: 'number', tooltip: 'Reward points earned on completion. Leave 0/empty to use the tier\'s points, so a whole tier can be retuned in one place.' },
    show_progress: { type: 'boolean', defaultValue: true, tooltip: 'Show the progress bar with "n / target" on unearned cards. Only meaningful for targets above 1.' },
    disabled: { type: 'boolean', defaultValue: false, tooltip: 'Retire the accolade without deleting the row — it never completes and never shows. Mods should disable and add a new id instead of editing rows in place.' },
    tags: { type: 'string[]', tooltip: 'Free-form tags for scripts to address whole families at once (e.g. "seed_ass" on Backdoor Open / Anal Slut / Bottomless lets one call progress all three tiers).' },
    order: { type: 'number', defaultValue: 0, tooltip: 'Sort order inside the group.' },
} as const satisfies Schema;

export type AccoladeObject = SchemaToType<typeof AccoladeSchema>;
