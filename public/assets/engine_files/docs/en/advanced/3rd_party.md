# Third-Party Libraries

Dryad Engine exposes several third-party libraries through `window.engine` for use in custom scripts.

---

## PrimeVue

[PrimeVue](https://primevue.org/) is a comprehensive Vue component library with buttons, inputs, dropdowns, dialogs, and more.

Access via `window.engine.primeVue`:

```javascript
const { vue, primeVue } = window.engine;
const { defineComponent, ref } = vue;

const MyForm = defineComponent({
  components: {
    Button: primeVue.Button,
    InputText: primeVue.InputText,
    Dropdown: primeVue.Dropdown
  },
  setup() {
    const name = ref("");
    return { name };
  },
  template: /*html*/`
    <div>
      <InputText v-model="name" placeholder="Enter name" />
      <Button label="Submit" @click="submit" />
    </div>
  `
});
```

**Global directives:** `v-tooltip` is registered globally and works on any element.

Browse all components at [primevue.org](https://primevue.org/).

---

## VueUse

[VueUse](https://vueuse.org/) is a collection of Vue composition utilities for common tasks like handling mouse position, keyboard events, local storage, and more.

Access via `window.engine.vueUse`:

```javascript
const { vue, vueUse } = window.engine;
const { defineComponent } = vue;
const { useMouse, useLocalStorage, useWindowSize } = vueUse;

const MouseTracker = defineComponent({
  setup() {
    const { x, y } = useMouse();
    const { width, height } = useWindowSize();
    const savedValue = useLocalStorage('my-key', 'default');

    return { x, y, width, height, savedValue };
  },
  template: /*html*/`
    <div>
      <p>Mouse: {{ x }}, {{ y }}</p>
      <p>Window: {{ width }}x{{ height }}</p>
    </div>
  `
});
```

Browse all utilities at [vueuse.org](https://vueuse.org/).

---

## Floating UI

[Floating UI](https://floating-ui.com/) is a library for positioning floating elements like tooltips, popovers, and dropdowns.

Access via `window.engine.floatingUi`:

```javascript
const { vue, floatingUi } = window.engine;
const { defineComponent, ref } = vue;
const { useFloating, offset, flip, shift } = floatingUi;

const Tooltip = defineComponent({
  setup() {
    const reference = ref(null);
    const floating = ref(null);

    const { floatingStyles } = useFloating(reference, floating, {
      middleware: [offset(10), flip(), shift()]
    });

    return { reference, floating, floatingStyles };
  },
  template: /*html*/`
    <div>
      <button ref="reference">Hover me</button>
      <div ref="floating" :style="floatingStyles">Tooltip content</div>
    </div>
  `
});
```

Browse documentation at [floating-ui.com](https://floating-ui.com/).

---

## GSAP

[GSAP](https://gsap.com/) (GreenSock Animation Platform) is a professional-grade animation library.

Access via `window.engine.gsap`:

```javascript
const { gsap } = window.engine;

// Animate an element
gsap.to(".my-element", {
  x: 100,
  opacity: 0.5,
  duration: 1,
  ease: "power2.out"
});

// Timeline for sequenced animations
const tl = gsap.timeline();
tl.to(".box", { x: 100, duration: 0.5 })
  .to(".box", { y: 50, duration: 0.3 })
  .to(".box", { rotation: 360, duration: 0.5 });
```

Browse documentation at [gsap.com](https://gsap.com/).

---

## fast-copy

[fast-copy](https://github.com/planttheidea/fast-copy) is a fast deep cloning library.

Access via `window.engine.fastCopy`:

```javascript
const { fastCopy } = window.engine;

const original = {
  nested: { value: 1 },
  array: [1, 2, 3]
};

// Create a deep clone
const clone = fastCopy(original);
clone.nested.value = 2;

console.log(original.nested.value); // 1 (unchanged)
console.log(clone.nested.value);    // 2
```

---

## Quick Reference

| Library | Access | Purpose |
|---------|--------|---------|
| PrimeVue | `window.engine.primeVue` | UI components (buttons, inputs, dialogs) |
| VueUse | `window.engine.vueUse` | Vue composition utilities |
| Floating UI | `window.engine.floatingUi` | Positioning floating elements |
| GSAP | `window.engine.gsap` | Professional animations |
| fast-copy | `window.engine.fastCopy` | Deep cloning objects |

