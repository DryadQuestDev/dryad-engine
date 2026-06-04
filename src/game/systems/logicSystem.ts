import { jsonrepair } from "jsonrepair";
import { Choice } from "../core/content/choice";
import { Character } from "../core/character/character";
import { Game } from "../game";
import { computed, ComputedRef } from "vue";
import { gameLogger } from "../utils/logger";
import { CustomChoiceObject } from "../../schemas/customChoiceSchema";
import { PoolDefinitionObject } from "../../schemas/poolDefinitionSchema";
import { PoolEntryObject } from "../../schemas/poolEntrySchema";

export type ActionObject = {
    action?: Function;
    choiceModifier?: Function;
    onGameLoad?: boolean;
    eventDelayed?: boolean;
}

// Simplified type for createCustomChoice - only requires id, name, and action
export type CreateChoiceParams = {
    id: string;
    name?: string;
    params?: string | Record<string, any>;
}

export type AspectRenderer = (input: {
    value: any;
    aspects: Record<string, any>;
    character: Character | undefined;
    ability: { meta?: Record<string, any>, effects?: Record<string, any> } | undefined;
}) => string;

export class LogicSystem {

    get game(): Game {
        return Game.getInstance();
    }

    // note: the reason why we cannot get rid of conditionRegistry and use placeholderRegistry for both conditions and placeholders is because placeholders return strings, while conditions return booleans/numbers
    conditionRegistry = new Map<string, Function>();

    placeholderRegistry = new Map<string, Function>();
    public resolveContext: Record<string, any> = {};
    actionRegistry = new Map<string, ActionObject>(); // make it an object {func: Function}

    public customChoiceMap = new Map<string, CustomChoiceObject>();

    public aspectRendererRegistry = new Map<string, AspectRenderer>();

    public registerAspectRenderer(aspectId: string, fn: AspectRenderer): void {
        this.aspectRendererRegistry.set(aspectId, fn);
    }

    /**
     * Parse a generic `id<op>value` specification into a typed list of ops.
     * Pure string parsing — no characters, stats, or game data are touched.
     * Plugins use this to avoid hand-rolling regex when they accept the
     * common `"id>5, id2=3"` shorthand syntax. Reused internally by
     * `processCharAction` (with dotted ids) and the `char` content action.
     *
     * String form: comma-separated `"<id><op><value>"` where op is `=`, `>`,
     * or `<`. Whitespace around the operator is allowed. The id may contain
     * dots (e.g. `alice.stat.brawn`). Returned `value` is the trimmed string
     * after the operator — consumers coerce as needed.
     *
     * Object form: `{ id: any }`. For numeric values, sign infers the op
     * (positive `>`, negative `<`, zero `=`) and `value` is the absolute
     * magnitude. For non-numeric values, op is `=` and the raw value passes
     * through.
     *
     * Invalid specs are logged and skipped.
     *
     * @example
     * logicSystem.parseOpsSpec("alice>5, bob = 3");
     * // [{ id: 'alice', op: '>', value: '5' }, { id: 'bob', op: '=', value: '3' }]
     * logicSystem.parseOpsSpec({ alice: 5, bob: -2 });
     * // [{ id: 'alice', op: '>', value: 5 }, { id: 'bob', op: '<', value: 2 }]
     */
    public parseOpsSpec(data: string | Record<string, any>): Array<{ id: string; op: '=' | '>' | '<'; value: any }> {
        const out: Array<{ id: string; op: '=' | '>' | '<'; value: any }> = [];
        if (typeof data === 'string') {
            for (const spec of data.split(',').map(s => s.trim()).filter(Boolean)) {
                const m = spec.match(/^([^=<>\s]+)\s*([=<>])\s*(.+)$/);
                if (!m) {
                    gameLogger.error(`[parseOpsSpec] invalid spec: "${spec}". Use "<id>[=<>]<value>"`);
                    continue;
                }
                out.push({ id: m[1], op: m[2] as '=' | '>' | '<', value: m[3].trim() });
            }
        } else if (data && typeof data === 'object') {
            for (const [id, raw] of Object.entries(data)) {
                if (typeof raw === 'number') {
                    if (raw > 0) out.push({ id, op: '>', value: raw });
                    else if (raw < 0) out.push({ id, op: '<', value: Math.abs(raw) });
                    else out.push({ id, op: '=', value: 0 });
                } else {
                    out.push({ id, op: '=', value: raw });
                }
            }
        }
        return out;
    }

    /**
     * Parse a `targetId->item & item & ..., targetId->!item, ...` specification into
     * a typed list of per-target add/remove operations. Pure string parsing — no
     * characters, statuses, or game data are touched. Used by `status`, `skin_layer`,
     * and `item_slot` content actions, and available to plugins authoring similar
     * `caster->X & Y, caster->!Z` sugar.
     *
     * Format: comma-separates per-target specs; each spec is `id->item & item`,
     * each item optionally prefixed with `!` to mark it for removal. Tokens with
     * no `->` are logged and skipped. An empty item list (e.g. `"alice->"`) is
     * skipped silently.
     *
     * @example
     * logicSystem.parseTargetedSpec("alice->buff1 & buff2, bob->!debuff");
     * // [
     * //   { characterId: 'alice', items: [{ name: 'buff1', remove: false }, { name: 'buff2', remove: false }] },
     * //   { characterId: 'bob', items: [{ name: 'debuff', remove: true }] },
     * // ]
     */
    public parseTargetedSpec(data: string): Array<{ characterId: string; items: Array<{ name: string; remove: boolean }> }> {
        const out: Array<{ characterId: string; items: Array<{ name: string; remove: boolean }> }> = [];
        if (typeof data !== 'string' || !data.trim()) return out;

        for (const spec of data.split(',').map(s => s.trim()).filter(Boolean)) {
            const arrowIdx = spec.indexOf('->');
            if (arrowIdx === -1) {
                gameLogger.error(`[parseTargetedSpec] missing '->' in spec: "${spec}"`);
                continue;
            }
            const characterId = spec.slice(0, arrowIdx).trim();
            if (!characterId) {
                gameLogger.error(`[parseTargetedSpec] missing target id in spec: "${spec}"`);
                continue;
            }
            const items = spec.slice(arrowIdx + 2)
                .split('&').map(s => s.trim()).filter(Boolean)
                .map(token => {
                    const remove = token.startsWith('!');
                    return { name: remove ? token.slice(1).trim() : token, remove };
                })
                .filter(i => i.name);
            if (items.length === 0) continue;
            out.push({ characterId, items });
        }
        return out;
    }

    public registerCondition(id: string, func: Function) {
        let firstChar = id.charAt(0);

        if (firstChar !== '_') {
            throw new Error(`Error registering argument ${id}: You need to have _ prefix for arguments. E.G. _my_argument`);
        }

        let exists = this.conditionRegistry.has(id);
        if (exists) {
            gameLogger.overwrite(`Condition "${id}" already exists - overwriting`);
        }

        this.conditionRegistry.set(id, func);
    }


    /**
     * Private helper to evaluate a single condition string like "a==1" or "a=1"
     * Returns the result of the evaluation
     * Supports custom conditions with parameters: "_char(alice.attribute.sex) = female"
     */
    private _evaluateSingleCondition(condition: string): boolean {
        // Parse condition format: "key operator value"
        // Supported operators: ==, =, !=, >, <, >=, <=
        // Note: We check for == and >= before = to avoid matching = in ==, >=, etc.
        // Key can be: flag, dungeon.flag, _condition, or _condition(arg1, arg2)
        const match = condition.match(/^([a-zA-Z0-9_.]+(?:\([^)]*\))?)\s*(==|!=|>=|<=|>|<|=)\s*(.+)$/);

        if (!match) {
            gameLogger.error(`Invalid condition format: "${condition}". Use format like key==value or key=value without quotes`);
            return false;
        }

        const [, key, operator, rawValue] = match;

        // Get the actual value from the flag/condition
        const actualValue = this.getConditionValue(key.trim());

        const trimmedValue = rawValue.trim();

        // Parse the comparison value - try boolean, then number, then string
        let comparisonValue: any;
        let valueType: 'boolean' | 'number' | 'string';

        if (trimmedValue === 'true' || trimmedValue === 'false') {
            comparisonValue = trimmedValue === 'true';
            valueType = 'boolean';
        } else if (!isNaN(Number(trimmedValue))) {
            comparisonValue = Number(trimmedValue);
            valueType = 'number';
        } else {
            comparisonValue = trimmedValue;
            valueType = 'string';
        }

        // Perform comparison based on operator and type
        switch (operator) {
            case '=':
            case '==':
                return actualValue == comparisonValue; // Use == for type coercion
            case '!=':
                return actualValue != comparisonValue;
            case '>':
                if (valueType === 'string') {
                    gameLogger.error(`Operator "${operator}" not supported for string comparison in condition "${condition}"`);
                    return false;
                }
                return Number(actualValue) > Number(comparisonValue);
            case '<':
                if (valueType === 'string') {
                    gameLogger.error(`Operator "${operator}" not supported for string comparison in condition "${condition}"`);
                    return false;
                }
                return Number(actualValue) < Number(comparisonValue);
            case '>=':
                if (valueType === 'string') {
                    gameLogger.error(`Operator "${operator}" not supported for string comparison in condition "${condition}"`);
                    return false;
                }
                return Number(actualValue) >= Number(comparisonValue);
            case '<=':
                if (valueType === 'string') {
                    gameLogger.error(`Operator "${operator}" not supported for string comparison in condition "${condition}"`);
                    return false;
                }
                return Number(actualValue) <= Number(comparisonValue);
            default:
                return false;
        }
    }

    /**
     * Private helper to split conditions by comma, respecting parentheses
     * e.g., "_item_on(alice, sword) = true, flag = 1" splits correctly
     */
    private _splitConditions(str: string): string[] {
        const parts: string[] = [];
        let current = '';
        let parenDepth = 0;

        for (const char of str) {
            if (char === '(') parenDepth++;
            else if (char === ')') parenDepth--;

            if (char === ',' && parenDepth === 0) {
                parts.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        if (current.trim()) parts.push(current.trim());
        return parts;
    }

    /**
     * Private helper to evaluate string-based conditions with AND logic: "a==1, b>4, _char(alice.health) > 50"
     * All conditions must be true
     */
    private _evaluateConditionString(conditionString: string): boolean {
        const conditions = this._splitConditions(conditionString);

        for (const condition of conditions) {
            if (!this._evaluateSingleCondition(condition)) {
                return false; // AND logic: if any condition fails, return false
            }
        }

        return true; // All conditions passed
    }

    /**
     * Private helper to evaluate string-based conditions with OR logic: "a==1, b>4, d!=6"
     * At least one condition must be true
     */
    private _evaluateConditionStringOr(conditionString: string): boolean {
        const conditions = conditionString.split(',').map(s => s.trim());

        for (const condition of conditions) {
            if (this._evaluateSingleCondition(condition)) {
                return true; // OR logic: if any condition passes, return true
            }
        }

        return false; // No conditions passed
    }

    // ignore types
    public performConditionalEvaluation(params?: Record<string, any>, isActiveClause = false): boolean {
        if (params === undefined) {
            return true;
        }

        const clauseKey = isActiveClause ? 'active' : 'if';
        const clauseOrKey = isActiveClause ? 'activeOr' : 'ifOr';

        const primaryClause = params[clauseKey];
        const orClause = params[clauseOrKey];

        // Determine if primary clause exists and what type it is
        let hasPrimary = false;
        let primaryIsString = false;
        let primaryIsBoolean = false;

        if (primaryClause !== undefined) {
            if (typeof primaryClause === 'string') {
                hasPrimary = true;
                primaryIsString = true;
            } else if (typeof primaryClause === 'boolean') {
                hasPrimary = true;
                primaryIsBoolean = true;
            }
        }

        // Determine if or clause exists and what type it is
        let hasOr = false;
        let orIsString = false;

        if (orClause !== undefined) {
            if (typeof orClause === 'string') {
                hasOr = true;
                orIsString = true;
            }
        }

        // If neither primary nor 'Or' clauses are present or valid, return always true.
        if (!hasPrimary && !hasOr) {
            return true;
        }

        // Evaluate primary clause
        let primaryBlockPasses = true;
        if (hasPrimary) {
            if (primaryIsBoolean) {
                primaryBlockPasses = primaryClause as boolean;
            } else if (primaryIsString) {
                primaryBlockPasses = this._evaluateConditionString(primaryClause);
            }
        }

        // Evaluate or clause
        let orBlockPasses = true; // Default to true if no 'or' clause
        if (hasOr) {
            orBlockPasses = false; // If 'or' clause exists, it must have at least one true condition
            if (orIsString) {
                orBlockPasses = this._evaluateConditionStringOr(orClause);
            }
        }

        if (hasPrimary && hasOr) {
            return primaryBlockPasses && orBlockPasses;
        } else if (hasPrimary) {
            return primaryBlockPasses;
        } else if (hasOr) {
            return orBlockPasses;
        }
        // This case should be covered by the initial (!hasPrimary && !hasOr) check
        return true;
    }

    // ignore types
    public buildComputed(params?: Record<string, any>, isActive = false): ComputedRef<boolean> {
        return computed(() => this.performConditionalEvaluation(params, isActive));
    }


    // ignore types
    public getConditionValue(id: string): any {
        let firstChar = id.charAt(0);

        if (firstChar === '_') {
            // Parse function syntax: _name or _name(arg1, arg2)
            const funcMatch = id.match(/^(_[a-zA-Z0-9_]+)(?:\(([^)]*)\))?$/);
            if (!funcMatch) {
                throw new Error(`Invalid condition format: ${id}`);
            }

            const conditionName = funcMatch[1];
            const argsString = funcMatch[2] || '';

            // Split args by comma, trimming whitespace
            const args = argsString ? argsString.split(',').map(a => a.trim()) : [];

            let conditionFunc = this.conditionRegistry.get(conditionName);
            if (!conditionFunc) {
                throw new Error(`Condition ${conditionName} not found`);
            }

            return conditionFunc(...args);
        }

        return this.game.dungeonSystem.getFlag(id);
    }


    // Action Registry
    public registerAction(id: string, actionObject: ActionObject) {
        if (!actionObject.action) {
            actionObject.action = () => { };
        }

        if (!actionObject.choiceModifier) {
            actionObject.choiceModifier = () => { };
        }


        let exists = this.actionRegistry.has(id);
        if (exists) {
            gameLogger.overwrite(`Action "${id}" already exists - overwriting`);
        }

        this.actionRegistry.set(id, actionObject);
    }

    // if params is an array, it will be executed for each item
    public resolveActions(params: Record<string, any> | string, skipDelayed: boolean = false) {

        if (typeof params === 'string') {
            params = JSON.parse(this.fixJson(params)) as Record<string, any>;
        }

        let skip = ["if", "ifOr", "active", "activeOr"];
        for (let param of Object.keys(params)) {
            if (skip.includes(param)) {
                continue;
            }
            //console.log('param', param);
            let actionObject = this.actionRegistry.get(param);
            if (!actionObject) {
                gameLogger.error(`Action ${param} is not registered.`);
                continue;
            }

            if (skipDelayed && actionObject.eventDelayed) {
                continue;
            }

            if (Array.isArray(params[param])) {
                for (let item of params[param]) {
                    actionObject.action?.(item);
                }
            } else {
                actionObject.action?.(params[param]);
            }
        }
    }

    public getDelayedActions(params: Record<string, any>): Record<string, any> {
        let filteredParams: Record<string, any> = {};
        for (let param of Object.keys(params)) {
            let actionObject = this.actionRegistry.get(param);
            if (!actionObject) {
                continue;
            }
            if (!actionObject.eventDelayed) {
                continue;
            }
            filteredParams[param] = params[param];
        }
        return filteredParams;
    }

    public getReloadActions(params: Record<string, any>): Record<string, any> {
        let filteredParams: Record<string, any> = {};
        for (let param of Object.keys(params)) {
            let actionObject = this.actionRegistry.get(param);
            if (!actionObject) {
                continue;
            }
            if (!actionObject.onGameLoad) {
                continue;
            }
            filteredParams[param] = params[param];
        }
        return filteredParams;
    }


    public registerPlaceholder(id: string, func: Function) {
        let exists = this.placeholderRegistry.has(id);
        if (exists) {
            gameLogger.overwrite(`Placeholder "${id}" already exists - overwriting`);
        }
        this.placeholderRegistry.set(id, func);
    }


    // takes: my_placeholder(arg1, arg2)
    private resolvePlaceholder(value: string): string {
        // Parse function syntax: name or name(arg1, arg2)
        const funcMatch = value.match(/^([a-zA-Z0-9_'\-]+)(?:\(([^)]*)\))?$/);
        if (!funcMatch) {
            throw new Error(`Invalid placeholder format: ${value}`);
        }

        const placeholderId = funcMatch[1];
        const argsString = funcMatch[2] || '';

        let placeholder = this.placeholderRegistry.get(placeholderId);
        if (!placeholder) {
            throw new Error(`Placeholder ${placeholderId} is not registered.`);
        }

        // Split args by comma, trimming whitespace
        const args = argsString ? argsString.split(',').map(a => a.trim()) : [];

        return placeholder(...args);
    }




    public resolveString(input: string, noExecuteActions: boolean = false, context?: Record<string, any>): { output: string, actions: Record<string, any> } {
        const prevContext = this.resolveContext;
        if (context) this.resolveContext = context;

        // todo: [code]some content with actions, placeholders etc that should be ignored in the resolvers[/code]
        let output = this.resolveCode(input);

        // if{} — hoisted to run first so unreachable branches (and their [[!id]] discover-on-encounter
        // tokens, side-effecting actions, etc.) are dropped before any other stage processes them.
        // Trade-off: conditions cannot use |placeholder| substitution (they can use flags and registered _conditions).
        output = this.ifLogic(output);

        // [[record_id]] / [[!record_id]] / [[id>label]]
        output = this.resolveLoreLinks(output);

        // |placeholder|
        output = this.resolveTextPlaceholders(output);

        // |@slot|
        output = this.resolveNarrativeSlots(output);

        // |$template|
        output = this.resolveTemplate(output);


        // resolve actions (check for delayed actions)
        let { resultString, resultActions } = this.resolveTextActions(output, noExecuteActions);
        output = resultString;

        // bold * and italic **
        output = this.resolveTextStyles(output);

        this.resolveContext = prevContext;
        return { output: output, actions: resultActions };
    }

    private resolveCode(text: string): string {
        const codeRegex = /\[code\]([\s\S]*?)\[\/code\]/g;
        return text.replace(codeRegex, (match, codeContent) => {
            // To prevent other resolvers from interpreting special characters
            // inside the [code] block, we convert them into HTML entities.
            // The v-html directive in the Vue component will then decode these
            // entities for correct display in the browser.
            const escapedContent = codeContent
                .replace(/&/g, '&amp;') // Must be first
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/{/g, '&#123;')
                .replace(/}/g, '&#125;')
                .replace(/\[/g, '&#91;')
                .replace(/\]/g, '&#93;')
                .replace(/\|/g, '&#124;')
                .replace(/\*/g, '&#42;')
                .replace(/\$/g, '&#36;');

            return `<span class='output_code'>${escapedContent}</span>`;
        });
    }

    public resolveTalkingCharacter(text: string): string {
        const pattern = /^(\w+):\s*(.*)$/;
        const match = text.match(pattern);

        if (match && match[2] !== undefined) {
            // match[0] is the full string "CharacterId: some text"
            // match[1] is "CharacterId"
            // match[2] is "some text"
            this.game.dungeonSystem.talkingCharacterId.value = match[1];
            return match[2];
        } else {
            this.game.dungeonSystem.talkingCharacterId.value = null;
        }

        return text; // Return original text if no match
    }

    public resolveTextStyles(text: string): string {

        let output = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');

        output = output.replace(/\*(.*?)\*/g, '<i>$1</i>');

        return output;
    }

    private resolveLoreLinks(text: string): string {
        const regex = /\[\[(!?)([a-zA-Z0-9_]+)(?:(?:>|&gt;)([^\]]+?))?\]\]/g;
        const narrative = this.game.narrativeSystem;
        return text.replace(regex, (_match, bang: string, id: string, customLabel?: string) => {
            const record = narrative.getRecord(id);
            if (!record) {
                gameLogger.error(`Unknown record "${id}" in [[${bang}${id}]]`);
                return customLabel || id;
            }
            if (bang === '!') {
                narrative.discoverRecord(id);
            }
            const display = customLabel || record.title || id;
            if (!narrative.isRecordDiscovered(id)) {
                return display;
            }
            return `<span class='lore-link' data-lore-id='${id}' tabindex='0'>${display}</span>`;
        });
    }

    private resolveTextPlaceholders(text: string): string {
        const placeholderRegex = /\|([^|]+?)\|/g;
        let output = text;
        let match;

        // Iterate over all matches in the text
        const matches = Array.from(text.matchAll(placeholderRegex));

        for (const currentMatch of matches) {
            const fullMatch = currentMatch[0]; // The full matched string, e.g., "|placeholderName|"
            const placeholderName = currentMatch[1]; // The captured group, e.g., "placeholderName"


            // if placeholder starts with $ or @ it means it's a template or narrative slot, skip it.
            if (placeholderName.startsWith("$") || placeholderName.startsWith("@")) {
                continue;
            }

            try {
                const resolvedValue = this.resolvePlaceholder(placeholderName);
                output = output.replace(fullMatch, resolvedValue);
            } catch (error) {
                gameLogger.error(`Error resolving placeholder "${placeholderName}": ${(error as Error).message}`);
                // Optionally, replace with an error message or leave as is
                // output = output.replace(fullMatch, `[Error: ${placeholderName}]`);
            }
        }
        return output;
    }

    private resolveTextActions(text: string, noExecuteActions: boolean = false): { resultString: string, resultActions: Record<string, any> } {
        let remainingText = text;
        let processedString = "";
        const accumulatedActions: Record<string, any> = {};

        let openBraceIndex = remainingText.indexOf('{');

        while (openBraceIndex !== -1) {
            // Append text before the current JSON object
            processedString += remainingText.substring(0, openBraceIndex);

            let braceDepth = 1;
            let jsonEndIndex = -1;
            // Start searching for the closing brace from after the openBraceIndex
            for (let i = openBraceIndex + 1; i < remainingText.length; i++) {
                if (remainingText[i] === '{') {
                    braceDepth++;
                } else if (remainingText[i] === '}') {
                    braceDepth--;
                    if (braceDepth === 0) {
                        jsonEndIndex = i;
                        break;
                    }
                }
            }

            if (jsonEndIndex === -1) {
                // Unmatched open brace, append the rest of the string (including the malformed part) and stop processing
                gameLogger.error(`Unmatched open brace in text: ${remainingText.substring(openBraceIndex)}`);
                processedString += remainingText.substring(openBraceIndex);
                remainingText = ""; // Clear remainingText as we've processed what's left
                break;
            }

            // Extract the JSON-like string (including braces)
            const jsonStringWithBraces = remainingText.substring(openBraceIndex, jsonEndIndex + 1);

            try {
                const repairedJsonString = this.fixJson(jsonStringWithBraces);
                const parsedJson = JSON.parse(repairedJsonString);

                // TODO: check for {redirect} first. If there's then return immediately.
                if (parsedJson["redirect"]) {
                    return { resultString: "", resultActions: parsedJson };
                }

                // Resolve actions (skipDelayed = true)
                if (!noExecuteActions) {
                    this.resolveActions(parsedJson, true);
                }

                // Accumulate actions
                Object.assign(accumulatedActions, parsedJson);

            } catch (error) {
                gameLogger.error(`Failed to process JSON object: "${jsonStringWithBraces}"`, (error as Error).message);
                // The JSON string is removed from the text even if processing fails, as per requirements.
            }

            // Update remainingText to exclude the processed JSON part
            remainingText = remainingText.substring(jsonEndIndex + 1);

            // Find the next JSON object in the updated remainingText
            openBraceIndex = remainingText.indexOf('{');
        }

        // Append any text remaining after the last JSON object
        processedString += remainingText;

        return { resultString: processedString, resultActions: accumulatedActions };
    }

    private resolveNarrativeSlots(text: string): string {
        const slotRegex = /\|@([a-zA-Z0-9_]+)(?:\(([^)]*)\))?\|/g;
        const matches = Array.from(text.matchAll(slotRegex));
        if (matches.length === 0) return text;

        let output = text;
        for (const match of matches) {
            const fullMatch = match[0];
            const slotType = match[1];
            const argsString = match[2] || '';
            const args = argsString ? argsString.split(',').map(a => a.trim()) : [];
            const resolved = this.game.narrativeSystem.resolveSlot(slotType, args);
            output = output.replace(fullMatch, resolved);
        }
        return output;
    }

    private resolveTemplate(text: string): string {

        const templateRegex = /\|(\$[^|]+?)\|/g;
        let output = text;
        let match;

        const matches = Array.from(text.matchAll(templateRegex));

        for (const currentMatch of matches) {
            const fullMatch = currentMatch[0]; // The full matched string, e.g., "|$templateName|"
            const templateId = currentMatch[1]; // The captured group, e.g., "$templateName"

            try {
                const resolvedValue = this.doTemplate(templateId);
                output = output.replace(fullMatch, resolvedValue);
            } catch (error) {
                gameLogger.error(`Error resolving template "${templateId}": ${(error as Error).message}`);
                // Optionally, replace with an error message or leave as is
                // output = output.replace(fullMatch, `[Error: ${templateId}]`);
            }
        }
        return output;
    }

    private doTemplate(value: string): string {
        let parts = value.split(".");
        let dungeon = null;
        let templateId = ""
        if (parts.length == 1) {
            templateId = value;
        } else {
            dungeon = parts[0].slice(1);
            templateId = "$" + parts[1];
        }
        let realDungeonId = this.game.getDungeonId(dungeon);

        // Collect variants: base + ~2, ~3, ...
        const variants = [templateId];
        for (let i = 2; ; i++) {
            const variantId = `${templateId}~${i}`;
            const line = this.game.getLineByDungeonId(variantId, realDungeonId);
            if (!line) break;
            variants.push(variantId);
        }

        const chosen = variants[Math.floor(Math.random() * variants.length)];
        let content = this.game.getLineByDungeonId(chosen, realDungeonId).val;
        let resolved = this.resolveString(content).output;
        return resolved;
    }

    // ignore types
    public ifLogic(str: string): string {
        let parts = [];
        parts.push("");
        let left = 0;
        let right = 0;
        for (let i = 0; i < str.length; i++) {
            let char = str[i];
            if (char == "{") {
                left++;
                let slice = parts[parts.length - 1].slice(-2) as string;
                // Debug: console.error(slice);
                if (slice == "if" || slice == "fi") {
                    parts[parts.length - 1] = parts[parts.length - 1].slice(0, -2);
                    parts.push(slice + "{");
                } else {
                    slice = parts[parts.length - 1].slice(-4);
                    if (slice == "else" || slice == "ifOr") {
                        parts[parts.length - 1] = parts[parts.length - 1].slice(0, -4);
                        parts.push(slice + "{");
                    } else {
                        parts[parts.length - 1] += char;
                    }
                }
                // Debug: console.error(parts);
            } else if (char == "}") {
                parts[parts.length - 1] += char;
                if (left > 0) {
                    right++;
                    if (left == right) {
                        parts.push("");
                        left = 0;
                        right = 0;
                    }
                }

            } else {
                parts[parts.length - 1] += char;
            }
        }

        // Debug: console.warn(parts);
        return this.ifLogic2(parts, str);
    }

    private ifLogic2(parts: string[], str: string) {
        // Debug: let parts = str.split("&;");

        if (parts.length == 1) {// just a regular string with no ifs
            return parts[0];
        }
        // Debug: console.warn(parts);

        let result = "";
        let i = 0;

        //check the first part
        if (!/^(if{|else{|ifOr{)/.test(parts[0])) {
            result += parts[0];
            i = 1;
        }

        let cycleFinished = false;
        let or = false;
        for (i; i < parts.length; i = i + 1) {
            let part = parts[i];
            if (/^(if{|else{|ifOr{)/.test(part)) {
                if (cycleFinished) {
                    continue;
                }
                if (/^(ifOr{)/.test(part)) {
                    or = true;
                } else if (/^(if{)/.test(part)) {
                    or = false;
                }

                let conditionIsTrue: boolean;
                let conditionArr = part.match(/(\{.*\})/);
                if (conditionArr) {
                    let condition = conditionArr[0];

                    // Remove outer braces to get the condition string
                    let innerContent = condition.slice(1, -1).trim();

                    // Check if this is an else{} with no condition (always true)
                    if (innerContent === '') {
                        conditionIsTrue = true; // else{} always evaluates to true
                    } else {
                        // Process as string condition
                        // Examples: {flag < 3}, {_selected_character = alice}, {count >= 1}
                        if (or) {
                            conditionIsTrue = this.performConditionalEvaluation({ ifOr: innerContent }, false);
                        } else {
                            conditionIsTrue = this.performConditionalEvaluation({ if: innerContent }, false);
                        }
                    }
                } else {//for ELSE
                    conditionIsTrue = this.performConditionalEvaluation(undefined, false); // Evaluates to true
                }
                if (conditionIsTrue) { // Use the direct boolean result
                    result += parts[i + 1];
                    cycleFinished = true;
                }

            }

            //check fi
            if (i == parts.length - 1) {

                break;
            }
            if (/^fi{}$/.test(part)) {
                let next = parts[i + 1];
                if (!/^(if{|ifOr{)/.test(next)) {
                    result += parts[i + 1];
                } else {
                    i--;
                }


                cycleFinished = false;
            }

        }


        // Debug: console.warn(result);
        return result;
        // Debug: return str;
    }

    public createCustomChoice(customChoice: CreateChoiceParams): Choice {
        let choice = new Choice();
        choice.id = customChoice.id;
        choice.name = customChoice.name || "";

        // Handle action as either string (from schema) or object (from code)
        let params = typeof customChoice.params === 'string'
            ? JSON.parse(this.fixJson(customChoice.params))
            : (customChoice.params || {});

        choice.params = params;
        //console.log("actionObject", actionObject);
        choice.isVisible = computed(() => this.performConditionalEvaluation(params));
        choice.isAvailable = computed(() => this.performConditionalEvaluation(params, true));
        this.performChoiceModifier(choice, params);
        return choice;
    }

    private performChoiceModifier(choice: Choice, params: Record<string, any>) {
        for (let param of Object.keys(params)) {
            let actionObject = this.actionRegistry.get(param);
            if (actionObject && actionObject.choiceModifier) {
                actionObject.choiceModifier(choice, params[param]);
            }
        }

        if (!choice.nameComputed) {
            choice.nameComputed = computed(() => choice.name);
        }
    }

    public fixJson(str: string): string {
        str = str
            .replace(/[“”„‟«»]/g, '"')
            .replace(/[‘’‚‛]/g, "'");
        str = str.replace(/\.(?!\d)/g, "__dot__");
        str = jsonrepair(str);
        str = str.replace(/__dot__/g, ".");
        return str;
    }

    /**
     * Traverse a nested object using a dot-separated path.
     * Example: getNestedValue({ a: { b: { c: 10 } } }, "a.b.c") returns 10
     * @param obj The object to traverse
     * @param path Dot-separated path (e.g., "a.b.c")
     * @returns The value at the path, or undefined if not found
     */
    public getNestedValue(obj: any, path: string): any {
        if (obj === null || obj === undefined) {
            return undefined;
        }

        const parts = path.split('.');
        let value = obj;

        for (const part of parts) {
            if (value === null || value === undefined || typeof value !== 'object') {
                return undefined;
            }
            value = value[part];
        }

        return value;
    }

    public getParts(str: string, simpleLogic: boolean = false): string[] {
        if (typeof str !== "string") {
            throw new Error(`getParts: ${str} is not a string`);
        }

        if (simpleLogic) {
            return str.split(",").map(s => s.trim());
        }

        // Split by commas, but not those inside brackets or parentheses
        const parts: string[] = [];
        let current = '';
        let bracketDepth = 0;
        let parenDepth = 0;

        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (char === '[') {
                bracketDepth++;
                current += char;
            } else if (char === ']') {
                bracketDepth--;
                current += char;
            } else if (char === '(') {
                parenDepth++;
                current += char;
            } else if (char === ')') {
                parenDepth--;
                current += char;
            } else if (char === ',' && bracketDepth === 0 && parenDepth === 0) {
                parts.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        // Add the last part
        if (current.trim()) {
            parts.push(current.trim());
        }

        return parts;
    }


    // POOL SYSTEM
    public poolDefinitionsMap = new Map<string, PoolDefinitionObject>();
    public poolEntriesMap = new Map<string, PoolEntryObject>();

    /**
     * Convert an array or Map to a Map. Arrays use 'id' or 'uid' as key.
     */
    private toMap(data: Map<string, any> | any[]): Map<string, any> {
        if (!Array.isArray(data)) {
            return data;
        }
        const map = new Map<string, any>();
        for (const item of data) {
            const key = item.id || item.uid;
            if (key) {
                map.set(key, item);
            } else {
                gameLogger.warn('toMap: item missing id/uid property, skipping');
            }
        }
        return map;
    }


    /**
     * Draw templates from a pool based on weighted random selection.
     * @param entry Pool entry ID or custom entry object
     * @param settings Optional draw settings (type, draws, unique)
     * @returns Array of template IDs drawn from the pool
     */
    public drawFromPool(entry: string | PoolEntryObject, settings?: PoolSettings): PoolDrawResult[] {
        // 1. Resolve pool entry
        const poolEntry = typeof entry === 'string'
            ? this.poolEntriesMap.get(entry)
            : entry;

        if (!poolEntry) {
            gameLogger.error(`Pool entry not found: ${entry}`);
            return [];
        }

        // 2. Get pool definition
        const poolId = poolEntry.pool;
        if (!poolId) {
            gameLogger.error(`Pool entry has no pool reference`);
            return [];
        }
        const poolDef = this.poolDefinitionsMap.get(poolId);
        if (!poolDef) {
            gameLogger.error(`Pool definition not found: ${poolId}`);
            return [];
        }

        // 3. Get source templates - use customData if provided, otherwise game.getData()
        const sourceId = poolDef.source;
        if (!sourceId && !settings?.customData) {
            gameLogger.error(`Pool definition has no source: ${poolId}`);
            return [];
        }

        // Get source data (pool sources are always entity collections which return Maps)
        let sourceMap: Map<string, any> | undefined;
        if (settings?.customData) {
            sourceMap = this.toMap(settings.customData);
        } else {
            sourceMap = this.game.getData(sourceId!) as Map<string, any>;
        }

        if (!sourceMap) {
            gameLogger.error(`Source data not found: ${sourceId}`);
            return [];
        }

        // 4. Settings with defaults
        const type = settings?.type || 'weight';
        const draws = settings?.draws || 1;
        const unique = settings?.unique || false;

        // 5. getData already returns a deep copy, so we can mutate directly
        const workingSourceMap = sourceMap;

        const stackMap = new Map<string, number>();

        // 6. Perform draws
        for (let d = 0; d < draws; d++) {
            if (type === 'weight') {
                // Weight mode: one entity wins, re-roll if it can't fulfill requirements
                const excludedEntities = new Set<PoolEntityGroup>();
                let drawComplete = false;

                while (!drawComplete && excludedEntities.size < (poolEntry.entities?.length || 0)) {
                    const availableEntities = poolEntry.entities?.filter(e => !excludedEntities.has(e));
                    const winner = this.weightedRandomSelect(availableEntities);

                    if (!winner) {
                        // No more entities to try
                        break;
                    }

                    const filtered = this.getFilteredTemplates(workingSourceMap, winner);
                    const count = this.resolveCount(winner);
                    const isUnique = winner.unique ?? unique;

                    // Check if winner can fulfill the requirement
                    if (isUnique && filtered.length < count) {
                        gameLogger.warn(`Pool entity "${winner.id || 'unnamed'}" cannot provide ${count} unique items (only ${filtered.length} available) - re-rolling`);
                        excludedEntities.add(winner);
                        continue;
                    }

                    if (filtered.length === 0) {
                        gameLogger.warn(`Pool entity "${winner.id || 'unnamed'}" has no matching items - re-rolling`);
                        excludedEntities.add(winner);
                        continue;
                    }

                    // Draw templates
                    if (filtered.length === 1 && !isUnique) {
                        stackMap.set(filtered[0], (stackMap.get(filtered[0]) || 0) + count);
                    } else {
                        for (let i = 0; i < count && filtered.length > 0; i++) {
                            const idx = Math.floor(Math.random() * filtered.length);
                            const templateId = filtered[idx];
                            stackMap.set(templateId, (stackMap.get(templateId) || 0) + 1);

                            if (isUnique) {
                                workingSourceMap.delete(templateId);
                                filtered.splice(idx, 1);
                            }
                        }
                    }

                    drawComplete = true;
                }
            } else {
                // Chance mode: each entity independently wins or loses (no re-rolling)
                const winners = this.chanceSelect(poolEntry.entities);

                for (const winner of winners) {
                    const filtered = this.getFilteredTemplates(workingSourceMap, winner);
                    const count = this.resolveCount(winner);
                    const isUnique = winner.unique ?? unique;

                    if (isUnique && filtered.length < count) {
                        gameLogger.warn(`Pool entity "${winner.id || 'unnamed'}" cannot provide ${count} unique items (only ${filtered.length} available)`);
                    }

                    if (filtered.length === 1 && !isUnique) {
                        stackMap.set(filtered[0], (stackMap.get(filtered[0]) || 0) + count);
                    } else {
                        for (let i = 0; i < count && filtered.length > 0; i++) {
                            const idx = Math.floor(Math.random() * filtered.length);
                            const templateId = filtered[idx];
                            stackMap.set(templateId, (stackMap.get(templateId) || 0) + 1);

                            if (isUnique) {
                                workingSourceMap.delete(templateId);
                                filtered.splice(idx, 1);
                            }
                        }
                    }
                }
            }
        }

        return [...stackMap.entries()].map(([id, quantity]) => ({ id, quantity }));
    }

    /**
     * Select one entity based on weighted random selection.
     */
    private weightedRandomSelect(entities: PoolEntryObject['entities']): PoolEntityGroup | null {
        if (!entities || entities.length === 0) return null;

        const totalWeight = entities.reduce((sum, e) => sum + (e.weight || 1), 0);
        if (totalWeight <= 0) return null;

        let random = Math.random() * totalWeight;

        for (const entity of entities) {
            random -= entity.weight || 1;
            if (random <= 0) return entity;
        }

        return entities[entities.length - 1]; // Fallback
    }

    /**
     * Select 0+ entities based on chance (0-100%).
     */
    private chanceSelect(entities: PoolEntryObject['entities']): PoolEntityGroup[] {
        if (!entities) return [];
        const winners: PoolEntityGroup[] = [];

        for (const entity of entities) {
            // Use 'chance' field (0-100), default to 50%
            const chancePercent = entity.chance ?? 50;
            if (Math.random() * 100 < chancePercent) {
                winners.push(entity);
            }
        }

        return winners;
    }

    /**
     * Resolve count with optional delta randomization.
     * delta > 0: count ± delta (uniform random).
     */
    private resolveCount(entity: PoolEntityGroup): number {
        const base = entity.count || 1;
        const delta = entity.delta || 0;
        if (delta <= 0) return base;
        return base + Math.floor(Math.random() * (2 * delta + 1)) - delta;
    }

    /**
     * Get templates matching an entity's filters.
     */
    private getFilteredTemplates(
        sourceMap: Map<string, any>,
        entity: PoolEntityGroup
    ): string[] {
        const result: string[] = [];

        // Fast path: direct Map lookup when filtering by id (ids are unique)
        if (entity.filters_include && 'id' in entity.filters_include) {
            const targetId = entity.filters_include.id as string;
            const template = sourceMap.get(targetId);
            if (!template) return result;

            // Check remaining include filters (excluding 'id')
            const { id: _id, ...restInclude } = entity.filters_include;
            if (Object.keys(restInclude).length > 0 && !this.matchesFilter(template, restInclude, false)) {
                return result;
            }
            if (!this.matchesFilter(template, entity.filters_exclude, true)) {
                return result;
            }
            result.push(targetId);
            return result;
        }

        for (const [id, template] of sourceMap) {
            // Check include filters (must match all)
            if (!this.matchesFilter(template, entity.filters_include, false)) {
                continue;
            }
            // Check exclude filters (must not match any)
            if (!this.matchesFilter(template, entity.filters_exclude, true)) {
                continue;
            }
            result.push(id);
        }

        return result;
    }

    /**
     * Check if a template matches include/exclude filters.
     * Filter matching logic:
     * - ['a','b'] (array): OR logic - any overlap matches
     * - { $all: ['a','b'] }: AND logic - all values must be present
     * - { min, max }: Range filter for numeric values
     * - boolean: Direct equality check
     * - string: Direct equality check
     */
    private matchesFilter(
        template: any,
        filters: Record<string, any> | undefined,
        isExclude: boolean
    ): boolean {
        if (!filters) return true;

        for (const fieldPath in filters) {
            const filterValue = filters[fieldPath];
            const templateValue = this.getNestedValue(template, fieldPath);

            // Handle range filters (min/max)
            if (typeof filterValue === 'object' && filterValue !== null && ('min' in filterValue || 'max' in filterValue) && !('$all' in filterValue)) {
                const numValue = Number(templateValue);
                // Check if value is within range [min, max]
                const inRange = (filterValue.min === undefined || numValue >= filterValue.min) &&
                    (filterValue.max === undefined || numValue <= filterValue.max);

                if (isExclude && inRange) return false;  // Exclude items IN the range
                if (!isExclude && !inRange) return false; // Include only items IN the range
            }
            // Handle $all filter (AND logic) - { $all: ['a', 'b'] }
            else if (typeof filterValue === 'object' && filterValue !== null && '$all' in filterValue) {
                const requiredValues = filterValue.$all as any[];
                if (requiredValues.length === 0) continue;

                const templateArr = Array.isArray(templateValue) ? templateValue : [templateValue];
                const hasAll = requiredValues.every(v => templateArr.includes(v));

                if (isExclude && hasAll) return false;
                if (!isExclude && !hasAll) return false;
            }
            // Handle array filters (OR logic) - ['a', 'b']
            else if (Array.isArray(filterValue)) {
                if (filterValue.length === 0) continue;

                // Normalize template value to array (handles chooseOne → string case)
                const templateArr = Array.isArray(templateValue) ? templateValue : [templateValue];
                const hasAny = filterValue.some(v => templateArr.includes(v));

                if (isExclude && hasAny) return false;
                if (!isExclude && !hasAny) return false;
            }
            // Handle boolean
            else if (typeof filterValue === 'boolean') {
                if (isExclude && templateValue === filterValue) return false;
                if (!isExclude && templateValue !== filterValue) return false;
            }
            // Handle single value match (string)
            else {
                if (isExclude && templateValue === filterValue) return false;
                if (!isExclude && templateValue !== filterValue) return false;
            }
        }

        return true;
    }


    /**
     * Convert a Record<string, T> to an array of objects with id and value fields.
     * Useful for preparing data for drawFromCollection.
     * @param data Record to convert (e.g., { goblins: 50, orcs: 30 })
     * @param valueField Name for the value field (e.g., 'weight', 'amount', 'chance')
     * @returns Array of objects with id and value (e.g., [{ id: 'goblins', weight: 50 }, ...])
     */
    public toEntries<T>(data: Record<string, T>, valueField: string): { id: string;[key: string]: T | string }[] {
        return Object.entries(data).map(([id, value]) => ({ id, [valueField]: value }));
    }

    /**
     * Draw items from a collection based on random selection.
     * @param data Collection to draw from (Array, Map, or Record)
     * @param settings Draw settings (type, count, unique)
     * @returns Array of drawn items
     */
    public drawFromCollection<T>(
        data: T[] | Map<string, T> | Record<string, T>,
        settings?: CollectionSettings
    ): T[] {
        const type = settings?.type || 'uniform';
        const count = settings?.count || 1;
        const unique = settings?.unique ?? false;

        // Convert input to array of [key, value] pairs for uniform processing
        let entries: [string, T][];

        if (Array.isArray(data)) {
            entries = data.map((item, idx) => [(item as any).id || (item as any).uid || String(idx), item]);
        } else if (data instanceof Map) {
            entries = Array.from(data.entries());
        } else {
            entries = Object.entries(data) as [string, T][];
        }

        if (entries.length === 0) {
            gameLogger.warn('drawFromCollection: empty collection provided');
            return [];
        }

        let resultEntries: [string, T][];

        if (type === 'weight') {
            resultEntries = this.drawWeighted(entries, count, unique);
        } else if (type === 'chance') {
            resultEntries = this.drawChance(entries, count);
        } else {
            // uniform
            resultEntries = this.drawUniform(entries, count, unique);
        }

        // Always return array of values
        return resultEntries.map(([, value]) => value);
    }

    /**
     * Draw items using weighted random selection. Always returns exactly `count` items.
     */
    private drawWeighted(entries: [string, any][], count: number, unique: boolean): [string, any][] {
        const result: [string, any][] = [];
        const working = unique ? [...entries] : entries;

        if (unique && working.length < count) {
            gameLogger.warn(`drawFromCollection: requested ${count} unique items but only ${working.length} available`);
        }

        for (let i = 0; i < count; i++) {
            if (working.length === 0) break;

            const totalWeight = working.reduce((sum, [, item]) => sum + (item.weight ?? 1), 0);
            if (totalWeight <= 0) {
                gameLogger.warn('drawFromCollection: total weight is 0 or negative');
                break;
            }

            let random = Math.random() * totalWeight;
            let selectedIdx = working.length - 1; // fallback

            for (let j = 0; j < working.length; j++) {
                const weight = working[j][1].weight ?? 1;
                random -= weight;
                if (random <= 0) {
                    selectedIdx = j;
                    break;
                }
            }

            result.push(working[selectedIdx]);

            if (unique) {
                working.splice(selectedIdx, 1);
            }
        }

        return result;
    }

    /**
     * Draw items uniformly at random. Returns exactly `count` items.
     */
    private drawUniform(entries: [string, any][], count: number, unique: boolean): [string, any][] {
        const result: [string, any][] = [];
        const working = unique ? [...entries] : entries;

        if (unique && working.length < count) {
            gameLogger.warn(`drawFromCollection: requested ${count} unique items but only ${working.length} available`);
        }

        for (let i = 0; i < count; i++) {
            if (working.length === 0) break;

            const idx = Math.floor(Math.random() * working.length);
            result.push(working[idx]);

            if (unique) {
                working.splice(idx, 1);
            }
        }

        return result;
    }

    /**
     * Build auto-generated description lines for an ability's effects.
     * Uses ingame_description templates from ability definitions.
     * [v] = aspect's own value, [other_id] = sibling aspect value.
     */
    public buildAbilityEffectsDescription(
        abilityIdOrData: string | { meta?: Record<string, any>, effects?: Record<string, Record<string, any>> },
        characterId?: string, isFlat?: boolean,
        baseData?: { meta?: Record<string, any>, effects?: Record<string, Record<string, any>> }
    ): { name?: string, lines: string[] }[] | string[] {
        const definitionsMap = this.game.characterSystem.abilityDefinitionsMap;
        if (!definitionsMap) return [];

        const abilityData = typeof abilityIdOrData === 'string'
            ? this.resolveAbilityData(abilityIdOrData, characterId)
            : abilityIdOrData;
        if (!abilityData?.effects) return [];

        const character = (characterId ? this.game.getCharacter(characterId) : undefined) ?? undefined;

        const result: { name?: string, lines: string[] }[] = [];
        for (const effectId in abilityData.effects) {
            const aspects = abilityData.effects[effectId];
            const fallback = baseData?.effects?.[effectId];
            const lines = this.buildDescriptionLines(aspects, definitionsMap, undefined, fallback, character, abilityData);
            if (lines.length > 0) {
                result.push({ name: aspects.__name || fallback?.__name, lines });
            }
        }

        return isFlat ? result.flatMap(r => r.lines) : result;
    }

    public buildAbilityMetaDescription(
        abilityIdOrData: string | { meta?: Record<string, any>, effects?: Record<string, Record<string, any>> },
        characterId?: string,
        baseData?: { meta?: Record<string, any>, effects?: Record<string, Record<string, any>> }
    ): string[] {
        const definitionsMap = this.game.characterSystem.abilityDefinitionsMap;
        if (!definitionsMap) return [];

        const abilityData = typeof abilityIdOrData === 'string'
            ? this.resolveAbilityData(abilityIdOrData, characterId)
            : abilityIdOrData;
        if (!abilityData?.meta) return [];

        const character = (characterId ? this.game.getCharacter(characterId) : undefined) ?? undefined;
        return this.buildDescriptionLines(abilityData.meta, definitionsMap, 'meta', baseData?.meta, character, abilityData);
    }

    /**
     * Resolve ability data from a character (merged with modifiers) or fall back to base template.
     */
    private resolveAbilityData(abilityId: string, characterId?: string): { meta: Record<string, any>; effects: Record<string, Record<string, any>> } | null {
        if (characterId) {
            const character = this.game.getCharacter(characterId);
            const ability = character?.getAbility(abilityId);
            if (ability) return ability;
        }

        const template = this.game.characterSystem.abilityTemplatesMap?.get(abilityId);
        if (!template) return null;

        const data: { meta: Record<string, any>; effects: Record<string, Record<string, any>> } = {
            meta: template.meta || {},
            effects: {}
        };
        if (Array.isArray(template.effects)) {
            for (const effect of template.effects) {
                if (effect.id) {
                    const normalized: any = { ...(effect.aspects || {}) };
                    if (effect.name) normalized.__name = effect.name;
                    data.effects[effect.id] = normalized;
                }
            }
        } else if (template.effects) {
            data.effects = template.effects as any;
        }
        return data;
    }

    /**
     * Build description lines from a flat key-value object using ability definitions' ingame_description.
     */
    private buildDescriptionLines(fields: Record<string, any>, definitionsMap: Map<string, any>, roleFilter?: string, fallbackFields?: Record<string, any>, character?: Character, ability?: { meta?: Record<string, any>, effects?: Record<string, any> }): string[] {
        const lines: string[] = [];

        // Sort fields by definition order (lower = first, default 0)
        const fieldIds = Object.keys(fields)
            .filter(id => !id.startsWith('__'))
            .sort((a, b) => {
                const orderA = definitionsMap.get(a)?.order ?? 0;
                const orderB = definitionsMap.get(b)?.order ?? 0;
                return orderA - orderB;
            });

        for (const fieldId of fieldIds) {
            const definition = definitionsMap.get(fieldId);
            if (!definition || !definition.ingame_description) continue;
            if (definition.ingame_hide) continue;
            if (roleFilter && definition.role !== roleFilter) continue;

            let line = definition.ingame_description as string;
            line = line.replace(/\[v(?::(id|status|character))?\]/g, (_m, mode) => {
                if (mode === 'id') return String(fields[fieldId] ?? '');
                if (mode === 'status') return this.resolveStatusLinks(fields[fieldId]);
                if (mode === 'character') return this.resolveCharacterName(fields[fieldId]);
                const renderer = this.aspectRendererRegistry.get(fieldId);
                if (renderer) return renderer({ value: fields[fieldId], aspects: fields, character, ability });
                return `<b>${this.resolveAspectValue(fields[fieldId], definition)}</b>`;
            });
            line = line.replace(/(?<!\[)\[([a-zA-Z0-9_]+)(?::(id|status|character))?\](?!\])/g, (match: string, siblingId: string, mode?: string) => {
                if (siblingId === 'v') return match;
                const value = fields[siblingId] ?? fallbackFields?.[siblingId];
                if (value === undefined) return '';
                if (mode === 'id') return String(value);
                if (mode === 'status') return this.resolveStatusLinks(value);
                if (mode === 'character') return this.resolveCharacterName(value);
                const sibDef = definitionsMap.get(siblingId);
                const sibRenderer = this.aspectRendererRegistry.get(siblingId);
                // If sibling has its own ingame_description, render that template instead of raw value
                if (sibDef?.ingame_description) {
                    return (sibDef.ingame_description as string).replace(/\[v\]/g, () => {
                        if (sibRenderer) return sibRenderer({ value, aspects: fields, character, ability });
                        return `<b>${this.resolveAspectValue(value, sibDef)}</b>`;
                    });
                }
                if (sibRenderer) return sibRenderer({ value, aspects: fields, character, ability });
                return `<b>${this.resolveAspectValue(value, sibDef)}</b>`;
            });
            // Clean up extra whitespace from removed siblings
            line = line.replace(/\s{2,}/g, ' ').trim();
            line = this.resolveString(line, true).output;
            lines.push(line);
        }
        return lines;
    }

    /**
     * Render one or more status ids as clickable popup links.
     * For each id, looks up the status definition's display name and emits
     * `<span class='lore-link' data-lore-id='ID' data-lore-kind='status' tabindex='0'>NAME</span>`.
     * Arrays render as comma-joined links. Unknown ids fall back to raw id + warning.
     */
    private resolveStatusLinks(value: any): string {
        if (value === undefined || value === null) return '';
        const statuses = this.game.getData('character_statuses', true);
        const renderOne = (id: string): string => {
            const def = statuses?.get(id);
            if (!def) {
                gameLogger.warn(`[v:status] unknown character_statuses id "${id}"`);
                return id;
            }
            const name = def.name || id;
            return `<span class='lore-link' data-lore-id='${id}' data-lore-kind='status' tabindex='0'>${name}</span>`;
        };
        if (Array.isArray(value)) return value.map((id: any) => renderOne(String(id))).join(', ');
        return renderOne(String(value));
    }

    /**
     * Resolve one or more character-template ids to their display name (`traits.name`, then
     * `name`, then the raw id), as bold text. Arrays render comma-joined.
     */
    private resolveCharacterName(value: any): string {
        if (value === undefined || value === null) return '';
        const chars = this.game.getData('character_templates', true);
        const one = (id: string): string => {
            const def = chars?.get(id);
            const name = (def && (this.getNestedValue(def, 'traits.name') || def.name)) || id;
            return `<b>${name}</b>`;
        };
        if (Array.isArray(value)) return value.map((id: any) => one(String(id))).join(', ');
        return one(String(value));
    }

    /**
     * Resolve an aspect value to a display string.
     * For fromFile definitions, looks up the referenced item's display name.
     * If a narrative record exists with the same id, emits `[[id>name]]` so the
     * downstream resolveString pass renders it as a lore link.
     */
    private resolveAspectValue(value: any, definition?: any): string {
        if (value === undefined || value === null) return '';

        // Delta-overlaid numeric values arrive as { _base, _merged } from callers like
        // AbilityCard's modifier-merge pipeline. Render them as `base➜merged` for the
        // default (no-renderer) fallback path; aspect renderers handle these themselves.
        if (typeof value === 'object' && value !== null && '_base' in value && '_merged' in value) {
            return `${value._base}➜<span class="delta-value">${value._merged}</span>`;
        }

        if (definition?.fromFile) {
            const sourceData = this.game.getData(definition.fromFile, true);
            if (sourceData) {
                const refPath = definition.ingame_description_ref || 'name';
                const narrative = this.game.narrativeSystem;
                const linkify = (id: string, name: string): string => {
                    return narrative?.getRecord(id) ? `[[${id}>${name}]]` : name;
                };

                if (Array.isArray(value)) {
                    return value.map((id: string) => {
                        const item = sourceData.get(id);
                        if (!item) return id;
                        const name = this.getNestedValue(item, refPath) || id;
                        return linkify(id, name);
                    }).join(', ');
                } else {
                    const id = String(value);
                    const item = sourceData.get(id);
                    if (item) {
                        const name = this.getNestedValue(item, refPath) || id;
                        return linkify(id, name);
                    }
                }
            }
        }

        // Locale lookup for non-fromFile values
        if (Array.isArray(value)) {
            return value.map((v: any) => {
                const localeEntry = this.game.coreSystem.localeMap?.get(String(v));
                return localeEntry?.val || String(v);
            }).join(', ');
        }

        const localeEntry = this.game.coreSystem.localeMap?.get(String(value));
        return localeEntry?.val || String(value);
    }

    /**
     * Get a localized string by ID with placeholder substitution.
     * Looks up locale entry and replaces |placeholder| tokens with provided params.
     */
    public getLine(lineId: string, params: Record<string, any> = {}): string {
        const localeEntry = this.game.coreSystem.localeMap?.get(lineId);
        let string = localeEntry?.val || `[${lineId}]`;
        for (const key in params) {
            string = string.replaceAll(`|${key}|`, String(params[key]));
        }
        return string;
    }

    /**
     * Draw items based on chance field. Each item is rolled `count` times independently.
     * May return 0 or more than `count` items.
     */
    private drawChance(entries: [string, any][], count: number): [string, any][] {
        const result: [string, any][] = [];

        for (const entry of entries) {
            const chancePercent = entry[1].chance ?? 50;

            for (let i = 0; i < count; i++) {
                if (Math.random() * 100 < chancePercent) {
                    result.push(entry);
                }
            }
        }

        return result;
    }

}

export type PoolDrawResult = {
    id: string;
    quantity: number;
}

export type PoolSettings = {
    type?: 'weight' | 'chance';
    draws?: number; // how many times to draw from the pool
    unique?: boolean; // if true, the drawn items will be removed from the pool when drawn
    customData?: Map<string, any> | any[]; // use runtime data instead of pool's source (array auto-converts using 'id' as key)
}

export type PoolEntityGroup = {
    id?: string;
    weight?: number;
    chance?: number;
    count?: number;
    delta?: number;
    unique?: boolean;
    filters_include?: Record<string, any>;
    filters_exclude?: Record<string, any>;
}

export type CollectionSettings = {
    type?: 'uniform' | 'weight' | 'chance';
    count?: number; // how many times to draw from the collection
    unique?: boolean; // if true, the drawn items will be removed from the collection when drawn
}



