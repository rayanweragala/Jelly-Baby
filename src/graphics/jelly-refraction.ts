import { Color, Vector3, type MeshPhysicalNodeMaterial } from 'three/webgpu';
import { attribute, cameraPosition, float, normalWorld, positionWorld, uniform } from 'three/tsl';
import type { JellyFlavor } from './jelly-flavors.ts';
import type { RefractiveLightField } from './refractive-light.js';

/** Forward scattering through thin sweet. Weighted by geometry rather than by per-channel
 * absorption: a green sweet barely absorbs green, so a transmittance-weighted glow just lifts the
 * whole body. Measured optical depth runs 12-62 mm, so this falloff leaves the dome alone. */
const EDGE_DEPTH = 0.014;
const EDGE_GLOW = 0.45;
const RIM_GLOW = 0.34;

/** Single-pass gel for mobile. No framebuffer sample: PowerVR loses depth across that pass break,
 * and sharp stones/rings behind the body read as bands instead of jelly. */
export function jellyRefraction(
  material: MeshPhysicalNodeMaterial,
  _optics: RefractiveLightField | null = null,
  _windowFraction = 0,
) {
  // Keep the shared material factory call compatible with the desktop optics setup.
  void _optics;
  void _windowFraction;
  const tint = uniform(new Color()),
    absorption = uniform(new Vector3()),
    amount = uniform(1),
    ior = uniform(1.35);
  const thickness = attribute('opticalThickness', 'float') as unknown as ReturnType<typeof float>;
  const view = cameraPosition.sub(positionWorld).normalize();
  const normal = normalWorld.normalize();
  const f0 = ior.sub(1).div(ior.add(1)).pow(2);
  const fresnel = f0.add(f0.oneMinus().mul(normal.dot(view).saturate().oneMinus().pow(5)));
  material.transmission = 0;
  // Thin parts of a real sweet carry their own colour even with nothing bright behind them.
  const gelTint = tint.rgb;
  const transmittance = absorption.mul(thickness.mul(0.55)).negate().exp();
  const thinness = thickness.mul(-1 / EDGE_DEPTH).exp();
  material.backdropNode = gelTint
    .mul(transmittance)
    .mul(0.88)
    .add(gelTint.mul(thinness).mul(EDGE_GLOW))
    .add(gelTint.mul(fresnel).mul(RIM_GLOW));
  material.backdropAlphaNode = amount.mul(0.72);
  return (look: JellyFlavor) => {
    // Absorption carries the body colour; a lighter tint keeps thin edges luminous.
    tint.value.set(look.surface).lerp(new Color('#ffffff'), 0.35);
    absorption.value.fromArray(look.absorption);
    amount.value = look.transmission;
    ior.value = look.ior;
  };
}
