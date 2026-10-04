#!/bin/bash
# Upload release builds to Cloudflare R2 for dryadengine.com/download.
#
# Run after prepare-public.sh. Without -u nothing is sent: the script lists
# every file it would upload with its size and SHA-256. With -u it uploads the
# files, checks each one's size in the bucket, then writes
# <product>/<version>/release.json LAST, so a half-finished upload never looks
# complete. Uploaded versions stay invisible to players until they are
# published in the website's Admin → Downloads tab.
#
# Products:
#   <game>   every "standalone_release" game in web-game-list.json, versioned by
#            its _core manifest: free + premium desktop zips, premium mod zips,
#            and the APKs android-build-list.json builds for it
#   engine   the bare engine zips, versioned by package.json
#   legacy   any folder of old builds, with --legacy (see usage)
#
# Needs rclone with an "r2" remote (~/.config/rclone/rclone.conf). Override with
# R2_REMOTE / R2_BUCKET.

set -euo pipefail

usage() {
    cat <<'EOF'
Usage: ./publish-release.sh [-u] [options]

  (no flags)          dry run: list what would be uploaded
  -u, --upload        upload for real
  --game <id>         only this game (default: every standalone_release game)
  --no-engine         skip the bare engine zips
  --engine-only       only the bare engine zips
  --allow-debug       accept debug-signed APKs (*-debug.apk)
  --legacy <dir> --product <id> --version <v> [--title "<title>"]
                      upload a folder of old builds as their own product;
                      platform is read from each file name (win, linux, mac, apk)
  --list              show what is in the bucket
  --delete <product>/<version>
                      remove that version's files from the bucket (with -u;
                      unpublish it in Admin → Downloads first)
  -h, --help          this text
EOF
}

UPLOAD=false
ONLY_GAME=""
WITH_GAMES=true
WITH_ENGINE=true
ALLOW_DEBUG=false
LEGACY_DIR=""
LEGACY_PRODUCT=""
LEGACY_VERSION=""
LEGACY_TITLE=""
LIST=false
DELETE=""

while [ $# -gt 0 ]; do
    case "$1" in
        -u|--upload) UPLOAD=true ;;
        --game) ONLY_GAME="${2:?--game needs an id}"; shift ;;
        --no-engine) WITH_ENGINE=false ;;
        --engine-only) WITH_GAMES=false ;;
        --allow-debug) ALLOW_DEBUG=true ;;
        --legacy) LEGACY_DIR="${2:?--legacy needs a folder}"; shift ;;
        --product) LEGACY_PRODUCT="${2:?--product needs an id}"; shift ;;
        --version) LEGACY_VERSION="${2:?--version needs a value}"; shift ;;
        --title) LEGACY_TITLE="${2:?--title needs a value}"; shift ;;
        --list) LIST=true ;;
        --delete) DELETE="${2:?--delete needs <product>/<version>}"; shift ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown argument: $1"; echo; usage; exit 1 ;;
    esac
    shift
done

cd "$(dirname "$0")"

R2_REMOTE="${R2_REMOTE:-r2}"
R2_BUCKET="${R2_BUCKET:-dryad-releases}"
DEST="$R2_REMOTE:$R2_BUCKET"
RELEASE_DIR="${RELEASE_DIR:-../dryad-engine-release}"
NAME=$(node -p "require('./package.json').name")
ENGINE_VERSION=$(node -p "require('./package.json').version")
SLUG_RE='^[a-z0-9][a-z0-9_-]*$'

for tool in rclone jq sha256sum; do
    command -v "$tool" >/dev/null || { echo "Error: $tool is not installed"; exit 1; }
done
if ! rclone listremotes | grep -qx "$R2_REMOTE:"; then
    echo "Error: rclone has no \"$R2_REMOTE\" remote (rclone config)"
    exit 1
fi

human() { numfmt --to=si --suffix=B --format='%.2f' "$1"; }

# ── --list ───────────────────────────────────────────────────────────────────
if [ "$LIST" = true ]; then
    echo "Bucket $DEST:"
    found=false
    while IFS= read -r manifest; do
        found=true
        dir="${manifest%/release.json}"
        info=$(rclone cat "$DEST/$manifest" | jq -r '"\(.title) – \(.files | length) files, uploaded \(.uploadedAt)"')
        bytes=$(rclone size --json "$DEST/$dir" | jq -r .bytes)
        printf "  %-32s %10s  %s\n" "$dir" "$(human "$bytes")" "$info"
    done < <(rclone lsf -R --files-only --include "*/release.json" "$DEST")
    [ "$found" = true ] || echo "  (no releases)"
    exit 0
fi

# ── --delete ─────────────────────────────────────────────────────────────────
if [ -n "$DELETE" ]; then
    if ! [[ "$DELETE" =~ ^[a-z0-9][a-z0-9_-]*/[A-Za-z0-9._+-]+$ ]]; then
        echo "Error: --delete takes <product>/<version>, e.g. dryad_tale/0.20.0"
        exit 1
    fi
    echo "Files under $DEST/$DELETE:"
    rclone lsl "$DEST/$DELETE" | sed 's/^/  /'
    if [ "$UPLOAD" != true ]; then
        echo ""
        echo "Dry run – add -u to delete them. Unpublish the version in Admin → Downloads first,"
        echo "or its /dl/ links will start failing."
        exit 0
    fi
    rclone delete "$DEST/$DELETE"
    echo "✓ Deleted $DELETE"
    exit 0
fi

# ── Collect the plan ─────────────────────────────────────────────────────────
# One TSV row per file: product, version, title, kind, id, platform, premium, variant, path
PLAN=$(mktemp)
trap 'rm -f "$PLAN" "$PLAN".*' EXIT
MISSING=()

add_file() {
    local product=$1 version=$2 title=$3 kind=$4 id=$5 platform=$6 premium=$7 variant=$8 path=$9
    if [ -f "$path" ]; then
        printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
            "$product" "$version" "$title" "$kind" "$id" "$platform" "$premium" "$variant" "$path" >> "$PLAN"
    else
        MISSING+=("$path")
    fi
}

# add_apk <product> <version> <title> <id> <release subfolder> <build id>
add_apk() {
    local apk="$RELEASE_DIR/$5/$6-android-v$2.apk"
    if [ ! -f "$apk" ] && [ "$ALLOW_DEBUG" = true ] && [ -f "${apk%.apk}-debug.apk" ]; then
        apk="${apk%.apk}-debug.apk"
    elif [ ! -f "$apk" ] && [ -f "${apk%.apk}-debug.apk" ]; then
        echo "⚠ Only a debug APK exists for $6 v$2 – skipped (--allow-debug to take it)"
        return
    fi
    add_file "$1" "$2" "$3" game "$4" android "$( [ "$5" = premium ] && echo true || echo false )" full "$apk"
}

if [ -n "$LEGACY_DIR" ]; then
    WITH_GAMES=false
    WITH_ENGINE=false
    [ -d "$LEGACY_DIR" ] || { echo "Error: $LEGACY_DIR is not a folder"; exit 1; }
    [[ "$LEGACY_PRODUCT" =~ $SLUG_RE ]] || { echo "Error: --legacy needs --product <id> (lowercase, digits, - and _)"; exit 1; }
    [ -n "$LEGACY_VERSION" ] || { echo "Error: --legacy needs --version"; exit 1; }
    shopt -s nullglob
    for path in "$LEGACY_DIR"/*; do
        [ -f "$path" ] || continue
        base=$(basename "$path")
        lower=${base,,}
        case "$lower" in .*|release.json) continue ;; esac
        platform=any
        # darwin before win: "darwin" contains "win".
        if [[ "$lower" == *.apk || "$lower" == *android* ]]; then platform=android
        elif [[ "$lower" == *linux* && ( "$lower" == *mac* || "$lower" == *osx* ) ]]; then platform=linux-mac
        elif [[ "$lower" == *linux* ]]; then platform=linux
        elif [[ "$lower" == *mac* || "$lower" == *osx* || "$lower" == *darwin* ]]; then platform=mac
        elif [[ "$lower" == *win* ]]; then platform=windows
        fi
        premium=false
        [[ "$lower" == *premium* || "$lower" == *patron* ]] && premium=true
        id=$platform
        [ "$premium" = true ] && id="premium-$platform"
        add_file "$LEGACY_PRODUCT" "$LEGACY_VERSION" "${LEGACY_TITLE:-$LEGACY_PRODUCT}" legacy "$id" "$platform" "$premium" full "$path"
    done
    shopt -u nullglob
fi

if [ "$WITH_GAMES" = true ]; then
    if [ -n "$ONLY_GAME" ]; then
        GAMES="$ONLY_GAME"
        WITH_ENGINE=false
    else
        GAMES=$(jq -r '.[] | select(.standalone_release) | .id' web-game-list.json)
    fi
    for G in $GAMES; do
        manifest="production/${NAME}-linux/assets/games_files/$G/_core/manifest.json"
        [ -f "$manifest" ] || { echo "Error: no manifest for $G ($manifest)"; exit 1; }
        V=$(jq -r .version "$manifest")
        T=$(jq -r --arg g "$G" '.name // $g' "$manifest")
        add_file "$G" "$V" "$T" game windows windows false full "$RELEASE_DIR/public/$G-windows-v$V.zip"
        add_file "$G" "$V" "$T" game linux-mac linux-mac false full "$RELEASE_DIR/public/$G-linux+mac-v$V.zip"
        MODS=$(jq -r --arg g "$G" '.[] | select(.id == $g) | .premium_mods[]?' web-game-list.json)
        if [ -n "$MODS" ]; then
            add_file "$G" "$V" "$T" game premium-windows windows true full "$RELEASE_DIR/premium/$G-windows-premium-v$V.zip"
            add_file "$G" "$V" "$T" game premium-linux-mac linux-mac true full "$RELEASE_DIR/premium/$G-linux+mac-premium-v$V.zip"
            for MOD in $MODS; do
                add_file "$G" "$V" "$T" game "$MOD-mod" any true mod "$RELEASE_DIR/premium/$G-$MOD-mod-v$V.zip"
            done
        fi
        while IFS=$'\t' read -r BUILD IS_PREMIUM; do
            [ -n "$BUILD" ] || continue
            if [ "$IS_PREMIUM" = true ]; then
                add_apk "$G" "$V" "$T" premium-android premium "$BUILD"
            else
                add_apk "$G" "$V" "$T" android public "$BUILD"
            fi
        done < <(jq -r --arg g "$G" '.[] | select((.skip | not) and .games[0].id == $g) | "\(.id)\t\(.premium // false)"' android-build-list.json)
    done
fi

if [ "$WITH_ENGINE" = true ]; then
    add_file engine "$ENGINE_VERSION" "Dryad Engine" engine windows windows false full "$RELEASE_DIR/engine/$NAME-windows-v$ENGINE_VERSION.zip"
    add_file engine "$ENGINE_VERSION" "Dryad Engine" engine linux-mac linux-mac false full "$RELEASE_DIR/engine/$NAME-linux+mac-v$ENGINE_VERSION.zip"
fi

if [ ${#MISSING[@]} -gt 0 ]; then
    echo "Not found (skipped):"
    printf '  %s\n' "${MISSING[@]}"
    echo ""
fi
if [ ! -s "$PLAN" ]; then
    echo "Nothing to upload. Run ./prepare-public.sh first, or check $RELEASE_DIR."
    exit 1
fi

dupes=$(cut -f1,2,5 "$PLAN" | sort | uniq -d)
if [ -n "$dupes" ]; then
    echo "Error: two files would get the same id (rename one):"
    echo "$dupes" | sed 's/^/  /'
    exit 1
fi

# ── Per release: hash, show, upload ──────────────────────────────────────────
UPLOADED=()
RELEASES=$(cut -f1,2 "$PLAN" | sort -u)
while IFS=$'\t' read -r PRODUCT VERSION; do
    [[ "$PRODUCT" =~ $SLUG_RE ]] || { echo "Error: bad product id \"$PRODUCT\""; exit 1; }
    [[ "$VERSION" =~ ^[A-Za-z0-9._+-]+$ ]] || { echo "Error: bad version \"$VERSION\""; exit 1; }
    PREFIX="$PRODUCT/$VERSION"
    ROWS="$PLAN.$PRODUCT"
    awk -F'\t' -v p="$PRODUCT" -v v="$VERSION" '$1 == p && $2 == v' "$PLAN" > "$ROWS"
    TITLE=$(head -1 "$ROWS" | cut -f3)
    KIND=$(head -1 "$ROWS" | cut -f4)

    echo "══ $TITLE  ($PREFIX, $KIND) ══"
    if rclone lsf "$DEST/$PREFIX/" 2>/dev/null | grep -qx release.json; then
        echo "⚠ Already in the bucket – uploading replaces it; press Update in Admin → Downloads afterwards."
    fi

    FILES_JSON="$PLAN.$PRODUCT.files"
    : > "$FILES_JSON"
    TOTAL=0
    while IFS=$'\t' read -r _ _ _ _ ID PLATFORM PREMIUM VARIANT FILE; do
        NAME_OUT=$(basename "$FILE" | tr '+' '-')
        SIZE=$(stat -c %s "$FILE")
        SHA=$(sha256sum "$FILE" | cut -d' ' -f1)
        TOTAL=$((TOTAL + SIZE))
        printf "  %-20s %10s  %s…  %s\n" "$ID" "$(human "$SIZE")" "${SHA:0:12}" "$(basename "$FILE")"
        jq -n --arg id "$ID" --arg key "$PREFIX/$NAME_OUT" --arg name "$NAME_OUT" --arg platform "$PLATFORM" \
              --argjson premium "$PREMIUM" --arg variant "$VARIANT" --argjson size "$SIZE" --arg sha256 "$SHA" \
              --arg path "$FILE" \
              '{id: $id, key: $key, name: $name, platform: $platform, premium: $premium, variant: $variant, size: $size, sha256: $sha256, _path: $path}' \
              >> "$FILES_JSON"
    done < "$ROWS"
    echo "  total $(human "$TOTAL")"

    if [ "$UPLOAD" = true ]; then
        while IFS= read -r f; do
            src=$(jq -r ._path <<< "$f")
            key=$(jq -r .key <<< "$f")
            size=$(jq -r .size <<< "$f")
            echo "  ↑ $key"
            rclone copyto "$src" "$DEST/$key" --s3-chunk-size 64M --s3-upload-concurrency 4 --retries 3 --stats-one-line -P
            remote=$(rclone lsjson "$DEST/$key" | jq -r '.[0].Size // -1')
            if [ "$remote" != "$size" ]; then
                echo "Error: $key is $remote bytes in the bucket, $size here – stopping before release.json"
                exit 1
            fi
        done < <(jq -c . "$FILES_JSON")

        MANIFEST="$PLAN.$PRODUCT.manifest"
        jq -s --arg product "$PRODUCT" --arg version "$VERSION" --arg title "$TITLE" --arg kind "$KIND" \
              --arg uploadedAt "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
              '{format: 1, product: $product, version: $version, title: $title, kind: $kind, uploadedAt: $uploadedAt,
                files: map(del(._path))}' "$FILES_JSON" > "$MANIFEST"
        rclone copyto "$MANIFEST" "$DEST/$PREFIX/release.json"
        echo "  ✓ $PREFIX/release.json"
        UPLOADED+=("$PREFIX")
    fi
    echo ""
done <<< "$RELEASES"

if [ "$UPLOAD" = true ]; then
    echo "Uploaded: ${UPLOADED[*]}"
    echo "Next: dryadengine.com/admin/downloads → Publish (it stays invisible until then)."
else
    echo "Dry run – nothing was uploaded. Add -u to upload."
fi
