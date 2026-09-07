import assert from 'node:assert/strict';
import { Vector3 } from 'three/webgpu';
import { loadModel } from './load-model.mjs';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { Baby } from '../src/graphics/baby.ts';
import { SurfaceBVH } from '../src/graphics/refractive-light.js';
import { surfaceGrab, advanceGrabTarget } from '../src/physics/grab.ts';

const original = loadModel(),
  model = loadModel('jelly-baby-mobile');
assert.equal(original.surface.positions.length / 3, 72234, 'original asset remains intact');
assert.equal(model.surface.positions.length / 3, 10090);
assert.equal(model.tets.length, 456);
assert(
  Math.abs(model.totalVolume / original.totalVolume - 1) < 0.01,
  'mass stays within one percent',
);
const bvh = new SurfaceBVH(model.surface),
  p = original.surface.positions,
  n = original.surface.restNormals;
let maxError = 0;
for (let i = 0; i < p.length; i += 3) {
  const origin = [0, 1, 2].map((k) => p[i + k] + n[i + k] * 0.004);
  const hit = bvh.hit(origin, [-n[i], -n[i + 1], -n[i + 2]], 0.008);
  assert(hit, `mobile surface covers original vertex ${i / 3}`);
  maxError = Math.max(maxError, Math.abs(hit.distance - 0.004));
}
assert(maxError < 0.0008, 'same SDF silhouette differs by less than 0.8 mm');
const body = new SoftBody(model),
  baby = new Baby(body, true);
for (let i = 0; i < 480; i++) body.step(PHYS.step);
body.updateSurface(true);
baby.update(1 / 60);
assert(body.isFinite());
assert(body.volumeRatio() > 0.9);
const grabBVH = new SurfaceBVH(body.surface);
const origin = [body.center.x, body.center.y + 0.12, body.center.z],
  hit = grabBVH.hit(origin, [0, -1, 0]);
assert(hit);
const ix = model.surface.indices,
  at = hit.t * 3,
  point = new Vector3(origin[0], origin[1] - hit.distance, origin[2]);
const binding = surfaceGrab(body, { a: ix[at], b: ix[at + 1], c: ix[at + 2] }, point);
assert(binding);
body.grab = { ...binding, target: point.clone(), lambda: new Float64Array(3) };
const target = point.clone().add(new Vector3(0.04, 0.06, 0.02));
for (let i = 0; i < 160; i++) {
  advanceGrabTarget(body.grab.target, target, PHYS.step, body.grab.point);
  body.step(PHYS.step);
  if (i % 4 === 0) {
    body.updateSurface();
    baby.update(1 / 60);
  }
  assert(body.lastMinJacobian >= 0.12);
  assert(body.isFinite());
}
assert(body.energy() > 1e-6, 'stretch stores motion');
body.grab = null;
body.wake();
for (let i = 0; i < 960; i++) {
  body.step(PHYS.step);
  if (i % 4 === 0) {
    body.updateSurface();
    baby.update(1 / 60);
  }
  assert(body.lastMinJacobian >= 0.12);
  assert(body.isFinite());
}
assert(body.volumeRatio() > 0.8 && body.volumeRatio() < 1.2, 'release recovers volume');
// Lazy facial samples must still be the exact CPU embedding, never stale rest vertices.
body.updateSurface(true);
const expectedPositions = body.surface.positions.slice();
const expectedNormals = body.surface.geometry.attributes.normal.array.slice();
body.updateSurface();
for (let id = 0; id < expectedPositions.length / 3; id++) body.updateSurfaceVertex(id);
assert.deepEqual(body.surface.positions, expectedPositions);
assert.deepEqual(body.surface.geometry.attributes.normal.array, expectedNormals);
assert(baby.mesh.material.positionNode, 'mobile render uses cage deformation');
assert(baby.mesh.material.backdropNode, 'mobile jelly samples the actual background');
baby.dispose();
console.log('PASS mobile shape, mass, grip, face animation and recovery', {
  maxSurfaceErrorMm: maxError * 1000,
});
