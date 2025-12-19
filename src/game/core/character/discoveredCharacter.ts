export class DiscoveredCharacter {
    public attributes: Map<string, Set<string>> = new Map();
    public skinLayers: Set<string> = new Set();
    public skinLayerStyles: Map<string, Set<string>> = new Map();

    constructor() {
        this.attributes = new Map();
        this.skinLayers = new Set();
        this.skinLayerStyles = new Map();
    }

    public loadState(data: any): void {
        // Reconstruct attributes: Map<string, Set<string>>
        this.attributes.clear();
        if (data.attributes && typeof data.attributes === 'object') {
            for (const [key, value] of Object.entries(data.attributes)) {
                if (Array.isArray(value)) {
                    this.attributes.set(key, new Set(value));
                }
            }
        }

        // Reconstruct skinLayers: Set<string>
        if (Array.isArray(data.skinLayers)) {
            this.skinLayers = new Set(data.skinLayers);
        } else {
            this.skinLayers.clear();
        }

        // Reconstruct skinLayerStyles: Map<string, Set<string>>
        this.skinLayerStyles.clear();
        if (data.skinLayerStyles && typeof data.skinLayerStyles === 'object') {
            for (const [key, value] of Object.entries(data.skinLayerStyles)) {
                if (Array.isArray(value)) {
                    // value is an array of strings
                    this.skinLayerStyles.set(key, new Set(value as string[]));
                }
            }
        }
    }
}