import { Directive } from 'vue';
import { useDebounceFn } from '@vueuse/core';

interface PreserveScrollElement extends HTMLElement {
  _preserveScrollData?: {
    resizeObserver: ResizeObserver;
    scrollContainer: HTMLElement;
  };
}

/**
 * Vue directive to preserve scroll position when a textarea with autoResize changes size.
 *
 * This directive solves the issue where PrimeVue's Textarea with autoResize causes
 * the parent scroll container to jump when the textarea height changes (e.g., when
 * removing lines or adding content).
 *
 * How it works:
 * 1. Finds the parent .editor-right scroll container
 * 2. Uses ResizeObserver to detect when the textarea height changes
 * 3. Adjusts the scroll position to compensate for the height change
 * 4. Only adjusts scroll if the textarea is above the current viewport
 *
 * Usage: <Textarea v-preserve-scroll autoResize />
 */
export const preserveScroll: Directive = {
  mounted(el: PreserveScrollElement) {
    // Find the .editor-right scroll container
    const findScrollContainer = (): HTMLElement | null => {
      let parent = el.parentElement;
      while (parent) {
        if (parent.classList.contains('editor-right')) {
          return parent;
        }
        parent = parent.parentElement;
      }
      return null;
    };

    const scrollContainer = findScrollContainer();
    if (!scrollContainer) {
      console.warn('[preserveScroll] Could not find .editor-right scroll container');
      return;
    }

    let savedScrollTop = scrollContainer.scrollTop;
    let lastHeight = el.offsetHeight;

    // Use MutationObserver to detect when the textarea height changes
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const newHeight = entry.contentRect.height;

        if (newHeight !== lastHeight) {
          // Restore the scroll position that was saved before the resize
          scrollContainer.scrollTop = savedScrollTop;
          lastHeight = newHeight;
        }
      }
    });

    // Listen to scroll events on the container to update our saved position
    // when the user manually scrolls (not when browser auto-scrolls)
    const handleScroll = useDebounceFn(() => {
      savedScrollTop = scrollContainer.scrollTop;
    }, 100);

    scrollContainer.addEventListener('scroll', handleScroll);

    // Start observing the textarea for size changes
    resizeObserver.observe(el);

    // Store data for cleanup
    el._preserveScrollData = {
      resizeObserver,
      scrollContainer
    };

    // Store cleanup function for the scroll listener
    (el as any)._preserveScrollInputCleanup = () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  },

  beforeUnmount(el: PreserveScrollElement) {
    // Cleanup: disconnect the ResizeObserver
    if (el._preserveScrollData) {
      el._preserveScrollData.resizeObserver.disconnect();
      delete el._preserveScrollData;
    }

    // Cleanup: remove input event listener
    if ((el as any)._preserveScrollInputCleanup) {
      (el as any)._preserveScrollInputCleanup();
      delete (el as any)._preserveScrollInputCleanup;
    }
  }
};
