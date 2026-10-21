/**
 * Face bake: renders a character's face crop to a square WebP, for the Art Manager's Face tab to
 * save as `face_static`. Reproduces CharacterFace's crop – the doll at the reference size, the
 * face_shift_* square cut out of it, art_dx/art_dy ignored – at FACE_BAKE_SIZE instead of 100px.
 */
import { spineRenderer } from '../game/utils/spineRenderer';
import { applyTrackMap } from '../game/utils/spineAnimationGroups';
import { SPINE_REFERENCE_HEIGHT, SPINE_REFERENCE_WIDTH } from '../game/utils/characterReference';

/** Edge of a baked face in px. */
export const FACE_BAKE_SIZE = 300;
const FACE_BAKE_QUALITY = 0.85;

/** CharacterFace's circle at scale 1, in doll px. */
const FACE_RECT_SIZE = 100;

/** A face crop as the face_shift_* traits store it: % of the 1:1 doll, and a zoom. */
export interface FaceCrop {
  x: number;
  y: number;
  scale: number;
}

/** A spine doll as the preview shows it. */
export interface SpineFaceSource {
  atlasUrl: string;
  skeletonUrl: string;
  skins: string[];
  trackMap: Map<number, string>;
  artScale: number;
  gameScale: number;
}

/** The crop's square in doll px. */
function cropSquare(crop: FaceCrop) {
  return {
    left: (crop.x / 100) * SPINE_REFERENCE_WIDTH,
    top: (crop.y / 100) * SPINE_REFERENCE_HEIGHT,
    side: FACE_RECT_SIZE / (crop.scale || 1),
  };
}

function createFaceCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = FACE_BAKE_SIZE;
  canvas.height = FACE_BAKE_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  return { canvas, ctx };
}

async function encodeWebp(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', FACE_BAKE_QUALITY));
  // A browser without a WebP encoder silently hands back a PNG instead.
  if (!blob || blob.type !== 'image/webp') throw new Error('This browser cannot encode WebP.');
  return new Uint8Array(await blob.arrayBuffer());
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

function nextFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = () => (--count <= 0 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  });
}

/** Stacks the image layers (lowest z first) the way CharacterDollStatic draws them – each one
 * object-fit: contain in the doll – and cuts the face out at the images' own resolution. */
export async function bakeStaticFace(imageUrls: string[], crop: FaceCrop): Promise<Uint8Array> {
  const images = await Promise.all(imageUrls.map(loadImage));
  const { canvas, ctx } = createFaceCanvas();
  const { left, top, side } = cropSquare(crop);
  const toOutput = FACE_BAKE_SIZE / side;

  for (const img of images) {
    const fit = Math.min(SPINE_REFERENCE_WIDTH / img.naturalWidth, SPINE_REFERENCE_HEIGHT / img.naturalHeight);
    const width = img.naturalWidth * fit;
    const height = img.naturalHeight * fit;
    ctx.drawImage(img,
      ((SPINE_REFERENCE_WIDTH - width) / 2 - left) * toOutput,
      ((SPINE_REFERENCE_HEIGHT - height) / 2 - top) * toOutput,
      width * toOutput,
      height * toOutput);
  }
  return encodeWebp(canvas);
}

/**
 * Renders the skeleton into a hidden FACE_BAKE_SIZE slot whose viewport is zoomed onto the crop,
 * so the face is drawn at full resolution rather than upscaled from the preview's canvas.
 *
 * In a doll the skeleton's centre sits on the doll's centre and a point lies u = offset × k doll
 * px from it (k = gameScale × artScale). The bake slot draws it at
 * B/2 + (B / SPINE_REFERENCE_HEIGHT) × (zoom × u + k × viewport.d), so zoom = reference / side
 * fills the slot with the crop and viewport.d = −zoom × f / k centres the crop's own centre f.
 */
export async function bakeSpineFace(source: SpineFaceSource, crop: FaceCrop): Promise<Uint8Array> {
  const { left, top, side } = cropSquare(crop);
  const scale = (source.gameScale || 1) * (source.artScale || 1);
  const zoom = SPINE_REFERENCE_HEIGHT / side;
  const centerX = left + side / 2 - SPINE_REFERENCE_WIDTH / 2;
  const centerY = top + side / 2 - SPINE_REFERENCE_HEIGHT / 2;

  // The renderer sizes its buffer from the host's CSS box × dpr; this one comes out ≥ FACE_BAKE_SIZE.
  // Laid out but invisible: the render loop skips a host with no size.
  const hostSize = Math.ceil(FACE_BAKE_SIZE / (window.devicePixelRatio || 1));
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-10000px;top:0;width:${hostSize}px;height:${hostSize}px;`
    + 'visibility:hidden;pointer-events:none;';
  document.body.appendChild(host);
  const slotId = `face_bake_${Date.now()}`;

  try {
    const spine = await spineRenderer.register(slotId, host, {
      atlasUrl: source.atlasUrl,
      skeletonUrl: source.skeletonUrl,
      artScale: source.artScale || 1,
      gameScale: source.gameScale || 1,
      viewport: { zoom, dx: (-zoom * centerX) / scale, dy: (-zoom * centerY) / scale },
    });
    if (!spine) throw new Error(`Could not load the spine ${source.skeletonUrl}`);
    if (source.skins.length > 0) spineRenderer.applySkins(spine, source.skins);
    applyTrackMap(spine, source.trackMap);

    // The renderer paints on its own ticker – give it a few frames to draw this slot.
    await nextFrames(3);
    const slotCanvas = host.querySelector('canvas');
    if (!slotCanvas || slotCanvas.width < FACE_BAKE_SIZE) throw new Error('The spine did not render.');

    const { canvas, ctx } = createFaceCanvas();
    ctx.drawImage(slotCanvas, 0, 0, FACE_BAKE_SIZE, FACE_BAKE_SIZE);
    return await encodeWebp(canvas);
  } finally {
    spineRenderer.unregister(slotId);
    host.remove();
  }
}
