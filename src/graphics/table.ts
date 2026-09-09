import * as THREE from 'three/webgpu';
import { positionWorld, float, vec3, uniform, texture } from 'three/tsl';
import type { RefractiveLightField } from './refractive-light.js';

const WATER_NEAR = new THREE.Color('#1B4657');
const WATER_FAR = new THREE.Color('#0E2B36');

export async function makeTable(
  optics: RefractiveLightField,
  light: { color: THREE.Color; windowFraction: number; irradiance: number },
) {
  const opticalUV = positionWorld.xz.sub(optics.originNode).div(optics.spanNode);
  const inside = float(
    opticalUV.x
      .greaterThan(0)
      .and(opticalUV.x.lessThan(1))
      .and(opticalUV.y.greaterThan(0))
      .and(opticalUV.y.lessThan(1)),
  );
  const tide = positionWorld.z.mul(0.05).add(0.5).clamp(0, 1);
  const water = tide.mix(
    vec3(WATER_FAR.r, WATER_FAR.g, WATER_FAR.b),
    vec3(WATER_NEAR.r, WATER_NEAR.g, WATER_NEAR.b),
  );
  // Clearcoat here cost ~3.6x the frame on an entry-level phone GPU: the table fills every pixel
  // and is drawn twice, once more behind the jelly's transmission. Standard material instead.
  const material = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.18 });
  const jellyTransmission = uniform(1);
  material.colorNode = water.mul(optics.groundAttenuation(positionWorld.xz, light.windowFraction));
  material.emissiveNode = water
    .mul(texture(optics.lightTexture, opticalUV).rgb)
    .mul(light.irradiance / Math.PI)
    .mul(vec3(light.color.r, light.color.g, light.color.b))
    .mul(inside)
    .mul(jellyTransmission);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material);
  // Keep the receiver behind stones even on WebViews that lose depth between passes.
  mesh.renderOrder = -2;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.00005;
  return {
    mesh,
    jellyTransmission,
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
