#!/bin/bash

# Build Android APKs from the web build — one APK per entry in android-build-list.json.
#
# Usage: ./build-capacitor.sh [build_id|all]     (default: all)
# Requires: dist-web/ (run build-web.sh first) and a one-time ./scripts/setup-android.sh
#
# Exits 0 with a warning when Android tooling isn't set up, so prepare-public.sh
# (set -e) keeps working on machines without the SDK.

set -e

TARGET="${1:-all}"
RELEASE_DIR="../dryad-engine-release"

echo "=========================================="
echo "Building Android APKs"
echo "=========================================="

# ── Preflight ────────────────────────────────────────────────────────────
if [ ! -d "dist-web" ]; then
    echo "Error: dist-web/ not found. Run build-web.sh first."
    exit 1
fi
if [ ! -d "android" ]; then
    echo "⚠ android/ platform missing — run ./scripts/setup-android.sh first. Skipping APK builds."
    exit 0
fi

# Every dev machine needs local.properties (gitignored) — create it when the
# SDK is findable; setup-android.sh handles the no-SDK case with instructions.
if [ ! -f "android/local.properties" ]; then
    SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
    if [ -d "$SDK_DIR" ]; then
        echo "sdk.dir=$SDK_DIR" > android/local.properties
        echo "✓ Wrote android/local.properties (sdk.dir=$SDK_DIR)"
    else
        echo "⚠ No Android SDK found — run ./scripts/setup-android.sh first. Skipping APK builds."
        exit 0
    fi
fi

SIGNED=true
if [ ! -f "android/key.properties" ]; then
    SIGNED=false
    echo "⚠ No android/key.properties — building UNSIGNED DEBUG APKs."
    echo "  Run ./scripts/setup-android.sh to create the release keystore."
fi

# ImageMagick (v7 `magick` or v6 `convert`) for icon upscaling
IMAGICK=""
if command -v magick >/dev/null 2>&1; then IMAGICK="magick"; elif command -v convert >/dev/null 2>&1; then IMAGICK="convert"; fi

mkdir -p "$RELEASE_DIR"
RELEASE_ABS="$(cd "$RELEASE_DIR" && pwd)"

BUILD_IDS=$(jq -r '.[].id' android-build-list.json)
if [ "$TARGET" != "all" ]; then
    if ! echo "$BUILD_IDS" | grep -qx "$TARGET"; then
        echo "Error: build '$TARGET' not found in android-build-list.json (have: $(echo $BUILD_IDS | tr '\n' ' '))"
        exit 1
    fi
    BUILD_IDS="$TARGET"
fi

for BUILD_ID in $BUILD_IDS; do
    APP_ID=$(jq -r ".[] | select(.id==\"$BUILD_ID\") | .app_id" android-build-list.json)
    APP_NAME=$(jq -r ".[] | select(.id==\"$BUILD_ID\") | .app_name" android-build-list.json)
    ICON=$(jq -r ".[] | select(.id==\"$BUILD_ID\") | .icon // empty" android-build-list.json)
    BUMP=$(jq -r ".[] | select(.id==\"$BUILD_ID\") | .version_bump // 0" android-build-list.json)
    SUFFIX=$(jq -r ".[] | select(.id==\"$BUILD_ID\") | .version_suffix // empty" android-build-list.json)

    # Version comes from the GAME's _core manifest (first game of the build),
    # not the engine — the APK is the game, its releases track game versions.
    GAME_ID=$(jq -r ".[] | select(.id==\"$BUILD_ID\") | .games[0].id" android-build-list.json)
    GAME_SRC=$(jq -r ".[] | select(.id==\"$BUILD_ID\") | .games[0].source" android-build-list.json)
    GAME_VERSION=$(jq -r .version "$GAME_SRC/games_files/$GAME_ID/_core/manifest.json")

    # versionCode scheme: M*100000 + m*1000 + p*10 + version_bump
    # (premium uses bump=1 so it always installs OVER the free APK of the same release)
    BASE_CODE=$(node -p "const [M,m,p]='$GAME_VERSION'.split('.').map(Number); M*100000+m*1000+p*10")
    VERSION_CODE=$((BASE_CODE + BUMP))
    VERSION_NAME="$GAME_VERSION"
    [ -n "$SUFFIX" ] && VERSION_NAME="$GAME_VERSION-$SUFFIX"

    echo ""
    echo "── Build: $BUILD_ID ($APP_ID, \"$APP_NAME\", v$VERSION_NAME code $VERSION_CODE) ──"

    # 1. Stage web assets: engine skeleton + this build's games/mods only
    echo "Staging dist-capacitor/..."
    rm -rf dist-capacitor
    cp -r dist-web dist-capacitor
    rm -rf dist-capacitor/assets/games_files/* dist-capacitor/assets/games_assets/*
    node scripts/copy-web-games.cjs --dest=dist-capacitor/assets --android-build="$BUILD_ID"
    node scripts/generate-files-tree.cjs \
        --root=dist-capacitor/assets \
        --output=dist-capacitor/assets/files_tree.json \
        --dirs=games_files,engine_files

    # 2. App identity: config via env (cap sync reads capacitor.config.ts),
    #    strings.xml rewritten directly (sync does not regenerate it)
    export CAP_APP_ID="$APP_ID"
    export CAP_APP_NAME="$APP_NAME"
    node scripts/set-android-strings.cjs

    # 3. Launcher icon + splash. Always regenerated, never skipped: android/res/
    #    still holds the previous entry's stamps, so a build with no icon of its
    #    own would otherwise ship the other game's artwork.
    if [ -n "$ICON" ] && [ ! -f "$ICON" ]; then
        echo "⚠ Icon not found: $ICON — falling back to the engine logo"
        ICON=""
    fi
    [ -n "$ICON" ] || ICON="android-overrides/icon.png"

    echo "Generating launcher icons from $ICON..."
    rm -rf temp/cap-assets && mkdir -p temp/cap-assets
    if [ -n "$IMAGICK" ]; then
        # capacitor-assets wants >=1024px sources; pad/upscale as needed
        $IMAGICK "$ICON" -resize 1024x1024 -background none -gravity center -extent 1024x1024 temp/cap-assets/logo.png
    else
        echo "⚠ ImageMagick not found — using icon as-is (needs to be >=1024px)"
        cp "$ICON" temp/cap-assets/logo.png
    fi
    npx capacitor-assets generate --android \
        --assetPath temp/cap-assets \
        --iconBackgroundColor '#0b0d10' --iconBackgroundColorDark '#0b0d10' \
        --splashBackgroundColor '#0b0d10' --splashBackgroundColorDark '#0b0d10' >/dev/null
    rm -rf temp/cap-assets

    # 4. Sync web assets + config into the android project
    npx cap sync android

    # 5. Gradle build
    APK_SUFFIX=""
    if [ "$SIGNED" = true ]; then
        (cd android && ./gradlew assembleRelease -PappId="$APP_ID" -PversionCode="$VERSION_CODE" -PversionName="$VERSION_NAME" --quiet)
        APK_SRC="android/app/build/outputs/apk/release/app-release.apk"
    else
        (cd android && ./gradlew assembleDebug -PappId="$APP_ID" -PversionCode="$VERSION_CODE" -PversionName="$VERSION_NAME" --quiet)
        APK_SRC="android/app/build/outputs/apk/debug/app-debug.apk"
        APK_SUFFIX="-debug"
    fi

    APK_OUT="$RELEASE_ABS/${BUILD_ID}-android-v${GAME_VERSION}${APK_SUFFIX}.apk"
    cp "$APK_SRC" "$APK_OUT"
    echo "✓ Created: $APK_OUT ($(du -h "$APK_OUT" | cut -f1))"
done

rm -rf dist-capacitor

echo ""
echo "=========================================="
echo "✓ Android builds complete"
echo "=========================================="
echo "Note: these APKs are for sideload/itch/Patreon distribution."
echo "Google Play would require an AAB + Play Asset Delivery (not built here)."
