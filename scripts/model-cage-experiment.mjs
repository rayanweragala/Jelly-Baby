import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import * as THREE from 'three/webgpu';
import { buildCage } from './model-cage.mjs';
import { buildOpticalModel } from './optical-model.mjs';
import { parseBabyCage } from '../src/physics/baby-cage.ts';
import { SoftBody } from '../src/physics/soft-body.js';
import { PHYS } from '../src/physics/constants.js';
import { SurfaceBVH } from '../src/graphics/refractive-light.js';
import { surfaceGrab, advanceGrabTarget } from '../src/physics/grab.ts';

const outDir = '.android-tools/cage-candidates';
const spacings = process.argv.slice(2).map(Number).filter(Number.isFinite);
if (!spacings.length) spacings.push(0.012, 0.015, 0.018);

function referenceModel() {
  const source = readFileSync('refs/jelly_baby_mesh.html', 'utf8');
  const begin = source.indexOf('const V =');
  const end = source.indexOf('// Minimal WebGPU viewer');
  const model = new Function(
    'THREE',
    source.slice(begin, end) + '\nreturn {buildJellyGeometry,jellySDF};',
  )(THREE);
  const raw = model.buildJellyGeometry();
  const scale = 0.07 / (raw.boundingBox.max.y - raw.boundingBox.min.y);
  const bottom = raw.boundingBox.min.y;
  raw.translate(0, -bottom, 0);
  raw.scale(scale, scale, scale);
  const p = raw.attributes.position.array,
    n = raw.attributes.normal.array;
  const positions = [],
    normals = [],
    indices = [],
    vertices = new Map();
  for (let i = 0; i < p.length; i += 3) {
    const key = `${p[i]},${p[i + 1]},${p[i + 2]}`;
    let id = vertices.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      vertices.set(key, id);
      positions.push(p[i], p[i + 1], p[i + 2]);
      normals.push(n[i], n[i + 1], n[i + 2]);
    }
    indices.push(id);
  }
  let signedVolume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3,
      b = indices[i + 1] * 3,
      c = indices[i + 2] * 3;
    signedVolume +=
      (positions[a] * (positions[b + 1] * positions[c + 2] - positions[b + 2] * positions[c + 1]) +
        positions[a + 1] * (positions[b + 2] * positions[c] - positions[b] * positions[c + 2]) +
        positions[a + 2] * (positions[b] * positions[c + 1] - positions[b + 1] * positions[c])) /
      6;
  }
  return {
    source,
    sourceModel: source.slice(begin, end),
    model,
    scale,
    bottom,
    positions,
    normals,
    indices,
    signedVolume,
  };
}

function writeCandidate(name, arrays, source, scale, bottom, volume) {
  const chunks = [],
    layout = {};
  let offset = 0;
  for (const [key, array] of Object.entries(arrays)) {
    const padding = (8 - (offset % 8)) % 8;
    if (padding) {
      chunks.push(Buffer.alloc(padding));
      offset += padding;
    }
    layout[key] = { offset, length: array.length, type: array.constructor.name };
    chunks.push(Buffer.from(array.buffer));
    offset += array.byteLength;
  }
  const manifest = {
    sourceHash: createHash('sha256').update(source).digest('hex'),
    scale,
    bottom,
    volume,
    layout,
  };
  writeFileSync(`${outDir}/${name}.bin`, Buffer.concat(chunks));
  writeFileSync(`${outDir}/${name}.json`, JSON.stringify(manifest, null, 2));
  const bytes = readFileSync(`${outDir}/${name}.bin`);
  return parseBabyCage(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    manifest,
  );
}

function stepBody(body, n) {
  let minJ = Infinity,
    started = performance.now();
  for (let i = 0; i < n; i++) {
    body.step(PHYS.step);
    minJ = Math.min(minJ, body.lastMinJacobian);
  }
  return { ms: performance.now() - started, minJ };
}

function testCandidate(cage) {
  const body = new SoftBody(cage);
  body.canSleep = false;
  let r = stepBody(body, 480);
  body.updateSurface();
  const bounds = body.surface.geometry.boundingBox;
  const settled = {
    stepMs: r.ms / 480,
    minJ: r.minJ,
    volume: body.volumeRatio(),
    height: bounds.max.y,
  };
  assert(body.isFinite());
  assert(settled.minJ >= 0.12);
  assert(settled.volume > 0.8 && settled.volume < 1.2);
  assert(settled.height > 0.055);

  const grabBVH = new SurfaceBVH(body.surface);
  const origin = [body.center.x, body.center.y + 0.12, body.center.z];
  const hit = grabBVH.hit(origin, [0, -1, 0]);
  assert(hit);
  const ids = body.surface.indices.slice(hit.t * 3, hit.t * 3 + 3);
  const point = new THREE.Vector3(origin[0], origin[1] - hit.distance, origin[2]);
  const binding = surfaceGrab(body, { a: ids[0], b: ids[1], c: ids[2] }, point);
  assert(binding);
  body.grab = { ...binding, target: point.clone(), lambda: new Float64Array(3) };
  let stretchMinJ = Infinity;
  for (let i = 0; i < 100; i++) {
    advanceGrabTarget(
      body.grab.target,
      point.clone().add(new THREE.Vector3(0.04, 0.06, 0.02)),
      PHYS.step,
      body.grab.point,
    );
    body.step(PHYS.step);
    stretchMinJ = Math.min(stretchMinJ, body.lastMinJacobian);
  }
  const energy = body.energy();
  body.grab = null;
  body.wake();
  r = stepBody(body, 720);
  body.updateSurface();
  const release = {
    energy,
    stepMs: r.ms / 720,
    minJ: Math.min(stretchMinJ, r.minJ),
    volume: body.volumeRatio(),
    center: body.center.toArray(),
  };
  assert(release.energy > 1e-6);
  assert(release.minJ >= 0.12);
  assert(release.volume > 0.7 && release.volume < 1.3);
  return { settled, release };
}

mkdirSync(outDir, { recursive: true });
const ref = referenceModel();
const results = [];
for (const spacing of spacings) {
  const label = String(spacing).replace('0.', '0p');
  const name = `jelly-baby-${label}`;
  const arrays = {
    positions: new Float32Array(ref.positions),
    normals: new Float32Array(ref.normals),
    indices: new Uint32Array(ref.indices),
    ...buildCage(
      ref.positions,
      ref.scale,
      ref.bottom,
      ref.model.jellySDF,
      ref.signedVolume,
      spacing,
    ),
  };
  Object.assign(arrays, buildOpticalModel(ref.sourceModel, ref.scale, ref.bottom, arrays));
  const cage = writeCandidate(name, arrays, ref.source, ref.scale, ref.bottom, ref.signedVolume);
  const metrics = testCandidate(cage);
  results.push({
    spacing,
    name,
    particles: arrays.particles.length / 3,
    tets: arrays.tets.length / 4,
    ...metrics,
    bin: `${outDir}/${name}.bin`,
    json: `${outDir}/${name}.json`,
  });
}
console.log(JSON.stringify(results, null, 2));
