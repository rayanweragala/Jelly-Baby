import * as THREE from 'three/webgpu';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { diagnostic } from '../game/diagnostics.ts';

export async function createRenderer(fail: (e: unknown) => void) {
  if (!window.isSecureContext) throw new Error('Please open this game over HTTPS or localhost.');
  if (!navigator.gpu)
    throw new Error('This browser does not support WebGPU. Open in a WebGPU-capable browser.');
  // Match Three's compatibility adapter request; some phones expose no core adapter.
  const probe = await navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
    featureLevel: 'compatibility',
  } as GPURequestAdapterOptions);
  if (!probe) throw new Error('No WebGPU adapter is available on this device.');
  // Request advertised limits for vertex storage; for..in includes prototype getters.
  const supported = probe.limits as unknown as Record<string, unknown>;
  const requiredLimits: Record<string, number> = {};
  for (const key in supported) {
    const value = supported[key];
    if (typeof value === 'number' && Number.isFinite(value)) requiredLimits[key] = value;
  }
  diagnostic('Requested limits', JSON.stringify(requiredLimits));
  const renderer = new THREE.WebGPURenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    requiredLimits,
  });
  // r185 normally installs a WebGL fallback factory. Reject before it is invoked.
  (renderer as unknown as { _getFallback: null })._getFallback = null;
  let fatal: Error | null = null;
  const lost = renderer.onDeviceLost.bind(renderer),
    error = renderer.onError.bind(renderer);
  renderer.onDeviceLost = (info) => {
    diagnostic('Device loss', info.message);
    lost(info);
    fatal = new Error(`WebGPU device lost: ${info.message}`);
    fail(fatal);
    void renderer.setAnimationLoop(null);
  };
  renderer.onError = (info) => {
    const gpuInfo = info as unknown as { type: string; message: string };
    diagnostic('GPU error', `${gpuInfo.type}: ${gpuInfo.message}`);
    error(info);
    fatal = new Error(`WebGPU ${gpuInfo.type}: ${gpuInfo.message}`);
    fail(fatal);
    void renderer.setAnimationLoop(null);
  };
  diagnostic('Adapter', 'Requesting through Three.js WebGPU backend');
  diagnostic('Device', 'Initializing');
  try {
    await renderer.init();
  } catch (error) {
    diagnostic(
      'Adapter',
      String(error).includes('adapter')
        ? 'Adapter request failed'
        : 'See device initialization error',
    );
    diagnostic('Device', `Initialization failed: ${String(error)}`);
    throw error;
  }
  if (fatal) throw fatal;
  if (!(renderer.backend as unknown as { isWebGPUBackend: boolean }).isWebGPUBackend)
    throw new Error('WebGPU is required.');
  let disposing = false;
  const dispose = renderer.dispose.bind(renderer);
  renderer.dispose = () => {
    disposing = true;
    dispose();
  };
  const device = (renderer.backend as unknown as { device: GPUDevice }).device;
  const info = device.adapterInfo;
  diagnostic(
    'Adapter',
    info
      ? JSON.stringify({
          vendor: info.vendor,
          architecture: info.architecture,
          device: info.device,
          description: info.description,
        })
      : 'Initialized; identity unavailable',
  );
  diagnostic('Device', 'Initialized — WebGPU backend');
  void device.lost.then((info) => {
    // Three forwards non-destroyed loss. A destruction outside our teardown is fatal too.
    if (info.reason === 'destroyed' && !disposing) {
      fail(new Error('WebGPU device was unexpectedly destroyed'));
      void renderer.setAnimationLoop(null);
    }
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute(
    'aria-label',
    'Jelly baby. Use the touch joystick or WASD to walk, Space to jump. Drag the baby to stretch; drag the table to orbit.',
  );
  return renderer;
}

// Reduce fill cost on slower GPUs while retaining full resolution when affordable.
let qualityScale = 1;
const MIN_QUALITY_SCALE = 0.45;

export function currentQualityScale() {
  return qualityScale;
}

/** Returns true when the scale moved and the view needs resizing. */
export function adaptQuality(fps: number) {
  const previous = qualityScale;
  if (fps < 45) qualityScale = Math.max(MIN_QUALITY_SCALE, qualityScale * 0.82);
  else if (fps > 50) qualityScale = Math.min(1, qualityScale / 0.82);
  return qualityScale !== previous;
}

export function resizeView(
  renderer: THREE.WebGPURenderer,
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
) {
  if (window.innerWidth <= 0 || window.innerHeight <= 0) return;
  const width = Math.max(1, window.innerWidth),
    height = Math.max(1, window.innerHeight);
  const dpr =
    Math.min(window.devicePixelRatio, 1.7, Math.sqrt(4_000_000 / (width * height))) * qualityScale;
  renderer.setDrawingBufferSize(width, height, Number.isFinite(dpr) && dpr > 0 ? dpr : 1);
  camera.aspect = width / height;
  camera.fov =
    (2 * Math.atan(Math.tan((18 * Math.PI) / 180) * Math.max(1, 0.85 / camera.aspect)) * 180) /
    Math.PI;
  // Android large screens may override portrait; keep both pads in the short viewport.
  if (width > height) camera.fov = Math.max(64, camera.fov);
  // Every visible ray meets the tabletop. The horizon never enters the frame.
  controls.maxPolarAngle = Math.PI / 2 - THREE.MathUtils.degToRad(camera.fov) / 2 - 0.1;
  camera.setViewOffset(width, height, 0, height * (width < 700 ? 0.075 : 0.025), width, height);
  camera.updateProjectionMatrix();
  controls.update();
}
