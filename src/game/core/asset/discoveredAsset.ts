export class DiscoveredAsset {
    public animations: Set<string> = new Set();
    public skins: Set<string> = new Set();

    constructor() {
        this.animations = new Set();
        this.skins = new Set();
    }
    /*
        public loadState(data: any): void {
            // Reconstruct animations: Set<string>
            if (Array.isArray(data.animations)) {
                this.animations = new Set(data.animations);
            } else {
                this.animations.clear();
            }
    
            // Reconstruct skins: Set<string>
            if (Array.isArray(data.skins)) {
                this.skins = new Set(data.skins);
            } else {
                this.skins.clear();
            }
        }
            */
}

