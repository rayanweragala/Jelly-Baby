import * as THREE from 'three/webgpu';
import { attribute } from 'three/tsl';
import { BabyFace } from './baby-face.ts';
import type { SoftBody } from '../physics/soft-body.js';
import { DEFAULT_JELLY_FLAVOR, JELLY_FLAVORS, type JellyFlavorName } from './jelly-flavors.ts';
import { jellyRefraction } from './jelly-refraction.ts';
import type { RefractiveLightField } from './refractive-light.js';
import { JellyDeformation } from './jelly-deformation.ts';

export const ABSORPTION = JELLY_FLAVORS[DEFAULT_JELLY_FLAVOR].absorption;

export class Baby {
  readonly mesh: THREE.Mesh;
  readonly group = new THREE.Group();
  private readonly face: BabyFace;
  private readonly jellyMaterial: THREE.MeshPhysicalNodeMaterial;
  private readonly updateRefraction: ReturnType<typeof jellyRefraction> | null;
  private readonly deformation: JellyDeformation | null;
  readonly body: SoftBody;
  constructor(
    body: SoftBody,
    compact = false,
    optics: RefractiveLightField | null = null,
    windowFraction = 0,
  ) {
    this.body = body;
    const material = new THREE.MeshPhysicalNodeMaterial({
      color: JELLY_FLAVORS[DEFAULT_JELLY_FLAVOR].surface,
      roughness: 0.085,
      metalness: 0,
      transmission: 1,
      thickness: 0.035,
      ior: 1.35,
      attenuationDistance: 0.035,
      dispersion: 0.025,
      clearcoat: 0.42,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.05,
      transparent: false,
      side: THREE.FrontSide,
      flatShading: false,
    });
    this.jellyMaterial = material;
    this.updateRefraction = compact ? jellyRefraction(material, optics, windowFraction) : null;
    material.thicknessNode = attribute('opticalThickness', 'float');
    this.setFlavor(DEFAULT_JELLY_FLAVOR);
    this.mesh = new THREE.Mesh(body.surface.geometry, material);
    this.mesh.renderOrder = 1;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.face = new BabyFace(body, this.group, compact);
    this.deformation = compact ? new JellyDeformation(body, material) : null;
    this.update();
  }
  setFlavor(flavor: JellyFlavorName) {
    const look = JELLY_FLAVORS[flavor];
    this.jellyMaterial.color.set(look.surface);
    this.jellyMaterial.roughness = look.roughness;
    this.jellyMaterial.clearcoat = look.clearcoat;
    this.jellyMaterial.clearcoatRoughness = look.clearcoatRoughness;
    this.jellyMaterial.ior = look.ior;
    this.jellyMaterial.transmission = this.updateRefraction ? 0 : look.transmission;
    this.updateRefraction?.(look);
    this.jellyMaterial.attenuationDistance = look.attenuationDistance;
    this.jellyMaterial.attenuationColor.setRGB(
      ...(look.absorption.map((value) => Math.exp(-value * look.attenuationDistance)) as [
        number,
        number,
        number,
      ]),
      THREE.LinearSRGBColorSpace,
    );
  }
  update(dt = 0) {
    this.deformation?.update();
    this.face.update(dt);
  }
  resetFace() {
    this.face.reset();
  }
  celebrate() {
    this.face.celebrate();
  }
  dispose() {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((m) => m.dispose());
      }
    });
  }
}
