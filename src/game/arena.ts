import * as THREE from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';

// Hysteresis lets a jelly resting at the edge sleep instead of correcting every step.
const RESTORE = 0.9;
const TRIGGER = 0.95;
const WALL_RESTITUTION = 0.35;

// Post-step containment is shared by the JS and WebAssembly solvers.
export class Arena {
  private readonly viewProjection = new THREE.Matrix4();
  private readonly inverse = new THREE.Matrix4();
  private readonly point = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private ready = false;

  update(camera: THREE.PerspectiveCamera) {
    camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.inverse.copy(this.viewProjection).invert();
    this.ready = true;
  }

  // Translate rigidly to avoid fighting elastic recovery; reflect velocity per node.
  contain(body: SoftBody) {
    // A high arc can cross the screen edge without leaving the table. Let it land first.
    if (!this.ready || body.grab || !body.grounded) return;
    const x = body.x,
      v = body.velocity;
    let totalX = 0,
      totalZ = 0;
    // Moving the body rigidly changes what every other node needs, so re-measure and repeat.
    for (let round = 0; round < 4; round++) {
      // Track the furthest correction demanded in each direction. Nodes can be over different
      // edges at once, so applying only the single largest leaves the others hanging out.
      let minX = 0,
        maxX = 0,
        minZ = 0,
        maxZ = 0;
      for (let i = 0; i < x.length; i += 3) {
        let dx = 0,
          dz = 0;
        // Sliding sideways also changes distance from the eye, so one correction undershoots;
        // near the top of the frame, where the view grazes the table, it undershoots badly. This
        // is a bound, not a cost: it exits as soon as the node is inside, which is immediately for
        // every node that never left.
        for (let pass = 0; pass < 8; pass++) {
          const ndc = this.point
            .set(x[i] + dx, x[i + 1], x[i + 2] + dz)
            .applyMatrix4(this.viewProjection);
          // Anything behind the eye has no meaningful frame position; leave it to the solver.
          if (!(ndc.z > -1 && ndc.z < 1)) break;
          const overX = ndc.x < -TRIGGER || ndc.x > TRIGGER;
          const overY = ndc.y < -TRIGGER || ndc.y > TRIGGER;
          if (!overX && !overY) break;
          this.target
            .set(
              overX ? Math.sign(ndc.x) * RESTORE : ndc.x,
              overY ? Math.sign(ndc.y) * RESTORE : ndc.y,
              ndc.z,
            )
            .applyMatrix4(this.inverse);
          // Walls are vertical: correct on the table, never lift the body off it.
          dx = this.target.x - x[i];
          dz = this.target.z - x[i + 2];
        }
        if (dx < minX) minX = dx;
        if (dx > maxX) maxX = dx;
        if (dz < minZ) minZ = dz;
        if (dz > maxZ) maxZ = dz;
      }
      const pushX = maxX > -minX ? maxX : minX;
      const pushZ = maxZ > -minZ ? maxZ : minZ;
      if (!(Math.hypot(pushX, pushZ) > 1e-12)) break;
      for (let i = 0; i < x.length; i += 3) {
        x[i] += pushX;
        x[i + 2] += pushZ;
      }
      totalX += pushX;
      totalZ += pushZ;
    }
    const worst = Math.hypot(totalX, totalZ);
    if (!(worst > 1e-12)) return;
    body.updateCenter();
    body.kernel?.setCenter(body.center);
    for (const grab of body.grabs) {
      grab.point.x += totalX;
      grab.point.z += totalZ;
    }
    body.surfaceDirty = true;
    body.wake();
    const nx = totalX / worst,
      nz = totalZ / worst;
    for (let i = 0; i < v.length; i += 3) {
      const outward = v[i] * nx + v[i + 2] * nz;
      if (outward >= 0) continue;
      const impulse = -outward * (1 + WALL_RESTITUTION);
      v[i] += nx * impulse;
      v[i + 2] += nz * impulse;
    }
  }

  /** How far past the edge of the frame a world point sits, in half-frames. Zero when in view. */
  beyondFrame(x: number, y: number, z: number) {
    if (!this.ready) return 0;
    const ndc = this.point.set(x, y, z).applyMatrix4(this.viewProjection);
    return Math.max(0, Math.abs(ndc.x) - 1, Math.abs(ndc.y) - 1);
  }
}
