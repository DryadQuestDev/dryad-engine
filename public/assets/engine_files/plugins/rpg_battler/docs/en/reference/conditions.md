# Conditions

| Condition | Description |
|---|---|
| `_party_full` | True when the current party size is greater than or equal to `max_party_size` from the battle config |
| `_defeated(battleId)` | True if the battle with the given definition ID has been won by any route: a fight, `{win}` or `{set_defeated}`. Example: `_defeated(forest_ambush)==true` |
| `_fought(battleId)` | True only if the battle was won in actual combat, not cleared by `{win}` or `{set_defeated}`. Example: `_fought(forest_ambush)==true` |
