import { gameLogger } from '../game/utils/logger';
import { rampVolume } from './audioFade';

interface PlayOptions {
  /** Seconds the outgoing track takes to fade out before this one starts. 0 cuts. */
  fadeOut?: number;
  /** Seconds this track takes to reach its gain. */
  fadeIn?: number;
  /** The player's music slider, 0–1. */
  volume?: number;
  /** The track's own gain, 0–1, multiplied onto the slider. */
  trackVolume?: number;
  /** Random file order (default) or the listed order. */
  shuffle?: boolean;
  force?: boolean;
}

interface StopOptions {
  fadeOut?: number;
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
  /** The running fade, if any. Only one ramp touches the player at a time. */
  private cancelRamp: (() => void) | null = null;
  private userVolume = 1;
  private trackVolume = 1;
  /** Fade-in to apply when the next track actually starts (kept across an autoplay block). */
  private pendingFadeIn = 0;
  private interactionHandler: (() => void) | null = null;

  get currentId(): string | null {
    return this._currentId;
  }

  private get effectiveVolume(): number {
    return this.userVolume * this.trackVolume;
  }

  play(id: string, files: string[], opts: PlayOptions = {}): void {
    if (!id || files.length === 0) return;
    if (!opts.force && this._currentId === id && this.player) return;

    const fadeOut = opts.fadeOut ?? 1.0;
    if (opts.volume !== undefined) this.userVolume = opts.volume;
    this.trackVolume = opts.trackVolume ?? 1;
    this.pendingFadeIn = opts.fadeIn ?? 0;
    const shuffled = opts.shuffle ?? true;
    this._currentId = id;

    if (this.player && fadeOut > 0) {
      this.fadeOut(fadeOut, () => this.startPlaylist(files, shuffled));
    } else {
      this.disposePlayer();
      this.startPlaylist(files, shuffled);
    }
  }

  stop(opts: StopOptions = {}): void {
    const fadeOut = opts.fadeOut ?? 1.0;
    this._currentId = null;
    if (!this.player) return;
    gameLogger.info('[music] Music stopped');
    if (fadeOut > 0) {
      this.fadeOut(fadeOut, () => { });
    } else {
      this.disposePlayer();
    }
  }

  /** The player's slider moved. A running fade keeps its own course and lands on the new level. */
  setVolume(volume: number): void {
    this.userVolume = volume;
    if (this.player && this.cancelRamp === null) {
      this.player.volume = this.effectiveVolume;
    }
  }

  private stopRamp(): void {
    if (this.cancelRamp) {
      this.cancelRamp();
      this.cancelRamp = null;
    }
  }

  private fadeOut(durationSec: number, onComplete: () => void): void {
    this.stopRamp();
    if (!this.player) {
      onComplete();
      return;
    }
    const player = this.player;
    this.cancelRamp = rampVolume(player, player.volume, 0, durationSec, () => {
      this.cancelRamp = null;
      player.pause();
      player.currentTime = 0;
      player.remove();
      if (this.player === player) this.player = null;
      onComplete();
    });
  }

  private startPlaylist(files: string[], shuffled: boolean): void {
    this.disposePlayer();
    this.playlist = shuffled ? shuffle([...files]) : [...files];
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
    player.currentTime = 0;
    const fadeIn = this.pendingFadeIn;
    player.volume = fadeIn > 0 ? 0 : this.effectiveVolume;
    gameLogger.info(`[music] Playing "${this._currentId}": ${this.playlist[this.trackIndex]}`);
    player.play().then(() => {
      // The fade-in belongs to the first track that actually plays; later tracks of the
      // playlist start at full gain.
      if (fadeIn > 0 && this.player === player) {
        this.pendingFadeIn = 0;
        this.stopRamp();
        this.cancelRamp = rampVolume(player, 0, this.effectiveVolume, fadeIn, () => {
          this.cancelRamp = null;
        });
      }
    }).catch((error: any) => {
      if (error?.name === 'AbortError') {
        return;
      }
      if (error?.name === 'NotAllowedError') {
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
    this.stopRamp();
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
