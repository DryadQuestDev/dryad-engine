/**
 * Shared audio plumbing for music (MusicPlayer) and sounds (CoreSystem): the inline `(prop=val)`
 * tail that music and sound ids accept in content, and a volume ramp for fades.
 */

/** Per-play overrides. Chain: inline `(prop=val)` → the entity's field → the engine default. */
export type AudioOverrides = {
  /** Gain 0–1, multiplied onto the player's slider. */
  volume?: number;
  /** Seconds from silence to full gain when playback starts. */
  fade_in?: number;
  /** Seconds to silence when stopped or replaced. 0 cuts. */
  fade_out?: number;
  /** Sounds only: seconds to wait before starting. */
  delay?: number;
  /** Music only: play the files in random order. */
  shuffle?: boolean;
};

/** `rain(volume=0.4, fade_in=2)` → `{ id: 'rain', props: { volume: 0.4, fade_in: 2 } }`. */
export function parseAudioSpec(spec: string): { id: string; props: AudioOverrides } {
  const match = spec.trim().match(/^([^(]+?)\s*(?:\(([^)]*)\))?$/);
  if (!match) return { id: spec.trim(), props: {} };
  const props: Record<string, unknown> = {};
  for (const pair of (match[2] ?? '').split(',')) {
    const kv = pair.match(/^\s*(\w+)\s*=\s*(.+?)\s*$/);
    if (!kv) continue;
    const raw = kv[2];
    props[kv[1]] = raw === 'true' ? true
      : raw === 'false' ? false
      : raw !== '' && !isNaN(Number(raw)) ? Number(raw)
      : raw.replace(/^["']|["']$/g, '');
  }
  return { id: match[1].trim(), props: props as AudioOverrides };
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Ramp an element's volume from `from` to `to` over `seconds`, then call `onDone`. A duration of 0
 * sets the volume and completes at once. Returns a cancel function; a cancelled ramp leaves the
 * volume where it was and never calls `onDone`.
 */
export function rampVolume(
  el: HTMLAudioElement,
  from: number,
  to: number,
  seconds: number,
  onDone?: () => void,
): () => void {
  if (seconds <= 0) {
    el.volume = clamp(to);
    onDone?.();
    return () => { };
  }
  el.volume = clamp(from);
  const start = performance.now();
  const id = window.setInterval(() => {
    const t = Math.min(1, (performance.now() - start) / (seconds * 1000));
    el.volume = clamp(from + (to - from) * t);
    if (t >= 1) {
      clearInterval(id);
      onDone?.();
    }
  }, 40);
  return () => clearInterval(id);
}
