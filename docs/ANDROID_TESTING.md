# Android build and testing

Use Node 24, npm, JDK 21, Android SDK platform 36, build-tools 36.0.0,
and platform-tools. Select Java per shell; do not replace system Java.
Accept SDK licenses through the Android SDK Manager before building.

## Checks and debug APK

```sh
npm ci
npm run lint
npm run typecheck
npm run test:physics
npm run test:multitouch
npm run test:performance
npm run test:hop
npm run test:skins
node --experimental-strip-types scripts/verify-mobile-model.mjs
node --experimental-strip-types scripts/verify-hop-input.mjs --mobile

export JAVA_HOME=/path/to/jdk-21
export ANDROID_HOME=/path/to/android-sdk
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
npm run android:build:debug
```

APK after a successful build: `android/app/build/outputs/apk/debug/app-debug.apk`
(relative to the repository root). `android:sync` rebuilds and bundles local
assets. No release signing or Play Store setup is configured.

## Physical phone

Enable Developer options and USB debugging, connect a data-capable USB cable,
unlock the phone, and accept its RSA authorization prompt. On Linux, check USB
permissions if adb reports `no permissions`. Use `adb -s SERIAL` with multiple phones.

```sh
adb devices -l
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -W -n dev.jellybaby.hop/.MainActivity
```

`unauthorized` requires phone approval. An empty device list means no phone is
available. Installation with `-r` preserves progress; clearing data does not.

## Test checklist

- Launch: jelly, face, tabletop and target appear. Menu → Device diagnostics
  offers copyable details; GPU completion alone does not prove visible rendering.
- Play: grab, stretch, release; count one throw per release. Complete all five
  targets after settling. Check Retry, Next, unlocks and best throws.
- Skins: preview all eight; face stays visible. Changes preserve simulation.
  Restart to check selected skin and progress persistence.
- Free play: orbit/pinch, joystick, hop and multiple fingers. Check reset and mute.
- Recovery: drag outside the play area; recovery preserves throw count. Check
  automatic recovery after an unsettled throw and instant reset.
- Background while grabbing for ten seconds, then resume: no stuck grip,
  time-step jump or background sound. Repeat with screen lock/unlock.
- Back: closes picker/diagnostics, returns to menu, then exits from menu.
- Offline: airplane mode, force-stop, relaunch. Check rotation, cutouts,
  navigation bars and multi-window where available.
- Performance: play several minutes. Note resting and active-stretch frame rates,
  responsiveness, heat and visual sharpness separately.
- Startup errors: a missing adapter must show a readable error, not a blank
  canvas. Block the model request through debug WebView remote inspection to
  test asset-failure UI, then remove the block. Stalled stages time out.

## Capture failures

Run logcat in one terminal; launch and reproduce in another. Stop with Ctrl-C.
Keep captures local; do not commit them.

```sh
adb logcat -v threadtime 'Capacitor/Console:V' 'Capacitor:V' 'chromium:V' 'AndroidRuntime:E' '*:S' > jelly-hop.log
adb shell am force-stop dev.jellybaby.hop
adb shell am start -W -n dev.jellybaby.hop/.MainActivity
adb shell dumpsys webviewupdate
adb shell dumpsys gfxinfo dev.jellybaby.hop
```

Send diagnostics, logcat, WebView version, phone model/OS, and a recording with
the exact gesture. `gfxinfo` measures Android UI timing, not isolated WebGPU cost.

## Compatibility and verification limits

Capacitor packages WebGPU; it does not supply WebGPU or a WebGL fallback.
Desktop Linux Chrome, Android Chrome and APK WebView are separate targets.
The [Linux presentation failure](https://github.com/scottstts/Jelly-Baby/issues/1)
is not proof of Android failure. No experimental browser flags are required.

Android uses a smaller mesh sampled from the same character surface, the original
soft-body solver, GPU deformation and single-sample glossy refraction. Desktop
retains the original mesh and full transmission. Adaptive resolution trades
sharpness for frame rate; active stretching can still fall below 60 fps.

Physical rendering and grab/release were exercised on a CPH2469 with Android 14
and WebView 151. Complete five-level interaction, long-session performance,
audio, offline launch, background/resume and Back still need the manual checklist.
Automated physics, input, skin and DOM-fixture checks do not replace device tests.
See [asset permissions](ASSET_PERMISSIONS.md) before redistribution.
