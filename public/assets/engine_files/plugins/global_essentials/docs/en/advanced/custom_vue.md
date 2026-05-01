# Custom Vue Features

## Directives

### v-persist

Keeps images in browser memory cache after they load. Prevents the browser from evicting decoded image data when elements are removed from the DOM (e.g., when closing a panel that uses `v-if`).

**Usage:**

```html
<img :src="iconPath" v-persist />
```

**Why it exists:**

When a Vue component is destroyed (via `v-if`), all its `<img>` elements are removed from the DOM. The browser may then evict the decoded image data from memory. When the component is recreated, the browser needs to re-decode the image from disk cache, causing a brief visual delay.

`v-persist` creates a hidden JavaScript reference to each loaded image, telling the browser to keep the decoded data in memory.

**Example - Item display component:**

```javascript
const { vue, game } = window.engine;
const { defineComponent, computed } = vue;

const ItemIcon = defineComponent({
  props: ['item'],
  setup(props) {
    const icon = computed(() => props.item.getTrait('image'));
    return { icon };
  },
  template: /*html*/`
    <img v-if="icon" :src="icon" class="item-icon" v-persist />
  `
});
```

**When to use:**
- Images that appear in panels or screens that open/close frequently (character sheets, inventory, etc.)
- Character portraits and doll layers
- Any image that should always display instantly when its container is reopened

**When not needed:**
- Images that are always visible (static backgrounds, persistent UI elements)
- Images shown only once (splash screens, one-time animations)

The cache holds up to 600 images. When full, the oldest entry is removed to make room for new ones.

---

### v-fit

Shrinks font size so text fits within its container without clipping. Reacts to text changes and container resizes automatically.

**Usage:**

```html
<div v-fit>{{ characterName }}</div>
<div v-fit="{ min: 8 }">{{ longTitle }}</div>
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `min` | `number` | `6` | Minimum font size in px |

**Example - Character name badge:**

```javascript
const { vue, game } = window.engine;
const { defineComponent, computed } = vue;

const CharacterBadge = defineComponent({
  props: ['character'],
  setup(props) {
    const name = computed(() => props.character.getTrait('name'));
    return { name };
  },
  template: /*html*/`
    <div class="badge" v-fit>{{ name }}</div>
  `
});
```

**When to use:**
- Name labels on fixed-width containers (character portraits, item slots)
- Any single-line text that must not clip or overflow

**When not needed:**
- Text that can wrap to multiple lines
- Text in containers that grow to fit content

---

### v-script

Renders DryadScript text on any element with full lore-link interactivity. Resolves the input through the engine's text pipeline by default and attaches the hover/click event delegation needed to open lore tooltip popups on `[[record_id]]` references. Use this anywhere you display engine-resolved text in your own templates — plain `v-html` will render visually but the lore links won't react to hover or click. See ->miscellaneous.lore for the full lore system.

**Usage (string form):**

```html
<div v-script="rawText" />
```

Resolves `rawText` through the text pipeline (placeholders, `if{}`, `[[lore-links]]`, etc.) and renders it. Equivalent to `v-script="{ html: rawText }"`.

**Usage (object form):**

```html
<div v-script="{ html, resolver, navMode, onNavigate, disabled }" />
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `html` | `string` | required | text to render |
| `resolver` | `boolean` | `true` | run `html` through `game.resolveString(html, true).output` (noExecuteActions=true; rendering must never fire side effects). Set `false` if `html` is already resolved upstream. |
| `navMode` | `boolean` | `false` | for in-place navigation (e.g., the Encyclopedia tab): clicks call `onNavigate(recordId)` instead of opening a popup. Hover is suppressed in this mode. |
| `onNavigate` | `(recordId: string) => void` | — | callback for `navMode` clicks |
| `disabled` | `boolean` | `false` | suppress all hover/click handling. Use during DOM-unstable phases like a typing animation that re-parses HTML each frame, so the popup doesn't latch onto a stale anchor. |

**Example - choice description:**

```javascript
const { vue } = window.engine;
const { defineComponent } = vue;

const ChoiceCard = defineComponent({
  props: ['choice'],
  template: /*html*/`
    <div class="choice">
      <h3>{{ choice.name }}</h3>
      <div v-if="choice.description" v-script="choice.description" class="choice-description"></div>
    </div>
  `
});
```

**Reactivity caveat:** the directive re-renders only when its bound value changes. Reactive dependencies *inside* `resolveString` (e.g., a placeholder that reads a ref the player can change mid-session) won't trigger a re-render automatically. For those cases, wrap in your own `computed(() => game.resolveString(text).output)` and pass with `{ resolver: false }`.

**When to use:**
- Any custom component that displays user-authored text containing `[[record]]` references, `|placeholders|`, or other DryadScript syntax
- Choice descriptions, item descriptions, status descriptions in plugin UIs

**When not needed:**
- Plain text without any DryadScript syntax — use `{{ text }}` interpolation instead.

---

### v-dragscroll

Enables drag-to-scroll on any scrollable container. Click and drag to scroll horizontally, vertically, or both.

**Usage:**

```html
<!-- Horizontal only -->
<div class="scroll-container" v-dragscroll.x>...</div>

<!-- Vertical only -->
<div class="scroll-container" v-dragscroll.y>...</div>

<!-- Both directions (default) -->
<div class="scroll-container" v-dragscroll>...</div>
```

**When to use:**
- Horizontal card/character lists that overflow their container
- Any scrollable area where drag-to-scroll improves UX (especially touch devices)

**When not needed:**
- Containers that don't overflow
- Areas where drag conflicts with other interactions (text selection, sliders)

Powered by [vue-dragscroll](https://www.npmjs.com/package/vue-dragscroll).

---

## Quick Reference

| Directive | Element | Purpose |
|-----------|---------|---------|
| `v-persist` | `<img>` | Keep loaded images in browser memory cache |
| `v-fit` | Any | Shrink font size so text fits without clipping |
| `v-script` | Any | Render DryadScript text with `[[lore-link]]` interactivity |
| `v-dragscroll` | Any | Drag-to-scroll on scrollable containers |
| `v-tooltip` | Any | Show tooltip on hover (from PrimeVue) |
