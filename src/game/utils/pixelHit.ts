/**
 * Pixel-perfect (alpha-aware) hit testing for character bodies.
 *
 * - For spine canvases: read alpha directly from the rendered 2D canvas.
 * - For static images: build a 1-bit mask once per image (lazily, on first
 *   hit-test). Mask is W×H/8 bytes — tiny per image. The temporary RGBA
 *   canvas used to extract alpha is GC'd right after, so steady-state cost
 *   is just the mask.
 */

/** Pixel alpha below this is treated as transparent for hit-testing. */
export const ALPHA_THRESHOLD = 16;

interface ImageMask {
  mask: Uint8Array;
  w: number;
  h: number;
}

// WeakMap so masks are dropped when the img is GC'd.
const maskCache = new WeakMap<HTMLImageElement, ImageMask>();
// Track imgs we've already tried to build (and failed, e.g., CORS) so we
// don't retry every event.
const failedMasks = new WeakSet<HTMLImageElement>();

/**
 * Build a 1-bit alpha mask from an image. Allocates a temporary RGBA canvas,
 * blits the image, reads the ImageData, packs alpha bits into a Uint8Array.
 * Temporary canvas + ImageData are dropped after; only the mask sticks around.
 * Returns null if the image isn't loaded or CORS blocks reads.
 */
function buildImageMask(img: HTMLImageElement): ImageMask | null {
  if (!img.complete || !img.naturalWidth || !img.naturalHeight) return null;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    const total = w * h;
    const mask = new Uint8Array(Math.ceil(total / 8));
    for (let i = 0; i < total; i++) {
      if (data[i * 4 + 3] >= ALPHA_THRESHOLD) {
        mask[i >> 3] |= 1 << (i & 7);
      }
    }
    return { mask, w, h };
  } catch {
    // CORS-tainted canvas or other read failure
    return null;
  }
}

/** Lazy-build (or fetch cached) the 1-bit mask for an image. */
function getOrBuildImageMask(img: HTMLImageElement): ImageMask | null {
  const cached = maskCache.get(img);
  if (cached) return cached;
  if (failedMasks.has(img)) return null;
  const built = buildImageMask(img);
  if (built) {
    maskCache.set(img, built);
    return built;
  }
  failedMasks.add(img);
  return null;
}

/**
 * Map a clientX/clientY pair to the natural-image pixel coords of an `<img>`
 * element rendered with `object-fit: contain`. Returns null if the cursor is
 * outside the contain'd image area (in the letterbox region).
 */
function mapClientToImageNatural(
  img: HTMLImageElement,
  clientX: number,
  clientY: number
): { x: number; y: number } | null {
  const rect = img.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (nw <= 0 || nh <= 0) return null;
  // object-fit: contain — scale image to fit element preserving aspect.
  const scale = Math.min(rect.width / nw, rect.height / nh);
  const dispW = nw * scale;
  const dispH = nh * scale;
  const offsetX = (rect.width - dispW) / 2;
  const offsetY = (rect.height - dispH) / 2;
  const localX = clientX - rect.left - offsetX;
  const localY = clientY - rect.top - offsetY;
  if (localX < 0 || localY < 0 || localX >= dispW || localY >= dispH) return null;
  return {
    x: Math.floor(localX / scale),
    y: Math.floor(localY / scale),
  };
}

/** True if the image's pixel at (clientX, clientY) is opaque (alpha ≥ threshold). */
export function isImageOpaqueAtClient(
  img: HTMLImageElement,
  clientX: number,
  clientY: number,
  mirrored: boolean = false
): boolean {
  const p = mapClientToImageNatural(img, clientX, clientY);
  if (!p) return false;
  const m = getOrBuildImageMask(img);
  // If mask building failed (CORS), fall back to bbox-hit (treat as opaque).
  if (!m) return true;
  // For mirrored images (`transform: scaleX(-1)`), the displayed pixel at
  // local x corresponds to natural x = (w - 1 - x).
  const px = mirrored ? (m.w - 1 - p.x) : p.x;
  if (px < 0 || px >= m.w || p.y < 0 || p.y >= m.h) return false;
  const i = p.y * m.w + px;
  return ((m.mask[i >> 3] >> (i & 7)) & 1) === 1;
}

/** True if the canvas's pixel at (clientX, clientY) is opaque. Reads via
 * getImageData on the canvas's 2D context — cheap for a 1×1 read. */
export function isCanvasOpaqueAtClient(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number
): boolean {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const x = Math.floor((clientX - rect.left) * (canvas.width / rect.width));
  const y = Math.floor((clientY - rect.top) * (canvas.height / rect.height));
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return false;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const px = ctx.getImageData(x, y, 1, 1).data;
    return px[3] >= ALPHA_THRESHOLD;
  } catch {
    return false;
  }
}
