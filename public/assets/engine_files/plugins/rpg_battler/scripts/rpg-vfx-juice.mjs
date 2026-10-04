// Impact "juice": the short reactions that make a damaging hit land. The struck body flashes white
// and holds there for the hit-stop before it recoils; an additive burst blooms at the point of
// contact and sparks fly off it in the effect's own colour; the screen jolts. readSheet reads that
// colour and the frame an impact lands on off a sprite sheet — in the editor only (the Projectiles
// tab's save hook stores both on the def; the battle never decodes a sheet). DOM + Web Animations only, no imports and no `window.engine`, so the battler (rpg-battle-anims.mjs) and the editor's
// Projectile Editor preview play the same thing (the editor blob-imports this file). Sizes are px;
// durations are ms at normal battle speed, times the battle-speed multiplier `m` the caller passes.
// The classes live in css/rpg-vfx.css.

/** How hard an impact reads, by a projectile def's `impact_strength`. `none` turns the juice off. */
export const IMPACT_STRENGTH = { none: 0, light: 0.6, medium: 1, heavy: 1.6 };

/** Config-tab fallbacks (battle_config hit_stop_ms / hit_sparks / hit_shake), before the strength. */
export const JUICE_DEFAULTS = { stopMs: 70, sparks: 12, shake: 3 };

/** @param {string|undefined} strength */
export function strengthOf(strength) {
  const k = IMPACT_STRENGTH[/** @type {keyof typeof IMPACT_STRENGTH} */ (strength || 'medium')];
  return k ?? IMPACT_STRENGTH.medium;
}

const reads = new Map();                    // url|filter → the pending or finished SheetRead

/**
 * @typedef {{ color: string, peak: number|null }} SheetRead
 * `color` is the effect's own colour; `peak` the 0-based index of its fullest frame (null when the
 * image could not be read).
 */

/**
 * Read a sprite sheet once: its fullest frame (the most light — alpha times luminance, so a sheet
 * drawn on black for additive blending counts too), where an impact lands, and the effect's colour —
 * that frame's opaque pixels averaged, weighted toward the saturated ones, after the def's CSS
 * `filter` (a hue-rotated sheet gives its new colour), pushed to full brightness so it reads as
 * light. White and no peak when there is no image or it cannot be read.
 * @param {string} url @param {{ frames?: number, cols?: number, filter?: string }} [o]
 * @returns {Promise<SheetRead>}
 */
export function readSheet(url, o = {}) {
  const none = { color: '#ffffff', peak: null };
  if (!url) return Promise.resolve(none);
  const key = url + '|' + (o.filter || '');
  const known = reads.get(key);
  if (known) return known instanceof Promise ? known : Promise.resolve(known);
  const p = new Promise((resolve) => {
    const done = (r) => { reads.set(key, r); resolve(r); };
    const img = new Image();
    img.onload = () => {
      try {
        const n = o.frames || 1, c = o.cols || n, r = Math.ceil(n / c);
        const fw = img.naturalWidth / c, fh = img.naturalHeight / r;
        const cv = document.createElement('canvas'); cv.width = cv.height = 48;
        const g = /** @type {CanvasRenderingContext2D} */ (cv.getContext('2d', { willReadFrequently: true }));
        if (o.filter) g.filter = o.filter;
        let peak = 0, most = -1, px = null;
        for (let f = 0; f < n; f++) {
          g.clearRect(0, 0, 48, 48);
          g.drawImage(img, (f % c) * fw, Math.floor(f / c) * fh, fw, fh, 0, 0, 48, 48);
          const d = g.getImageData(0, 0, 48, 48).data;
          let light = 0;
          for (let i = 0; i < d.length; i += 4) light += d[i + 3] * (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
          if (light > most) { most = light; peak = f; px = d; }
        }
        let R = 0, G = 0, B = 0, W = 0;
        for (let i = 0; i < px.length; i += 4) {
          const a = px[i + 3] / 255;
          if (a < 0.5) continue;
          const sat = (Math.max(px[i], px[i + 1], px[i + 2]) - Math.min(px[i], px[i + 1], px[i + 2])) / 255;
          const w = a * (0.1 + sat * sat * 4);
          R += px[i] * w; G += px[i + 1] * w; B += px[i + 2] * w; W += w;
        }
        const k = W ? 255 / Math.max(1, R / W, G / W, B / W) : 0;
        done({ peak, color: W ? `rgb(${Math.round(R / W * k)}, ${Math.round(G / W * k)}, ${Math.round(B / W * k)})` : '#ffffff' });
      } catch { done(none); }
    };
    img.onerror = () => done(none);
    img.src = url;
  });
  reads.set(key, p);
  return p;
}

/**
 * @typedef {{ container: HTMLElement, fixed?: boolean, pos: {x:number,y:number}, size: number,
 *   color: string, k: number, m: number, sparks?: number }} JuiceHit
 * `size` is the impact's size in px (the hit sprite's); `k` the strength; `fixed` places the pieces
 * in viewport coordinates (the battler), otherwise relative to `container` (the editor stage).
 */

/** @param {HTMLElement} el @param {JuiceHit} o */
function place(el, o) {
  el.style.position = o.fixed ? 'fixed' : 'absolute';
  el.style.left = `${o.pos.x}px`;
  el.style.top = `${o.pos.y}px`;
  el.style.setProperty('--juice', o.color);
  o.container.appendChild(el);
}

/** An additive flash that blooms out from the point of contact. @param {JuiceHit} o */
export function burst(o) {
  const el = document.createElement('div');
  el.className = 'rpg-juice-burst';
  const d = o.size * (0.55 + 0.35 * o.k);
  el.style.width = el.style.height = `${d}px`;
  place(el, o);
  const a = el.animate([
    { scale: 0.2, opacity: 1 },
    { scale: 0.9, opacity: 0.9, offset: 0.3 },
    { scale: 1.15, opacity: 0 },
  ], { duration: 260 * o.m, easing: 'cubic-bezier(.2,.8,.3,1)' });
  a.finished.then(() => el.remove(), () => el.remove());
}

/** Streaks thrown out from the point of contact, dropping a little as they fade. @param {JuiceHit} o */
export function sparks(o) {
  const n = Math.round((o.sparks ?? JUICE_DEFAULTS.sparks) * o.k);
  const thick = Math.max(2, o.size * 0.022);
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'rpg-juice-spark';
    const ang = Math.random() * Math.PI * 2;
    const dist = o.size * (0.3 + Math.random() * 0.5) * (0.75 + 0.25 * o.k);
    const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist, drop = o.size * 0.12;
    el.style.width = `${o.size * (0.08 + Math.random() * 0.1)}px`;
    el.style.height = `${thick}px`;
    el.style.marginTop = `${-thick / 2}px`;
    el.style.rotate = `${ang}rad`;
    place(el, o);
    const a = el.animate([
      { translate: '0 0', scale: '1 1', opacity: 1 },
      { translate: `${dx * 0.75}px ${dy * 0.75 + drop * 0.2}px`, scale: '1 1', opacity: 1, offset: 0.5 },
      { translate: `${dx}px ${dy + drop}px`, scale: '0.3 0.6', opacity: 0 },
    ], { duration: (240 + Math.random() * 200) * o.m, easing: 'cubic-bezier(.1,.75,.35,1)' });
    a.finished.then(() => el.remove(), () => el.remove());
  }
}

/**
 * The struck body's flash: near-white for the hit-stop, then a glow in the effect's colour that
 * fades out. Every keyframe carries the same filter functions, so it eases instead of jumping.
 * @param {Element|null} el @param {string} color @param {number} holdMs @param {number} glowPx @param {number} m
 */
export function flash(el, color, holdMs, glowPx, m) {
  if (!el) return;
  const hold = holdMs * m, fade = 320 * m, total = hold + fade;
  const f = (b, s, r, c) => `brightness(${b}) saturate(${s}) drop-shadow(0 0 ${r}px ${c})`;
  /** @type {HTMLElement} */ (el).animate([
    { filter: f(2.6, 0.15, 0, color), offset: 0 },
    { filter: f(2.6, 0.15, 0, color), offset: hold / total },
    { filter: f(1.5, 0.8, glowPx, color), offset: (hold + fade * 0.3) / total },
    { filter: f(1, 1, 0, 'transparent') },
  ], { duration: total, easing: 'linear' });
}

/**
 * A short jolt of the view: each element moves by the separate `translate` property, added on top of
 * whatever moves it already (a lunge, a recoil), so their own transforms (the camera zoom, a centring
 * translate) are untouched. Give every layer that must move together; animations started in one
 * call stay in step.
 * @param {Iterable<Element>} els @param {number} px @param {number} m
 */
export function shake(els, px, m) {
  if (px <= 0) return;
  const frames = [
    { translate: '0 0' }, { translate: `${px}px ${-px * 0.6}px` }, { translate: `${-px * 0.9}px ${px * 0.5}px` },
    { translate: `${px * 0.5}px ${-px * 0.25}px` }, { translate: '0 0' },
  ];
  for (const el of els) /** @type {HTMLElement} */ (el).animate(frames, { duration: 200 * m, easing: 'linear', composite: 'add' });
}
