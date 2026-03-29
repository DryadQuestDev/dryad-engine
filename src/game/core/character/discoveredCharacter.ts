export interface DiscoveredSpineConfig {
    view: string;
    atlas: string;
    skeleton: string;
    animations: string[];
    skins: string[];
}

export class DiscoveredCharacter {
    public attributes: Map<string, Set<string>> = new Map();
    public skinLayers: Set<string> = new Set();
    public skinLayerStyles: Map<string, Set<string>> = new Map();
    public spineConfigs: DiscoveredSpineConfig[] = [];
    public views: Set<string> = new Set();

    constructor() {
        this.attributes = new Map();
        this.skinLayers = new Set();
        this.skinLayerStyles = new Map();
        this.spineConfigs = [];
        this.views = new Set();
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

        // Reconstruct views: Set<string>
        if (Array.isArray(data.views)) {
            this.views = new Set(data.views);
        } else {
            this.views.clear();
        }

        // Reconstruct spineConfigs: array of plain objects
        this.spineConfigs = [];
        if (Array.isArray(data.spineConfigs)) {
            for (const cfg of data.spineConfigs) {
                if (cfg && typeof cfg === 'object' && cfg.skeleton) {
                    this.spineConfigs.push({
                        view: cfg.view ?? '',
                        atlas: cfg.atlas ?? '',
                        skeleton: cfg.skeleton,
                        animations: Array.isArray(cfg.animations) ? cfg.animations : [],
                        skins: Array.isArray(cfg.skins) ? cfg.skins : []
                    });
                }
            }
        }
    }
}