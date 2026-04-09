# Conditions

| Condition | Returns | Description |
|---|---|---|
| `_level(characterId)` | number | Returns the character's current level. Use with comparison operators. |

## Examples

```js
// Show choice only if hero is level 5 or higher
!path_of_truth{ active: "_level(hero)>=5"}

