import assert from 'node:assert/strict';

// renderer.ts reaches for the DOM at import time through diagnostics.ts.
globalThis.window = { isSecureContext: true };
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node', gpu: undefined },
  configurable: true,
});
const { adaptQuality, currentQualityScale } = await import('../src/graphics/renderer.ts');

assert.equal(currentQualityScale(), 1);
// A phone that only just clears the old 50 fps bar must not climb: stepping up costs ~1.5x the
// fill, so it would drop straight back. That round trip was the visible 0.45 <-> 0.55 flip.
for (let i = 0; i < 10; i++) {
  assert.equal(adaptQuality(52), false, 'no climb without real headroom');
}
assert.equal(currentQualityScale(), 1);

assert.equal(adaptQuality(30), true, 'drops immediately under load');
const dropped = currentQualityScale();
assert(dropped < 1);

assert.equal(adaptQuality(60), false, 'one good window is not a trend');
assert.equal(adaptQuality(60), false);
assert.equal(adaptQuality(60), true, 'climbs after a sustained run');
assert(currentQualityScale() > dropped);

adaptQuality(30);
assert.equal(adaptQuality(60), false);
assert.equal(adaptQuality(52), false, 'a dip resets the run');
assert.equal(adaptQuality(60), false);
assert.equal(adaptQuality(60), false);
assert.equal(adaptQuality(60), true);

assert.equal(adaptQuality(1), true);
for (let i = 0; i < 20; i++) adaptQuality(1);
assert.equal(currentQualityScale(), 0.45, 'never falls below the floor');
console.log('Quality scaling: climbs only on sustained headroom, drops at once, holds the floor.');
