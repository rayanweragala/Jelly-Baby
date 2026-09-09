import * as THREE from 'three/webgpu';
import type { SoftBody } from '../physics/soft-body.js';
import type { Input } from './input.ts';
import type { FlavorPicker } from './flavor-picker.ts';
import {
  HopRound,
  LEVELS,
  loadProgress,
  recordWin,
  needsRecovery,
  medalForAccuracy,
} from './hop-rules.ts';

const PROGRESS_KEY = 'jelly-hop-progress';
const STONE_DEPTH = 0.009;
const element = (id: string) => document.querySelector<HTMLElement>(`#${id}`)!;
const optionalElement = (id: string) => document.querySelector<HTMLElement>(`#${id}`);

/** Tabletop game state and UI; the original solver still owns every movement. */
export class HopGame {
  private round = new HopRound(0);
  private progress = loadProgress(null);
  private screen: 'home' | 'levels' | 'hop' | 'complete' | 'free' | 'skins' = 'home';
  private unsettled = 0;
  private abort = new AbortController();
  private pads = new THREE.Group();
  private startStone: THREE.Mesh;
  private targetStone: THREE.Mesh;
  private startPad: THREE.Mesh;
  private target: THREE.Mesh;
  private gold: THREE.Mesh;
  private silver: THREE.Mesh;
  onComplete: () => void = () => {};
  onFeedback: (cue: 'release' | 'settle' | 'reset' | 'menu') => void = () => {};
  private recoveringFor = 0;
  private wasSettling = false;
  get paused() {
    return !!document.querySelector<HTMLDialogElement>('#pause-menu')?.open;
  }
  private body: SoftBody;
  private input: Input;
  private picker: FlavorPicker;
  private resetBody: () => void;
  private restoreSaveFailed = false;
  private cueStart = new THREE.Vector3();
  private cueEnd = new THREE.Vector3();
  private targetPoint = new THREE.Vector3();
  private feedbackText = '';

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
    this.startStone = this.stone(0.038);
    this.targetStone = this.stone(1);
    this.startPad = this.pad(0.038, '#fff5dc');
    this.target = this.pad(1, '#66D6BA');
    this.gold = this.pad(0.2, '#bd822e');
    this.silver = this.pad(0.5, '#faf1db');
    for (const ring of [this.gold, this.silver]) {
      ring.rotation.x = 0;
      ring.position.set(0, 0, 0.002);
      this.target.add(ring);
    }
    this.pads.add(this.startStone, this.targetStone, this.startPad, this.target);
    scene.add(this.pads);
    const { signal } = this.abort;
    const on = (id: string, fn: () => void) =>
      element(id).addEventListener('click', fn, { signal });
    on('play', () => this.start(this.progress.unlocked - 1));
    on('home', () =>
      this.screen === 'hop' || this.screen === 'free' ? this.pause() : this.home(),
    );
    on('resume', () => this.resume());
    on('pause-home', () => {
      this.resume();
      this.home();
    });
    element('pause-menu').addEventListener(
      'cancel',
      (event) => {
        event.preventDefault();
        this.resume();
      },
      { signal },
    );
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
      element('play-hint').textContent = 'Grab, wobble, wander. Drag the water to orbit.';
    });
    on('skins', () => {
      this.screen = 'skins';
      this.input.setMode('preview');
      this.pose(this.body.center.x, this.body.center.z);
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
          !document.querySelector<HTMLDialogElement>('#diagnostics')?.open &&
          this.back()
        )
          event.preventDefault();
      },
      { signal },
    );
    this.input.onRelease = () => {
      if (this.screen !== 'hop') return;
      this.round.release();
      this.onFeedback('release');
      this.unsettled = 0;
      this.updateThrows();
      if (!this.progress.hintSeen) {
        this.progress.hintSeen = true;
        this.save();
        element('play-hint').textContent = LEVELS[this.round.levelIndex].challenge;
      }
    };
    this.home();
    if (this.restoreSaveFailed) this.storageWarning();
  }

  private stone(radius: number) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 0.94, STONE_DEPTH, 64),
      new THREE.MeshStandardNodeMaterial({ color: '#B2B8B0', roughness: 0.8 }),
    );
    mesh.position.y = -STONE_DEPTH / 2;
    mesh.renderOrder = -1;
    return mesh;
  }

  private pad(radius: number, color: string) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(radius * 0.84, radius, 64),
      new THREE.MeshBasicNodeMaterial({ color, side: THREE.DoubleSide, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.0002;
    mesh.renderOrder = 0;
    return mesh;
  }

  private pose(x = 0, z = 0) {
    const c = this.input.controls;
    const preview = this.screen === 'home' || this.screen === 'skins';
    const distance = preview ? 1.4 : 1;
    c.target.set(x, this.screen === 'skins' ? -0.06 : 0.025, z);
    this.input.camera.position.set(
      x + 0.035 * distance,
      0.025 + 0.21 * distance,
      z + 0.27 * distance,
    );
    this.input.camera.lookAt(c.target);
    c.update();
  }

  private layout() {
    element('power-ring').hidden = true;
    element('recovery-ripple').hidden = true;
    this.recoveringFor = 0;
    element('stretch-cue').hidden = true;
    element('shot-feedback').hidden = true;
    const targetLabel = optionalElement('target-label');
    if (targetLabel) targetLabel.hidden = this.screen !== 'hop';
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
    this.pads.visible = this.screen !== 'levels';
    this.startStone.visible =
      this.screen === 'home' || this.screen === 'skins' || this.screen === 'free';
    this.targetStone.visible = this.screen === 'hop' || this.screen === 'complete';
    this.target.visible = this.targetStone.visible;
    this.startPad.visible = this.startStone.visible || this.screen === 'hop';
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
    this.updateHomeLabels();
  }

  private pause() {
    if (this.paused) return;
    this.picker.close();
    this.input.setMode('preview');
    element('stretch-cue').hidden = true;
    element('power-ring').hidden = true;
    (element('pause-menu') as HTMLDialogElement).showModal();
    this.onFeedback('menu');
  }

  private resume() {
    (element('pause-menu') as HTMLDialogElement).close();
    if (this.screen === 'hop' || this.screen === 'free') this.input.setMode(this.screen);
  }

  private levels() {
    this.screen = 'levels';
    this.input.setMode('preview');
    this.picker.close();
    this.pads.visible = false;
    this.layout();
    this.setOptionalText(
      'level-summary',
      `${this.progress.best.filter((best) => best !== null).length} of ${LEVELS.length} stones crossed`,
    );
    element('level-list').replaceChildren();
    LEVELS.forEach((level, index) => {
      const button = document.createElement('button');
      button.disabled = index >= this.progress.unlocked;
      const best = this.progress.best[index];
      const accuracy = this.progress.accuracy?.[index];
      const score = this.progress.score?.[index];
      const result =
        score == null
          ? accuracy == null
            ? ''
            : ` · ${accuracy}% on pad`
          : ` · ${medalForAccuracy(score)}`;
      const summary = button.disabled
        ? 'Locked'
        : best === null
          ? `Aim for ${level.par} throw${level.par === 1 ? '' : 's'}`
          : `Best: ${best} throw${best === 1 ? '' : 's'}${result}`;
      button.dataset.state = button.disabled ? 'locked' : best === null ? 'current' : 'cleared';
      button.setAttribute('aria-label', `${index + 1}. ${level.name} · ${summary}`);
      const number = document.createElement('span');
      number.className = 'stone-number';
      number.textContent = String(index + 1);
      const label = document.createElement('span');
      label.className = 'stone-label';
      label.textContent = `${level.name} · ${summary}`;
      button.replaceChildren(number, label);
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
    this.targetStone.scale.set(level.radius, 1, level.radius);
    this.target.position.set(level.x, 0.0002, level.z);
    this.targetStone.position.set(level.x, -STONE_DEPTH / 2, level.z);
    (this.target.material as THREE.MeshBasicNodeMaterial).color.set('#66D6BA');
    this.gold.scale.setScalar(1 - 0.01 / level.radius);
    this.silver.scale.copy(this.gold.scale);
    this.pose(level.x / 2, level.z / 2);
    this.layout();
    this.updateThrows();
    element('level-name').textContent = level.name;
    this.setOptionalText('level-number', `LV ${index + 1}`);
    this.setOptionalText('throw-par', `/ ${level.par}`);
    this.setOptionalText(
      'level-summary',
      `${level.challenge}. Par ${level.par} throw${level.par === 1 ? '' : 's'}.`,
    );
    element('play-hint').textContent = this.progress.hintSeen
      ? `${level.challenge}. Aim for gold. Par ${level.par}.`
      : 'Hold the jelly, stretch toward the ring, then let go.';
  }

  private updateThrows() {
    element('throw-count').textContent =
      `${this.round.throws} throw${this.round.throws === 1 ? '' : 's'}`;
  }
  private storageWarning() {
    element('notice').textContent = 'Saving is unavailable. You can still play this session.';
  }
  private setOptionalText(id: string, text: string) {
    const el = optionalElement(id);
    if (el) el.textContent = text;
  }
  private updateHomeLabels() {
    this.setOptionalText('play-level', `LV ${this.progress.unlocked}`);
    this.setOptionalText(
      'home-progress',
      `${this.progress.best.filter((best) => best !== null).length} / ${LEVELS.length} stones crossed`,
    );
  }
  private save() {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(this.progress));
    } catch {
      this.storageWarning();
    }
  }

  reset = () => {
    this.onFeedback('reset');
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
    if (this.paused) {
      this.resume();
      return true;
    }
    if (this.screen === 'hop' || this.screen === 'free') {
      this.pause();
      return true;
    }
    if (this.screen === 'home') return false;
    this.home();
    return true;
  }

  update(dt: number) {
    if (this.paused) return;
    this.recoveringFor = Math.max(0, this.recoveringFor - dt);
    element('recovery-ripple').hidden = this.recoveringFor === 0;
    this.updateFeedback();
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
      this.recoveryFeedback();
      this.unsettled = 0;
      this.round.update(0, { ...sample, grabbing: true });
      element('play-hint').textContent = 'Back on the shore. Give it another little throw.';
      return;
    }
    if (this.screen === 'free') return;
    if (!sample.grabbing && (sample.speed > 0.025 || !sample.grounded)) this.unsettled += dt;
    else this.unsettled = 0;
    if (this.unsettled > 15) {
      this.resetBody();
      this.recoveryFeedback();
      this.unsettled = 0;
      this.round.update(0, { ...sample, grabbing: true });
      element('play-hint').textContent = 'Barely a ripple. Throw count stays.';
      return;
    }
    if (this.round.update(dt, sample)) {
      const accuracy = this.round.accuracy ?? 0;
      const landing = this.round.landing ?? 0;
      const score = this.round.score ?? 0;
      this.progress = recordWin(
        this.progress,
        this.round.levelIndex,
        this.round.throws,
        accuracy,
        score,
      );
      this.save();
      this.screen = 'complete';
      this.input.setMode('preview');
      this.layout();
      this.onComplete();
      const medal = medalForAccuracy(score);
      element('complete-title').textContent =
        landing >= 85
          ? 'Barely a ripple'
          : accuracy >= 80
            ? 'Right on the sweet spot.'
            : 'Stuck the landing.';
      element('medal').textContent =
        `${medal} · ${score}% — ${accuracy}% on the pad, ${landing}% landing`;
      element('medal').dataset.medal = medal.toLowerCase();
      const par = LEVELS[this.round.levelIndex].par;
      const throws = `${this.round.throws} throw${this.round.throws === 1 ? '' : 's'}`;
      this.setOptionalText('complete-eyebrow', `Low Tide · LV ${this.round.levelIndex + 1}`);
      this.setOptionalText('result-throws', String(this.round.throws));
      this.setOptionalText('result-par', `par ${par}`);
      this.setOptionalText('result-position', `${accuracy}%`);
      this.setOptionalText(
        'result-landing',
        landing >= 85 ? 'Soft' : landing >= 50 ? 'Firm' : 'Hard',
      );
      element('result').textContent =
        `${throws} · ${this.round.throws < par ? 'Under par!' : this.round.throws === par ? 'Par matched!' : `Aim for ${par} next time`} · personal best ${this.progress.best[this.round.levelIndex]}`;
      element('next').textContent =
        this.round.levelIndex === LEVELS.length - 1 ? 'All five! Pick another spot' : 'Next stone';
      element('next').focus({ preventScroll: true });
    }
  }

  private updateFeedback() {
    if (this.screen !== 'hop') return;
    this.updateTargetLabel();
    this.startPad.visible = this.round.throws === 0 && !this.body.grab;
    const aiming = this.input.getStretchCue(this.cueStart, this.cueEnd);
    element('stretch-cue').hidden = !aiming;
    const powerRing = element('power-ring');
    powerRing.hidden = !aiming;
    if (aiming) {
      const line = element('stretch-line');
      const screen = (n: number) => String(Math.max(2, Math.min(98, n)));
      line.setAttribute('x1', screen((this.cueStart.x + 1) * 50));
      line.setAttribute('y1', screen((1 - this.cueStart.y) * 50));
      line.setAttribute('x2', screen((this.cueEnd.x + 1) * 50));
      line.setAttribute('y2', screen((1 - this.cueEnd.y) * 50));
      const power = Math.min(
        1,
        Math.hypot(this.cueEnd.x - this.cueStart.x, this.cueEnd.y - this.cueStart.y) / 0.7,
      );
      powerRing.style.left = `${(this.cueStart.x + 1) * 50}%`;
      powerRing.style.top = `${(1 - this.cueStart.y) * 50}%`;
      powerRing.style.background = `conic-gradient(#ff9e5e ${power * 360}deg, #ff9e5e30 0deg)`;
      for (let i = 0; i < 6; i++) {
        const t = (i + 1) / 7;
        const bead = element(`stretch-bead-${i}`);
        bead.style.left = `${(this.cueStart.x + (this.cueEnd.x - this.cueStart.x) * t + 1) * 50}%`;
        bead.style.top = `${(1 - this.cueStart.y - (this.cueEnd.y - this.cueStart.y) * t) * 50}%`;
      }
    }
    const settled = this.round.settledFor;
    if (settled > 0 && !this.wasSettling) this.onFeedback('settle');
    this.wasSettling = settled > 0;
    const text = aiming
      ? 'Stretch toward the stone. Let go to hop.'
      : settled > 0
        ? 'Nice spot. Let the wobble settle…'
        : '';
    element('shot-feedback').hidden = !text;
    if (text !== this.feedbackText) {
      element('shot-status').textContent = text;
      this.feedbackText = text;
    }
    const progress = element('settle-progress') as HTMLProgressElement;
    progress.hidden = settled === 0 || aiming;
    progress.value = settled;
  }

  private recoveryFeedback() {
    this.recoveringFor = 0.65;
    this.onFeedback('reset');
    const ripple = element('recovery-ripple');
    this.targetPoint.copy(this.body.center).project(this.input.camera);
    ripple.style.left = `${(this.targetPoint.x + 1) * 50}%`;
    ripple.style.top = `${(1 - this.targetPoint.y) * 50}%`;
    ripple.hidden = false;
  }

  private updateTargetLabel() {
    const label = optionalElement('target-label');
    if (!label) return;
    this.input.camera.updateMatrixWorld();
    this.target.updateWorldMatrix(true, false);
    this.targetPoint.setFromMatrixPosition(this.target.matrixWorld).project(this.input.camera);
    label.hidden = false;
    label.textContent = this.round.settledFor > 0 ? 'ON THE STONE' : 'LAND HERE';
    label.style.left = `${(this.targetPoint.x + 1) * 50}%`;
    label.style.top = `${(1 - this.targetPoint.y) * 50}%`;
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
