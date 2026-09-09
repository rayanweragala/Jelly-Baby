import assert from 'node:assert/strict';
import { Group } from 'three/webgpu';
import { SoftBody } from '../src/physics/soft-body.js';
import { BabyFace } from '../src/graphics/baby-face.ts';
import { FaceExpression } from '../src/graphics/face-expression.ts';
import { SurfaceBVH } from '../src/graphics/refractive-light.js';
import { loadModel } from './load-model.mjs';

const body = new SoftBody(loadModel()),
  group = new Group(),
  face = new BabyFace(body, group);
face.update(0);
const baseline = group.children.map((mesh) => mesh.geometry.attributes.position.array.slice());
// Compare the resting face to the original ray-projected artwork.
const bvh = new SurfaceBVH(body.surface),
  out = new Float64Array(6);
for (const detail of face.details) {
  const { rest, cx, cy, depth, mesh } = detail,
    p = mesh.geometry.attributes.position.array;
  for (let i = 0; i < rest.length; i += 3) {
    const hit = bvh.hit([rest[i] + cx, rest[i + 1] + cy, 0.08], [0, 0, -1]);
    assert(hit);
    out.fill(0);
    for (let k = 0; k < 3; k++) {
      const id = body.surface.indices[hit.t * 3 + k] * 3,
        w = k === 0 ? 1 - hit.u - hit.v : k === 1 ? hit.u : hit.v;
      for (let axis = 0; axis < 3; axis++) {
        out[axis] += body.surface.positions[id + axis] * w;
        out[axis + 3] += body.surface.geometry.attributes.normal.array[id + axis] * w;
      }
    }
    const scale = Math.max(0.00008, rest[i + 2] + depth) / Math.hypot(out[3], out[4], out[5]);
    for (let axis = 0; axis < 3; axis++)
      assert(
        Math.abs(p[i + axis] - out[axis] - out[axis + 3] * scale) < 1e-8,
        'rest artwork is preserved',
      );
  }
}
// Cached bindings must remain bit-equivalent to a fresh lookup, then refresh
// exactly when expression coordinates move.
const cached = new Float64Array(6),
  fresh = new Float64Array(6);
for (const detail of face.details) {
  const binding = face.skin.createBinding();
  for (let i = 0; i < detail.rest.length; i += 3) {
    const x = detail.rest[i] + detail.cx,
      y = detail.rest[i + 1] + detail.cy,
      offset = Math.max(0.00008, detail.rest[i + 2] + detail.depth);
    face.skin.sampleCached(x, y, offset, cached, binding);
    const first = { ...binding };
    face.skin.sample(x, y, offset, fresh);
    assert.deepEqual([...cached], [...fresh], 'cached face sample matches uncached sample');
    face.skin.sampleCached(x, y, offset, cached, binding);
    assert.deepEqual(binding, first, 'same expression coordinate reuses binding');
    face.skin.sampleCached(x, y + 0.00001, offset, cached, binding);
    assert.notEqual(binding.y, first.y, 'changed expression coordinate refreshes binding');
  }
}
// Sweep blinks, sobbing, release giggles, interrupted release and multiple grips.
for (let frame = 0; frame < 600; frame++) {
  body.grabs = frame >= 170 && frame < 280 ? [{}, {}] : frame >= 310 && frame < 370 ? [{}] : [];
  face.update(1 / 60);
  for (const mesh of group.children) {
    assert(mesh.geometry.attributes.position.array.every(Number.isFinite));
    assert(mesh.geometry.attributes.normal.array.every(Number.isFinite));
  }
}
face.reset();
face.update(0);
group.children.forEach((mesh, i) =>
  assert.deepEqual(mesh.geometry.attributes.position.array, baseline[i]),
);
// Any expression must move with the skin, including a sleeping body's rigid motion.
body.grabs = [{}];
for (let i = 0; i < 60; i++) face.update(1 / 60);
const before = group.children.map((mesh) => mesh.geometry.attributes.position.array.slice());
for (let i = 0; i < body.x.length; i += 3) {
  body.x[i] += 0.02;
  body.x[i + 1] += 0.01;
  body.x[i + 2] -= 0.03;
}
body.updateSurface();
face.update(0);
group.children.forEach((mesh, j) => {
  const p = mesh.geometry.attributes.position.array;
  for (let i = 0; i < p.length; i++)
    assert(
      Math.abs(p[i] - before[j][i] - [0.02, 0.01, -0.03][i % 3]) < 2e-8,
      'expression follows skin',
    );
});
const expression = new FaceExpression();
// Stretch and shear the skin, then exercise every part of the performance on it.
for (let i = 0; i < body.x.length; i += 3) {
  body.x[i] = body.rest[i] * 1.35 + body.rest[i + 1] * 0.2;
  body.x[i + 1] = body.rest[i + 1] * 1.15;
  body.x[i + 2] = body.rest[i + 2] * 0.8;
}
body.updateSurface();
for (let frame = 0; frame < 240; frame++) {
  body.grabs = frame < 90 ? [{}, {}] : [];
  face.update(1 / 60);
  for (const mesh of group.children)
    assert(mesh.geometry.attributes.position.array.every(Number.isFinite));
}
for (let i = 0; i < 60; i++) expression.update(1 / 60, true);
assert(expression.sob > 0.99);
for (let i = 0; i < 45; i++) expression.update(1 / 60, false);
assert(expression.laugh > 0.7);
for (let i = 0; i < 360; i++) expression.update(1 / 60, false);
assert.equal(expression.sob, 0);
assert.equal(expression.laugh, 0);
for (let i = 0; i < 60; i++) expression.update(1 / 60, false, true);
assert(expression.surprise > 0.99, 'airborne eyes widen');
expression.update(1 / 60, false, false);
assert(expression.blink > 0, 'landing triggers a blink');
expression.celebrate();
for (let i = 0; i < 45; i++) expression.update(1 / 60, false);
assert(expression.laugh > 0.7, 'winning triggers a smile without a grab');
expression.reset();
assert.equal(expression.surprise, 0);
assert.equal(expression.laugh, 0);
for (let i = 0; i < 180; i++) expression.update(1 / 60, false, true, 0.8);
assert.equal(expression.blink, 0, 'idle blink is suppressed during flight');
for (let i = 0; i < 8; i++) expression.update(1 / 60, false, false);
assert(expression.sob > 0.5, 'hard impact briefly squeezes the face');
expression.reset();
expression.update(1 / 60, false, true, 0.1);
for (let i = 0; i < 8; i++) expression.update(1 / 60, false, false);
assert.equal(expression.sob, 0, 'soft impact keeps the relaxed face');
// The catchlight is placed in rest coordinates, so it only stays put through a blink while the
// eyes still carry that attribute alongside their live world-space positions.
for (const { mesh, rest, kind } of face.details) {
  const anchored = mesh.geometry.attributes.restPosition;
  assert(anchored, 'face detail keeps its undeformed coordinates');
  assert.deepEqual([...anchored.array], [...rest], 'rest attribute matches the artwork');
  assert.notEqual(anchored.array, mesh.geometry.attributes.position.array);
  if (kind === 'eye') assert(mesh.material.emissiveNode, 'eyes carry a catchlight');
}

console.log(
  'Face checks passed: original pose, animation coverage, multiple grabs, release, reset, deformed attachment and eye catchlights.',
);
