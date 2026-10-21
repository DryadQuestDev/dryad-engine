#!/bin/bash
# Upload release builds to Cloudflare R2 for dryadengine.com/download.
#
# Run after prepare-public.sh. Without -u nothing is sent: the script lists
# every file it would upload with its size and SHA-256. With -u it uploads the
# files, checks each one's size in the bucket, then writes
# <product>/<version>/release.json LAST, so a half-finished upload never looks
# complete. Then it deploys the website (../dryad-engine-website/deploy.sh –
# the web builds prepare-public.sh put there go live at /play and
# /play_premium), waits for the site to answer again, and finally publishes
# each release on the site (POST /api/downloads/publish with the RELEASE_PUBLISH_TOKEN from the
# website's .env), which makes it the version every /dl/ link serves and hides
# the previous one. --no-deploy skips the website deploy; --no-publish stops
# after the upload, and Admin → Downloads → Publish makes it live later.
#
# Products:
#   <game>   every "standalone_release" game in web-game-list.json, versioned by
#            its _core manifest: free + premium desktop zips, premium mod zips,
#            and the APKs android-build-list.json builds for it
#   engine   the bare engine zips, versioned by package.json
#   legacy   any folder of old builds, with --legacy (see usage)
#
# Needs rclone with an "r2" remote (~/.config/rclone/rclone.conf). Override with
# R2_REMOTE / R2_BUCKET, the site with SITE_URL, the token with
# RELEASE_PUBLISH_TOKEN (default: read from ../dryad-engine-website/.env), the
# deploy step with DEPLOY_CMD (default: ../dryad-engine-website/deploy.sh).

set -euo pipefail

usage() {
    cat <<'EOF'
Usage: ./publish-release.sh [-u] [options]

  (no flags)          dry run: list what would be uploaded
  -u, --upload        upload for real, deploy the website (/play and
                      /play_premium), then publish the releases on the site
  --no-deploy         with -u: skip the website deploy
  --no-publish        with -u: upload only; publish later in Admin → Downloads
  --game <id>         only this game (default: every standalone_release game)
  --no-engine         skip the bare engine zips
  --engine-only       only the bare engine zips
  --allow-debug       accept debug-signed APKs (*-debug.apk)
  --legacy <dir> --product <id> --version <v> [--title "<title>"] [--nsfw]
                      upload a folder of old builds as their own product;
                      platform is read from each file name (win, linux, mac, apk);
                      --nsfw tags it 18+ on the download page (games take
                      the flag from their manifest's "nsfw")
  --list              show what is in the bucket
  --delete <product>/<version>
                      with -u: unpublish that version on the site, then remove
                      its files from the bucket; repeat for several versions.
                      A live version is refused – Roll back in Admin first.
                      Add --no-publish to only delete the files.
  -h, --help          this text
EOF
}

UPLOAD=false
PUBLISH=true
DEPLOY=true
ONLY_GAME=""
WITH_GAMES=true
WITH_ENGINE=true
ALLOW_DEBUG=false
LEGACY_DIR=""
LEGACY_PRODUCT=""
LEGACY_VERSION=""
LEGACY_TITLE=""
LEGACY_NSFW=false
LIST=false
DELETES=()

while [ $# -gt 0 ]; do
    case "$1" in
        -u|--upload) UPLOAD=true ;;
        --no-publish) PUBLISH=false ;;
        --no-deploy) DEPLOY=false ;;
        --game) ONLY_GAME="${2:?--game needs an id}"; shift ;;
        --no-engine) WITH_ENGINE=false ;;
        --engine-only) WITH_GAMES=false ;;
        --allow-debug) ALLOW_DEBUG=true ;;
        --legacy) LEGACY_DIR="${2:?--legacy needs a folder}"; shift ;;
        --product) LEGACY_PRODUCT="${2:?--product needs an id}"; shift ;;
        --version) LEGACY_VERSION="${2:?--version needs a value}"; shift ;;
        --title) LEGACY_TITLE="${2:?--title needs a value}"; shift ;;
        --nsfw) LEGACY_NSFW=true ;;
        --list) LIST=true ;;
        --delete) DELETES+=("${2:?--delete needs <product>/<version>}"); shift ;;
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

SITE_URL="${SITE_URL:-https://dryadengine.com}"
WEBSITE_DIR="${WEBSITE_DIR:-../dryad-engine-website}"
WEBSITE_ENV="${WEBSITE_ENV:-$WEBSITE_DIR/.env}"
DEPLOY_CMD="${DEPLOY_CMD:-./deploy.sh}"
PUBLISH_TOKEN="${RELEASE_PUBLISH_TOKEN:-}"
if [ -z "$PUBLISH_TOKEN" ] && [ -f "$WEBSITE_ENV" ]; then
    PUBLISH_TOKEN=$(grep -E '^RELEASE_PUBLISH_TOKEN=' "$WEBSITE_ENV" | head -1 | cut -d= -f2- | tr -d "\"'" || true)
fi

# wait_for_site – after deploy.sh, PM2 reports the new server "online" before Nuxt is
# listening, and nginx answers 502 until it is. Poll the download page until it is back.
wait_for_site() {
    local code i
    for i in $(seq 1 60); do
        code=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$SITE_URL/download" || true)
        if [ "$code" = 200 ]; then
            if [ "$i" -gt 1 ]; then echo "  ✓ $SITE_URL is back"; fi
            return 0
        fi
        if [ "$i" = 1 ]; then echo "Waiting for $SITE_URL to come back after the deploy …"; fi
        sleep 3
    done
    echo "  ⚠ $SITE_URL still answers $code after 3 minutes – publishing anyway"
}

# publish_release <bucket key of release.json> – the same step as Admin → Publish.
# The token goes in through a file descriptor, never on curl's command line.
publish_release() {
    local key=$1 resp code body attempt
    for attempt in 1 2 3 4 5 6; do
        code=000
        if resp=$(curl -sS -m 120 -w '\n%{http_code}' -X POST "$SITE_URL/api/downloads/publish" \
                -H @<(printf 'Authorization: Bearer %s\n' "$PUBLISH_TOKEN") \
                -H 'Content-Type: application/json' -d "{\"key\":\"$key\"}" 2>&1); then
            code=$(tail -n1 <<< "$resp")
        fi
        # No answer, or an nginx gateway error while the site restarts. Publishing a version
        # again only rewrites its record, so sending the request again is safe.
        case "$code" in
            000|502|503|504)
                if [ "$attempt" -lt 6 ]; then
                    echo "  … $SITE_URL answered ${code/#000/nothing}, retrying in 10 s"
                    sleep 10
                    continue
                fi ;;
        esac
        break
    done
    if [ "$code" = 000 ]; then
        echo "  ⚠ Could not reach $SITE_URL ($(sed '$d' <<< "$resp")) – publish it in Admin → Downloads"
        PUBLISH_FAILED+=("${key%/release.json}")
        return
    fi
    body=$(sed '$d' <<< "$resp")
    if [ "$code" = 200 ]; then
        if [ "$(jq -r .startedHidden <<< "$body")" = true ]; then
            echo "  ✓ published as hidden – a newer version of this product is live"
        else
            local hid
            hid=$(jq -r '.hidden | join(", ")' <<< "$body")
            echo "  ✓ live on $SITE_URL/download$( [ -n "$hid" ] && echo " (previous $hid hidden – Roll back in Admin → Downloads)" )"
        fi
        PUBLISHED+=("${key%/release.json}")
    else
        echo "  ⚠ Publish failed (HTTP $code): $(jq -r '.error // .' <<< "$body" 2>/dev/null || echo "$body")"
        jq -r '.problems[]? | "      – " + .' <<< "$body" 2>/dev/null || true
        echo "    The upload is complete – fix and press Publish in Admin → Downloads."
        PUBLISH_FAILED+=("${key%/release.json}")
    fi
}
PUBLISHED=()
PUBLISH_FAILED=()

# unpublish_release <product>/<version> – the same step as the trash button in Admin → Downloads.
# Fails when the version has to keep its files: it is still live, or the site gave no answer.
unpublish_release() {
    local product=${1%%/*} version=${1#*/} resp code body
    code=000
    if resp=$(curl -sS -m 60 -w '\n%{http_code}' -X POST "$SITE_URL/api/downloads/unpublish" \
            -H @<(printf 'Authorization: Bearer %s\n' "$PUBLISH_TOKEN") \
            -H 'Content-Type: application/json' \
            -d "{\"product\":\"$product\",\"version\":\"$version\"}" 2>&1); then
        code=$(tail -n1 <<< "$resp")
    fi
    body=$(sed '$d' <<< "$resp")
    case "$code" in
        200)
            if [ "$(jq -r .removed <<< "$body" 2>/dev/null)" = true ]; then
                echo "  ✓ unpublished on $SITE_URL"
            else
                echo "  ✓ was not published on $SITE_URL"
            fi
            return 0 ;;
        000) echo "  ⚠ Could not reach $SITE_URL ($body)" ;;
        *)   echo "  ⚠ Unpublish failed (HTTP $code): $(jq -r 'if (.error | type) == "string" then .error else (.message // .) end' <<< "$body" 2>/dev/null || echo "$body")"
             if [ "$code" = 404 ]; then
                 echo "    A site deployed before /api/downloads/unpublish existed answers 404 – deploy it,"
                 echo "    or unpublish in Admin → Downloads and add --no-publish."
             fi ;;
    esac
    return 1
}

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
if [ ${#DELETES[@]} -gt 0 ]; then
    for target in "${DELETES[@]}"; do
        if ! [[ "$target" =~ ^[a-z0-9][a-z0-9_-]*/[A-Za-z0-9._+-]+$ ]]; then
            echo "Error: --delete takes <product>/<version>, e.g. dryad_tale/0.20.0 (got \"$target\")"
            exit 1
        fi
    done
    if [ "$UPLOAD" = true ] && [ "$PUBLISH" = true ] && [ -z "$PUBLISH_TOKEN" ]; then
        echo "Error: no publish token – set RELEASE_PUBLISH_TOKEN in $WEBSITE_ENV, or unpublish"
        echo "in Admin → Downloads and add --no-publish to only delete the files."
        exit 1
    fi
    KEPT=()
    for target in "${DELETES[@]}"; do
        echo "$target:"
        listing=$(rclone lsl "$DEST/$target" 2>/dev/null || true)
        if [ -n "$listing" ]; then
            sed 's/^/    /' <<< "$listing"
        else
            echo "    (no files in the bucket)"
        fi
        [ "$UPLOAD" = true ] || continue
        if [ "$PUBLISH" = true ] && ! unpublish_release "$target"; then
            echo "  ✗ kept its files"
            KEPT+=("$target")
            continue
        fi
        if [ -n "$listing" ]; then
            rclone delete "$DEST/$target"
            echo "  ✓ deleted its files"
        fi
    done
    echo ""
    if [ "$UPLOAD" != true ]; then
        if [ "$PUBLISH" = true ]; then
            echo "Dry run – add -u to unpublish these on $SITE_URL and delete their files."
        else
            echo "Dry run – add -u to delete these files (unpublish them in Admin → Downloads first,"
            echo "or their /dl/ links will start failing)."
        fi
        exit 0
    fi
    if [ ${#KEPT[@]} -gt 0 ]; then
        echo "Not deleted: ${KEPT[*]}"
        exit 2
    fi
    echo "✓ Done"
    exit 0
fi

if [ "$UPLOAD" = true ] && [ "$PUBLISH" = true ] && [ -z "$PUBLISH_TOKEN" ]; then
    echo "Error: no publish token – set RELEASE_PUBLISH_TOKEN in $WEBSITE_ENV (and deploy the site),"
    echo "or add --no-publish to upload only and publish in Admin → Downloads."
    exit 1
fi

# ── Collect the plan ─────────────────────────────────────────────────────────
# One TSV row per file: product, version, title, kind, nsfw, id, platform, premium, variant, path
PLAN=$(mktemp)
trap 'rm -f "$PLAN" "$PLAN".*' EXIT
MISSING=()

# NSFW is per product, so it rides along in a variable the caller sets.
NSFW=false
add_file() {
    local product=$1 version=$2 title=$3 kind=$4 id=$5 platform=$6 premium=$7 variant=$8 path=$9
    if [ -f "$path" ]; then
        printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
            "$product" "$version" "$title" "$kind" "$NSFW" "$id" "$platform" "$premium" "$variant" "$path" >> "$PLAN"
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
    DEPLOY=false
    [ -d "$LEGACY_DIR" ] || { echo "Error: $LEGACY_DIR is not a folder"; exit 1; }
    [[ "$LEGACY_PRODUCT" =~ $SLUG_RE ]] || { echo "Error: --legacy needs --product <id> (lowercase, digits, - and _)"; exit 1; }
    [ -n "$LEGACY_VERSION" ] || { echo "Error: --legacy needs --version"; exit 1; }
    NSFW=$LEGACY_NSFW
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
        NSFW=$(jq -r 'if .nsfw == true then "true" else "false" end' "$manifest")
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
    NSFW=false
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

dupes=$(cut -f1,2,6 "$PLAN" | sort | uniq -d)
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
    IS_NSFW=$(head -1 "$ROWS" | cut -f5)

    echo "══ $TITLE  ($PREFIX, $KIND$( [ "$IS_NSFW" = true ] && echo ", 18+" )) ══"
    if rclone lsf "$DEST/$PREFIX/" 2>/dev/null | grep -qx release.json; then
        if [ "$PUBLISH" = true ]; then
            echo "⚠ Already in the bucket – uploading replaces it, and publishing refreshes the site's copy."
        else
            echo "⚠ Already in the bucket – uploading replaces it; press Update in Admin → Downloads afterwards."
        fi
    fi

    FILES_JSON="$PLAN.$PRODUCT.files"
    : > "$FILES_JSON"
    TOTAL=0
    while IFS=$'\t' read -r _ _ _ _ _ ID PLATFORM PREMIUM VARIANT FILE; do
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
              --argjson nsfw "$IS_NSFW" --arg uploadedAt "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" \
              '{format: 1, product: $product, version: $version, title: $title, kind: $kind, nsfw: $nsfw,
                uploadedAt: $uploadedAt, files: map(del(._path))}' "$FILES_JSON" > "$MANIFEST"
        rclone copyto "$MANIFEST" "$DEST/$PREFIX/release.json"
        echo "  ✓ $PREFIX/release.json"
        UPLOADED+=("$PREFIX")
    fi
    echo ""
done <<< "$RELEASES"

# ── Deploy the website: /play and /play_premium ───────────────────────────────
# nginx hands /play to the Nuxt server, which serves it from the asset list baked
# in at build time, so new web builds need a full site build – deploy.sh.
DEPLOY_FAILED=false
if [ "$UPLOAD" = true ] && [ "$DEPLOY" = true ] && [ ${#UPLOADED[@]} -gt 0 ]; then
    # The web builds deploy.sh ships are whatever prepare-public.sh last put in the
    # website folder; say so if they don't match the releases just uploaded.
    for PREFIX in "${UPLOADED[@]}"; do
        G=${PREFIX%%/*}
        V=${PREFIX#*/}
        for DIR in public/play premium_games; do
            WEB_MANIFEST="$WEBSITE_DIR/$DIR/assets/games_files/$G/_core/manifest.json"
            [ -f "$WEB_MANIFEST" ] || continue
            WEB_V=$(jq -r .version "$WEB_MANIFEST")
            if [ "$WEB_V" != "$V" ]; then
                echo "⚠ $DIR has $G $WEB_V, the release is $V – prepare-public.sh (without --public-only) rebuilds it."
            fi
        done
    done
    echo "Deploying the website (/play, /play_premium) with $DEPLOY_CMD …"
    if (cd "$WEBSITE_DIR" && $DEPLOY_CMD) > "$RELEASE_DIR/deploy.log" 2>&1; then
        echo "  ✓ website deployed (log: $RELEASE_DIR/deploy.log)"
    else
        DEPLOY_FAILED=true
        echo "  ⚠ Deploy failed – last lines of $RELEASE_DIR/deploy.log:"
        tail -n 8 "$RELEASE_DIR/deploy.log" | sed 's/^/      /'
        echo "    Fix it and run ./deploy.sh in $WEBSITE_DIR."
    fi
    echo ""
fi

# ── Publish: the uploaded versions go live on the download page ─────────────────
if [ "$UPLOAD" = true ] && [ "$PUBLISH" = true ]; then
    if [ "$DEPLOY" = true ] && [ ${#UPLOADED[@]} -gt 0 ]; then
        wait_for_site
    fi
    for PREFIX in "${UPLOADED[@]}"; do
        echo "Publishing $PREFIX …"
        publish_release "$PREFIX/release.json"
    done
    echo ""
fi

if [ "$UPLOAD" = true ]; then
    echo "Uploaded: ${UPLOADED[*]}"
    if [ "$DEPLOY_FAILED" = true ]; then echo "Website deploy FAILED – /play and /play_premium are not updated."; fi
    if [ "$PUBLISH" = false ]; then
        echo "Not published (--no-publish): $SITE_URL/admin/downloads → Publish makes it live."
    else
        if [ ${#PUBLISHED[@]} -gt 0 ]; then echo "Published: ${PUBLISHED[*]} – $SITE_URL/download"; fi
        if [ ${#PUBLISH_FAILED[@]} -gt 0 ]; then
            echo "NOT published: ${PUBLISH_FAILED[*]} – press Publish in $SITE_URL/admin/downloads"
            exit 2
        fi
    fi
    if [ "$DEPLOY_FAILED" = true ]; then exit 2; fi
else
    STEPS="upload"
    if [ "$DEPLOY" = true ]; then STEPS="$STEPS, deploy the website (/play, /play_premium)"; fi
    if [ "$PUBLISH" = true ]; then STEPS="$STEPS, publish on the download page"; fi
    echo "Dry run – nothing was uploaded. Add -u to $STEPS."
fi
