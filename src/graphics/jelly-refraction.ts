import { Color, Vector3, type MeshPhysicalNodeMaterial } from 'three/webgpu';
import {
  attribute,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  float,
  normalWorld,
  positionWorld,
  refract,
  uniform,
  vec2,
  vec4,
  viewportSharedTexture,
} from 'three/tsl';
import type { JellyFlavor } from './jelly-flavors.ts';

/** Same volume-ray construction as Three's physical transmission, without the mip blur chain.
 * The phone presets remain glossy; pearl uses its diffuse contribution for a milky interior.
 * ponytail: no chromatic dispersion or rough refraction blur; desktop retains Three's full path. */
export function jellyRefraction(material: MeshPhysicalNodeMaterial) {
  const tint = uniform(new Color()),
    absorption = uniform(new Vector3()),
    amount = uniform(1),
    ior = uniform(1.35);
  const thickness = attribute('opticalThickness', 'float') as unknown as ReturnType<typeof float>;
  const view = cameraPosition.sub(positionWorld).normalize();
  const normal = normalWorld.normalize();
  const ray = refract(view.negate(), normal, ior.reciprocal()).normalize().mul(thickness);
  const clip = cameraProjectionMatrix.mul(cameraViewMatrix.mul(vec4(positionWorld.add(ray), 1)));
  const projected = clip.xy.div(clip.w).mul(0.5).add(0.5);
  const background = viewportSharedTexture(
    vec2(projected.x, projected.y.oneMinus()).clamp(0.001, 0.999),
  );
  const f0 = ior.sub(1).div(ior.add(1)).pow(2);
  const fresnel = f0.add(f0.oneMinus().mul(normal.dot(view).saturate().oneMinus().pow(5)));
  material.transmission = 0;
  material.backdropNode = background.rgb
    .mul(tint)
    .mul(absorption.mul(thickness).negate().exp())
    .mul(fresnel.oneMinus());
  material.backdropAlphaNode = amount;
  return (look: JellyFlavor) => {
    tint.value.set(look.surface);
    absorption.value.fromArray(look.absorption);
    amount.value = look.transmission;
    ior.value = look.ior;
  };
}
