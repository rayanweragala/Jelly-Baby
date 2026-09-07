import assert from 'node:assert/strict';
import { Color } from 'three/webgpu';
import { JELLY_FLAVORS, DEFAULT_JELLY_FLAVOR } from '../src/graphics/jelly-flavors.ts';
import { Baby } from '../src/graphics/baby.ts';
import { SoftBody } from '../src/physics/soft-body.js';
import { loadModel } from './load-model.mjs';
import { FlavorPicker, flavorPickerMarkup } from '../src/game/flavor-picker.ts';

const expected = [
  'strawberry',
  'tangerine',
  'lemon',
  'lime',
  'aqua',
  'blueberry',
  'bubblegum',
  'pearl',
];
assert.deepEqual(Object.keys(JELLY_FLAVORS), expected, 'exact Jelly Hop skin set');
assert.equal(DEFAULT_JELLY_FLAVOR, 'lime');

for (const [name, flavor] of Object.entries(JELLY_FLAVORS)) {
  assert(flavor.label && flavor.surface && flavor.swatch, `${name} has UI labels and swatch`);
  assert.equal(flavor.ior, 1.35, `${name} IOR matches fixed optical engine`);
  assert(
    flavor.transmission > 0 && flavor.transmission <= 1,
    `${name} keeps a lit, translucent interior`,
  );
  assert(flavor.roughness >= 0 && flavor.roughness <= 1, `${name} roughness bounded`);
  assert(flavor.clearcoat > 0 && flavor.clearcoat <= 1, `${name} clearcoat bounded`);
  assert(
    flavor.clearcoatRoughness >= 0 && flavor.clearcoatRoughness <= 1,
    `${name} clearcoat roughness bounded`,
  );
  assert(flavor.attenuationDistance > 0, `${name} attenuation distance positive`);
  assert.equal(flavor.absorption.length, 3, `${name} RGB absorption`);
  assert(
    flavor.absorption.every((v) => Number.isFinite(v) && v >= 0),
    `${name} absorption finite`,
  );
}

const body = new SoftBody(loadModel()),
  baby = new Baby(body);
const before = {
  x: body.x.slice(),
  velocity: body.velocity.slice(),
  surfaceRevision: body.surfaceRevision,
  mesh: baby.mesh,
  faceChildren: baby.group.children.length,
};
baby.setFlavor('pearl');
assert.equal(baby.mesh, before.mesh, 'flavor switch preserves visible mesh');
assert.equal(
  baby.group.children.length,
  before.faceChildren,
  'flavor switch does not recreate face',
);
assert.deepEqual(body.x, before.x, 'flavor switch does not reset simulation positions');
assert.deepEqual(
  body.velocity,
  before.velocity,
  'flavor switch does not reset simulation velocity',
);
assert.equal(
  body.surfaceRevision,
  before.surfaceRevision,
  'flavor switch does not deform/update surface',
);
// The requested original appearance needs actual background transmission, not emissive tint.
assert.equal(
  baby.mesh.material.transmission,
  JELLY_FLAVORS.pearl.transmission,
  'flavour drives real transmission',
);
assert(baby.mesh.material.thicknessNode, 'transmission uses the deformed jelly thickness');
assert.equal(baby.mesh.material.attenuationDistance, JELLY_FLAVORS.pearl.attenuationDistance);
assert.deepEqual(
  baby.mesh.material.attenuationColor.toArray(),
  JELLY_FLAVORS.pearl.absorption.map((value) =>
    Math.exp(-value * JELLY_FLAVORS.pearl.attenuationDistance),
  ),
  'flavour drives Beer-Lambert absorption',
);
const pearlLinear = new Color(JELLY_FLAVORS.pearl.surface);
assert.deepEqual(
  baby.mesh.material.color.toArray(),
  pearlLinear.toArray(),
  'flavour drives surface tint',
);
assert.equal(baby.mesh.material.ior, 1.35);
baby.dispose();

class FakeButton extends globalThis.EventTarget {
  constructor(flavor) {
    super();
    this.dataset = flavor ? { flavor } : {};
    this.attributes = new Map();
    this.style = {};
    this.hidden = false;
    this.focused = false;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  focus() {
    this.focused = true;
  }
  blur() {
    this.focused = false;
  }
}
const options = expected.map((name) => new FakeButton(name));
const menu = new FakeButton();
menu.hidden = true;
const button = new FakeButton();
const root = {
  querySelector(selector) {
    return selector === '#flavor' ? button : selector === '#flavor-menu' ? menu : null;
  },
  querySelectorAll(selector) {
    return selector === '[data-flavor]' ? options : [];
  },
  contains(target) {
    return target === button || target === menu || options.includes(target);
  },
};
const stored = new Map([['jelly-baby.flavor', 'aqua']]),
  events = [];
globalThis.localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, String(value)),
};
globalThis.document = new globalThis.EventTarget();
globalThis.document.querySelector = (selector) => (selector === '#flavor-picker' ? root : null);
globalThis.window = new globalThis.EventTarget();
globalThis.window.addEventListener('jelly-storage-error', (event) => events.push(event.detail));
assert(flavorPickerMarkup().includes('Strawberry red'), 'markup uses labels');
const selected = [];
const picker = new FlavorPicker((flavor) => selected.push(flavor));
assert.deepEqual(selected, ['aqua'], 'constructor applies restored skin');
assert.equal(options[4].getAttribute('aria-pressed'), 'true', 'restored skin selected');
picker.open(true);
assert.equal(picker.isOpen, true);
assert.equal(options[4].focused, true);
picker.choose({ currentTarget: options[7] });
assert.equal(stored.get('jelly-baby.flavor'), 'pearl', 'choice persists');
assert.deepEqual(selected, ['aqua', 'pearl'], 'choice previews on actual jelly callback');
assert.equal(menu.hidden, false, 'choice keeps picker open for live preview');
picker.close();
assert.equal(picker.isOpen, false);
globalThis.localStorage = {
  getItem() {
    throw new Error('blocked get');
  },
  setItem() {
    throw new Error('blocked set');
  },
};
new FlavorPicker(() => {}).dispose();
assert.equal(events[0].message, 'blocked get', 'storage failure dispatches visible event');
picker.dispose();
console.log('Skin presets, Baby.setFlavor preservation, picker restore/save/open state passed.');
