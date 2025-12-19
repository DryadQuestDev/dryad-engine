# Placeholders Reference

Format: `|placeholderName(args)|`

---

## Built-in Placeholders

| Placeholder | Description | Example |
|-------------|-------------|---------|
| `flag` | Returns the value of a flag | `You have \|flag(gold)\| gold` |
| `property` | Returns the value of a game property | `Score: \|property(score)\|` |
| `item` | Returns the name of an item | `You are using \|item(uid, invId)\|` |

---

## Nested Property Paths

For object-type properties, access nested values with dot notation:

```
Volume: |property(settings.volume)|%
Theme: |property(config.ui.theme)|
```

---

