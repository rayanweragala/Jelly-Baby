import assert from 'node:assert/strict';
import { PerspectiveCamera, Mesh, Vector3 } from 'three/webgpu';
import { Input } from '../src/game/input.ts';
import { HopRound, LEVELS } from '../src/game/hop-rules.ts';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { Locomotion } from '../src/game/locomotion.ts';
import { loadModel } from './load-model.mjs';
const mobile = process.argv.includes('--mobile');
const step = PHYS.step;

class MiniTarget extends globalThis.EventTarget {
  querySelector() {
    return null;
  }
  querySelectorAll() {
    return [];
  }
}

const documentTarget = new MiniTarget();
documentTarget.hidden = false;
globalThis.document = documentTarget;
globalThis.window = new MiniTarget();

function setup() {
  const body = new SoftBody(loadModel(mobile ? 'jelly-baby-mobile' : 'jelly-baby'));
  assert(body.kernel, 'accelerated solver is available');
  const rig = new Locomotion(body);
  const camera = new PerspectiveCamera(40, 420 / 720, 0.001, 10);
  camera.position.set(0.16, 0.15, 0.26);
  camera.lookAt(0, 0.035, 0);
  camera.updateMatrixWorld();
  const captured = new Set();
  const classes = new Set();
  let input;
  const canvas = new MiniTarget();
  canvas.style = {};
  canvas.ownerDocument = documentTarget;
  canvas.getRootNode = () => documentTarget;
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 420, height: 720 });
  canvas.classList = {
    add: (name) => classes.add(name),
    remove: (name) => classes.delete(name),
    toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
    contains: (name) => classes.has(name),
  };
  canvas.setPointerCapture = (id) => captured.add(id);
  canvas.hasPointerCapture = (id) => captured.has(id);
  canvas.releasePointerCapture = (id) => captured.delete(id);
  const mesh = new Mesh(body.surface.geometry);
  input = new Input(camera, canvas, body, mesh, rig, { unlock: async () => {} }, () =>
    body.reset(),
  );
  const state = { releases: 0 };
  input.onRelease = () => state.releases++;
  return { body, rig, camera, input, canvas, captured, state };
}

function pointEvent(
  camera,
  point,
  { id = 1, type = 'pointerdown', dx = 0, dy = 0, pointerType = 'touch' } = {},
) {
  camera.updateMatrixWorld();
  const p = point.clone().project(camera);
  return event({
    id,
    type,
    pointerType,
    clientX: (p.x + 1) * 210 + dx,
    clientY: (1 - p.y) * 360 + dy,
  });
}

function event({
  id = 1,
  type = 'pointerdown',
  clientX = 210,
  clientY = 360,
  pointerType = 'touch',
  button = 0,
  buttons = 1,
}) {
  return {
    pointerId: id,
    pointerType,
    button,
    buttons,
    type,
    clientX,
    clientY,
    getCoalescedEvents: () => [],
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {},
  };
}

function physicsTick(ctx) {
  ctx.input.step(step);
  ctx.rig.step(step);
  ctx.body.step(step);
  ctx.rig.afterStep();
  ctx.input.afterPhysicsStep();
}

function settle(ctx, steps = Math.round(1 / step)) {
  for (let i = 0; i < steps; i++) {
    physicsTick(ctx);
    if (i % 12 === 0) ctx.body.updateSurface();
  }
  ctx.body.updateSurface();
}

function grabPoint(body) {
  body.updateSurface();
  return body.center.clone().add(new Vector3(0, 0.025, 0));
}

{
  const ctx = setup();
  settle(ctx);
  ctx.input.setMode('hop');
  ctx.input.begin(pointEvent(ctx.camera, grabPoint(ctx.body)));
  assert.equal(ctx.body.grabs.length, 1, 'hop mode allows first grip');
  ctx.input.begin(pointEvent(ctx.camera, grabPoint(ctx.body), { id: 2, dx: 25 }));
  assert.equal(ctx.body.grabs.length, 1, 'hop mode remains one-finger');
  assert.equal(ctx.input.controls.enabled, false, 'hop disables orbit during grip');
  ctx.input.end(
    pointEvent(ctx.camera, grabPoint(ctx.body), { type: 'pointerup', dx: -70, dy: -20 }),
  );
  assert.equal(
    ctx.state.releases,
    0,
    'pointerup does not count before physics consumes final sample',
  );
  physicsTick(ctx);
  assert.equal(ctx.state.releases, 0, 'first consumption tick still retained for impulse');
  physicsTick(ctx);
  assert.equal(ctx.state.releases, 1, 'pointerup counts once after physics consumes sample');
  assert.equal(ctx.body.grabs.length, 0);
  assert.equal(ctx.input.controls.enabled, false, 'hop orbit remains disabled after release');
  physicsTick(ctx);
  assert.equal(ctx.state.releases, 1, 'release callback fires once');
  ctx.body.reset();
  ctx.input.update(step);
  assert.equal(ctx.input.controls.enabled, false, 'hop orbit remains disabled after reset');
  ctx.input.dispose();
}

for (const cleanup of ['cancel', 'lostpointercapture', 'blur', 'reset']) {
  const ctx = setup();
  settle(ctx);
  ctx.input.setMode('hop');
  ctx.input.begin(pointEvent(ctx.camera, grabPoint(ctx.body)));
  if (cleanup === 'cancel')
    ctx.input.end(pointEvent(ctx.camera, grabPoint(ctx.body), { type: 'pointercancel' }));
  else if (cleanup === 'lostpointercapture')
    ctx.input.end(pointEvent(ctx.camera, grabPoint(ctx.body), { type: 'lostpointercapture' }));
  else if (cleanup === 'blur') globalThis.window.dispatchEvent(new globalThis.Event('blur'));
  else {
    ctx.body.reset();
    ctx.input.update(step);
  }
  for (let i = 0; i < 3; i++) physicsTick(ctx);
  assert.equal(ctx.state.releases, 0, `${cleanup} does not count as launch`);
  assert.equal(ctx.input.controls.enabled, false, `${cleanup} leaves hop orbit disabled`);
  ctx.input.dispose();
}

{
  const ctx = setup();
  settle(ctx);
  ctx.input.setMode('preview');
  ctx.input.begin(pointEvent(ctx.camera, grabPoint(ctx.body)));
  assert.equal(ctx.body.grabs.length, 0, 'preview cannot grab');
  assert.equal(ctx.state.releases, 0);
  assert.equal(ctx.input.controls.enabled, false);
  ctx.input.dispose();
}

{
  const ctx = setup();
  settle(ctx);
  ctx.input.setMode('free');
  ctx.input.begin(pointEvent(ctx.camera, grabPoint(ctx.body), { id: 1, dx: -8 }));
  ctx.input.begin(pointEvent(ctx.camera, grabPoint(ctx.body), { id: 2, dx: 8 }));
  assert.equal(ctx.body.grabs.length, 2, 'free mode preserves touch multitouch');
  assert.equal(ctx.input.controls.enabled, false);
  physicsTick(ctx);
  ctx.input.end(pointEvent(ctx.camera, grabPoint(ctx.body), { id: 1, type: 'pointercancel' }));
  physicsTick(ctx);
  assert.equal(ctx.body.grabs.length, 1);
  assert.equal(ctx.input.controls.enabled, false);
  ctx.input.end(pointEvent(ctx.camera, grabPoint(ctx.body), { id: 2, type: 'pointercancel' }));
  physicsTick(ctx);
  assert.equal(ctx.body.grabs.length, 0);
  assert.equal(ctx.input.controls.enabled, true, 'free mode restores orbit after all grips clear');
  ctx.input.dispose();
}

const trialContext = setup();
function trial(levelIndex, dx, dy) {
  const ctx = trialContext;
  ctx.input.recenter();
  ctx.body.reset();
  ctx.state.releases = 0;
  ctx.input.setMode('hop');
  const level = LEVELS[levelIndex];
  ctx.input.controls.target.set(level.x / 2, 0.025, level.z / 2);
  ctx.camera.position.set(level.x / 2 + 0.035, 0.235, level.z / 2 + 0.27);
  ctx.camera.fov =
    (2 * Math.atan(Math.tan((18 * Math.PI) / 180) * Math.max(1, 0.85 / ctx.camera.aspect)) * 180) /
    Math.PI;
  ctx.camera.setViewOffset(420, 720, 0, 720 * 0.075, 420, 720);
  ctx.camera.updateProjectionMatrix();
  ctx.input.controls.update();
  settle(ctx);
  const round = new HopRound(levelIndex);
  const start = grabPoint(ctx.body);
  ctx.input.begin(pointEvent(ctx.camera, start));
  assert.equal(ctx.body.grabs.length, 1, 'feasibility trial acquired grip');
  ctx.input.pointerMove(pointEvent(ctx.camera, start, { type: 'pointermove', dx, dy }));
  for (let i = 0; i < Math.round(0.5 / step); i++) physicsTick(ctx);
  ctx.input.end(pointEvent(ctx.camera, start, { type: 'pointerup', dx, dy }));
  let completed = false;
  let bestMiss = Infinity;
  let bestPosition = ctx.body.center.clone();
  for (let i = 0; i < Math.round(4 / step); i++) {
    physicsTick(ctx);
    if (i % 6 === 0) {
      const center = ctx.body.center;
      const speed = Math.sqrt((2 * ctx.body.energy()) / ctx.body.totalMass);
      const sample = {
        x: center.x,
        y: center.y,
        z: center.z,
        speed,
        grounded: ctx.body.grounded,
        grabbing: ctx.body.grabs.length > 0,
      };
      if (round.throws === 0 && ctx.state.releases > 0) round.release();
      completed = round.update(step * 6, sample) || completed;
      const miss = Math.hypot(center.x - level.x, center.z - level.z);
      if (miss < bestMiss) {
        bestMiss = miss;
        bestPosition = center.clone();
      }
      if (completed) break;
    }
  }
  return { completed, bestMiss, bestPosition, throws: round.throws };
}

// Cage sampling changes which release lands closest; keep the same targets and
// winning tolerance, and search actual pointer gestures rather than teleporting.
const dragsByLevel = mobile
  ? LEVELS.map(() =>
      [-80, -40, 0, 40, 80, 120, 160, 200].flatMap((dx) =>
        [-180, -240, -300, -340, -380, -480].map((dy) => [dx, dy]),
      ),
    )
  : [
      [[0, -180]],
      [[0, -240]],
      [[0, -240]],
      [
        [-40, -300],
        [-40, -340],
        [-40, -380],
      ],
      [
        [50, -300],
        [50, -340],
        [50, -380],
      ],
    ];
const feasibility = [];
for (let i = 0; i < LEVELS.length; i++) {
  let best = {
    completed: false,
    bestMiss: Infinity,
    bestPosition: new Vector3(),
    throws: 0,
    dx: 0,
    dy: 0,
  };
  for (const [dx, dy] of dragsByLevel[i]) {
    const result = trial(i, dx, dy);
    if (result.completed || result.bestMiss < best.bestMiss) best = { ...result, dx, dy };
    if (result.completed) break;
  }
  feasibility.push({
    level: LEVELS[i].name,
    completed: best.completed,
    drag: [best.dx, best.dy],
    bestMiss: Number(best.bestMiss.toFixed(4)),
    closestPosition: [
      Number(best.bestPosition.x.toFixed(4)),
      Number(best.bestPosition.y.toFixed(4)),
      Number(best.bestPosition.z.toFixed(4)),
    ],
  });
  console.log('Landing trial', feasibility.at(-1));
}
trialContext.input.dispose();

assert(
  feasibility.every((item) => item.completed),
  'all five targets are numerically reachable through actual Input',
);
console.log('Hop input passed: all five targets reached through real grab/release and settling.');
