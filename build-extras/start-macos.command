#!/bin/bash
# macOS launcher for the Linux build.
#
# Everything here except the launcher binary is plain JavaScript, so this
# installs the macOS builds of Electron and sharp on first run, then starts the
# engine. Later runs skip straight to launching.

ELECTRON_VERSION="__ELECTRON_VERSION__"

cd "$(dirname "$0")" || exit 1

# A double-clicked .command runs without a login shell, so node installed by
# Homebrew or nvm is often missing from PATH.
if ! command -v node >/dev/null 2>&1; then
    for profile in "$HOME/.zprofile" "$HOME/.zshrc" "$HOME/.bash_profile" "$HOME/.profile"; do
        [ -f "$profile" ] && . "$profile" >/dev/null 2>&1
    done
fi
for dir in /opt/homebrew/bin /usr/local/bin; do
    [ -x "$dir/node" ] && PATH="$dir:$PATH"
done
export PATH

pause() {
    echo ""
    echo "Press Return to close this window."
    read -r _
}

echo "Dryad Engine – macOS launcher"
echo "============================="
echo ""

if ! command -v npm >/dev/null 2>&1; then
    echo "Node.js is required, and it was not found on this Mac."
    echo ""
    echo "Install the LTS version from https://nodejs.org then run this file"
    echo "again. Opening that page now..."
    open "https://nodejs.org" >/dev/null 2>&1
    pause
    exit 1
fi

if ! cd resources/app 2>/dev/null; then
    echo "Expected a resources/app folder next to this file."
    echo ""
    echo "Keep start-macos.command inside the folder you unzipped, alongside"
    echo "index.html and the assets folder."
    pause
    exit 1
fi

case "$(uname -m)" in
    x86_64) SHARP_ARCH="x64" ;;
    *)      SHARP_ARCH="arm64" ;;
esac

if [ ! -d "node_modules/electron" ]; then
    echo "First run – installing Electron $ELECTRON_VERSION for macOS."
    echo "This downloads a few hundred megabytes and takes a few minutes."
    echo ""
    if ! npm install --save-dev "electron@${ELECTRON_VERSION}"; then
        echo ""
        echo "Electron failed to install. Check your internet connection and"
        echo "run this file again."
        pause
        exit 1
    fi
    echo ""
fi

if [ ! -d "node_modules/@img/sharp-darwin-${SHARP_ARCH}" ]; then
    echo "Installing image support for macOS ($SHARP_ARCH)..."
    echo ""
    if ! npm install sharp; then
        echo ""
        echo "Image support failed to install. Check your internet connection"
        echo "and run this file again."
        pause
        exit 1
    fi
    echo ""
fi

echo "Starting – keep this window open while you play."
echo ""
npx electron . || pause
