#!/bin/bash

# Parse command line arguments
BUILD_ALL=false
if [ "$1" == "--all" ] || [ "$1" == "-a" ]; then
    BUILD_ALL=true
fi

# Detect current OS
CURRENT_OS="linux"
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
    CURRENT_OS="windows"
elif [[ "$(uname -s)" == "MINGW"* ]] || [[ "$(uname -s)" == "MSYS"* ]]; then
    CURRENT_OS="windows"
elif [[ "$(uname -r)" == *"microsoft"* ]] || [[ "$(uname -r)" == *"WSL"* ]]; then
    # Running in WSL - build for Windows
    CURRENT_OS="windows"
fi

# Get app name and version from package.json
NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")

if [ "$BUILD_ALL" = true ]; then
    echo "Building $NAME v$VERSION (all platforms)"
else
    echo "Building $NAME v$VERSION (${CURRENT_OS})"
fi
echo "================================"

# Clean up any existing temp folder from previous builds
if [ -d "temp" ]; then
    echo "Removing old temp folder..."
    rm -rf temp
fi

# Step 1: Check if existing build exists and backup game assets
BACKUP_SOURCE=""
if [ -d "production/${NAME}-linux" ]; then
    BACKUP_SOURCE="production/${NAME}-linux"
elif [ -d "production/${NAME}-windows" ]; then
    BACKUP_SOURCE="production/${NAME}-windows"
fi

if [ -n "$BACKUP_SOURCE" ]; then
    echo "Found existing build at $BACKUP_SOURCE, backing up game assets..."

    # Create temp directory if it doesn't exist
    mkdir -p temp

    # Backup games_assets and games_files if they exist
    if [ -d "${BACKUP_SOURCE}/assets/games_assets" ]; then
        echo "Backing up games_assets..."
        cp -r ${BACKUP_SOURCE}/assets/games_assets temp/
    fi

    if [ -d "${BACKUP_SOURCE}/assets/games_files" ]; then
        echo "Backing up games_files..."
        cp -r ${BACKUP_SOURCE}/assets/games_files temp/
    fi

    echo "Backup complete!"
fi

# Step 2: Delete all production builds
echo "Cleaning production folder..."
rm -rf production/*

# Step 2.5: Copy TypeScript definitions to public/assets/engine_files/types
echo "Copying TypeScript definitions for modders..."

# Create types directory
mkdir -p public/assets/engine_files/types

# Copy Vue types
echo "Copying Vue types..."
cp node_modules/vue/dist/vue.d.ts public/assets/engine_files/types/ 2>/dev/null || echo "  ⚠ Vue types not found, skipping..."

# Copy VueUse types
echo "Copying VueUse types..."
mkdir -p public/assets/engine_files/types/@vueuse
cp node_modules/@vueuse/core/index.d.mts public/assets/engine_files/types/@vueuse/core.d.ts 2>/dev/null || echo "  ⚠ VueUse types not found, skipping..."

# Copy PrimeVue types
echo "Copying PrimeVue types..."
mkdir -p public/assets/engine_files/types/primevue
cp -r node_modules/primevue/*.d.ts public/assets/engine_files/types/primevue/ 2>/dev/null || echo "  ⚠ PrimeVue types not found, skipping..."

# Create VS Code settings for modders
echo "Creating VS Code settings..."
mkdir -p public/assets/.vscode
cat > public/assets/.vscode/settings.json << 'EOF'
{
  "javascript.inlayHints.parameterTypes.enabled": false,
  "javascript.inlayHints.variableTypes.enabled": false,
  "javascript.inlayHints.functionLikeReturnTypes.enabled": false,
  "typescript.inlayHints.parameterTypes.enabled": false,
  "typescript.inlayHints.variableTypes.enabled": false,
  "typescript.inlayHints.functionLikeReturnTypes.enabled": false,
  "javascript.suggestionActions.enabled": false,
  "typescript.suggestionActions.enabled": false
}
EOF

echo "Type definitions copied!"

# Step 3: Build the Angular/Vue app
echo "Building the application..."
npm run build

# Step 4: Clean up dist/assets folder
echo "Cleaning dist/assets folders..."

# Empty games_assets and games_files folders
if [ -d "dist/assets/games_assets" ]; then
    rm -rf dist/assets/games_assets/*
fi

if [ -d "dist/assets/games_files" ]; then
    rm -rf dist/assets/games_files/*
fi

# Delete engine_assets/test folder
if [ -d "dist/assets/engine_assets/test" ]; then
    echo "Removing engine_assets/test folder..."
    rm -rf dist/assets/engine_assets/test
fi

# Step 5: Restore backup to dist/assets
if [ -d "temp/games_assets" ]; then
    echo "Restoring games_assets from backup..."
    cp -r temp/games_assets dist/assets/
fi

if [ -d "temp/games_files" ]; then
    echo "Restoring games_files from backup..."
    cp -r temp/games_files dist/assets/
fi

# Copy VS Code settings to dist (in case Vite ignored .vscode folder)
echo "Copying VS Code settings to dist..."
mkdir -p dist/assets/.vscode
cp public/assets/.vscode/settings.json dist/assets/.vscode/settings.json

# Step 6: Build Electron
echo "Building Electron application..."

if [ "$BUILD_ALL" = true ]; then
    # Build for both platforms
    echo "Building Linux version..."
    ELECTRON_DISABLE_SANDBOX=1 npx electron-builder build --linux --dir
    echo "Building Windows version..."
    npx electron-builder build --windows --dir
elif [ "$CURRENT_OS" = "windows" ]; then
    echo "Building Windows version..."
    npx electron-builder build --windows --dir
else
    echo "Building Linux version..."
    ELECTRON_DISABLE_SANDBOX=1 npx electron-builder build --linux --dir
fi

# Rename the unpacked folders to use app name
if [ -d "production/linux-unpacked" ]; then
    mv production/linux-unpacked production/${NAME}-linux
fi

if [ -d "production/win-unpacked" ]; then
    mv production/win-unpacked production/${NAME}-windows
fi

# Step 7: Reorganize Linux build structure
if [ -d "production/${NAME}-linux" ]; then
    echo "Reorganizing Linux build structure..."
    SOURCE="production/${NAME}-linux/resources/app/dist"
    DEST="production/${NAME}-linux"

    if [ -d "$SOURCE" ]; then
        mv "$SOURCE"/* "$DEST"/
    fi

    SOURCE_ASSETS="production/${NAME}-linux/resources/assets"
    DEST_ASSETS="production/${NAME}-linux/assets"

    if [ -d "$SOURCE_ASSETS" ]; then
        mkdir -p "$DEST_ASSETS"
        # Enable dotglob to include hidden files/folders like .vscode
        shopt -s dotglob
        mv "$SOURCE_ASSETS"/* "$DEST_ASSETS"/
        shopt -u dotglob
    fi
fi

# Step 8: Reorganize Windows build structure
if [ -d "production/${NAME}-windows" ]; then
    echo "Reorganizing Windows build structure..."
    SOURCE_WIN="production/${NAME}-windows/resources/app/dist"
    DEST_WIN="production/${NAME}-windows"

    if [ -d "$SOURCE_WIN" ]; then
        mv "$SOURCE_WIN"/* "$DEST_WIN"/
    fi

    SOURCE_ASSETS_WIN="production/${NAME}-windows/resources/assets"
    DEST_ASSETS_WIN="production/${NAME}-windows/assets"

    if [ -d "$SOURCE_ASSETS_WIN" ]; then
        mkdir -p "$DEST_ASSETS_WIN"
        # Enable dotglob to include hidden files/folders like .vscode
        shopt -s dotglob
        mv "$SOURCE_ASSETS_WIN"/* "$DEST_ASSETS_WIN"/
        shopt -u dotglob
    fi

    # Fix sharp for Windows - install Windows binaries
    if [ -d "production/${NAME}-windows/resources/app" ]; then
        echo "Installing Windows binaries for sharp..."
        cd production/${NAME}-windows/resources/app

        # Install sharp Windows-specific packages (force install to bypass platform check)
        echo "Forcing installation of Windows-specific sharp packages..."
        npm_config_platform=win32 npm_config_arch=x64 npm install --force @img/sharp-win32-x64@0.34.4 @img/sharp-libvips-win32-x64@1.2.3

        # Verify installation
        if [ -d "node_modules/@img/sharp-win32-x64" ]; then
            echo "✓ Sharp Windows binaries installed successfully!"
        else
            echo "✗ ERROR: Sharp Windows binaries installation failed!"
        fi

        cd ../../../../
    fi
fi

echo ""
echo "================================"
echo "Build complete! Version: $VERSION"

if [ "$BUILD_ALL" = true ]; then
    echo "Linux build: production/${NAME}-linux/"
    echo "Windows build: production/${NAME}-windows/"
    echo ""
    echo "Note: For Linux, remember to run after extracting:"
    echo "  sudo chown root chrome-sandbox"
    echo "  sudo chmod 4755 chrome-sandbox"
elif [ "$CURRENT_OS" = "windows" ]; then
    echo "Windows build: production/${NAME}-windows/"
else
    echo "Linux build: production/${NAME}-linux/"
    echo ""
    echo "Note: For Linux, remember to run after extracting:"
    echo "  sudo chown root chrome-sandbox"
    echo "  sudo chmod 4755 chrome-sandbox"
fi
