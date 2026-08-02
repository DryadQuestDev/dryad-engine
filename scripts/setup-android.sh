#!/bin/bash

# Guided first-time Android build setup for the Dryad Engine.
# Idempotent — run it again anytime; it only fixes what's missing.
# After it passes, build APKs with: ./build-capacitor.sh
#
# android/ is NOT in git — it is Capacitor scaffold plus a few engine overrides, all
# reproducible from here. Every build-capacitor.sh run also restamps its icons and
# strings.xml, so committing it would only churn one game's art into the repo.
#
# What it checks/sets up:
#   1. Java (JDK 21+)
#   2. android/ platform (npx cap add android when missing)
#   3. Android SDK location -> android/local.properties
#   4. Required SDK packages + licenses
#   5. Engine overrides (app/build.gradle, MainActivity, landscape lock)
#   6. Release signing keystore -> android/keystores/ + android/key.properties

set -e
cd "$(dirname "$0")/.."

BOLD=$(tput bold 2>/dev/null || true)
RESET=$(tput sgr0 2>/dev/null || true)

step() { echo ""; echo "${BOLD}== $1 ==${RESET}"; }
fail() { echo ""; echo "✗ $1"; echo "  Fix the above, then re-run: ./scripts/setup-android.sh"; exit 1; }

echo "=========================================="
echo "Dryad Engine — Android build setup"
echo "=========================================="

# ── 1. Java ──────────────────────────────────────────────────────────────
step "1/6 Java JDK"
if ! command -v java >/dev/null 2>&1; then
    echo "Java is missing. Install JDK 21:"
    echo "  Ubuntu/Debian: sudo apt install openjdk-21-jdk"
    echo "  Other:         https://adoptium.net/"
    fail "Java not found"
fi
JAVA_MAJOR=$(java -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/')
if [ "$JAVA_MAJOR" -lt 21 ]; then
    echo "Found Java $JAVA_MAJOR, but the Android Gradle Plugin needs 21+."
    echo "  Ubuntu/Debian: sudo apt install openjdk-21-jdk"
    echo "  Then make it default: sudo update-alternatives --config java"
    fail "Java too old"
fi
echo "✓ Java $JAVA_MAJOR"

# ── 2. Capacitor android platform ────────────────────────────────────────
step "2/6 Android platform"
if [ -d "android" ]; then
    echo "✓ android/ already present"
else
    # `cap add` runs a sync at the end, which refuses to start without webDir.
    # A real one arrives later from build-capacitor.sh; a stub is enough here.
    STUB_WEBDIR=false
    if [ ! -d "dist-capacitor" ]; then
        STUB_WEBDIR=true
        mkdir -p dist-capacitor
        echo '<!doctype html><title>placeholder</title>' > dist-capacitor/index.html
    fi

    # appId/appName come from capacitor.config.ts, which is deliberately engine-level
    # (com.dryadengine.engine) — per-game identity is stamped at build time instead.
    npx cap add android

    [ "$STUB_WEBDIR" = true ] && rm -rf dist-capacitor
    echo "✓ android/ created"
fi

# ── 3. Android SDK ───────────────────────────────────────────────────────
step "3/6 Android SDK"
SDK_DIR="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
if [ ! -d "$SDK_DIR" ]; then
    echo "No Android SDK found at: $SDK_DIR"
    echo ""
    echo "Two ways to get it:"
    echo "  a) Install Android Studio (easiest): https://developer.android.com/studio"
    echo "     It installs the SDK to ~/Android/Sdk on first launch."
    echo "  b) Command-line tools only: https://developer.android.com/studio#command-line-tools-only"
    echo "     Unzip to ~/Android/Sdk/cmdline-tools/latest/"
    echo ""
    echo "If your SDK lives elsewhere, export ANDROID_HOME=/path/to/sdk and re-run."
    fail "Android SDK not found"
fi
echo "✓ SDK found: $SDK_DIR"

# Gradle finds the SDK via android/local.properties — no env var needed at build time.
echo "sdk.dir=$SDK_DIR" > android/local.properties
echo "✓ Wrote android/local.properties"

# ── 4. SDK packages + licenses ───────────────────────────────────────────
step "4/6 SDK packages & licenses"
# Read required versions from the Capacitor-generated project (stays correct
# across Capacitor upgrades — no hardcoded API levels here).
COMPILE_SDK=$(grep -oP 'compileSdkVersion\s*=\s*\K[0-9]+' android/variables.gradle)
echo "Project needs: platform android-$COMPILE_SDK"

SDKMANAGER="$SDK_DIR/cmdline-tools/latest/bin/sdkmanager"
if [ ! -x "$SDKMANAGER" ]; then
    SDKMANAGER=$(ls "$SDK_DIR"/cmdline-tools/*/bin/sdkmanager 2>/dev/null | head -1 || true)
fi
if [ -n "$SDKMANAGER" ] && [ -x "$SDKMANAGER" ]; then
    "$SDKMANAGER" --install "platform-tools" "platforms;android-$COMPILE_SDK" >/dev/null
    echo "✓ platform-tools + android-$COMPILE_SDK installed"
    echo "Accepting licenses (answer 'y' if prompted)..."
    yes | "$SDKMANAGER" --licenses >/dev/null || true
    echo "✓ Licenses accepted"
else
    echo "⚠ sdkmanager not found under $SDK_DIR/cmdline-tools/."
    echo "  If Android Studio manages your SDK this is usually fine — gradle will"
    echo "  download missing packages, but may stop on unaccepted licenses."
    echo "  To fix licenses manually: install cmdline-tools via Android Studio's"
    echo "  SDK Manager, then re-run this script."
fi

# ── 5. Engine overrides ──────────────────────────────────────────────────
# Everything Capacitor's scaffold does NOT give us. All idempotent, so this
# is also the repair path after a platform regeneration.
step "5/6 Engine overrides"

# app/build.gradle: release signing from key.properties, plus the -PappId /
# -PversionCode / -PversionName injection build-capacitor.sh relies on to ship
# many games from one project. Copied wholesale — the rest of the file is stock.
cp android-overrides/app/build.gradle android/app/build.gradle
echo "✓ app/build.gradle overridden"

# Immersive fullscreen + WebView viewport settings (initial-scale support).
# `npx cap add android` regenerates MainActivity as an empty shell — this
# restores the engine's version whenever the marker is missing.
MAIN_ACTIVITY="android/app/src/main/java/com/dryadengine/engine/MainActivity.java"
if grep -q "hideSystemBars" "$MAIN_ACTIVITY" 2>/dev/null; then
    echo "✓ MainActivity already patched"
else
    mkdir -p "$(dirname "$MAIN_ACTIVITY")"
    cat > "$MAIN_ACTIVITY" <<'EOF'
package com.dryadengine.engine;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebSettings;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Honor the page's <meta name="viewport"> (incl. the engine's dynamic
        // initial-scale from adjustViewport()) — WebView ignores it otherwise.
        WebSettings settings = this.bridge.getWebView().getSettings();
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        // Keep layout independent of the system font-size setting
        settings.setTextZoom(100);

        // Let the game draw into the display cutout (matches viewport-fit=cover)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    // Immersive fullscreen: no status/navigation bars; swipe from edge peeks
    // them temporarily (BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE).
    private void hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
EOF
    echo "✓ MainActivity patched (fullscreen + viewport settings)"
fi

# Same for the landscape lock in the manifest (lost on platform regeneration)
if ! grep -q 'screenOrientation="sensorLandscape"' android/app/src/main/AndroidManifest.xml; then
    sed -i 's|android:configChanges="orientation|android:screenOrientation="sensorLandscape"\n            android:configChanges="orientation|' android/app/src/main/AndroidManifest.xml
    echo "✓ AndroidManifest patched (sensorLandscape lock)"
else
    echo "✓ AndroidManifest already has the landscape lock"
fi

# Capacitor ships these commented out. The repo-level .gitignore already covers
# android/, but signing material is worth a second lock.
if grep -q '^#\*\.keystore' android/.gitignore; then
    sed -i 's|^# Uncomment the following lines if you do not want to check your keystore files in.|# NEVER commit signing material (created below by this script)|; s|^#\(\*\.jks\)|\1|; s|^#\(\*\.keystore\)|\1\nkeystores/\nkey.properties|' android/.gitignore
    echo "✓ android/.gitignore hardened (keystores)"
else
    echo "✓ android/.gitignore already hardened"
fi

# ── 6. Signing keystore ──────────────────────────────────────────────────
step "6/6 Release signing keystore"
KEYSTORE_DIR="android/keystores"
KEYSTORE="$KEYSTORE_DIR/dryad-release.keystore"
KEY_PROPS="android/key.properties"

if [ -f "$KEYSTORE" ] && [ -f "$KEY_PROPS" ]; then
    echo "✓ Keystore + key.properties already present — nothing to do."
else
    echo "Creating the RELEASE SIGNING KEY. This identifies your apps forever:"
    echo "every future update must be signed with THIS key. Guard it."
    echo ""
    read -r -p "Key alias [dryad]: " KEY_ALIAS
    KEY_ALIAS=${KEY_ALIAS:-dryad}
    while true; do
        read -r -s -p "Keystore password (min 6 chars): " STORE_PASS; echo ""
        read -r -s -p "Repeat password: " STORE_PASS2; echo ""
        [ "$STORE_PASS" = "$STORE_PASS2" ] && [ ${#STORE_PASS} -ge 6 ] && break
        echo "Passwords differ or too short — try again."
    done

    mkdir -p "$KEYSTORE_DIR"
    keytool -genkeypair \
        -keystore "$KEYSTORE" \
        -alias "$KEY_ALIAS" \
        -storepass "$STORE_PASS" \
        -keypass "$STORE_PASS" \
        -keyalg RSA -keysize 2048 \
        -validity 36500 \
        -dname "CN=Dryad Engine, OU=Games, O=DryadEngine, C=US"

    cat > "$KEY_PROPS" <<EOF
storeFile=keystores/dryad-release.keystore
storePassword=$STORE_PASS
keyAlias=$KEY_ALIAS
keyPassword=$STORE_PASS
EOF
    chmod 600 "$KEY_PROPS"

    echo ""
    echo "✓ Keystore created: $KEYSTORE"
    echo "✓ Credentials written to $KEY_PROPS (gitignored, chmod 600)"
    echo ""
    echo "${BOLD}!!! BACK UP $KEYSTORE AND ITS PASSWORD NOW !!!${RESET}"
    echo "Losing them means NO future update can ever install over existing"
    echo "installs — players would have to uninstall and lose their saves."
    echo "Keep a copy outside this machine (password manager + private storage)."
fi

echo ""
echo "=========================================="
echo "✓ Android setup complete"
echo "=========================================="
echo ""
echo "Next: ./build-web.sh && ./build-capacitor.sh"
