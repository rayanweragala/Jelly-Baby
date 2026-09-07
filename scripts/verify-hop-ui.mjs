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
  children = [];
  dataset = {};
  replaceChildren() {
    this.children = [];
  }
  appendChild(child) {
    this.children.push(child);
  }
  focus() {}
  close() {
    this.open = false;
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
click('skins');
assert(picker.isOpen);
assert.equal(input.mode, 'preview');
assert(game.back());
assert.equal(document.body.dataset.screen, 'home');
click('levels');
assert.equal(element('#level-list').children.length, 5);
assert.equal(element('#level-list').children.filter((button) => !button.disabled).length, 1);
click('levels-back');
click('play');
assert.equal(input.mode, 'hop');
input.onRelease();
assert.equal(element('#throw-count').textContent, '1 throw');
body.center.x = 1;
game.update(0.02);
assert.equal(body.center.x, 0);
assert.equal(element('#throw-count').textContent, '1 throw', 'recovery keeps attempt count');
game.reset();
assert.equal(element('#throw-count').textContent, '0 throws');
for (let levelIndex = 0; levelIndex < 5; levelIndex++) {
  input.onRelease();
  body.center.set(LEVELS[levelIndex].x, 0.03, LEVELS[levelIndex].z);
  for (let i = 0; i < 40; i++) game.update(0.02);
  assert.equal(document.body.dataset.screen, 'complete');
  assert.equal(element('#completion').hidden, false);
  assert.match(element('#result').textContent, /1 throw/);
  click('next');
}
assert.equal(document.body.dataset.screen, 'levels');
assert.equal(element('#level-list').children.filter((button) => !button.disabled).length, 5);
assert(saved.has('jelly-hop-progress'));
click('home');
click('free-play');
assert.equal(input.mode, 'free');
assert.equal(element('.touch-controls').hidden, false);
element('#diagnostics').open = true;
assert(game.back());
assert(!element('#diagnostics').open);
assert.equal(document.body.dataset.screen, 'free', 'closing diagnostics keeps current mode');
assert(game.back());
assert.equal(document.body.dataset.screen, 'home');
assert.equal(game.back(), false);
game.dispose();
game = new HopGame(new Scene(), body, input, picker, reset);
click('play');
assert.match(element('#level-name').textContent, /5 \/ 5/, 'highest unlocked level restored');
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
