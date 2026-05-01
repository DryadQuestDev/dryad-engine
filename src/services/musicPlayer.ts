import { gameLogger } from '../game/utils/logger';

interface PlayOptions {
  fade?: number;
  volume?: number;
  force?: boolean;
}

interface StopOptions {
  fade?: number;
}

export class MusicPlayer {
  private static _instance: MusicPlayer | null = null;
  static getInstance(): MusicPlayer {
    if (!this._instance) this._instance = new MusicPlayer();
    return this._instance;
  }

  private _currentId: string | null = null;
  private playlist: string[] = [];
  private trackIndex = 0;
  private player: HTMLAudioElement | null = null;
  private fadeInterval: number | null = null;
  private targetVolume = 1;
  private interactionHandler: (() => void) | null = null;

  get currentId(): string | null {
    return this._currentId;
  }

  play(id: string, files: string[], opts: PlayOptions = {}): void {
    if (!id || files.length === 0) return;
    if (!opts.force && this._currentId === id && this.player) return;

    const fade = opts.fade ?? 1.0;
    if (opts.volume !== undefined) this.targetVolume = opts.volume;
    this._currentId = id;

    if (this.player && fade > 0) {
      this.fadeOut(fade, () => this.startPlaylist(files));
    } else {
      this.disposePlayer();
      this.startPlaylist(files);
    }
  }

  stop(opts: StopOptions = {}): void {
    const fade = opts.fade ?? 1.0;
    this._currentId = null;
    if (!this.player) return;
    if (fade > 0) {
      this.fadeOut(fade, () => { });
    } else {
      this.disposePlayer();
    }
  }

  setVolume(volume: number): void {
    this.targetVolume = volume;
    if (this.player && this.fadeInterval === null) {
      this.player.volume = volume;
    }
  }

  private fadeOut(durationSec: number, onComplete: () => void): void {
    if (this.fadeInterval !== null) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
    if (!this.player) {
      onComplete();
      return;
    }
    const player = this.player;
    const startVolume = player.volume;
    const steps = 10;
    const stepMs = (durationSec * 1000) / steps;
    let step = 0;
    this.fadeInterval = window.setInterval(() => {
      step++;
      if (step >= steps) {
        player.pause();
        player.currentTime = 0;
        player.remove();
        if (this.player === player) this.player = null;
        if (this.fadeInterval !== null) {
          clearInterval(this.fadeInterval);
          this.fadeInterval = null;
        }
        onComplete();
      } else {
        player.volume = Math.max(0, startVolume - startVolume * (step / steps));
      }
    }, stepMs);
  }

  private startPlaylist(files: string[]): void {
    this.playlist = shuffle([...files]);
    this.trackIndex = 0;
    this.player = new Audio();
    this.player.addEventListener('ended', () => {
      this.trackIndex = (this.trackIndex + 1) % this.playlist.length;
      this.playCurrentTrack();
    });
    this.playCurrentTrack();
  }

  private playCurrentTrack(): void {
    if (!this.player || this.playlist.length === 0) return;
    const player = this.player;
    player.src = this.playlist[this.trackIndex];
    player.volume = this.targetVolume;
    player.currentTime = 0;
    gameLogger.info(`Playing music: ${this.playlist[this.trackIndex]}`);
    player.play().catch((error: any) => {
      if (error?.name === 'NotAllowedError' || error?.name === 'DOMException') {
        gameLogger.warn('Music play prevented - waiting for user interaction');
        this.waitForInteraction();
      } else {
        gameLogger.error('Unexpected music playback error:', error);
      }
    });
  }

  private waitForInteraction(): void {
    if (this.interactionHandler) return;
    const handler = () => {
      gameLogger.info('User interaction detected - resuming music');
      document.removeEventListener('click', handler);
      document.removeEventListener('keydown', handler);
      document.removeEventListener('touchstart', handler);
      this.interactionHandler = null;
      this.playCurrentTrack();
    };
    this.interactionHandler = handler;
    document.addEventListener('click', handler);
    document.addEventListener('keydown', handler);
    document.addEventListener('touchstart', handler);
  }

  private disposePlayer(): void {
    if (this.player) {
      this.player.pause();
      this.player.currentTime = 0;
      this.player.remove();
      this.player = null;
    }
  }
}

function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
