import assert from 'node:assert/strict';
import {
  LEVELS,
  HopRound,
  freshProgress,
  loadProgress,
  needsRecovery,
  recordWin,
  serializeProgress,
} from '../src/game/hop-rules.ts';

const sample = (level, patch = {}) => ({
  x: level.x,
  y: 0.04,
  z: level.z,
  speed: 0.01,
  grounded: true,
  grabbing: false,
  ...patch,
});

assert.equal(LEVELS.length, 5);
assert(
  LEVELS.every(
    (level) => Math.hypot(level.x, level.z) >= 0.09 && Math.hypot(level.x, level.z) <= 0.181,
  ),
);
assert(LEVELS.every((level) => level.radius >= 0.055 && level.radius <= 0.065));

{
  const round = new HopRound(0);
  assert.equal(round.update(1, sample(LEVELS[0])), false, 'no release, no win');
  assert.equal(round.settledFor, 0);
  round.release();
  assert.equal(round.throws, 1);
  assert.equal(
    round.update(99, sample(LEVELS[0])),
    false,
    'clamped dt cannot auto-win after resume',
  );
  assert.equal(round.settledFor, 0.1);
  for (let i = 0; i < 5; i++) assert.equal(round.update(0.1, sample(LEVELS[0])), i === 4);
  assert.equal(round.complete, true);
  round.release();
  assert.equal(round.throws, 1, 'complete rounds ignore later releases');
  assert.equal(round.update(0.1, sample(LEVELS[0])), false, 'completion transition fires once');
  round.reset();
  assert.equal(round.complete, false);
  assert.equal(round.throws, 0);
  assert.equal(round.settledFor, 0);
}

{
  const round = new HopRound(1);
  round.release();
  assert.equal(
    round.update(0.6, sample(LEVELS[1], { grabbing: true })),
    false,
    'grabbing cannot win',
  );
  assert.equal(round.settledFor, 0);
  assert.equal(round.update(0.5, sample(LEVELS[1])), false);
  assert.equal(
    round.update(0.1, sample(LEVELS[1], { x: LEVELS[1].x + LEVELS[1].radius })),
    false,
    'leaving margin resets settle',
  );
  assert.equal(round.settledFor, 0);
  assert.equal(
    round.update(0.6, sample(LEVELS[1], { speed: 0.026 })),
    false,
    'fast body cannot win',
  );
  assert.equal(
    round.update(0.6, sample(LEVELS[1], { speed: -0.001 })),
    false,
    'negative speed cannot win',
  );
  assert.equal(
    round.update(0.6, sample(LEVELS[1], { grounded: false })),
    false,
    'airborne body cannot win',
  );
  assert.equal(round.update(0.6, sample(LEVELS[1], { y: 0.08 })), false, 'high body cannot win');
  assert.equal(
    round.update(0.6, sample(LEVELS[1], { y: -0.001 })),
    false,
    'below-floor body cannot win',
  );
  assert.equal(
    round.update(0.6, sample(LEVELS[1], { x: NaN })),
    false,
    'invalid sample cannot win',
  );
}

{
  const round = new HopRound(2);
  round.release();
  round.release();
  assert.equal(round.throws, 2);
  for (let i = 0; i < 6; i++) round.update(0.1, sample(LEVELS[2]));
  assert.equal(round.complete, true);
}

for (let i = 0; i < LEVELS.length; i++) {
  const round = new HopRound(i);
  round.release();
  let transitioned = false;
  for (let tick = 0; tick < 6; tick++)
    transitioned = round.update(0.1, sample(LEVELS[i])) || transitioned;
  assert.equal(transitioned, true, `level ${i} completes after settling`);
}

assert.throws(() => new HopRound(-1), RangeError);
assert.throws(() => new HopRound(LEVELS.length), RangeError);

assert.equal(needsRecovery(sample(LEVELS[0])), false);
assert.equal(needsRecovery(sample(LEVELS[0], { x: 0.51 })), true);
assert.equal(needsRecovery(sample(LEVELS[0], { z: -0.51 })), true);
assert.equal(needsRecovery(sample(LEVELS[0], { y: -0.11 })), true);
assert.equal(needsRecovery(sample(LEVELS[0], { y: 0.61 })), true);
assert.equal(needsRecovery(sample(LEVELS[0], { x: Infinity })), true);

{
  const fresh = freshProgress();
  assert.deepEqual(fresh, {
    version: 1,
    unlocked: 1,
    best: [null, null, null, null, null],
    hintSeen: false,
  });
  const won = recordWin(fresh, 0, 4);
  assert.notEqual(won, fresh);
  assert.deepEqual(won.best, [4, null, null, null, null]);
  assert.equal(won.unlocked, 2);
  const better = recordWin(won, 0, 2);
  assert.equal(better.best[0], 2);
  const worse = recordWin(better, 0, 7);
  assert.equal(worse.best[0], 2);
  const final = recordWin(worse, 4, 3);
  assert.equal(final.unlocked, 5);
  assert.deepEqual(recordWin(final, 1, 0), final, 'invalid throw count ignored');
  assert.deepEqual(recordWin(final, 1, 1.5), final, 'fractional throw count ignored');
  assert.equal(
    recordWin(final, 1, 1200).best[1],
    999,
    'real high throw count caps at persisted maximum',
  );
}

{
  assert.deepEqual(loadProgress(null), freshProgress());
  assert.deepEqual(loadProgress('{bad'), freshProgress());
  assert.deepEqual(loadProgress(JSON.stringify(null)), freshProgress());
  assert.deepEqual(loadProgress(JSON.stringify(7)), freshProgress());
  assert.deepEqual(
    loadProgress(JSON.stringify({ version: 99, unlocked: 99, best: [3], hintSeen: true })),
    freshProgress(),
  );
  assert.deepEqual(
    loadProgress(
      JSON.stringify({ version: 1, unlocked: 99, best: [3, -1, 1.5, 1000, 8], hintSeen: true }),
    ),
    {
      version: 1,
      unlocked: 5,
      best: [3, null, null, 999, 8],
      hintSeen: true,
    },
  );
  assert.equal(
    serializeProgress({ version: 0, unlocked: -5, best: [0, 4, 5, 6, 7, 8], hintSeen: true }),
    JSON.stringify({
      version: 1,
      unlocked: 1,
      best: [null, 4, 5, 6, 7],
      hintSeen: true,
    }),
  );
}

console.log('Hop rules passed.');
