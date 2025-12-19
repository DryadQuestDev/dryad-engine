// Utility to track and manage game play order in localStorage

const STORAGE_KEY = 'game-play-order';

export interface GamePlayRecord {
  gameId: string;
  lastPlayed: number; // timestamp
}

/**
 * Update the play order when a game is played
 */
export function updateGamePlayOrder(gameId: string): void {
  const records = getGamePlayRecords();
  const existingIndex = records.findIndex(r => r.gameId === gameId);

  const newRecord: GamePlayRecord = {
    gameId,
    lastPlayed: Date.now()
  };

  if (existingIndex >= 0) {
    // Update existing record
    records[existingIndex] = newRecord;
  } else {
    // Add new record
    records.push(newRecord);
  }

  saveGamePlayRecords(records);
}

/**
 * Get all game play records from localStorage
 */
export function getGamePlayRecords(): GamePlayRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to load game play records:', error);
    return [];
  }
}

/**
 * Save game play records to localStorage
 */
function saveGamePlayRecords(records: GamePlayRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch (error) {
    console.error('Failed to save game play records:', error);
  }
}

/**
 * Sort games by last played date (played games first, then unplayed)
 */
export function sortGamesByPlayOrder<T extends { id?: string }>(games: T[]): T[] {
  const records = getGamePlayRecords();
  const recordMap = new Map(records.map(r => [r.gameId, r.lastPlayed]));

  return [...games].sort((a, b) => {
    const aPlayed = recordMap.get(a.id || '');
    const bPlayed = recordMap.get(b.id || '');

    // Both played: sort by most recent first
    if (aPlayed && bPlayed) {
      return bPlayed - aPlayed;
    }

    // Only a played: a comes first
    if (aPlayed) return -1;

    // Only b played: b comes first
    if (bPlayed) return 1;

    // Neither played: keep original order
    return 0;
  });
}
