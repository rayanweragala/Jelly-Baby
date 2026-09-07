import { RenderPipeline } from 'three/webgpu';
import type { WebGPURenderer, Scene, PerspectiveCamera } from 'three/webgpu';
import { pass, screenUV, float, vec3, vec4 } from 'three/tsl';

/** Linear HDR scene → grade → one AgX/output transform. */
// A bloom pass sat here. On an entry-level phone GPU its blur chain cost about a third of the
// frame (15.5 → 24 fps measured on a PowerVR GE8320) for a glow of strength .075, so the grade
// now runs straight off the scene colour.
export function createComposite(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera) {
  const scenePass = pass(scene, camera);
  const color = scenePass.getTextureNode('output');
  const vignette = screenUV.sub(0.5).length().smoothstep(0.24, 0.73).mul(0.065);
  const graded = color.rgb.mul(vec3(0.985, 1.01, 1.015)).mul(float(1).sub(vignette));
  const pipeline = new RenderPipeline(renderer, vec4(graded, color.a));
  return {
    render: () => pipeline.render(),
    dispose: () => {
      scenePass.dispose();
      pipeline.dispose();
    },
  };
}
