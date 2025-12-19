import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Game } from '../game/game';

// Define the structure of saveMeta if not directly importing Game
// For clarity, let's define it here, mirroring Game.ts's saveMeta
export interface SaveMetaData {
  saveDate: number;
  playTime: number;
  engineVersion: string;
  gameVersion: string;
  mods: string[];
  isDevMode?: boolean; // Flag to indicate if save was created in dev mode
  hidden?: boolean; // Flag to hide save from the list (e.g., replay mode saves)
}

// Special dev mode auto-save slot
export const DEV_AUTO_SAVE_SLOT = '__dev_auto_save__';

export interface SaveDB extends DBSchema {
  saves: {
    key: [gameId: string, slot: string];   // ← compound key
    value: {
      gameId: string;
      slot: string;
      saveMeta: SaveMetaData;
    } & any;
    /** optional index so we can "get all slots for gameId" fast */
    indexes: { by_game: string };
  };
}

// ----------  module-level singleton  ----------
const dbPromise: Promise<IDBPDatabase<SaveDB>> =
  openDB<SaveDB>('dryad_saves', 1, {
    upgrade(db) {
      // runs only the very first time (or when you bump the version)
      const store = db.createObjectStore('saves', { keyPath: ['gameId', 'slot'] });
      store.createIndex('by_game', 'gameId');
    },
  });

export class IndexedDbSaveService {

  private db = dbPromise;

  constructor() { }

  async save(gameId: string, slot: string, gameData: any): Promise<void> {
    const db = await this.db;
    const valueToStore = Object.assign({}, gameData, { gameId, slot });

    let clonedValueForStorage;
    try {
      console.log("Attempting deep clone before IndexedDB put...");
      clonedValueForStorage = JSON.parse(JSON.stringify(valueToStore));
      console.log("Deep clone successful.");
    } catch (cloneError) {
      console.error("Deep clone FAILED! The object is not JSON-compatible:", cloneError);
      console.error("Object being cloned:", valueToStore);
      throw new Error("Data is not clonable for IndexedDB storage.");
    }

    await db.put('saves', clonedValueForStorage);
  }

  async load(gameId: string, slot: string): Promise<any | undefined> {
    const db = await this.db;
    console.log('[IndexedDbSaveService] load called:', { gameId, slot });
    const storedValue = await db.get('saves', [gameId, slot]);
    console.log('[IndexedDbSaveService] load result:', storedValue ? 'Found' : 'Not found', storedValue ? { isDevMode: storedValue.saveMeta?.isDevMode } : null);
    if (storedValue) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { gameId: storedGameId, slot: storedSlot, saveMeta, ...gameData } = storedValue;
      // gameData will not contain saveMeta if it was destructured,
      // but it will be part of the root storedValue that 'save(this)' creates.
      // The important part is that the entire object including saveMeta is returned by loadGame in Global.ts.
      return storedValue; // Return the whole object as gameData now includes saveMeta
    }
    return undefined;
  }

  async listSlots(gameId: string, includeDevSaves: boolean = false): Promise<{ slot: string; saveMeta?: SaveMetaData }[]> {
    const db = await this.db;
    let allSavesForGame = await db.getAllFromIndex('saves', 'by_game', gameId);

    // Filter out hidden saves (e.g., replay mode saves)
    allSavesForGame = allSavesForGame.filter(save => !save.saveMeta?.hidden);

    // Filter out dev saves if not in dev mode
    if (!includeDevSaves) {
      allSavesForGame = allSavesForGame.filter(save => !save.saveMeta?.isDevMode);
    }

    // Sort the saves by saveDate in descending order (newest first)
    allSavesForGame.sort((a, b) => {
      const dateA = a.saveMeta?.saveDate;
      const dateB = b.saveMeta?.saveDate;
      return dateB - dateA; // For descending order
    });

    return allSavesForGame.map(save => ({
      slot: save.slot as string,
      saveMeta: save.saveMeta
    }));
  }

  async delete(gameId: string, slot: string): Promise<void> {
    const db = await this.db;
    await db.delete('saves', [gameId, slot]);
  }
} 