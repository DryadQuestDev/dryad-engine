# android-overrides

`android/` is not in git. It is Capacitor scaffold (`npx cap add android`) plus the few
engine-owned pieces kept here, and `scripts/setup-android.sh` reproduces the whole thing.

Committing `android/` would also commit whichever game built last: every `build-capacitor.sh`
run restamps `res/values/strings.xml` and ~48 icon/splash PNGs for the entry it is building.

| File | Why it is not stock |
|------|---------------------|
| `app/build.gradle` | Release signing from `key.properties`, plus the `-PappId` / `-PversionCode` / `-PversionName` injection that lets one project ship every entry in `android-build-list.json`. |
| `icon.png` | Launcher/splash source for entries that declare no `icon`. Without it those builds would inherit the previous entry's artwork. |

Two more overrides live in `setup-android.sh` itself, as idempotent patches:
`MainActivity.java` (immersive fullscreen + WebView viewport) and the `sensorLandscape`
lock in `AndroidManifest.xml`.

Package identity is engine-level (`com.dryadengine.engine`, from `capacitor.config.ts`) —
the shipped `applicationId` comes per build from `android-build-list.json`.
