# Apply System

The apply system handles the "Apply" button in inventories. This powers **crafting** (combining items into new items) and **custom interactions** (puzzle mechanics, item insertion, etc.).

---

## How It Works

When a player clicks the Apply button:

| Step | What happens |
|------|--------------|
| 1 | `inventory_apply` event fires |
| 2 | If event returns false, stop |
| 3 | Otherwise, run crafting logic |

The Apply button appears when an inventory has either:
- Recipes assigned to it
- A custom `interactive` value set

---

## The Apply Button

The `interactive` field on inventory templates controls the Apply button:

The value also becomes a CSS class on the button, allowing custom styling per inventory.

**Styling the Apply button:**

```css
/* Base styling for "combine" button */
.apply-button.combine {
  background-color: #4a90d9;
}

.apply-button.combine:hover {
  background-color: #3a70b9;
}

/* Set button text using ::before */
.apply-button.combine::before {
  content: "Combine";
}
```

---

## Recipes

Recipes define how items transform into other items.

### Recipe Template Fields

| Field | Description |
|-------|-------------|
| `id` | Recipe identifier |
| `name` | Display name |
| `description` | Recipe description (supports rich text) |
| `input_items` | Required ingredients |
| `output_items` | Items produced |
| `tags` | For categorizing recipes |

### Input/Output Format

| Field | Description |
|-------|-------------|
| `item_id` | The item template ID |
| `quantity` | How many (default: 1) |

---

## Learning Recipes

Recipes must be **learned** before they can be used.

| Action | Description |
|--------|-------------|
| `{learnRecipe: "recipe_id"}` | Learn a single recipe |
| `{learnRecipe: "recipe1, recipe2"}` | Learn multiple recipes (comma-separated) |

**Example - Learning from a book:**

| Field | Value |
|-------|-------|
| Trigger | Player uses "Blacksmith Manual" item |
| Action | `{learnRecipe: "iron_sword_recipe, steel_sword_recipe"}` |

---

## Crafting Flow

When the player clicks Apply with a selected recipe:

| Step | What happens |
|------|--------------|
| 1 | Check if recipe is learned |
| 2 | Check if ingredients exist (unequipped items only) |
| 3 | Check if inventory has space for outputs |
| 4 | Remove input items |
| 5 | Create output items |

If any check fails, an appropriate notification is shown.

---

## Recipe Selection UI

When an inventory has recipes:

| UI Element | Behavior |
|------------|----------|
| Recipe list | Shows only learned recipes |
| Recipe button | Disabled if ingredients missing |
| Click recipe | Transfers needed ingredients from party inventory |
| Click Apply | Crafts using selected recipe |

Clicking a recipe automatically moves the required ingredients from party inventory to the crafting inventory.

---

## Stacking Rules

Crafting respects item stacking:

| `max_stack` Value | Behavior |
|-------------------|----------|
| `0` or `1` | Each item takes one slot |
| `99` | Up to 99 items per slot |
| `-1` | Unlimited stacking |

The system calculates available space by considering:
- Slots freed by consuming ingredients
- Existing partial stacks that can be filled
- Max stack values from item templates

---

## Custom Apply Logic

Use the `inventory_apply` event for custom behavior:

```javascript
game.on("inventory_apply", (inventory) => {
  if (inventory.id === "puzzle_altar") {
    // Check if correct items are placed
    const gem = inventory.getFirstItemById("red_gem");
    const key = inventory.getFirstItemById("ancient_key");

    if (gem && key) {
      // Consume items
      inventory.removeItem(gem);
      inventory.removeItem(key);

      // Store result and notify
      game.getStore("puzzle").set("altar_activated", true);
      game.showNotification("The altar glows with ancient power!");
    }

    // Prevent other calls, including default crafting(if the inventory has any recipes assigned to it)
    return false; 
  }
});
```
---

## Assigning Recipes to Inventories

In the inventory template:

| Field | Description |
|-------|-------------|
| `recipes` | List of recipe IDs available at this inventory |

**Example - Blacksmith inventory:**

| Field | Value |
|-------|-------|
| `id` | blacksmith_forge |
| `name` | "Blacksmith's Forge" |
| `recipes` | iron_sword_recipe, steel_sword_recipe, repair_armor |

The Apply button defaults to "craft" when recipes are assigned.

---

## Events

| Event | When it fires | Parameters |
|-------|---------------|------------|
| `inventory_apply` | Apply button clicked | `(inventory)` |
| `recipe_learned` | Recipe is learned | `(recipeId)` |

---

## Methods

| Method | Description |
|--------|-------------|
| `inventory.getApplyButton()` | Get the apply button label |
| `inventory.addRecipe(id)` | Add recipe to inventory |
| `inventory.getRecipes()` | Get all recipe IDs |
| `inventory.craft()` | Execute crafting |
| `game.addLearnedRecipe(id)` | Learn a recipe |
| `game.getLearnedRecipes()` | Get all learned recipes |

---

## Quick Reference

| I want to... | Do this |
|--------------|---------|
| Create a crafting station | Set `recipes` on inventory template |
| Learn a recipe | `{learnRecipe: "recipe_id"}` action |
| Custom apply behavior | Listen to `inventory_apply` event |
| Change button label | Set `interactive` on inventory template |
| Check if recipe learned | `game.getLearnedRecipes().has(id)` |

---

## Next Steps

- ->items.items_overview - Item basics and templates
- ->items.exchange - Trading and shops

