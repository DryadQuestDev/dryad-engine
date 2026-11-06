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
| `changelog` | Release notes players open from **What's new** next to the version (see below) |
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

Before it zips, the export brings every dungeon whose `content_raw.txt` changed outside the editor up to date, so the archive always plays the content its text says.

The engine will create a `.zip` file in the `/assets` folder.

---

## Distribution

Share the `.zip` file with your audience. Players install it by:

1. Placing the archive in `assets/install/`
2. Opening the engine and installing from the Main Menu

---

## Landing Page Promotion Widgets

Use the `landing_widgets` field in **General → Manifest** to overlay custom HTML on the landing page – promo banners, release announcements, links to your Patreon, or a teaser for a premium mod.

Each widget has:

| Field | Description |
|-------|-------------|
| `widget_id` | Applied as the element's HTML id so your `landing_css` can target it with `#<widget_id>` |
| `html` | Raw HTML content, rendered as-is with no engine styling |
| `x` | Left edge in % of the stage width (0-100) |
| `y` | Top edge in % of the stage height (0-100) |

Widgets are positioned inside a centered 16:9 stage that letterboxes to fit the window, so a widget placed at `x: 70, y: 10` stays anchored to the same spot of your landing art at any window size. Inside your `landing_css`, `cqw`/`cqh` units resolve against this stage, which makes widget sizing scale with it too:

```css
#promo {
    width: 20cqw;
    padding: 1cqh 1cqw;
    background: rgba(20, 24, 29, 0.8);
    border-radius: 12px;
}
```

A widget's `html` can hold `[changes]` too: it shows the newest release of the manifest that wrote the widget, so a base-game widget shows the base game's notes.

Widgets stack across active manifests in load order, just like `landing_bg_asset`. Keep in mind that inactive mods contribute nothing to the landing page – a banner promoting a mod belongs in the **base game's** manifest, since the whole point is showing it before the mod is activated.

---

## Changelog (What's New)

Add an entry to the `changelog` field in **General → Manifest** for every release. The landing page shows **What's new** next to your game's version; it opens the list with the newest release expanded and older ones folded below, and **Expand all** opens every release at once.

| Field | Description |
|-------|-------------|
| `version` | The release this entry describes, in the same `a.b.c` format as `version` |
| `date` | Release date, picked from a calendar |
| `title` | Optional headline, e.g. the release's main new area |
| `image` | Optional picture shown above the notes |
| `notes` | Rich text: headings such as *New*, *Changes* and *Fixes* over bullet lists read well |

Entries are sorted by version, newest first, whatever their order in the form.

### Hotfixes

Give a hotfix its own entry with the full version (`0.23.1`) and only the fix in `notes`. The landing page shows it inside its release instead of as a release of its own: entries that share `a.b` form one block, headed by the newest version and date, with the oldest entry's notes first and each hotfix after them under a **Hotfix 0.23.1** heading. `[changes]` shows that whole block too, so the description reads **New in 0.23.1** over the release's notes and the fix. Restyle the heading with the `.changelog-hotfix` class in `landing_css`.

When a player comes back after an update, **What's new** carries a dot until they open it; a first-time player sees no dot. Dates are shown in the player's language.

A mod keeps its own changelog in its own manifest, and its panel on the landing page gets the same **What's new** link.

### Showing the latest release in the description

Put `[changes]` on its own line in `description` and the landing page shows your newest release there: a **New in 0.23.0** heading (in the player's language) over that release's notes, its hotfixes included. Write each release's notes once, in `changelog`, and the description keeps up by itself:

```html
<p>Play as a dryad who …</p>
<p>[changes]</p>
<h3>Already in the game</h3>
```

With no changelog entries the token simply disappears. The editor's Start page cards leave it out, since they are too small for a release's notes.

---

## Engine Version Compatibility

If your game uses features from a specific engine version, set the `engine_version_min` field in **General → Manifest**.

| Field | Description |
|-------|-------------|
| `engine_version_min` | Minimum engine version required (e.g., `1.2.0`) |

This automatically notifies players if they're running an older engine version that may not support your game's features. Players with older versions will see a warning prompting them to update.
