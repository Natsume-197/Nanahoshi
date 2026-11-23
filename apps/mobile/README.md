# Nanahoshi mobile

Expo (SDK 57) app for Android and iOS. Talks to the same oRPC API as `apps/web`.

## Run it

```sh
bun install                         # from the repo root
bun run dev                         # backend (API on :7333 in development)
bun run --cwd apps/mobile start     # Metro for the Nanahoshi Dev build
```

## Development and production side by side

`bun run start`, `bun run android` and `bun run ios` build **Nanahoshi Dev**
(`app.nanahoshi.mobile.dev`, scheme `nanahoshi-dev`), a separate app that
installs next to the production one. `bun run apk` builds production
(`app.nanahoshi.mobile`); `APP_VARIANT=development bun run apk` builds the dev
app as a standalone APK. `android/` is regenerated automatically when you switch
variants (`scripts/prebuild-android.sh`), so the first build after a switch is
a full one. Each app keeps its own session, downloads and settings.

The app looks for Nanahoshi servers on the phone's Wi-Fi (ports 7331 and
7333). You can also type the address, e.g. `192.168.1.37:7333`; from the Android
emulator the host machine is `10.0.2.2:7333`.

## Releasing to Google Play

`bun run aab` builds `dist/nanahoshi-<version>-<versionCode>.aab`: production
app, all ABIs, R8, native debug symbols, signed with the **upload key**. Play
App Signing keeps the real app signing key; if the upload key is lost, Play
support can reset it.

First release: `bash scripts/play-release-wizard.sh` walks through the key, the
build and the Play Console setup step by step. By hand:

One-time, create the upload key and keep it (and its password) backed up
outside the repo:

```sh
~/Android/jdk-17/bin/keytool -genkeypair -v -keystore ~/keys/nanahoshi-upload.jks \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Then in `~/.gradle/gradle.properties` (absolute path, no `~`):

```properties
NANAHOSHI_UPLOAD_STORE_FILE=/home/<you>/keys/nanahoshi-upload.jks
NANAHOSHI_UPLOAD_STORE_PASSWORD=...
NANAHOSHI_UPLOAD_KEY_ALIAS=upload
NANAHOSHI_UPLOAD_KEY_PASSWORD=...
```

Every upload needs a higher `expo.android.versionCode` in `app.json`; bump
`expo.version` for user-visible releases. The script regenerates `android/`
so both reach the build. The `plugins/release-signing.js` config plugin wires
the key into `build.gradle`; without the properties, release builds (and
`bun run apk`) stay debug-signed and `bun run aab` refuses to run.

Cleartext HTTP stays allowed: servers are usually reached by LAN IP over
`http://`, and Android cannot scope cleartext to private IP ranges.

## Screenshots for design review (wireless ADB)

One-time setup:

1. **Phone:** Settings → About phone → tap *Build number* 7 times. Then
   Settings → System → Developer options → turn on *Wireless debugging*.
2. **Computer** (SteamOS has no package for it; the official zip needs no root):
   ```sh
   cd ~ && curl -LO https://dl.google.com/android/repository/platform-tools-latest-linux.zip
   unzip -o platform-tools-latest-linux.zip
   ```
3. On the phone, open *Wireless debugging → Pair device with pairing code*, then:
   ```sh
   ~/platform-tools/adb pair <IP>:<pairing-port>     # enter the 6-digit code
   ~/platform-tools/adb connect <IP>:<port>          # the port shown on the Wireless debugging screen
   ```

Then:

```sh
apps/mobile/scripts/screens.sh home-dark    # one named screenshot
apps/mobile/scripts/screens.sh --watch      # a fresh .screens/live.png every 3 s
```

Screenshots land in `apps/mobile/.screens/` (git-ignored).
