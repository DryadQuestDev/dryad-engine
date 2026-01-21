# AI Agent Hints for Dryad Engine

## Two Development Contexts

**CRITICAL:** Identify which context applies before making changes.

### ENGINE Development (modifying the engine itself)
| Aspect | Details |
|--------|---------|
| Working directory | `/dryad-engine-v/` (project root) |
| Source code | `/src/` (TypeScript, Vue) |
| Type checking | `npx tsc --noEmit` |
| You are | Modifying core systems, Game class, engine features |

### GAME Development (making a game using the engine)
| Aspect | Details |
|--------|---------|
| Working directory | `/production/dryad-engine-linux/assets/` |
| Source code | `/games_assets/[game_name]/_core/scripts/` (.mjs) |
| Type checking | `npx tsc --project jsconfig.json --noEmit 2>&1 \| grep "games_assets"` |
| You are | Writing game scripts, UI components, game logic |

---

**The rest of this file covers GAME development patterns.**

---

## TypeScript Checking for Game Scripts

Run from the **assets folder**, not the root:

```bash
cd /production/dryad-engine-linux/assets
npx tsc --project jsconfig.json --noEmit 2>&1 | grep "games_assets"
```

The `grep` filters out node_modules noise and shows only game script errors.

## Component Patterns

### Vue Component Structure
```javascript
const { game, vue } = window.engine;
const { defineComponent } = vue;

export const MyComponent = defineComponent({
    setup() {
        // Use game.setState() for navigation
        // Use game.registerState() for new states
        return { /* exposed to template */ };
    },
    template: /*html*/`<div class="my-component">...</div>`
});
```

### Component Registration
```javascript
game.addComponent({
    id: "component_id",
    slot: "game_state",  // or "popup", "progression-tabs", etc.
    component: MyComponent
});
```

### Navigation Between Screens
```javascript
game.setState("game_state", "target_component_id");
```

### State Registration (required before use)
```javascript
game.registerState("my_state", defaultValue);
```

## Styling Guidelines

### Dark Glassy Theme
Use this pattern for game UI:
```css
.my-component {
  background: rgba(0, 0, 0, 0.95);
  color: rgba(255, 255, 255, 0.9);

  .panel {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }
}
```

### Custom Buttons (avoid PrimeVue for game UI)
```css
.btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.9);
  padding: 0.75rem 1.5rem;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);

  &:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.25);
  }
}
```

### CSS Organization
- Use nested CSS syntax
- Add section comments for each component:
```css
/* ============================================
   COMPONENT NAME
   ============================================ */
```

## File Locations

| Purpose | Path |
|---------|------|
| Game scripts | `/games_assets/[game]/_core/scripts/` |
| Game CSS | `/games_assets/[game]/_core/css/main.css` |
| Game types | `/games_assets/[game]/_core/scripts/dtypes.d.ts` |
| Engine types | `/engine_files/types.d.ts` |
| Engine API | See `window.engine.game` in types.d.ts |

## Common Pitfalls

1. **State not registered**: Always call `game.registerState()` before `game.setState()`
2. **PrimeVue in games**: Use custom styled elements, not PrimeVue components
3. **Wrong working directory**: Type checking must run from `/assets/` folder
4. **Missing imports**: Destructure from `window.engine`, not npm imports

## API Quick Reference

```javascript
// Navigation
game.setState("game_state", "component_id");
game.nextScene();
game.exitScene();
game.enter("room_id");

// Characters
game.getCharacter("id");
game.getParty();
game.createCharacter("id", template);

// Items
game.createItem(template);
game.getInventory("id");
game.createInventory("id", template);

// Events
game.on("event_name", callback);
game.trigger("event_name", ...args);
game.registerEmitter("custom_event");

// Logic
game.registerAction("id", func);
game.registerCondition("id", func);
game.execute({ action_id: params });
```
