import { Directive } from 'vue';

/**
 * Vue directive that shrinks font-size so text fits within its container.
 * Uses Canvas measureText for synchronous, layout-free measurement.
 * Observes DOM text changes (MutationObserver) and container resizes (ResizeObserver).
 *
 * Usage: <div v-fit>Long text here</div>
 * With min size: <div v-fit="{ min: 8 }">Long text here</div>
 */
export const fitText: Directive<HTMLElement, { min?: number } | undefined> = {
  mounted(el, binding) {
    // Hide until first fit to prevent flash of unsized text
    el.style.visibility = 'hidden';

    let lastWidth = el.clientWidth;

    const run = () => requestAnimationFrame(() => fit(el, binding.value));

    // React to text content changes in the DOM
    const mutObs = new MutationObserver(run);
    mutObs.observe(el, { childList: true, characterData: true, subtree: true });

    // React to container width changes (e.g. size prop change)
    const resizeObs = new ResizeObserver((entries) => {
      const newWidth = entries[0].contentRect.width;
      if (newWidth !== lastWidth) {
        lastWidth = newWidth;
        run();
      }
    });
    resizeObs.observe(el);

    (el as any)._fitObs = { mutObs, resizeObs };

    // Defer first fit so CSS v-bind values are applied before measuring
    requestAnimationFrame(() => {
      fit(el, binding.value);
      el.style.visibility = '';
    });
  },
  unmounted(el) {
    const obs = (el as any)._fitObs;
    if (obs) {
      obs.mutObs.disconnect();
      obs.resizeObs.disconnect();
      delete (el as any)._fitObs;
    }
  },
};

const _canvas = document.createElement('canvas');
const _ctx = _canvas.getContext('2d')!;

function fit(el: HTMLElement, options?: { min?: number }) {
  const minSize = options?.min ?? 6;

  // Clear any previous inline override so CSS rules (v-bind etc.) take effect
  el.style.fontSize = '';

  const style = getComputedStyle(el);
  const fontSize = parseFloat(style.fontSize);
  const fontWeight = style.fontWeight;
  const fontFamily = style.fontFamily;
  const text = el.textContent?.trim() || '';
  if (!text) return;

  // Available width = content box width (excluding padding)
  const paddingLeft = parseFloat(style.paddingLeft);
  const paddingRight = parseFloat(style.paddingRight);
  const availableWidth = el.clientWidth - paddingLeft - paddingRight;
  if (availableWidth <= 0) return;

  _ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const textWidth = _ctx.measureText(text).width;

  if (textWidth > availableWidth) {
    const newSize = Math.max(minSize, fontSize * (availableWidth / textWidth));
    el.style.fontSize = newSize + 'px';
  }
}
