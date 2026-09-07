import {
  BufferAttribute,
  StorageBufferAttribute,
  type MeshPhysicalNodeMaterial,
} from 'three/webgpu';
import { Fn, attribute, cross, normalLocal, storage, vec3 } from 'three/tsl';
import type { SoftBody } from '../physics/soft-body.js';

/** Four-node embedding and cofactor normals, matching deform-surface.js. */
export class JellyDeformation {
  private readonly packed: Float32Array;
  private readonly buffer: StorageBufferAttribute;
  private readonly body: SoftBody;
  private revision = -1;
  constructor(body: SoftBody, material: MeshPhysicalNodeMaterial) {
    this.body = body;
    // Four vec4 records per cage node: position then three deformation rows.
    this.packed = new Float32Array(body.mass.length * 16);
    this.buffer = new StorageBufferAttribute(this.packed, 4);
    const data = storage(this.buffer, 'vec4', this.packed.length / 4).toReadOnly();
    const geometry = body.surface.geometry;
    geometry.setAttribute('jellyIds', new BufferAttribute(body.surface.bindingIds, 4));
    geometry.setAttribute(
      'jellyWeights',
      new BufferAttribute(Float32Array.from(body.surface.bindingWeights), 4),
    );
    geometry.setAttribute('jellyRestNormal', new BufferAttribute(body.surface.restNormals, 3));
    const ids = attribute<'uvec4'>('jellyIds', 'uvec4'),
      weights = attribute<'vec4'>('jellyWeights', 'vec4');
    material.positionNode = Fn(() => {
      const row = (offset: number) =>
        data
          .element(ids.x.mul(4).add(offset))
          .xyz.mul(weights.x)
          .add(data.element(ids.y.mul(4).add(offset)).xyz.mul(weights.y))
          .add(data.element(ids.z.mul(4).add(offset)).xyz.mul(weights.z))
          .add(data.element(ids.w.mul(4).add(offset)).xyz.mul(weights.w));
      const a = row(1).toVar(),
        b = row(2).toVar(),
        c = row(3).toVar();
      const rest = attribute<'vec3'>('jellyRestNormal', 'vec3');
      normalLocal.assign(
        vec3(cross(b, c).dot(rest), cross(c, a).dot(rest), cross(a, b).dot(rest)).normalize(),
      );
      return row(0);
    })();
    body.gpuSurface = true;
    this.update();
  }
  update() {
    if (this.revision === this.body.surfaceRevision) return;
    const { x, nodalF } = this.body;
    for (let id = 0; id < x.length / 3; id++) {
      const at = id * 16;
      for (let k = 0; k < 3; k++) this.packed[at + k] = x[id * 3 + k];
      for (let row = 0; row < 3; row++)
        for (let k = 0; k < 3; k++)
          this.packed[at + 4 + row * 4 + k] = nodalF[id * 9 + row * 3 + k];
    }
    this.buffer.needsUpdate = true;
    this.revision = this.body.surfaceRevision;
  }
}
