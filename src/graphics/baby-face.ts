import * as THREE from 'three/webgpu';
import { attribute, vec2, vec3 } from 'three/tsl';
import type { SoftBody } from '../physics/soft-body.js';
import { refinePatch } from './surface-details.ts';
import { FaceSkin, type FaceSkinBinding } from './face-skin.ts';
import { FaceExpression } from './face-expression.ts';

type Feature = 'eye' | 'blush' | 'brow' | 'mouth' | 'tongue';
type Detail = {
  mesh: THREE.Mesh;
  rest: Float32Array;
  bindings: FaceSkinBinding[];
  cx: number;
  cy: number;
  depth: number;
  kind: Feature;
};

export class BabyFace {
  private readonly details: Detail[] = [];
  private readonly skin: FaceSkin;
  private readonly expression = new FaceExpression();
  private readonly sample = new Float64Array(6);
  private surfaceVersion = -1;
  private lastBlink = -1;
  private lastSob = -1;
  private lastLaugh = -1;
  private lastSurprise = -1;
  private readonly body: SoftBody;
  constructor(body: SoftBody, group: THREE.Group, compact = false) {
    this.body = body;
    this.skin = new FaceSkin(body);
    const eye = new THREE.MeshPhysicalNodeMaterial({
      color: '#142905',
      roughness: 0.13,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
    });
    // A dome this small almost never catches the window, and an eye with no highlight reads as
    // painted on. Anchor the catchlight to the rest coordinates rather than the live ones: the
    // live positions are overwritten with deformed world space every frame, so a normal- or
    // position-driven highlight would slide around during a blink and the sob chevron.
    const eyeSpace = attribute('restPosition', 'vec3') as unknown as ReturnType<typeof vec3>;
    const catchlight = eyeSpace.xy
      .sub(vec2(-0.0012, 0.0017))
      .div(vec2(0.0011, 0.0012))
      .length()
      .oneMinus()
      .smoothstep(0, 0.55);
    eye.emissiveNode = vec3(0.78, 0.82, 0.72).mul(catchlight);
    const mouth = new THREE.MeshPhysicalNodeMaterial({
      color: '#254508',
      roughness: 0.24,
      clearcoat: 0.6,
    });
    const tongue = new THREE.MeshPhysicalNodeMaterial({
      color: '#b5d641',
      roughness: 0.24,
      clearcoat: 0.5,
    });
    const blush = new THREE.MeshPhysicalNodeMaterial({
      color: '#edab4f',
      roughness: 0.3,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    const add = (
      geometry: THREE.BufferGeometry,
      mat: THREE.Material,
      cx: number,
      cy: number,
      depth: number,
      kind: Feature,
    ) => {
      const rest = new Float32Array(geometry.getAttribute('position').array);
      // Keep the undeformed coordinates addressable from the shader; `position` is about to
      // become a live world-space buffer.
      geometry.setAttribute('restPosition', new THREE.BufferAttribute(rest, 3));
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array(rest.length), 3).setUsage(
          THREE.DynamicDrawUsage,
        ),
      );
      const mesh = new THREE.Mesh(geometry, mat);
      mesh.frustumCulled = false;
      // Surface ink must render after transmission to avoid a refracted duplicate.
      mat.transparent = true;
      mesh.renderOrder = 2;
      const bindings = Array.from({ length: rest.length / 3 }, () => this.skin.createBinding());
      group.add(mesh);
      this.details.push({ mesh, rest, bindings, cx, cy, depth, kind });
    };
    const oval = (x: number, y: number, z: number) =>
      new THREE.SphereGeometry(
        1,
        compact ? 20 : 40,
        compact ? 12 : 24,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2,
      )
        .rotateX(Math.PI / 2)
        .scale(x, y, z);
    for (const sign of [-1, 1]) {
      add(oval(0.00325, 0.0043, 0.0015), eye, sign * 0.0095, 0.0465, 0.0001, 'eye');
      add(oval(0.0043, 0.0024, 0.00016), blush, sign * 0.014, 0.0388, 0.0001, 'blush');
      const brow = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.0021, -0.0005, 0),
        new THREE.Vector3(0, 0.00045, 0),
        new THREE.Vector3(0.0021, -0.0002, 0),
      ]);
      add(
        new THREE.TubeGeometry(brow, 16, 0.00048, 8, false),
        mouth,
        sign * 0.0097,
        0.0542,
        0.00025,
        'brow',
      );
    }
    const smile = new THREE.Shape();
    smile.moveTo(-0.0046, 0.0019);
    smile.bezierCurveTo(-0.002, 0.0006, 0.002, 0.0006, 0.0046, 0.002);
    smile.bezierCurveTo(0.0055, -0.0046, -0.0048, -0.0052, -0.0046, 0.0019);
    add(
      refinePatch(new THREE.ShapeGeometry(smile, compact ? 12 : 24), compact ? 1 : 2),
      mouth,
      0,
      0.0389,
      0.00018,
      'mouth',
    );
    const lip = new THREE.Shape();
    lip.absellipse(0, 0, 0.0024, 0.00125, 0, Math.PI * 2, false, 0);
    add(
      refinePatch(new THREE.ShapeGeometry(lip, compact ? 12 : 24), compact ? 1 : 2),
      tongue,
      0,
      0.0368,
      0.00028,
      'tongue',
    );
  }
  reset() {
    this.expression.reset();
  }
  celebrate() {
    this.expression.celebrate();
  }
  update(dt: number) {
    this.expression.update(
      dt,
      this.body.grabs.length > 0,
      !this.body.grounded,
      this.body.grounded ? 0 : Math.sqrt((2 * this.body.energy()) / this.body.totalMass),
    );
    const { sob, laugh, blink, time, surprise } = this.expression;
    const version = this.body.gpuSurface
      ? this.body.surfaceRevision
      : this.body.surface.geometry.attributes.position.version;
    if (
      version === this.surfaceVersion &&
      blink === this.lastBlink &&
      sob === this.lastSob &&
      laugh === this.lastLaugh &&
      surprise === this.lastSurprise &&
      sob === 0 &&
      laugh === 0
    )
      return;
    this.surfaceVersion = version;
    this.lastBlink = blink;
    this.lastSob = sob;
    this.lastLaugh = laugh;
    this.lastSurprise = surprise;
    const quiver = Math.sin(time * 33) * 0.00022 * sob;
    const chuckle = (0.5 + 0.5 * Math.sin(time * 19)) * laugh;
    for (const { mesh, rest, bindings, cx, cy, depth, kind } of this.details) {
      const positions = mesh.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        let x = rest[i * 3],
          y = rest[i * 3 + 1],
          z = rest[i * 3 + 2];
        if (kind === 'eye') {
          y *= 1 + surprise * 0.13;
          // Fold the original oval into a thin chevron, with its point facing
          // the nose. Keeping the vertical parameter gives two distinct arms.
          // Allow for the diagonal arms so their visible width matches the brows.
          const squeezedX = x * 0.38 + Math.sign(cx) * (0.0055 * Math.abs(y / 0.0043) - 0.0028);
          const squeezedY = y * 0.67 + quiver * 0.35;
          const squeezedZ = z * 0.2;
          const close = Math.max(blink, laugh * 0.9);
          y *= 1 - close * 0.94;
          z *= 1 - close * 0.88;
          // Idle blinks and giggles blend into the grabbed > < silhouette.
          y += (1 - Math.min(1, (x / 0.00325) ** 2)) * laugh * 0.00125;
          x += (squeezedX - x) * sob;
          y += (squeezedY - y) * sob;
          z += (squeezedZ - z) * sob;
        } else if (kind === 'brow') {
          y += surprise * 0.001;
          const inner = (-Math.sign(cx) * x) / 0.0021;
          y += sob * (0.0006 + inner * 0.0011) + laugh * 0.00055;
          y += quiver * 0.6;
        } else if (kind === 'mouth' || kind === 'tongue') {
          // Transform mouth and tongue in one shared frame to keep the tongue inside.
          y += cy - 0.0389;
          x *= 1 - surprise * 0.3;
          y *= 1 + surprise * 0.25;
          x *= 1 - sob * 0.22 + laugh * 0.18;
          y *= 1 - sob * 0.48 + chuckle * 0.32;
          y += sob * (0.0011 - 0.003 * (x / 0.0046) ** 2) + quiver;
          y -= laugh * 0.0003;
          y -= cy - 0.0389;
        } else {
          y += laugh * 0.00065 + sob * 0.00025;
        }
        this.skin.sampleCached(
          x + cx,
          y + cy,
          Math.max(0.00008, z + depth),
          this.sample,
          bindings[i],
        );
        positions.setXYZ(i, this.sample[0], this.sample[1], this.sample[2]);
      }
      positions.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
  }
}
