#!/bin/bash

# Build engine for web (no Electron, read-only mode)
# Output: dist-web/ (free games) + dist-web-premium/ (free + premium mods)
# Games to include are defined in web-game-list.json (mods / premium_mods)

set -e

NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")

echo "=========================================="
echo "Building $NAME v$VERSION (web)"
echo "=========================================="

# Clean previous builds
rm -rf dist-web dist-web-premium

# Step 1: Vite build with web mode flag
echo "Step 1: Building with Vite..."
VITE_WEB_MODE=true npx vite build --outDir dist-web

# Step 2: Clear dev game data and unnecessary folders (Vite copied everything from public/)
echo "Step 2: Clearing dev game data..."
rm -rf dist-web/assets/games_files/*
rm -rf dist-web/assets/games_assets/*
rm -rf dist-web/assets/backup
rm -rf dist-web/assets/install

# Step 2b: Duplicate the clean skeleton for the premium variant (same engine
# bundle — base is relative, so it works at any path; only game content differs)
echo "Step 2b: Creating premium build skeleton..."
cp -r dist-web dist-web-premium

# Step 3: Copy games from web-game-list.json
echo "Step 3: Copying games (free)..."
node scripts/copy-web-games.cjs --dest=dist-web/assets

echo "Step 3b: Copying games (premium)..."
node scripts/copy-web-games.cjs --dest=dist-web-premium/assets --premium

# Step 4: Generate files_tree.json
echo "Step 4: Generating files_tree.json..."
node scripts/generate-files-tree.cjs \
  --root=dist-web/assets \
  --output=dist-web/assets/files_tree.json \
  --dirs=games_files,engine_files
node scripts/generate-files-tree.cjs \
  --root=dist-web-premium/assets \
  --output=dist-web-premium/assets/files_tree.json \
  --dirs=games_files,engine_files

echo ""
echo "=========================================="
echo "Web build complete: dist-web/ + dist-web-premium/"
echo "=========================================="
