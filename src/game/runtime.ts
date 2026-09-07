import * as THREE from 'three/webgpu';
import { Capacitor } from '@capacitor/core';
import { SoftBody } from '../physics/soft-body.js';
import { PHYS } from '../physics/constants.js';
import { loadBabyCage } from '../physics/baby-cage.ts';
import { RefractiveLightField } from '../graphics/refractive-light.js';
import { Baby, ABSORPTION } from '../graphics/baby.ts';
import { loadEnvironment } from '../graphics/environment.ts';
import { makeTable } from '../graphics/table.ts';
import { Locomotion } from './locomotion.ts';
import { Input } from './input.ts';
import { JellySound } from './sound.ts';
import {
  adaptQuality,
  currentQualityScale,
  createRenderer,
  resizeView,
} from '../graphics/renderer.ts';
import { OpticalTransport } from '../graphics/transport.ts';
import { createComposite } from '../graphics/composite.ts';
import { FixedStepper } from './fixed-step.ts';
import { JELLY_FLAVORS } from '../graphics/jelly-flavors.ts';
import { FlavorPicker } from './flavor-picker.ts';
import { diagnostic } from './diagnostics.ts';
import { HopGame } from './hop-game.ts';
import { androidLifecycle } from './android.ts';

export async function startGame(
  stage: (s: string) => void,
  fail: (e: unknown) => void,
  registerStop: (stop: () => void) => void = () => {},
) {
  let disposed = false;
  const cleanup: (() => void)[] = [];
  const own = (dispose: () => void) => {
    if (disposed) dispose();
    else cleanup.push(dispose);
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const release of cleanup.reverse())
      try {
        release();
      } catch (error) {
        console.warn('Jelly cleanup', error);
      }
  };
  registerStop(dispose);
  try {
    stage('Starting WebGPU');
    const renderer = await createRenderer(fail);
    own(() => {
      void renderer.setAnimationLoop(null);
      renderer.dispose();
    });
    document.querySelector('#viewport')!.appendChild(renderer.domElement);
    // Construct audio before the remaining async scene work so the first mobile
    // gesture can unlock Web Audio even while assets and shaders are settling.
    const sound = new JellySound();
    own(() => sound.dispose());
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e8d9c3');
    scene.fog = new THREE.Fog('#e8d9c3', 2, 12);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.001, 40);
    camera.position.set(0.082, 0.126, 0.19);
    stage('Reading the light');
    const environment = await loadEnvironment(renderer, scene);
    own(() => environment.dispose());
    stage('Making a little jelly');
    const mobile = Capacitor.getPlatform() === 'android';
    const body = new SoftBody(await loadBabyCage(mobile));
    diagnostic(
      'Model',
      `${mobile ? 'Android' : 'Original'} surface; ${body.surface.positions.length / 3} vertices; ${body.elements.length} soft-body elements`,
    );
    const baby = new Baby(body, mobile);
    scene.add(baby.group);
    own(() => baby.dispose());
    const optics = new RefractiveLightField(
      body.cage.opticalSurface,
      environment.incoming,
      ABSORPTION,
    );
    own(() => optics.dispose());
    const table = await makeTable(optics, environment);
    scene.add(table.mesh);
    own(() => table.dispose());
    const composite = createComposite(renderer, scene, camera);
    own(() => composite.dispose());
    const rig = new Locomotion(body);
    const flavorPicker = new FlavorPicker((flavor) => {
      baby.setFlavor(flavor);
      optics.setAbsorption(JELLY_FLAVORS[flavor].absorption);
      table.jellyTransmission.value = JELLY_FLAVORS[flavor].transmission;
    });
    own(() => flavorPicker.dispose());
    rig.onContact = (speed, foot) => sound.contact(speed, foot);
    const physicsClock = new FixedStepper(PHYS.step);
    let lastTime = 0,
      active = true,
      frameCount = 0,
      frameSeconds = 0;
    let hop: HopGame;
    const resetBody = () => {
      input.recenter();
      body.reset();
      baby.resetFace();
      physicsClock.reset();
    };
    const reset = () => hop.reset();
    const input = new Input(camera, renderer.domElement, body, baby.mesh, rig, sound, reset);
    own(() => input.dispose());
    hop = new HopGame(scene, body, input, flavorPicker, resetBody);
    own(() => hop.dispose());
    const setActive = (value: boolean) => {
      active = value;
      input.clear();
      physicsClock.reset();
      lastTime = performance.now();
      sound.setActive(value && !document.hidden);
      frameCount = 0;
      frameSeconds = 0;
      diagnostic('Lifecycle', value ? 'Active' : 'Background — simulation and audio paused');
    };
    const visibility = () => {
      input.clear();
      physicsClock.reset();
      lastTime = performance.now();
      sound.setActive(active && !document.hidden);
    };
    document.addEventListener('visibilitychange', visibility);
    own(() => document.removeEventListener('visibilitychange', visibility));
    const removeAndroid = await androidLifecycle(setActive, () => hop.back());
    own(removeAndroid);
    const transport = new OpticalTransport(optics, body, camera, environment.incoming, fail);
    own(() => transport.dispose());
    const resize = () => resizeView(renderer, camera, input.controls);
    let resizeFrame = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(resize);
    });
    own(() => {
      resizeObserver.disconnect();
      cancelAnimationFrame(resizeFrame);
    });
    resizeObserver.observe(document.querySelector('#viewport')!);
    resize();
    document.querySelector('#reset')!.addEventListener('click', (event) => {
      reset();
      if ((event as MouseEvent).detail > 0) (event.currentTarget as HTMLButtonElement).blur();
    });
    document.querySelector('#sound')!.addEventListener('click', (event) => {
      const muted = sound.toggle(),
        button = document.querySelector('#sound')!;
      button.setAttribute('aria-pressed', String(muted));
      button.setAttribute('aria-label', muted ? 'Enable sound' : 'Mute sound');
      button.classList.toggle('muted', muted);
      void sound.unlock().catch(() => {});
      button.textContent = muted ? 'Muted' : 'Sound';
      try {
        localStorage.setItem('jelly-hop-muted', String(muted));
      } catch {
        window.dispatchEvent(new CustomEvent('jelly-storage-error'));
      }
      if ((event as MouseEvent).detail > 0) (event.currentTarget as HTMLButtonElement).blur();
    });
    try {
      if (localStorage.getItem('jelly-hop-muted') === 'true') {
        sound.toggle();
        const button = document.querySelector('#sound')!;
        button.textContent = 'Muted';
        button.classList.add('muted');
        button.setAttribute('aria-pressed', 'true');
        button.setAttribute('aria-label', 'Enable sound');
      }
    } catch {
      window.dispatchEvent(new CustomEvent('jelly-storage-error'));
    }
    stage('Settling in');
    // Let contact establish itself before displaying the first frame.
    for (let i = 0; i < 80; i++) {
      rig.step(PHYS.step);
      body.step(PHYS.step);
    }
    body.updateSurface();
    baby.update();
    input.update(1);
    optics.update(renderer, body, true);
    await transport.update();
    stage('Compiling the material');
    await renderer.compileAsync(scene, camera);
    stage('Drawing the first frame');
    composite.render();
    diagnostic('First frame', 'Submitted; awaiting GPU completion');
    // Fence first-frame GPU work so validation/OOM cannot masquerade as a successful boot.
    const backend = renderer.backend as unknown as { device: GPUDevice };
    await backend.device.queue.onSubmittedWorkDone();
    if (disposed) throw new Error('Startup stopped');
    diagnostic(
      'First frame',
      'GPU work completed; visible output needs physical-device confirmation',
    );
    lastTime = performance.now();
    const frame = (time: number) => {
      if (disposed) return;
      try {
        const elapsed = Math.max(0, (time - lastTime) / 1000),
          dt = Math.min(0.05, elapsed);
        lastTime = time;
        if (document.hidden || !active) {
          physicsClock.reset();
          return;
        }
        const steps = physicsClock.advance(dt, () => {
          input.step(PHYS.step);
          rig.step(PHYS.step);
          body.step(PHYS.step);
          input.afterPhysicsStep();
          rig.afterStep();
        });
        hop.update(steps * PHYS.step);
        if (steps && body.surfaceDirty) {
          if (!body.isFinite())
            throw new Error('The soft-body simulation produced an invalid state');
          body.updateSurface();
        }
        baby.update(dt);
        input.update(dt);
        transport.follow();
        optics.update(renderer, body);
        table.mesh.position.x = body.center.x;
        table.mesh.position.z = body.center.z;
        void transport.update().catch(fail);
        composite.render();
        frameCount++;
        frameSeconds += elapsed;
        if (frameSeconds >= 2) {
          const fps = frameCount / frameSeconds;
          const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
          diagnostic(
            'Recent frame rate',
            `${fps.toFixed(1)} fps; buffer ${buffer.x}x${buffer.y}; scale ${currentQualityScale().toFixed(2)}`,
          );
          frameCount = 0;
          frameSeconds = 0;
          if (adaptQuality(fps)) resize();
        }
      } catch (error) {
        fail(error);
      }
    };
    await renderer.setAnimationLoop(frame);
    window.addEventListener('pagehide', (event) => {
      if (!event.persisted) dispose();
    });
    if (import.meta.hot) import.meta.hot.dispose(dispose);
    return { stop: dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}
