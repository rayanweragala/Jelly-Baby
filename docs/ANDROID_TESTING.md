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
- Bullseye: the inner gold ring marks 80% accuracy and the pale ring 50%.
  Accuracy uses the worst centre distance during the uninterrupted settling
  interval, not the first impact. Medals and fewest throws save independently;
  existing saves retain unlocks. Par is an optional challenge, never a failure gate.
- Expressions: check wide airborne eyes, the landing blink and completion smile.
  Switching skins and resetting must preserve correct face attachment.
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
soft-body solver, GPU deformation and a single-pass gel approximation. Desktop
retains the original mesh and full transmission. Adaptive resolution trades
sharpness for frame rate; active stretching can still fall below 60 fps.

The following notes describe earlier builds; see the final Low Tide check below.
Physical rendering and grab/release were exercised on a CPH2469 with Android 14
and WebView 151. Complete five-level interaction, long-session performance,
audio, offline launch, background/resume and Back still need the manual checklist.
Automated physics, input, skin and DOM-fixture checks do not replace device tests.
The polish build was installed on that phone: native screenshots confirmed the
new rings and translucent material, and one adb swipe increased throws from six
to seven with no fatal UI error. Short resting samples were around 52 fps at
0.55 render scale; earlier overheating prevents a controlled before/after claim.
Medal completion and persistence passed automated tests, not a full phone replay.
See [asset permissions](ASSET_PERMISSIONS.md) before redistribution.

## Handoff regression checks

Wall containment now runs only in level mode, after landing and outside an active
grab. Screen edges must not redirect airborne throws or move the character when
orbiting in free play. Corrections update the center, grab attachment, kernel and
surface state; a corrected sleeping body wakes for contact recovery.
The starting ring hides while held and after release, avoiding a bright refracted
band across the body. Reset restores it; the target rings remain visible.

Run the actual wall path in the launch tests, plus focused regressions:

```sh
npm run test:hop
node --experimental-strip-types scripts/verify-hop-input.mjs --mobile
node --experimental-strip-types scripts/verify-arena.mjs
node --experimental-strip-types scripts/verify-jelly-shadow.mjs
node --experimental-strip-types scripts/verify-quality-scale.mjs
```

All five original-model gestures and mobile-model trials pass with containment
included. Composite medals now save separately from placement accuracy; old
unlocks and best throw counts remain intact. Unversioned values written into
`accuracy` by the intermediate build cannot be distinguished from old placement
results, so they are never promoted into new composite medals.

Native phone screenshots confirmed the brighter green material, pearl skin and
held direction cue. The pre-correction resting sample was 51.5 fps at 0.55 scale;
the phone's red refresh-rate overlay is not a measurement of game frame rate.
Reduced-resolution edges remain visible. These fixes do not establish 60 fps.
The corrected debug APK was built and installed on the same phone. Its native
home screenshot confirms visible output; a native adb swipe advanced the counter
from zero to one with no fatal UI error or matching errors in the bounded logcat
check. Recent samples were 52.5 fps at home and 48 fps after the throw, both at
0.55 scale. This was a smoke test, not a sustained active-motion benchmark.
The final starting-guide build was also installed: after the level camera settled,
a native swipe counted one throw and its screenshot showed no starting ring
across the body. A later sample was 50.1 fps at 0.45 scale, illustrating the
remaining adaptive-resolution sharpness tradeoff.

## Final Low Tide check — 2026-09-08

The Android gel now uses local thickness, absorption and a Fresnel rim instead of
sampling the framebuffer. Native before/after screenshots confirm that the
sharp ring/stone band no longer crosses the body. Desktop transmission, the
character mesh, physics, five level layouts and saved progress remain intact.

Aiming now shows a stretch ring and six direction beads, with a rising tone.
The ring indicates screen-space stretch, not a predicted flight path. Release,
settling, completion and reset use short synthesized cues through the existing
mute control. Hard landings briefly squeeze the face; flight suppresses idle
blinks. A native dialog pauses the simulation and resumes the same shot. Invalid
position recovery remains immediate, preserves throw count, and shows a ripple.

All five levels completed on the CPH2469 through CDP touch events delivered to
the actual WebView: 1, 1, 2, 3 and 3 throws. No body teleport or forced completion
was used. The later levels needed successive throws rather than resetting after
every attempt. Traces and native screenshots remain local under `.android-tools/`:
`low-tide-first-complete.png`, `low-tide-level-{2,3,4,5}-complete.png`,
`low-tide-level-trials.json` and `low-tide-multihop-trials.json`.

The 20-second pre-fix resting trace measured 50.8 fps at scale 0.55 (335×681).
The post-fix trace measured 52.1 fps overall, initially at 0.45 before returning
to the same 335×681 buffer; same-buffer diagnostic samples were 50–53.5 fps.
This shows no obvious resting regression, not a controlled sustained-performance
improvement. Active play still drops to scale 0.45. Keep adaptive scaling: raising
the fixed minimum would trade away measured frame rate. Pixelated edges at that
scale and long-session thermal performance remain device limitations.

Automated checks passed: lint, typecheck, build, physics, multitouch, original and
mobile-model five-level launches, skins, face attachment/impact expressions,
sound lifecycle/mute, controller pause/recovery, arena, shared ground shading,
quality scaling and formatting. Browser DOM/controller checks also passed at
320×568, 360×800, 412×915 and 800×360, with simulated physics explicitly isolated
from the native rendering/throw evidence.

The delivered scope is the Low Tide presentation on the existing five-level
game. The prototype's catapult controls, water-fall physics, new colliders,
octopus remodel, Tide Run and Deep Water are not part of this implementation.
Synthesized audio replaces the proposed external audio assets. Audible speaker
quality and first-time-player timing require a human play test; automated checks
do not establish either.

All eight skins were also inspected in native screenshots of the installed APK.
Mute, reduced motion and selected skin survived a WebView reload; the original
lime skin, sound-on and normal-motion preferences were restored afterward.
Phone checks covered pause/resume and free play, ending on the home screen.

On 2026-09-09, the completion card's static `par 1` label was corrected to use
the current level's par. The controller regression checks this for all five
levels. Lint, typecheck and the Android build passed again after the correction.
The rebuilt APK was installed and level 3 completed again through real touch
events in two throws. Its native screenshot shows `par 2` and `Par matched!`:
`.android-tools/low-tide-par-fixed-complete.png`. The app returned to home with
no fatal error. This replay sampled 58–58.5 fps at scale 0.45; it does not replace
the longer-trace qualifications above.
