# Releasing Your Game or Mod

When you're ready to share your game or mod with players, follow these steps to create a distributable package.

---

## Step 1: Check the Manifest

Go to **General → Manifest** and verify all fields are correctly filled:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier for your game/mod |
| `name` | Display name shown to players |
| `author` | Your name or studio name |
| `version` | Version number in `a.b.c` format (e.g., `1.0.0`, `0.3.42`) |
| `description` | Rich text description shown on the game selection screen |
| `cover_assets` | Cover images or videos for the selection screen |

### Version Format

The version must follow the `a.b.c` format:
- `a` - Major version (breaking changes)
- `b` - Minor version (new features)
- `c` - Patch version (bug fixes)

---

## Step 2: Configure Dev Settings

Go to **Dev → Dev Settings** and configure the build:

### asset_folders

List all folders containing your game's assets. Only these folders will be included in the build.

**Note:** Your game's default assets folder is already included when the game is created, so normally you won't need to change anything here.

**Important:**
- Paths are relative to `assets/games_assets/`
- Example: `my_game/_core`
- No need to include `engine_assets` - they're part of the engine

---

## Step 3: Export

Press the **Export game as ZIP** button in Dev Settings.

The engine will create a `.zip` file in the `/assets` folder.

---

## Distribution

Share the `.zip` file with your audience. Players install it by:

1. Placing the archive in `assets/install/`
2. Opening the engine and installing from the Main Menu

---

## Engine Version Compatibility

If your game uses features from a specific engine version, set the `engine_version_min` field in **General → Manifest**.

| Field | Description |
|-------|-------------|
| `engine_version_min` | Minimum engine version required (e.g., `1.2.0`) |

This automatically notifies players if they're running an older engine version that may not support your game's features. Players with older versions will see a warning prompting them to update.
