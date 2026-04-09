#!/bin/bash

# Build Capacitor app from web build
# Requires: dist-web/ to exist (run build-web.sh first)

set -e

echo "=========================================="
echo "Building Capacitor (stub)"
echo "=========================================="

if [ ! -d "dist-web" ]; then
    echo "Error: dist-web/ not found. Run build-web.sh first."
    exit 1
fi

# TODO: Actual Capacitor build steps:
# - npx cap sync android
# - npx cap build android
echo "Capacitor build not yet implemented. Skipping."
echo "=========================================="
