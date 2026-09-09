import assert from 'node:assert/strict';
import {
  LEVELS,
  HopRound,
  freshProgress,
  loadProgress,
  needsRecovery,
  recordWin,
  serializeProgress,
  medalForAccuracy,
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
    accuracy: [null, null, null, null, null],
    score: [null, null, null, null, null],
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
      accuracy: [null, null, null, null, null],
      score: [null, null, null, null, null],
      hintSeen: true,
    },
  );
  assert.equal(
    serializeProgress({ version: 0, unlocked: -5, best: [0, 4, 5, 6, 7, 8], hintSeen: true }),
    JSON.stringify({
      version: 1,
      unlocked: 1,
      best: [null, 4, 5, 6, 7],
      accuracy: [null, null, null, null, null],
      score: [null, null, null, null, null],
      hintSeen: true,
    }),
  );
}

{
  const level = LEVELS[0];
  const round = new HopRound(0);
  assert.equal(round.accuracy, null);
  round.release();
  round.update(0.1, sample(level, { x: level.x + (level.radius - 0.01) * 0.6 }));
  round.release();
  assert.equal(round.settledFor, 0, 'release clears pending settle timer');
  assert.equal(round.accuracy, null, 'release clears pending placement');
  round.update(0.1, sample(level, { x: level.x + (level.radius - 0.01) * 0.6 }));
  for (let i = 0; i < 5; i++) round.update(0.1, sample(level));
  assert.equal(round.accuracy, 40, 'score uses worst position throughout settling');
  round.update(0.1, sample(level));
  assert.equal(round.accuracy, 40, 'completed score is frozen');
  round.reset();
  assert.equal(round.accuracy, null);
  round.release();
  round.update(0.1, sample(level, { x: level.x + 0.04 }));
  round.update(0.1, sample(level, { grabbing: true }));
  round.update(0, sample(level, { x: level.x + 0.04 }));
  for (let i = 0; i < 6; i++) round.update(0.1, sample(level));
  assert.equal(round.accuracy, 100, 'interrupted settling clears previous miss');
  // Landing quality: a throw that jiggles on the pad before going quiet scores below a feather
  // arrival at the same spot. Thresholds come from measured settle times, 0.15 s to 1.2 s.
  {
    const soft = new HopRound(0);
    soft.release();
    for (let i = 0; i < 8; i++) soft.update(0.1, sample(level));
    assert.equal(soft.complete, true);
    assert.equal(soft.landing, 100, 'a throw that never wobbles lands perfectly');
    assert.equal(soft.score, soft.accuracy, 'a clean landing leaves placement untouched');

    const splat = new HopRound(0);
    splat.release();
    // Grounded and on the pad, but still above the quiet threshold: that is the wobble.
    for (let i = 0; i < 10; i++) splat.update(0.1, sample(level, { speed: 0.2 }));
    assert.equal(splat.complete, false, 'a wobbling body has not settled');
    assert.equal(splat.landing, null, 'landing is only scored once the round completes');
    for (let i = 0; i < 8; i++) splat.update(0.1, sample(level));
    assert.equal(splat.complete, true);
    assert.equal(splat.accuracy, soft.accuracy, 'both stopped in the same place');
    assert(
      splat.landing > 0 && splat.landing < 25,
      `a full second of wobble scores badly but is still a gradient, got ${splat.landing}`,
    );
    // The point of the whole thing: landing dead centre is no longer enough on its own.
    assert.equal(medalForAccuracy(soft.score), 'Gold');
    assert.equal(medalForAccuracy(splat.score), 'Silver', 'a dead-centre splat drops a medal');

    const retried = new HopRound(0);
    retried.release();
    for (let i = 0; i < 10; i++) retried.update(0.1, sample(level, { speed: 0.2 }));
    retried.release();
    for (let i = 0; i < 8; i++) retried.update(0.1, sample(level));
    assert.equal(retried.landing, 100, 'a retry is judged on its own landing');
  }
  assert.equal(medalForAccuracy(80), 'Gold');
  assert.equal(medalForAccuracy(79), 'Silver');
  assert.equal(medalForAccuracy(50), 'Silver');
  assert.equal(medalForAccuracy(49), 'Bronze');
  const old = loadProgress(
    JSON.stringify({ version: 1, unlocked: 3, best: [2, 3], hintSeen: true }),
  );
  assert.equal(old.unlocked, 3);
  assert.deepEqual(old.accuracy, [null, null, null, null, null]);
  assert.deepEqual(old.score, [null, null, null, null, null]);
  const won = recordWin(old, 0, 5, 95, 84);
  assert.equal(won.best[0], 2);
  assert.equal(won.accuracy[0], 95);
  assert.equal(won.score[0], 84);
  assert.equal(recordWin(won, 0, 1, 30).accuracy[0], 95);
  assert.equal(recordWin(won, 0, 1, 30).score[0], 84);
  assert.equal(recordWin(won, 0, 1, 30, 91).score[0], 91);
  assert.deepEqual(loadProgress(serializeProgress(won)), won);
  const legacyAccuracy = loadProgress(
    JSON.stringify({ version: 1, unlocked: 2, best: [1], accuracy: [88], hintSeen: true }),
  );
  assert.equal(legacyAccuracy.accuracy[0], 88);
  assert.equal(legacyAccuracy.score[0], null, 'legacy accuracy is not reinterpreted as score');
  const malformed = loadProgress(
    JSON.stringify({
      ...won,
      accuracy: [-1, '90', 1.5, null, 101],
      score: [-1, '90', 1.5, null, 101],
    }),
  );
  assert.deepEqual(malformed.accuracy, [null, null, null, null, 100]);
  assert.deepEqual(malformed.score, [null, null, null, null, 100]);
}
console.log('Hop rules and bullseye persistence passed.');
