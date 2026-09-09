import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three/webgpu';
import { Arena } from '../src/game/arena.ts';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { LEVELS, needsRecovery } from '../src/game/hop-rules.ts';
import { loadModel } from './load-model.mjs';

const step = PHYS.step;

const WIDTH = 360;
const HEIGHT = 730;

/** Mirrors resizeView. Framing the test tighter than the shipped view invents wall collisions
 *  that never happen on a phone, so the field of view and the offset both have to match. */
function framed(level) {
  const camera = new PerspectiveCamera(36, WIDTH / HEIGHT, 0.001, 40);
  camera.fov =
    (2 * Math.atan(Math.tan((18 * Math.PI) / 180) * Math.max(1, 0.85 / camera.aspect)) * 180) /
    Math.PI;
  camera.position.set(level.x / 2 + 0.035, 0.235, level.z / 2 + 0.27);
  camera.lookAt(level.x / 2, 0.025, level.z / 2);
  camera.setViewOffset(WIDTH, HEIGHT, 0, HEIGHT * 0.075, WIDTH, HEIGHT);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return camera;
}

/** The requirement is about pixels: how far past the frame any part of the body reaches. */
function beyondFrame(room, body) {
  let worst = 0;
  for (let i = 0; i < body.x.length; i += 3)
    worst = Math.max(worst, room.beyondFrame(body.x[i], body.x[i + 1], body.x[i + 2]));
  return worst;
}

/** Settle a body, then shove every node along one direction as a hard flat throw. */
function thrown(vx, vz) {
  const body = new SoftBody(loadModel('jelly-baby-mobile'));
  body.canSleep = false;
  for (let i = 0; i < 300; i++) body.step(step);
  for (let i = 0; i < body.velocity.length; i += 3) {
    body.velocity[i] += vx;
    body.velocity[i + 2] += vz;
  }
  return body;
}

const level = LEVELS[0];
const camera = framed(level);
const arena = new Arena();
arena.update(camera);

const sleeping = thrown(0, 0);
for (let i = 0; i < sleeping.x.length; i += 3) sleeping.x[i] += 0.4;
sleeping.updateSurface();
sleeping.sleeping = true;
const oldCenter = sleeping.center.clone();
arena.contain(sleeping);
assert(sleeping.surfaceDirty, 'wall corrections invalidate a sleeping body surface');
assert(!sleeping.sleeping, 'wall corrections wake the body for contact recovery');
assert(sleeping.center.distanceTo(oldCenter) > 0.01, 'center follows the correction immediately');
const correctedCenter = sleeping.center.clone();
sleeping.updateCenter();
assert(sleeping.center.distanceTo(correctedCenter) < 1e-6, 'center matches corrected cage');
assert(
  Math.abs(sleeping.kernel.meta[3] - sleeping.center.x) < 1e-6,
  'kernel center is synchronized',
);

for (const state of [{ grounded: false }, { grounded: true, grab: {} }]) {
  const moving = thrown(0, 0);
  for (let i = 0; i < moving.x.length; i += 3) moving.x[i] += 0.4;
  const before = moving.x.slice();
  arena.contain({ ...moving, ...state });
  assert.deepEqual(moving.x, before, 'walls do not teleport a held jelly or interrupt a flight');
}

// The room has to be real: the centre of the table is in it, half a metre out is not.
assert.equal(arena.beyondFrame(level.x, 0.03, level.z), 0, 'the pad is on screen');
assert(arena.beyondFrame(0.5, 0.03, 0.5) > 0.1, 'the far corner of the table is off screen');

for (const [name, vx, vz] of [
  ['right', 0.9, 0],
  ['left', -0.9, 0],
  ['far', 0, -0.9],
  ['near', 0, 0.9],
]) {
  // Without walls the same throw leaves the view, so the containment below is doing the work.
  const loose = thrown(vx, vz);
  for (let i = 0; i < Math.round(2 / step); i++) loose.step(step);
  loose.updateSurface();
  const loosest = beyondFrame(arena, loose);
  assert(loosest > 0.05, `${name}: leaves the frame entirely when nothing contains it`);

  const held = thrown(vx, vz);
  let worst = 0;
  let reversed = false;
  for (let i = 0; i < Math.round(4 / step); i++) {
    held.step(step);
    arena.contain(held);
    if (i % 12 === 0) {
      held.updateSurface();
      assert(held.isFinite(), `${name}: the solver stays finite against the wall`);
      assert(held.lastMinJacobian >= 0.12, `${name}: no tetrahedron inverts on impact`);
      const sample = { x: held.center.x, y: held.center.y, z: held.center.z };
      assert(
        !needsRecovery({ ...sample, speed: 0, grounded: true, grabbing: false }),
        `${name}: never strays far enough to trigger a reset`,
      );
      if (held.velocity[0] * vx + held.velocity[2] * vz < 0) reversed = true;
      // Ground containment is not the promise. Staying on screen is, and a body standing at the
      // visible edge of the table still projects past the side, so check the pixels players see.
      worst = Math.max(worst, beyondFrame(arena, held));
    }
  }
  assert.equal(
    arena.beyondFrame(held.center.x, held.center.y, held.center.z),
    0,
    `${name}: still in view after four seconds`,
  );
  assert(reversed, `${name}: the wall throws it back rather than swallowing it`);
  // Two to three orders of magnitude better than an unwalled throw. Not zero: a rigid
  // correction cannot satisfy nodes squeezed from opposite sides at once, and the bottom edge
  // is the worst conditioned because the view grazes the table there. At peak impact the body
  // can hang a few percent of the frame past the bottom, behind the footer, and comes straight
  // back. Sides and far edge hold exactly.
  assert(
    worst < 0.06 && worst < loosest / 20,
    `${name}: stays in frame — overhang ${worst.toFixed(4)} against ${loosest.toFixed(4)} loose`,
  );
}

console.log(
  'Arena: the view is a room — throws bounce off every wall and stay finite and in frame.',
);
