# Jelly Hop: octopus adventure design brief

Copy the brief below into Claude Design and attach the four current phone captures
in `docs/screenshots/`. This is a proposed next version, not a description of the
shipped game. Return the whole exported project, including support files and assets.

---

Redesign Jelly Hop as a vibrant, tactile physics puzzle adventure starring a
cute translucent jelly octopus. The current Android game has five landing targets
and eight colors. We want a distinctive character and meaningful mechanical play,
with decisions about timing, tension and routes. Produce a coherent playable
design prototype and an implementation handoff, not only polished menu screens.

## Character and art direction

- Replace the baby silhouette with a rounded jelly octopus, expressive face and
  eight readable, soft tentacles. Show front, side, top and gameplay camera views.
  Supply idle, stretch, cling, launch, airborne, impact, success and failure poses.
- Make the world brilliant and colorful: luminous turquoise water, coral orange,
  electric violet, sunny yellow and pearl highlights. Choose a disciplined palette
  with numeric tokens and clear foreground/background contrast. Avoid a uniformly
  dark or muddy scene; preserve readability outdoors on a small phone.
- Give materials distinct visual behavior: sticky coral, springy anemones, slippery
  shells and moving platforms. Encode their roles through shapes and motion as well
  as color. Keep the octopus and interactive objects immediately recognizable.

## Mechanical direction

Start from one core loop: aim, stretch, launch, cling, then redirect toward the goal.
Recommend one consistent portrait, one-thumb control scheme. Explain whether the
launch follows the drag or opposes it; do not switch conventions between mechanics.

Explore suction anchors as the signature mechanic: a tentacle attaches to a marked
anchor, the player adjusts tension and release timing, then swings or launches onward.
Combine that with a small supporting set: moving platforms, directional currents,
spring surfaces, and a pressure switch that opens a route. Choose the strongest
three mechanics for the first version; explain what decisions each creates.

Design three playable prototype levels: teach the launch, teach the anchor, then
combine anchoring with one timed obstacle. Also provide a 12-level campaign plan
across three visual areas, with escalating combinations, optional skill routes,
clear checkpoints and fast retries. More levels must introduce decisions, not
repeat the same landing with a different color. Reward mastery without requiring
perfect aim to progress. Avoid adding currencies, shops or daily chores.

Show exact interactive states: eligible anchor, attached tentacle, tension limit,
release, missed landing, checkpoint recovery, win and replay. Define hit areas,
timing windows, camera behavior, failure rules and scoring. Make tutorial teaching
happen through play. Aiming feedback must distinguish direction/power from an
accurate trajectory prediction; do not promise a prediction the runtime cannot supply.

## Implementation constraints

The existing application uses Three.js/WebGPU, Capacitor and a soft-body solver.
Keep the existing simulation foundation; a new octopus surface/cage and attachment
mechanics need explicit implementation work. Annotate which tentacles need physical
interaction and which can use lightweight visual motion. Do not assume eight fully
simulated arms with self-collision will be affordable.

Target the tested Android 14 CPH2469 with PowerVR GE8320. Existing short resting
traces are around 51–52 fps with reduced rendering resolution, not sustained 60 fps.
Prioritize one hero, simple collision shapes and bounded effects. Show an inexpensive
gel/water treatment without requiring full-scene refraction, volumetrics or expensive
postprocessing. Keep text and controls sharp independently of 3D resolution.

Support 360×800 portrait first, with 320px-wide and landscape layouts. Use at least
44px touch targets, mute and reduced-motion options, readable type and clear pause,
resume and retry behavior. Keep local/offline play viable.

## Deliverables

1. One recommended art direction, with palette, typography, materials and effects.
2. Octopus model reference sheet, silhouette, poses and attachment diagrams.
3. Interactive three-level prototype showing the chosen core loop and real state
   transitions; label any mocked physics or unavailable interactions explicitly.
4. Home, campaign, gameplay, pause, failure/recovery, completion and customization
   screens with complete states and responsive behavior.
5. Twelve-level mechanic progression table and three detailed level diagrams with
   dimensions, spawn/goal positions, obstacles, anchors and tutorial triggers.
6. Exported HTML/CSS/JS, all supporting files, reusable assets and their licenses,
   animation timings, input/state specification and a clear implementation order.

Preserve attribution to the original foundation:
[Jelly Baby by scottstts](https://github.com/scottstts/Jelly-Baby).
Do not represent existing upstream code or artwork as newly authored.
