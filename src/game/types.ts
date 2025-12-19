export type DungeonLine = {
    id: string;
    val: string;
    params?: Record<string, any>;
    anchor?: string;
}

export type ChoiceType = 'encounter' | 'text' | 'scene';