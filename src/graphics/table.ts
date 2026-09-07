import * as THREE from 'three/webgpu';
import { texture, positionWorld, float, vec2, vec3, normalMap, uniform } from 'three/tsl';
import type { RefractiveLightField } from './refractive-light.js';

export async function makeTable(
  optics: RefractiveLightField,
  light: { color: THREE.Color; windowFraction: number; irradiance: number },
) {
  const loader = new THREE.TextureLoader();
  const urls = [
    new URL('../assets/wood_texture/wood_base.jpg', import.meta.url).href,
    new URL('../assets/wood_texture/wood_normal.png', import.meta.url).href,
    new URL('../assets/wood_texture/wood_roughness.jpg', import.meta.url).href,
  ];
  const [base, normal, roughness] = await Promise.all(urls.map((url) => loader.loadAsync(url)));
  base.colorSpace = THREE.SRGBColorSpace;
  for (const t of [base, normal, roughness]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  const uv = positionWorld.xz.div(2.5).add(0.5);
  const opticalUV = positionWorld.xz.sub(optics.originNode).div(optics.spanNode);
  const inside = float(
    opticalUV.x
      .greaterThan(0)
      .and(opticalUV.x.lessThan(1))
      .and(opticalUV.y.greaterThan(0))
      .and(opticalUV.y.lessThan(1)),
  );
  const shadowUV = positionWorld.xz.sub(optics.shadowOriginNode).div(optics.shadowSpanNode);
  const shadowInside = float(
    shadowUV.x
      .greaterThan(0)
      .and(shadowUV.x.lessThan(1))
      .and(shadowUV.y.greaterThan(0))
      .and(shadowUV.y.lessThan(1)),
  );
  const shadow = texture(optics.shadowTexture, shadowUV).r.mul(shadowInside);
  const contactUV = positionWorld.xz.sub(optics.contactOriginNode).div(optics.shadowSpanNode);
  const contactInside = float(
    contactUV.x
      .greaterThan(0)
      .and(contactUV.x.lessThan(1))
      .and(contactUV.y.greaterThan(0))
      .and(contactUV.y.lessThan(1)),
  );
  const contact = texture(optics.shadowTexture, contactUV).g.mul(contactInside);
  const albedo = texture(base, uv).rgb;
  // Clearcoat here cost ~3.6x the frame on an entry-level phone GPU: the table fills every pixel
  // and is drawn twice, once more behind the jelly's transmission. Standard material instead.
  const material = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.26 });
  const jellyTransmission = uniform(1);
  material.colorNode = albedo
    .mul(float(1).sub(shadow.mul(light.windowFraction)))
    .mul(float(1).sub(contact.mul(0.4)));
  // Plane UV-v points toward -Z; the metre-scaled world UV points toward +Z.
  material.normalNode = normalMap(texture(normal, uv), vec2(0.27, -0.27));
  material.roughnessNode = texture(roughness, uv).r.mul(0.3).add(0.12);
  material.emissiveNode = albedo
    .mul(texture(optics.lightTexture, opticalUV).rgb)
    .mul(light.irradiance / Math.PI)
    .mul(vec3(light.color.r, light.color.g, light.color.b))
    .mul(inside)
    .mul(jellyTransmission);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.00005;
  return {
    mesh,
    jellyTransmission,
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
      [base, normal, roughness].forEach((t) => t.dispose());
    },
  };
}
