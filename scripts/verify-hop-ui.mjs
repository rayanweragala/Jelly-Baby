import assert from 'node:assert/strict';
import { Scene, Vector3, PerspectiveCamera } from 'three/webgpu';
import { HopGame } from '../src/game/hop-game.ts';
import { LEVELS } from '../src/game/hop-rules.ts';

// Exercise real controller actions without pretending this is a WebView test.
class Element extends globalThis.EventTarget {
  hidden = false;
  disabled = false;
  open = false;
  textContent = '';
  className = '';
  children = [];
  dataset = {};
  attributes = {};
  style = {};
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  replaceChildren(...children) {
    this.children = children;
  }
  appendChild(child) {
    this.children.push(child);
  }
  focus() {}
  close() {
    this.open = false;
  }
  showModal() {
    this.open = true;
  }
  click() {
    if (!this.disabled) this.dispatchEvent(new globalThis.Event('click'));
  }
}
const elements = new Map();
function element(selector) {
  if (!elements.has(selector)) elements.set(selector, new Element());
  return elements.get(selector);
}
const document = {
  querySelector: element,
  body: new Element(),
  createElement: () => new Element(),
};
globalThis.document = document;
globalThis.window = new globalThis.EventTarget();
const saved = new Map();
globalThis.localStorage = {
  getItem: (key) => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, value),
};
let resets = 0;
const body = {
  center: new Vector3(0, 0.03, 0),
  grounded: true,
  grab: null,
  totalMass: 1,
  energy: () => 0,
  isFinite: () => true,
};
const input = {
  mode: 'free',
  camera: new PerspectiveCamera(),
  controls: { target: new Vector3(), update() {} },
  setMode(mode) {
    this.mode = mode;
  },
  onRelease() {},
  getStretchCue() {
    return false;
  },
};
const picker = {
  isOpen: false,
  open() {
    this.isOpen = true;
  },
  close() {
    this.isOpen = false;
  },
};
const reset = () => {
  resets++;
  body.center.set(0, 0.03, 0);
  body.grab = null;
};
let game = new HopGame(new Scene(), body, input, picker, reset);
const click = (id) => element(`#${id}`).click();
assert.equal(document.body.dataset.screen, 'home');
assert.equal(game.pads.visible, true);
assert.equal(game.startStone.visible, true);
assert.equal(game.targetStone.visible, false);
const homeCameraDistance = input.camera.position.length();
click('skins');
assert(picker.isOpen);
assert.equal(input.mode, 'preview');
assert.equal(game.startStone.visible, true);
assert(input.controls.target.y < 0, 'skin preview sits above the bottom sheet');
assert(game.back());
assert.equal(document.body.dataset.screen, 'home');
click('levels');
assert.equal(element('#level-list').children.length, 5);
assert.equal(element('#level-list').children.filter((button) => !button.disabled).length, 1);
assert.equal(game.pads.visible, false);
assert.equal(element('#level-list').children[0].dataset.state, 'current');
assert.equal(element('#level-list').children[0].children[0].className, 'stone-number');
assert.equal(element('#level-list').children[0].children[0].textContent, '1');
assert.match(
  element('#level-list').children[1].attributes['aria-label'],
  /2\. Side Slide · Locked/,
);
click('levels-back');
click('play');
assert.equal(input.mode, 'hop');
assert(input.camera.position.length() < homeCameraDistance, 'menu preview leaves title space');
assert.equal(element('#level-name').textContent, LEVELS[0].name);
assert.equal(element('#level-number').textContent, 'LV 1');
assert.equal(element('#throw-par').textContent, '/ 1');
assert.match(element('#level-summary').textContent, /Par 1 throw\./);
assert.equal(game.startStone.visible, false);
assert.equal(game.targetStone.visible, true);
assert.equal(game.targetStone.position.x, LEVELS[0].x);
assert.equal(game.targetStone.position.y, -0.0045);
assert.equal(game.targetStone.position.z, LEVELS[0].z);
assert.equal(game.targetStone.scale.x, LEVELS[0].radius);
assert.equal(game.targetStone.scale.y, 1);
assert.equal(game.target.material.color.getHexString(), '66d6ba');
game.update(0.02);
assert.equal(game.startPad.visible, true, 'starting guide is visible before aiming');
assert.equal(element('#target-label').hidden, false);
assert.equal(element('#target-label').textContent, 'LAND HERE');
assert.match(element('#target-label').style.left, /%$/);
body.grab = {};
game.update(0.02);
assert.equal(game.startPad.visible, false, 'starting guide cannot cover the stretching jelly');
body.grab = null;
input.getStretchCue = (start, end) => {
  start.set(0, 0, 0);
  end.set(0.5, 0.5, 0);
  return true;
};
game.update(0.02);
assert.equal(element('#stretch-cue').hidden, false);
assert.equal(element('#stretch-line').attributes.x2, '75');
assert.match(element('#shot-status').textContent, /Stretch toward the stone/);
assert.equal(element('#power-ring').hidden, false);
assert.match(element('#stretch-bead-5').style.left, /%$/);
input.getStretchCue = () => false;
input.onRelease();
assert.equal(element('#throw-count').textContent, '1 throw');
click('home');
assert(game.paused, 'menu pauses an in-progress round');
assert.equal(input.mode, 'preview');
const beforePause = resets;
game.update(1);
click('resume');
assert(!game.paused);
assert.equal(input.mode, 'hop');
assert.equal(resets, beforePause, 'resume preserves the current shot');
assert.equal(element('#throw-count').textContent, '1 throw');
body.center.x = 1;
game.update(0.02);
assert.equal(body.center.x, 0);
assert.equal(element('#throw-count').textContent, '1 throw', 'recovery keeps attempt count');
assert.match(element('#play-hint').textContent, /Back on the shore/);
assert.equal(game.startPad.visible, false, 'starting guide stays hidden after a throw');
game.reset();
game.update(0.02);
assert.equal(game.startPad.visible, true, 'reset restores the starting guide');
assert.equal(element('#throw-count').textContent, '0 throws');
for (let levelIndex = 0; levelIndex < 5; levelIndex++) {
  input.onRelease();
  body.center.set(LEVELS[levelIndex].x, 0.03, LEVELS[levelIndex].z);
  game.update(0.02);
  game.update(0.02);
  assert.equal(element('#settle-progress').hidden, false);
  assert(element('#settle-progress').value > 0);
  for (let i = 0; i < 40; i++) game.update(0.02);
  assert.equal(document.body.dataset.screen, 'complete');
  assert.equal(element('#completion').hidden, false);
  assert.equal(element('#shot-feedback').hidden, true);
  assert.match(element('#result').textContent, /1 throw/);
  assert.equal(element('#complete-eyebrow').textContent, `Low Tide · LV ${levelIndex + 1}`);
  assert.equal(element('#result-throws').textContent, '1');
  assert.equal(element('#result-par').textContent, `par ${LEVELS[levelIndex].par}`);
  assert.equal(element('#result-position').textContent, '100%');
  assert.equal(element('#result-landing').textContent, 'Soft');
  assert.equal(element('#medal').textContent, 'Gold · 100% — 100% on the pad, 100% landing');
  assert.equal(element('#medal').dataset.medal, 'gold');
  click('next');
}
assert.equal(document.body.dataset.screen, 'levels');
assert.equal(element('#level-list').children.filter((button) => !button.disabled).length, 5);
assert.equal(element('#level-list').children[0].dataset.state, 'cleared');
assert(saved.has('jelly-hop-progress'));
assert.deepEqual(JSON.parse(saved.get('jelly-hop-progress')).accuracy, [100, 100, 100, 100, 100]);
assert.deepEqual(JSON.parse(saved.get('jelly-hop-progress')).score, [100, 100, 100, 100, 100]);
click('home');
click('free-play');
assert.equal(input.mode, 'free');
assert.equal(element('.touch-controls').hidden, false);
assert.equal(game.startStone.visible, true);
assert.equal(game.targetStone.visible, false);
element('#diagnostics').open = true;
assert(game.back());
assert(!element('#diagnostics').open);
assert.equal(document.body.dataset.screen, 'free', 'closing diagnostics keeps current mode');
assert(game.back());
assert(game.paused, 'Android back opens pause menu during play');
click('pause-home');
assert.equal(document.body.dataset.screen, 'home');
assert.equal(game.back(), false);
game.dispose();
game = new HopGame(new Scene(), body, input, picker, reset);
click('play');
assert.equal(element('#level-number').textContent, 'LV 5', 'highest unlocked level restored');
input.onRelease();
body.center.set(LEVELS[4].x, 0.03, LEVELS[4].z);
for (let i = 0; i < 40; i++) game.update(0.02);
click('retry-level');
assert.equal(element('#throw-count').textContent, '0 throws');
assert.equal(input.mode, 'hop');
assert(resets > 5);
game.dispose();
console.log(
  'Hop UI actions, retry/next, free play, back, recovery and saved unlocks passed (DOM fixture).',
);

const { resizeView, createRenderer } = await import('../src/graphics/renderer.ts');
globalThis.window.isSecureContext = false;
await assert.rejects(
  createRenderer(() => {}),
  /HTTPS or localhost/,
);
globalThis.window.isSecureContext = true;
await assert.rejects(
  createRenderer(() => {}),
  /does not support WebGPU/,
);
for (const [width, height] of [
  [320, 568],
  [360, 800],
  [412, 915],
  [800, 360],
  [3840, 2160],
]) {
  Object.assign(globalThis.window, { innerWidth: width, innerHeight: height, devicePixelRatio: 3 });
  const camera = new PerspectiveCamera();
  const controls = {
    target: new Vector3(),
    update() {
      camera.lookAt(this.target);
    },
  };
  const renderer = {
    setDrawingBufferSize(w, h, dpr) {
      assert(w * h * dpr * dpr <= 4_000_000.01);
    },
  };
  resizeView(renderer, camera, controls);
  for (const level of LEVELS) {
    controls.target.set(level.x / 2, 0.025, level.z / 2);
    camera.position.set(level.x / 2 + 0.035, 0.235, level.z / 2 + 0.27);
    controls.update();
    camera.updateMatrixWorld();
    for (const [x, z, r] of [
      [0, 0, 0.04],
      [level.x, level.z, level.radius],
    ])
      for (let i = 0; i < 16; i++) {
        const p = new Vector3(
          x + Math.cos((i * Math.PI) / 8) * r,
          0,
          z + Math.sin((i * Math.PI) / 8) * r,
        ).project(camera);
        assert(Math.abs(p.x) < 1 && Math.abs(p.y) < 1, `pads fit ${width}x${height}`);
      }
  }
}
console.log(
  'Portrait/landscape pad framing and drawing-buffer cap passed (projection math, not visual inspection).',
);
