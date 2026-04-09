#!/bin/bash

# Build engine for web (no Electron, read-only mode)
# Output: dist-web/
# Games to include are defined in web-game-list.json

set -e

NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")

echo "=========================================="
echo "Building $NAME v$VERSION (web)"
echo "=========================================="

# Clean previous build
rm -rf dist-web

# Step 1: Vite build with web mode flag
echo "Step 1: Building with Vite..."
VITE_WEB_MODE=true npx vite build --outDir dist-web

# Step 2: Clear dev game data and unnecessary folders (Vite copied everything from public/)
echo "Step 2: Clearing dev game data..."
rm -rf dist-web/assets/games_files/*
rm -rf dist-web/assets/games_assets/*
rm -rf dist-web/assets/backup
rm -rf dist-web/assets/install

# Step 3: Copy games from web-game-list.json
echo "Step 3: Copying games from web-game-list.json..."
node -e "
const fs = require('fs');
const path = require('path');

const games = JSON.parse(fs.readFileSync('web-game-list.json', 'utf-8'));

for (const game of games) {
  console.log('  Game: ' + game.id + ' (from ' + game.source + ')');

  for (const mod of game.mods) {
    // Copy games_files
    const srcFiles = path.join(game.source, 'games_files', game.id, mod);
    const destFiles = path.join('dist-web/assets/games_files', game.id, mod);

    if (!fs.existsSync(srcFiles)) {
      console.warn('    WARNING: ' + srcFiles + ' not found, skipping');
      continue;
    }

    fs.cpSync(srcFiles, destFiles, { recursive: true });
    console.log('    Copied games_files/' + game.id + '/' + mod);

    // Read dev_settings.json to find asset_folders
    const devSettingsPath = path.join(srcFiles, 'dev', 'dev_settings.json');
    if (fs.existsSync(devSettingsPath)) {
      const devSettings = JSON.parse(fs.readFileSync(devSettingsPath, 'utf-8'));
      const assetFolders = devSettings.asset_folders || [];

      for (const folder of assetFolders) {
        const srcAssets = path.join(game.source, 'games_assets', folder);
        const destAssets = path.join('dist-web/assets/games_assets', folder);

        if (fs.existsSync(srcAssets)) {
          fs.cpSync(srcAssets, destAssets, { recursive: true });
          console.log('    Copied games_assets/' + folder);
        } else {
          console.warn('    WARNING: games_assets/' + folder + ' not found');
        }
      }
    }
  }
}

console.log('  Done');
"

# Step 4: Generate files_tree.json
echo "Step 4: Generating files_tree.json..."
node scripts/generate-files-tree.cjs \
  --root=dist-web/assets \
  --output=dist-web/assets/files_tree.json \
  --dirs=games_files,engine_files

echo ""
echo "=========================================="
echo "Web build complete: dist-web/"
echo "=========================================="
