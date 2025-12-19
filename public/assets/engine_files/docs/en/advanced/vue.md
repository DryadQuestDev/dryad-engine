# Vue 3 - Modern Way to Build Complex UI

Dryad Engine is developed with **Vue 3**, a modern JavaScript framework for building user interfaces. This means all the engine's UI components - from character sheets to inventory screens to dialogue overlays - are Vue components that you can extend, replace, or build upon.

The engine exposes Vue and its APIs through `window.engine`, so you can create custom components that integrate seamlessly with the existing UI without setting up any build tools.

---

## What is Vue?

Vue is a framework that makes building interactive UIs simple and organized. Instead of manually manipulating HTML elements, you describe what the UI should look like based on your data, and Vue keeps everything in sync automatically.

**Key concepts:**

| Concept | What it does |
|---------|--------------|
| **Components** | Reusable UI building blocks (buttons, panels, entire screens) |
| **Reactive data** | When data changes, the UI updates automatically |
| **Templates** | HTML-like syntax to describe your component's structure |
| **Props** | Pass data from parent to child components |

**Learning resources:**

- [Vue 3 Official Tutorial](https://vuejs.org/tutorial/) - Interactive beginner tutorial
- [Vue 3 Documentation](https://vuejs.org/guide/introduction.html) - Complete reference
- [Vue Mastery](https://www.vuemastery.com/) - Video courses

You don't need deep Vue knowledge to customize Dryad Engine - the patterns shown here will cover most use cases.

---

## Creating Custom Components

Components are defined using `defineComponent()`:

```javascript
const { game, vue, primeVue } = window.engine;

// Import ref and defineComponent from vue to use in components
const { ref, defineComponent } = vue;

const MyComponent = defineComponent({
  // Register other components to use in template
  components: {
    Button: primeVue.Button
  },
  setup() {
    const message = ref("Hello!");

    function onClick() {
      message.value = "Clicked!";
    }

    return { message, onClick };
  },
  template: /*html*/`
    <div class="my-component">
      <p>{{ message }}</p>
      <Button label="Click me" @click="onClick" />
    </div>
  `
});
```

### Props - Passing Data to Components

Props let parent components pass data to children. The engine's `CharacterFace` component uses a `character` prop:

```javascript
const { vue, components, game } = window.engine;
const { defineComponent } = vue;
const { CharacterFace } = components;

// create a custom CharacterCard component that utilizes the built-in CharacterFace component
const CharacterCard = defineComponent({
  // Register engine's CharacterFace component to use in template
  components: { CharacterFace },
  // Declare what props this component accepts
  props: ['character'],
  setup(props) {
    // Access props.character in setup
    const name = props.character.getName();
    return { name };
  },
  template: /*html*/`
    <div class="character-card">
      <!-- Pass character prop to CharacterFace -->
      <CharacterFace :character="character" />
      <span>{{ name }}</span>
    </div>
  `
});

// Usage: pass a character object as prop
const alice = game.getCharacter("alice");
// In another component's template: <CharacterCard :character="alice" />
```

### Anatomy of a Component

| Part | Purpose |
|------|---------|
| `setup()` | Where you define reactive data, functions, and logic |
| `template` | HTML structure that displays your data |
| `components` | Register other components to use inside this one |
| `props` | Declare data this component receives from its parent |

### Reactive Data

Reactive data means the UI automatically updates when the data changes. In Dryad Engine, **game objects are already reactive** - characters, inventories, party, flags, and states are Vue reactive objects under the hood. When you mutate them, the UI updates automatically:

```javascript
setup() {
  // Game objects are reactive - pass them to template directly without the need to wrap in ref() or reactive()
  const mc = game.getCharacter("mc");
  const party = game.getParty();

  // When mc or party change, the template updates automatically
  return { mc, party };
}
```

```html
<!-- In template: access reactive properties directly -->
<p>Health: {{ mc.getResource("health") }} / {{ mc.getStat("max_health").value }}</p>
<p>Name: {{ mc.getTrait("name") }}</p>
```

Use `ref()` for your own local component state:

```javascript
const { ref } = vue;

setup() {
  // Use ref() for local UI state you create
  const isMenuOpen = ref(false);

  function toggleMenu() {
    isMenuOpen.value = !isMenuOpen.value;
  }

  return { isMenuOpen, toggleMenu };
}
```

Use `computed()` for derived values:

```javascript
const { computed } = vue;

setup() {
  const mc = game.getCharacter("mc");

  // Computed recalculates when dependencies change
  const healthPercent = computed(() => {
    const current = mc.getResource("health");
    const max = mc.getStat("max_health").value;
    return Math.round((current / max) * 100);
  });

  return { mc, healthPercent };
}
```

---

## Using Engine Components

The engine exports reusable components through `window.engine.components`:

```javascript
const { vue, components, game } = window.engine;
const { defineComponent } = vue;
const { CharacterFace, CharacterDoll, BackgroundAsset } = components;
```

**Example - Custom panel showing party faces:**

```javascript
const { vue, components, game } = window.engine;
const { defineComponent } = vue;
const { CharacterFace } = components;

const PartyFaces = defineComponent({
  components: { CharacterFace },
  setup() {
    const party = game.getParty();
    return { party };
  },
  template: /*html*/`
    <div class="party-faces">
      <div v-for="char in party" :key="char.id" class="face-slot">
        <CharacterFace :character="char" />
        <span>{{ char.getName() }}</span>
      </div>
    </div>
  `
});
```

---

## The Slot System

Dryad Engine uses a **slot system** to organize where components appear in the UI. Think of slots as designated areas where you can plug in your own components - like LEGO bricks snapping into place.

Use `game.addComponent()` to register your component into a slot:

```javascript
game.addComponent({
  id: "my-component-id",
  slot: "slot-name",
  title: "Display Title",
  component: MyComponent,
  order: 1  // Optional: controls position (lower = earlier)
});
```

### State-Based Slots

State-based slots show **one component at a time** based on a state value. The slot renders whichever component's `id` matches the current state.

**Example - Custom game state:**

```javascript
const { vue, game } = window.engine;
const { defineComponent } = vue;

const BattleScreen = defineComponent({
  setup() {
    function exitBattle() {
      game.setState("game_state", "exploration");
    }
    return { exitBattle };
  },
  template: /*html*/`
    <div class="battle-screen">
      <h1>Battle!</h1>
      <button @click="exitBattle">Retreat</button>
    </div>
  `
});

game.addComponent({
  id: "battle",           // When game_state = "battle", this shows
  slot: "game_state",
  component: BattleScreen
});

// Trigger it from anywhere:
game.setState("game_state", "battle");
```

### Injection Slots

Injection slots render **all registered components** together. They act as extension points throughout the UI - tabs, toolbars, panels, and more.

See ->builtins.component_slots for the full list of available slots and their default components.

---

## Example: Adding a Character Tab

Add a custom tab to the character sheet that shows alongside Stats, Skills, and Inventory:

```javascript
const { vue, game } = window.engine;
const { defineComponent, computed } = vue;

const NotesTab = defineComponent({
  setup() {
    // Get the currently viewed character
    const character = computed(() => {
      const charId = game.getState("selected_character");
      return game.getCharacter(charId);
    });

    // Store notes in a game store for persistence
    const notesStore = game.createStore("character_notes");

    const currentNote = computed(() => {
      if (!character.value) return "";
      return notesStore.get(character.value.id) || "";
    });

    function saveNote(event) {
      if (character.value) {
        notesStore.set(character.value.id, event.target.value);
      }
    }

    return { character, currentNote, saveNote };
  },
  template: /*html*/`
    <div class="notes-tab">
      <h3>Notes for {{ character?.getName() }}</h3>
      <textarea
        :value="currentNote"
        @input="saveNote"
        placeholder="Write notes about this character..."
      ></textarea>
    </div>
  `
});

game.addComponent({
  id: "notes",
  slot: "character-tabs",
  title: "Notes",
  component: NotesTab,
  order: 4  // After inventory (which is 3)
});
```

The tab appears automatically in the character sheet navigation.

---

## Example: Adding a Toolbar Button

@en/buttons.png

Add a custom button to the navigation toolbar:

```javascript
const { vue, primeVue, game } = window.engine;
const { defineComponent } = vue;

const QuickSaveButton = defineComponent({
  components: {
    Button: primeVue.Button
  },
  setup() {
    function quickSave() {
      game.saveGame("quicksave");
      game.addFlash("Game saved!");
    }

    return { quickSave };
  },
  template: /*html*/`
    <Button
      icon="pi pi-save"
      @click="quickSave"
      v-tooltip.bottom="'Quick Save'"
    />
  `
});

game.addComponent({
  id: "toolbar-quicksave",
  slot: "navigation-toolbar",
  component: QuickSaveButton,
  order: 10
});
```

---

## Removing or Replacing Components

Remove a default component:

```javascript
game.removeComponent("default-inventory-header");
```

Replace by using the same `id`:

```javascript
game.addComponent({
  id: "stats",  // Same ID as default stats tab
  slot: "character-tabs",
  title: "Character Stats",
  component: MyCustomStatsTab  // Your replacement
});
```

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Import Vue helpers | `const { ref, computed, defineComponent } = vue` |
| Create reactive value | `const x = ref(initialValue)` |
| Create computed value | `const x = computed(() => ...)` |
| Use engine component | `const { CharacterFace } = components` |
| Add component to slot | `game.addComponent({ id, slot, component })` |
| Remove component | `game.removeComponent("component-id")` |
| Change state-based slot | `game.setState("state_name", "component_id")` |

---

## Next Steps

- ->advanced.3rd_party - PrimeVue, VueUse, and other libraries
- ->advanced.set_up_coding - VS Code setup for autocomplete
- ->builtins.game_events - Events you can listen to

