import { PropertyObject } from '../schemas/propertySchema';
import { gameLogger } from './utils/logger';
import { Game } from './game';

// Interface for the mutable state
interface StatState {
    currentValue: number | string | boolean | any[] | Record<string, any> | undefined;
    minValue?: number;
    maxValue?: number;
}

// TODO rename to Stat
export class Property {
    // --- Configuration Property (mostly readonly) ---
    public id: string = '';
    public name?: string;
    public type: PropertyObject['type'] = 'number';
    public precision?: number;
    public isNegative?: boolean;
    public defaultValue?: number | string | boolean | any[] | Record<string, any>;
    public canOverflow?: boolean;

    // --- Mutable State Object ---
    public state: StatState = {
        currentValue: undefined,
        minValue: undefined,
        maxValue: undefined
    };

    constructor() {
        // Empty constructor - all initialization happens in init()
    }

    /**
     * Initialize the Property with configuration data.
     * Called when creating a new Property instance.
     */
    public init(obj: PropertyObject): void {
        // Assign configuration properties
        this.id = obj.id;
        this.name = obj.name;
        this.type = obj.type || 'number';
        this.precision = obj.precision;
        this.isNegative = obj.is_negative;
        this.canOverflow = obj.can_overflow;

        // Initialize the state object
        this.state = {
            currentValue: undefined, // Will be set below
            minValue: obj.min_value,
            maxValue: obj.max_value
        };

        // Get type-specific default value and calculate initial value
        let initialValue: number | string | boolean | any[] | Record<string, any> | undefined;
        switch (this.type) {
            case 'number':
                this.defaultValue = obj.default_value_number ?? 0;
                initialValue = this.defaultValue;
                break;
            case 'boolean':
                this.defaultValue = obj.default_value_boolean ?? false;
                initialValue = this.defaultValue;
                break;
            case 'string':
                this.defaultValue = obj.default_value_string ?? '';
                initialValue = this.defaultValue;
                break;
            case 'array':
                this.defaultValue = obj.default_value_array ?? [];
                initialValue = [...(this.defaultValue as any[])];
                break;
            case 'object':
                try {
                    const fixedJson = obj.default_value_object
                        ? Game.getInstance().logicSystem.fixJson(obj.default_value_object)
                        : '{}';
                    this.defaultValue = JSON.parse(fixedJson);
                } catch {
                    gameLogger.warn(`Invalid JSON in default_value_object for property '${this.id}', using empty object`);
                    this.defaultValue = {};
                }
                initialValue = { ...this.defaultValue as Record<string, any> };
                break;
            default:
                initialValue = undefined;
        }
        // Use the setter to assign initial value, applying rules
        this.currentValue = initialValue;
    }

    // --- Native Getters/Setters (operating on this.state) ---

    public get currentValue(): number | string | boolean | any[] | Record<string, any> | undefined {
        return this.state.currentValue;
    }

    public set currentValue(value: any) {
        if (this.type === 'number' && typeof value === 'number') {
            let processedValue = this.clampValue(value);
            processedValue = this.applyPrecision(processedValue);
            this.state.currentValue = processedValue;
        } else if (this.type === 'boolean' && typeof value === 'boolean') {
            this.state.currentValue = value;
        } else if (this.type === 'string' && typeof value === 'string') {
            this.state.currentValue = value;
        } else if (this.type === 'array' && Array.isArray(value)) {
            this.state.currentValue = [...value]; // Store a copy
        } else if (this.type === 'object' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
            this.state.currentValue = { ...value }; // Store a copy
        } else {
            if (value !== undefined) {
                gameLogger.error(`Cannot set value of property '${this.id}': Expected type '${this.type}' but received:`, value);
            }
            this.state.currentValue = undefined;
        }
    }

    public getMinValue(): number | undefined {
        if (this.type === 'number') {
            return this.state.minValue;
        }
        gameLogger.error(`Cannot get minValue: Stat ${this.id} is not of type number.`);
        return undefined;
    }

    public setMinValue(value: number | undefined): void {
        if (this.type !== 'number') {
            gameLogger.error(`Cannot set minValue: Stat ${this.id} is not of type number.`);
            return;
        }
        this.state.minValue = value;
        // Re-clamp current value if it's a number
        if (typeof this.state.currentValue === 'number') {
            // Use the setter to trigger clamping/precision
            this.currentValue = this.state.currentValue; // Read from state, set via setter
        }
    }

    public getMaxValue(): number | undefined {
        if (this.type === 'number') {
            return this.state.maxValue;
        }
        gameLogger.error(`Cannot get maxValue: Stat ${this.id} is not of type number.`);
        return undefined;
    }

    public setMaxValue(value: number | undefined): void {
        if (this.type !== 'number') {
            gameLogger.error(`Cannot set maxValue: Stat ${this.id} is not of type number.`);
            return;
        }
        this.state.maxValue = value;
        // Re-clamp current value if it's a number
        if (typeof this.state.currentValue === 'number') {
            // Use the setter to trigger clamping/precision
            this.currentValue = this.state.currentValue; // Read from state, set via setter
        }
    }

    public getRatio(): number {
        if (this.type !== 'number') {
            gameLogger.error(`Cannot calculate ratio: Stat ${this.id} is not of type number.`);
            return 0;
        }

        const currentVal = this.state.currentValue; // Read from state
        if (typeof currentVal !== 'number') {
            gameLogger.error(`Cannot calculate ratio: Current value of stat ${this.id} is not a number.`);
            return 0;
        }

        const maxVal = this.state.maxValue; // Read from state

        if (maxVal === undefined || maxVal === null || maxVal === 0) {
            return 1; // Consistent with previous logic
        }

        return currentVal / maxVal;
    }

    // --- Helper Methods (operating on config + this.state) ---
    private applyPrecision(value: number): number {
        const precision = this.precision; // Read config from instance
        if (precision === undefined || precision === null || this.type !== 'number') {
            return value;
        }
        const factor = Math.pow(10, precision);
        return Math.round(value * factor) / factor;
    }

    private clampValue(value: number): number {
        const minVal = this.state.minValue; // Read from state
        const maxVal = this.state.maxValue; // Read from state
        const canOvflw = this.canOverflow;  // Read config from instance
        let clampedValue = value;

        if (!canOvflw) {
            if (minVal !== undefined && clampedValue < minVal) {
                clampedValue = minVal;
            }
            if (maxVal !== undefined && clampedValue > maxVal) {
                clampedValue = maxVal;
            }
        }
        else if (minVal !== undefined && clampedValue < minVal) {
            clampedValue = minVal;
        }
        return clampedValue;
    }

    // --- Action Methods (operating via setters/getters which use this.state) ---

    public setCurrentValue(value: any): void {
        this.currentValue = value;
    }

    public getCurrentValue(): any {
        return this.currentValue;
    }

    public addCurrentValue(valueToAdd: number): void {
        const currentVal = this.currentValue; // Use getter
        if (this.type !== 'number' || typeof currentVal !== 'number') {
            gameLogger.error(`Cannot add value: Stat ${this.id} is not of type number or currentValue is not a number.`);
            return;
        }
        this.currentValue = currentVal + valueToAdd; // Use setter
    }

    public addMinValue(valueToAdd: number): void {
        if (this.type !== 'number') {
            gameLogger.error(`Cannot add minValue: Stat ${this.id} is not of type number.`);
            return;
        }
        const currentMin = this.getMinValue() ?? 0;
        this.setMinValue(currentMin + valueToAdd);
    }

    public addMaxValue(valueToAdd: number): void {
        if (this.type !== 'number') {
            gameLogger.error(`Cannot add maxValue: Stat ${this.id} is not of type number.`);
            return;
        }
        const currentMax = this.getMaxValue() ?? 0;
        this.setMaxValue(currentMax + valueToAdd);
    }

    // --- Boolean Specific Methods (operating via setters/getters) ---
    public switch(): void {
        const currentVal = this.currentValue; // Use getter
        if (this.type !== 'boolean' || typeof currentVal !== 'boolean') {
            gameLogger.error(`Cannot switch value: Stat ${this.id} is not of type boolean.`);
            return;
        }
        this.currentValue = !currentVal; // Use setter
    }
}