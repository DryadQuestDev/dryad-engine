import { ref, onMounted, onBeforeUnmount, type Ref } from 'vue';

type Pending = { activate: () => void };

const pendingQueue: Pending[] = [];
let schedulerHandle: number | null = null;
const BATCH_PER_TICK = 4;

const win: any = typeof window !== 'undefined' ? window : {};

const requestIdle: (cb: () => void) => number =
  typeof win.requestIdleCallback === 'function'
    ? (cb) => win.requestIdleCallback(cb, { timeout: 100 })
    : (cb) => win.requestAnimationFrame(cb);

const cancelIdle: (h: number) => void =
  typeof win.cancelIdleCallback === 'function'
    ? (h) => win.cancelIdleCallback(h)
    : (h) => win.cancelAnimationFrame(h);

function scheduleDrain() {
  if (schedulerHandle !== null) return;
  schedulerHandle = requestIdle(() => {
    schedulerHandle = null;
    let n = BATCH_PER_TICK;
    while (n-- > 0 && pendingQueue.length > 0) {
      const item = pendingQueue.shift()!;
      item.activate();
    }
    if (pendingQueue.length > 0) scheduleDrain();
  });
}

export function useLazyMount(
  targetRef: Ref<HTMLElement | null>,
  opts: { rootMargin?: string } = {},
) {
  const isActive = ref(false);
  let observer: IntersectionObserver | null = null;
  const pending: Pending = { activate: () => activate() };

  function activate() {
    if (isActive.value) return;
    isActive.value = true;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    const i = pendingQueue.indexOf(pending);
    if (i !== -1) pendingQueue.splice(i, 1);
  }

  onMounted(() => {
    if (isActive.value) return;
    pendingQueue.push(pending);
    scheduleDrain();
    if (targetRef.value && 'IntersectionObserver' in win) {
      observer = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            activate();
            break;
          }
        }
      }, { rootMargin: opts.rootMargin ?? '200px' });
      observer.observe(targetRef.value);
    }
  });

  onBeforeUnmount(() => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    const i = pendingQueue.indexOf(pending);
    if (i !== -1) pendingQueue.splice(i, 1);
    if (pendingQueue.length === 0 && schedulerHandle !== null) {
      cancelIdle(schedulerHandle);
      schedulerHandle = null;
    }
  });

  return { isActive, activate };
}
