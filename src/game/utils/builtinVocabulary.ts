import { InitSystem } from '../systems/initSystem';
import type { Game } from '../game';
import type { ActionObject } from '../systems/logicSystem';
import type { CallEntry } from '../../utility/contentVocabulary';
import type { Vocabulary } from '../../utility/dungeonEditor/refs';
import { TEXT_EFFECTS } from '../../utility/textTags';

let cached: Omit<Vocabulary, 'open'> | null = null;

/**
 * The engine's own actions, conditions, placeholders, states and text effects, with the help and
 * values their registrations carry. InitSystem registers into a recorder, not a Game: storing a
 * handler runs none of it, and no game state is touched.
 */
export function builtinVocabulary(): Omit<Vocabulary, 'open'> {
  if (cached) return cached;
  const source = { source: 'builtin' };
  const v: Omit<Vocabulary, 'open'> = {
    actions: new Map(), conditions: new Map(), placeholders: new Map(), states: new Map(),
    effects: new Map(TEXT_EFFECTS.map((e) => [e, source])),
  };
  const recorder = {
    registerAction: (id: string, obj: ActionObject | Function) => {
      v.actions.set(id, typeof obj === 'function' ? source : { ...source, help: obj.help, value: obj.value, examples: obj.examples });
    },
    registerCondition: (id: string, _func: Function, info?: CallEntry) => v.conditions.set(id, { ...source, ...info }),
    registerPlaceholder: (id: string, _func: Function, info?: CallEntry) => v.placeholders.set(id, { ...source, ...info }),
    registerState: (id: string) => v.states.set(id, source),
  };
  new InitSystem(recorder as unknown as Game).registerContentVocabulary();
  cached = v;
  return v;
}
