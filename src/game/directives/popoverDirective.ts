import { ref, shallowRef, type Component, type Directive, type DirectiveBinding } from 'vue';
import type { Placement } from '@floating-ui/vue';

export type PopoverBinding =
  | string
  | null
  | undefined
  | {
      html?: string;
      component?: Component;
      props?: Record<string, unknown>;
      width?: number | string;
      placement?: Placement;
    };

type Normalized = {
  html: string | null;
  component: Component | null;
  componentProps: Record<string, unknown>;
  width: number | string;
  placement: Placement;
};

export const popoverOpen = ref(false);
export const popoverAnchor = shallowRef<HTMLElement | null>(null);
export const popoverHtml = ref<string | null>(null);
export const popoverComponent = shallowRef<Component | null>(null);
export const popoverProps = shallowRef<Record<string, unknown>>({});
export const popoverWidth = ref<number | string>('300px');
export const popoverPlacement = ref<Placement>('top');

let currentOwner: HTMLElement | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;
const HIDE_DELAY = 100;

const PLACEMENT_MODS: Placement[] = ['top', 'bottom', 'left', 'right'];

function normalize(value: PopoverBinding, modifiers: Record<string, boolean>): Normalized | null {
  if (value == null || value === '') return null;
  const placementMod = PLACEMENT_MODS.find((p) => modifiers[p]);
  if (typeof value === 'string') {
    return {
      html: value,
      component: null,
      componentProps: {},
      width: '300px',
      placement: placementMod ?? 'top',
    };
  }
  return {
    html: value.html ?? null,
    component: value.component ?? null,
    componentProps: value.props ?? {},
    width: value.width ?? '300px',
    placement: value.placement ?? placementMod ?? 'top',
  };
}

function applyState(opts: Normalized, anchor: HTMLElement) {
  popoverAnchor.value = anchor;
  popoverComponent.value = opts.component;
  popoverHtml.value = opts.component ? null : opts.html;
  popoverProps.value = opts.componentProps;
  popoverWidth.value = opts.width;
  popoverPlacement.value = opts.placement;
}

function clearState() {
  popoverOpen.value = false;
  popoverAnchor.value = null;
  popoverComponent.value = null;
  popoverHtml.value = null;
  popoverProps.value = {};
  currentOwner = null;
}

export function cancelPopoverClose() {
  if (closeTimer !== null) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

export function schedulePopoverClose() {
  cancelPopoverClose();
  closeTimer = setTimeout(() => {
    closeTimer = null;
    clearState();
  }, HIDE_DELAY);
}

const OPTS = Symbol('de-popover-opts');
const HANDLERS = Symbol('de-popover-handlers');

type ElementState = { opts: Normalized | null; binding: DirectiveBinding<PopoverBinding> };

function readOpts(el: HTMLElement): Normalized | null {
  const state = (el as any)[OPTS] as ElementState | undefined;
  return state?.opts ?? null;
}

export const popover: Directive<HTMLElement, PopoverBinding> = {
  mounted(el, binding) {
    const opts = normalize(binding.value, binding.modifiers);
    (el as any)[OPTS] = { opts, binding } as ElementState;

    const onEnter = () => {
      const cur = readOpts(el);
      if (!cur) return;
      cancelPopoverClose();
      currentOwner = el;
      applyState(cur, el);
      popoverOpen.value = true;
    };
    const onLeave = () => {
      if (currentOwner !== el) return;
      schedulePopoverClose();
    };
    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mouseleave', onLeave);
    (el as any)[HANDLERS] = { onEnter, onLeave };
  },
  updated(el, binding) {
    const opts = normalize(binding.value, binding.modifiers);
    (el as any)[OPTS] = { opts, binding } as ElementState;
    if (currentOwner === el) {
      if (opts) applyState(opts, el);
      else clearState();
    }
  },
  unmounted(el) {
    const h = (el as any)[HANDLERS] as { onEnter: any; onLeave: any } | undefined;
    if (h) {
      el.removeEventListener('mouseenter', h.onEnter);
      el.removeEventListener('mouseleave', h.onLeave);
      delete (el as any)[HANDLERS];
    }
    delete (el as any)[OPTS];
    if (currentOwner === el) clearState();
  },
};
