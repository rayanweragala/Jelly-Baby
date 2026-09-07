import * as THREE from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';
import type { Input } from './input.ts';
import type { FlavorPicker } from './flavor-picker.ts';
import { HopRound, LEVELS, loadProgress, recordWin, needsRecovery } from './hop-rules.ts';

const PROGRESS_KEY = 'jelly-hop-progress';
const element = (id: string) => document.querySelector<HTMLElement>(`#${id}`)!;

/** Tabletop game state and UI; the original solver still owns every movement. */
export class HopGame {
  private round = new HopRound(0);
  private progress = loadProgress(null);
  private screen: 'home' | 'levels' | 'hop' | 'complete' | 'free' | 'skins' = 'home';
  private unsettled = 0;
  private abort = new AbortController();
  private pads = new THREE.Group();
  private target: THREE.Mesh;
  private body: SoftBody;
  private input: Input;
  private picker: FlavorPicker;
  private resetBody: () => void;
  private restoreSaveFailed = false;

  constructor(
    scene: THREE.Scene,
    body: SoftBody,
    input: Input,
    picker: FlavorPicker,
    resetBody: () => void,
  ) {
    this.body = body;
    this.input = input;
    this.picker = picker;
    this.resetBody = resetBody;
    try {
      this.progress = loadProgress(localStorage.getItem(PROGRESS_KEY));
    } catch {
      this.restoreSaveFailed = true;
    }
    const start = this.pad(0.038, '#fff5dc');
    this.target = this.pad(1, '#377764');
    this.pads.add(start, this.target);
    scene.add(this.pads);
    const { signal } = this.abort;
    const on = (id: string, fn: () => void) =>
      element(id).addEventListener('click', fn, { signal });
    on('play', () => this.start(this.progress.unlocked - 1));
    on('home', () => this.home());
    on('levels', () => this.levels());
    on('levels-back', () => this.home());
    on('skins-done', () => {
      this.picker.close();
      if (this.screen === 'skins') this.home();
    });
    on('complete-levels', () => this.levels());
    on('retry-level', () => this.start(this.round.levelIndex));
    on('next', () =>
      this.round.levelIndex < LEVELS.length - 1
        ? this.start(this.round.levelIndex + 1)
        : this.levels(),
    );
    on('free-play', () => {
      this.resetBody();
      this.screen = 'free';
      this.input.setMode('free');
      this.pads.visible = false;
      this.layout();
      element('play-hint').textContent = 'Grab, wobble, wander. Drag the table to orbit.';
    });
    on('skins', () => {
      this.screen = 'skins';
      this.input.setMode('preview');
      this.pads.visible = false;
      this.layout();
      this.picker.open();
    });
    window.addEventListener('jelly-storage-error', () => this.storageWarning(), { signal });
    window.addEventListener(
      'keydown',
      (event) => {
        if (
          event.key === 'Escape' &&
          !event.defaultPrevented &&
          !document.querySelector<HTMLDialogElement>('#diagnostics')?.open
        )
          this.back();
      },
      { signal },
    );
    this.input.onRelease = () => {
      if (this.screen !== 'hop') return;
      this.round.release();
      this.unsettled = 0;
      this.updateThrows();
      if (!this.progress.hintSeen) {
        this.progress.hintSeen = true;
        this.save();
        element('play-hint').textContent = 'Land in the green ring. Let the wobble settle.';
      }
    };
    this.home();
    if (this.restoreSaveFailed) this.storageWarning();
  }

  private pad(radius: number, color: string) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.78, radius, 64),
      new THREE.MeshBasicNodeMaterial({ color, side: THREE.DoubleSide, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.0002;
    mesh.renderOrder = 0;
    return mesh;
  }

  private pose(x = 0, z = 0) {
    const c = this.input.controls;
    c.target.set(x, 0.025, z);
    this.input.camera.position.set(x + 0.035, 0.235, z + 0.27);
    this.input.camera.lookAt(c.target);
    c.update();
  }

  private layout() {
    for (const [id, visible] of Object.entries({
      'home-panel': this.screen === 'home',
      'levels-panel': this.screen === 'levels',
      completion: this.screen === 'complete',
      hud: this.screen === 'hop' || this.screen === 'free',
      'play-footer': this.screen === 'hop' || this.screen === 'free',
    }))
      element(id).hidden = !visible;
    document.querySelector<HTMLElement>('.touch-controls')!.hidden = this.screen !== 'free';
    document.body.dataset.screen = this.screen;
    if (this.screen === 'free') {
      element('level-name').textContent = 'Free play';
      element('throw-count').textContent = 'Just for joy';
    }
  }

  private home() {
    this.screen = 'home';
    this.input.setMode('preview');
    this.picker.close();
    this.pads.visible = false;
    this.resetBody();
    this.pose();
    this.layout();
  }

  private levels() {
    this.screen = 'levels';
    this.input.setMode('preview');
    this.picker.close();
    this.pads.visible = false;
    this.layout();
    element('level-list').replaceChildren();
    LEVELS.forEach((level, index) => {
      const button = document.createElement('button');
      button.disabled = index >= this.progress.unlocked;
      const best = this.progress.best[index];
      button.textContent = `${index + 1}. ${level.name} · ${button.disabled ? 'Locked' : best === null ? 'New' : `Best: ${best} throw${best === 1 ? '' : 's'}`}`;
      button.addEventListener('click', () => this.start(index), { signal: this.abort.signal });
      element('level-list').appendChild(button);
    });
  }

  private start(index: number) {
    if (index < 0 || index >= this.progress.unlocked || index >= LEVELS.length) return;
    this.round = new HopRound(index);
    this.screen = 'hop';
    this.unsettled = 0;
    this.input.setMode('hop');
    this.resetBody();
    this.picker.close();
    const level = LEVELS[index];
    this.pads.visible = true;
    this.target.scale.setScalar(level.radius);
    this.target.position.set(level.x, 0.0002, level.z);
    this.pose(level.x / 2, level.z / 2);
    this.layout();
    this.updateThrows();
    element('level-name').textContent = `${index + 1} / 5 · ${level.name}`;
    element('play-hint').textContent = this.progress.hintSeen
      ? 'Land in the green ring. Let the wobble settle.'
      : 'Hold the jelly, stretch toward the ring, then let go.';
  }

  private updateThrows() {
    element('throw-count').textContent =
      `${this.round.throws} throw${this.round.throws === 1 ? '' : 's'}`;
  }
  private storageWarning() {
    element('notice').textContent = 'Saving is unavailable. You can still play this session.';
  }
  private save() {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(this.progress));
    } catch {
      this.storageWarning();
    }
  }

  reset = () => {
    if (this.screen === 'hop' || this.screen === 'complete') this.start(this.round.levelIndex);
    else {
      this.resetBody();
      this.pose();
    }
  };

  /** True when handled; Android may exit only from the home screen. */
  back() {
    const diagnostics = document.querySelector<HTMLDialogElement>('#diagnostics');
    if (diagnostics?.open) {
      diagnostics.close();
      return true;
    }
    if (this.screen === 'skins') {
      this.home();
      return true;
    }
    if (this.picker.isOpen) {
      this.picker.close();
      return true;
    }
    if (this.screen === 'home') return false;
    this.home();
    return true;
  }

  update(dt: number) {
    if (this.screen !== 'hop' && this.screen !== 'free') return;
    const b = this.body;
    const sample = {
      x: b.center.x,
      y: b.center.y,
      z: b.center.z,
      speed: Math.sqrt((2 * b.energy()) / b.totalMass),
      grounded: b.grounded,
      grabbing: !!b.grab,
    };
    if (!b.isFinite() || needsRecovery(sample)) {
      this.resetBody();
      this.unsettled = 0;
      this.round.update(0, { ...sample, grabbing: true });
      element('play-hint').textContent = 'Back on the table. Give it another little throw.';
      return;
    }
    if (this.screen === 'free') return;
    if (!sample.grabbing && (sample.speed > 0.025 || !sample.grounded)) this.unsettled += dt;
    else this.unsettled = 0;
    if (this.unsettled > 15) {
      this.resetBody();
      this.unsettled = 0;
      this.round.update(0, { ...sample, grabbing: true });
      element('play-hint').textContent =
        'Untangled! Your throw count stays. Try a gentler stretch.';
      return;
    }
    if (this.round.update(dt, sample)) {
      this.progress = recordWin(this.progress, this.round.levelIndex, this.round.throws);
      this.save();
      this.screen = 'complete';
      this.input.setMode('preview');
      this.layout();
      element('result').textContent =
        `${this.round.throws} throw${this.round.throws === 1 ? '' : 's'} · personal best ${this.progress.best[this.round.levelIndex]}`;
      element('next').textContent =
        this.round.levelIndex === LEVELS.length - 1
          ? 'All five! Pick another spot'
          : 'Next little adventure ↗';
      element('next').focus({ preventScroll: true });
    }
  }

  dispose() {
    this.abort.abort();
    this.input.onRelease = () => {};
    this.pads.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.pads.removeFromParent();
  }
}
