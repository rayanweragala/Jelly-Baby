import assert from 'node:assert/strict';
import { JellySound } from '../src/game/sound.ts';

const oscillators = [];
const parameter = () => ({
  value: 0,
  setValueAtTime(value) {
    this.value = value;
  },
  linearRampToValueAtTime(value) {
    this.value = value;
  },
  exponentialRampToValueAtTime(value) {
    this.value = value;
  },
  setTargetAtTime(value) {
    this.value = value;
  },
});
const node = () => ({
  connect(next) {
    return next;
  },
  disconnect() {
    this.disconnected = true;
  },
});
class TestContext {
  state = 'running';
  currentTime = 1;
  sampleRate = 48000;
  destination = node();
  createGain() {
    return { ...node(), gain: parameter() };
  }
  createDynamicsCompressor() {
    return { ...node(), threshold: parameter(), ratio: parameter() };
  }
  createBuffer() {
    return {};
  }
  createBufferSource() {
    return { ...node(), start() {} };
  }
  createOscillator() {
    const oscillator = {
      ...node(),
      frequency: parameter(),
      start() {
        this.started = true;
      },
      stop() {
        this.stopped = true;
      },
    };
    oscillators.push(oscillator);
    return oscillator;
  }
  async resume() {
    this.state = 'running';
  }
  async suspend() {
    this.state = 'suspended';
  }
  async close() {
    this.state = 'closed';
  }
}
globalThis.window = new globalThis.EventTarget();
globalThis.window.AudioContext = TestContext;
const sound = new JellySound();
sound.cue('win');
assert.equal(oscillators.length, 0, 'no audio before a user unlock');
await sound.unlock();
sound.stretch(0);
const held = oscillators.at(-1);
sound.stretch(2);
assert.equal(oscillators.length, 1, 'one continuous oscillator per grab');
assert.equal(held.frequency.value, 410, 'power is clamped');
sound.stretch(null);
assert(held.stopped && held.disconnected, 'release removes the stretch tone');
sound.cue('win');
assert.equal(oscillators.length, 4, 'win has three scheduled notes');
oscillators.slice(1).forEach((oscillator) => {
  oscillator.onended();
  assert(oscillator.disconnected, 'one-shot cleans up');
});
sound.stretch(0.5);
const mutedStretch = oscillators.at(-1);
sound.toggle();
assert(mutedStretch.stopped, 'mute stops ongoing stretch');
const count = oscillators.length;
sound.cue('release');
sound.stretch(1);
assert.equal(oscillators.length, count, 'mute suppresses all new cues');
sound.toggle();
sound.setActive(false);
sound.cue('reset');
sound.stretch(1);
assert.equal(oscillators.length, count, 'background suppresses cues');
sound.setActive(true);
await sound.unlock();
sound.stretch(Number.NaN);
assert.equal(oscillators.length, count, 'invalid power does not create audio');
sound.stretch(0.5);
const final = oscillators.at(-1);
sound.dispose();
assert(final.stopped && final.disconnected, 'dispose removes ongoing stretch');
console.log('Sound: unlock, power clamp, one-shot cleanup, mute, background, and dispose passed.');
