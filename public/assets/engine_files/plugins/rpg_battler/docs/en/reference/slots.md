# Component Extension Slots

The RPG Battler provides named slots where other plugins or game scripts can inject custom Vue components using `game.addComponent()`.

## Battle Screen Slots

| Slot | Location | Props | Description |
|---|---|---|---|
| `rpg-sidebar-top` | Top of the battle sidebar | `character` (Character) | Content injected above the turn/info display in the sidebar. Character is the active combatant. |
| `rpg-sidebar-bottom` | Bottom of the battle sidebar | `character` (Character) | Content injected below the turn order display in the sidebar. Character is the active combatant. |

## Ability Panel Slots

| Slot | Location | Props | Description |
|---|---|---|---|
| `rpg-ability-panel-top` | Top of the ability panel | `battle` (RpgBattle), `activeChar` (Character) | Content injected above the ability list |
| `rpg-ability-panel-bottom` | Bottom of the ability panel | `battle` (RpgBattle), `activeChar` (Character) | Content injected below the ability list |

## Character Overlay Slots

| Slot | Location | Props | Description |
|---|---|---|---|
| `rpg-char-overlay-top` | Top of the in-battle character overlay | `character` (Character) | Content injected above the character name and health bar |
| `rpg-char-overlay-bottom` | Bottom of the in-battle character overlay | `character` (Character) | Content injected below the status bricks |
| `rpg-battle-char-overlay` | CharacterSlot overlay during battle | `character` (Character), `slotScale` (number) | Full overlay component rendered on each battle CharacterSlot (default: RpgCharOverlay with health bar, name, status bricks) |

## Non-Battle Slots

| Slot | Location | Props | Description |
|---|---|---|---|
| `character-list-item` | Party list character portrait | `character` (Character) | Overlay on party list portraits. Used by RpgHealthOverlay to show HP loss bar |

## Example

```js
const { defineComponent } = window.engine.vue;

const ActiveCharName = defineComponent({
    props: ['character'],
    template: `<div class="custom-banner">{{ character?.getTrait('name') }}</div>`
});

game.addComponent({
    id: 'my_active_char_name',
    slot: 'rpg-sidebar-top',
    component: ActiveCharName,
    order: 0,
});
```
