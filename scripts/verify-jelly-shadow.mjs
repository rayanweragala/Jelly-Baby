import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  Color,
  DataTexture,
  MeshPhysicalNodeMaterial,
  Texture,
  TextureLoader,
  Vector2,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import { RefractiveLightField } from '../src/graphics/refractive-light.js';
import { jellyRefraction } from '../src/graphics/jelly-refraction.ts';
import { makeTable } from '../src/graphics/table.ts';

const source = readFileSync(
  new globalThis.URL('../src/graphics/jelly-refraction.ts', import.meta.url),
  'utf8',
);
assert(!source.includes('viewportSharedTexture'), 'mobile jelly must not sample the framebuffer');

// groundAttenuation only reads the shadow field's uniforms, so a stub exercises the real method.
const optics = {
  originNode: uniform(new Vector2()),
  spanNode: uniform(0.22),
  shadowOriginNode: uniform(new Vector2()),
  shadowSpanNode: uniform(0.22),
  contactOriginNode: uniform(new Vector2()),
  shadowTexture: new DataTexture(),
  lightTexture: new Texture(),
  groundAttenuation: RefractiveLightField.prototype.groundAttenuation,
};

// The mobile gel is local now: no scene sample, no shadow texture, no stone/ring band through body.
const reads = (root, target) => {
  const seen = new Set();
  const walk = (n) => {
    if (n === target) return true;
    if (!n || typeof n !== 'object' || seen.has(n)) return false;
    seen.add(n);
    return Object.values(n).some(walk);
  };
  return walk(root);
};

const attenuation = optics.groundAttenuation(uniform(new Vector2()), 0.8);
assert(attenuation.isNode, 'groundAttenuation builds a node');

const withOptics = new MeshPhysicalNodeMaterial();
jellyRefraction(withOptics, optics, 0.8);
const without = new MeshPhysicalNodeMaterial();
jellyRefraction(without);
assert(
  !reads(withOptics.backdropNode, optics.shadowTexture),
  'the jelly does not read table shadow pixels',
);

// Fresnel now adds a local rim, instead of darkening or sampling the background.
const dependsOnView = (root) => {
  const seen = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object' || seen.has(n)) return false;
    seen.add(n);
    if (/normal|camera/i.test(n.name ?? '')) return true;
    return Object.values(n).some(walk);
  };
  return walk(root);
};
assert(dependsOnView(withOptics.backdropNode), 'local gel rim depends on view angle');

const load = TextureLoader.prototype.loadAsync;
TextureLoader.prototype.loadAsync = async () => new Texture();
try {
  const table = await makeTable(optics, {
    color: new Color('white'),
    irradiance: 1,
    windowFraction: 0.8,
  });
  assert(
    table.mesh.material.colorNode.isNode,
    'the table still shades with the shared attenuation',
  );
  table.dispose();
} finally {
  TextureLoader.prototype.loadAsync = load;
}
console.log(
  'Jelly gel path: no framebuffer sample, no shadow read, shared table attenuation passed.',
);
