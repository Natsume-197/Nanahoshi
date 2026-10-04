# Nanahoshi mobile

Expo (SDK 57) app for Android and iOS. Talks to the same oRPC API as `apps/web`.

## Run it

```sh
bun install                         # from the repo root
bun run dev                         # backend (API on :7333 in development)
bun run --cwd apps/mobile start     # Metro; scan the QR code with Expo Go
```

The app looks for Nanahoshi servers on the phone's Wi-Fi (ports 7331 and
7333). You can also type the address, e.g. `192.168.1.37:7333`; from the Android
emulator the host machine is `10.0.2.2:7333`.

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
