export type HopSample = Readonly<{
  x: number;
  y: number;
  z: number;
  speed: number;
  grounded: boolean;
  grabbing: boolean;
}>;

export type HopLevel = Readonly<{
  name: string;
  challenge: string;
  par: number;
  color: string;
  x: number;
  z: number;
  radius: number;
}>;

export const LEVELS = [
  {
    name: 'Warm Pad',
    challenge: 'Soft opening hop',
    par: 1,
    color: '#ff8a5c',
    x: 0.015,
    z: -0.09,
    radius: 0.065,
  },
  {
    name: 'Side Slide',
    challenge: 'Angle across the grain',
    par: 1,
    color: '#ffbf47',
    x: -0.04,
    z: -0.11,
    radius: 0.063,
  },
  {
    name: 'Long Spoon',
    challenge: 'Long clean stretch',
    par: 2,
    color: '#73d56b',
    x: 0.04,
    z: -0.14,
    radius: 0.06,
  },
  {
    name: 'Corner Dab',
    challenge: 'Touch the far corner',
    par: 2,
    color: '#55c7e8',
    x: -0.035,
    z: -0.17,
    radius: 0.058,
  },
  {
    name: 'Table Crown',
    challenge: 'Final tiny pad',
    par: 2,
    color: '#b68cff',
    x: 0.045,
    z: -0.174,
    radius: 0.055,
  },
] as const satisfies readonly HopLevel[];

const VERSION = 1;
const BODY_MARGIN = 0.01;
const SETTLE_SECONDS = 0.6;
const MAX_UPDATE_DT = 0.1;
const QUIET_SPEED = 0.025;
const SOFT_LANDING_SECONDS = 0.15;
const HARD_LANDING_SECONDS = 1.2;
const PLACEMENT_WEIGHT = 0.7;

export interface HopProgress {
  version: number;
  unlocked: number;
  best: (number | null)[];
  accuracy?: (number | null)[];
  score?: (number | null)[];
  hintSeen: boolean;
}

export type HopMedal = 'Gold' | 'Silver' | 'Bronze';

export function needsRecovery(sample: HopSample) {
  return (
    !validPosition(sample) ||
    Math.abs(sample.x) > 0.5 ||
    Math.abs(sample.z) > 0.5 ||
    sample.y < -0.1 ||
    sample.y > 0.6
  );
}

export class HopRound {
  readonly levelIndex: number;
  #throws = 0;
  #complete = false;
  #settledFor = 0;
  #wobbleFor = 0;
  #worstSettleDistance = 0;
  #accuracy: number | null = null;

  constructor(levelIndex: number) {
    if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= LEVELS.length)
      throw new RangeError('Invalid level index');
    this.levelIndex = levelIndex;
  }

  get throws() {
    return this.#throws;
  }
  get complete() {
    return this.#complete;
  }
  get settledFor() {
    return this.#settledFor;
  }
  get accuracy() {
    return this.#accuracy;
  }
  get landing() {
    return this.#complete ? landingForWobble(this.#wobbleFor) : null;
  }
  get score() {
    if (this.#accuracy === null) return null;
    return Math.round(
      PLACEMENT_WEIGHT * this.#accuracy +
        (1 - PLACEMENT_WEIGHT) * landingForWobble(this.#wobbleFor),
    );
  }

  release() {
    if (this.#complete) return;
    this.#throws++;
    this.#settledFor = 0;
    this.#wobbleFor = 0;
    this.#worstSettleDistance = 0;
    this.#accuracy = null;
  }

  reset() {
    this.#throws = 0;
    this.#complete = false;
    this.#settledFor = 0;
    this.#wobbleFor = 0;
    this.#worstSettleDistance = 0;
    this.#accuracy = null;
  }

  update(dt: number, sample: HopSample) {
    if (this.#complete) return false;
    const level = LEVELS[this.levelIndex];
    if (
      this.#throws >= 1 &&
      !sample.grabbing &&
      isOnPad(level, sample) &&
      sample.speed >= QUIET_SPEED
    )
      this.#wobbleFor += clampDt(dt);
    if (this.#throws < 1 || sample.grabbing || !isWinningSample(level, sample)) {
      this.#settledFor = 0;
      this.#worstSettleDistance = 0;
      this.#accuracy = null;
      return false;
    }
    if (clampDt(dt) === 0) return false;
    this.#worstSettleDistance = Math.max(this.#worstSettleDistance, radialDistance(level, sample));
    this.#settledFor += clampDt(dt);
    if (this.#settledFor < SETTLE_SECONDS) return false;
    this.#complete = true;
    this.#accuracy = accuracyForDistance(level, this.#worstSettleDistance);
    return true;
  }
}

export function freshProgress(): HopProgress {
  return {
    version: VERSION,
    unlocked: 1,
    best: Array.from({ length: LEVELS.length }, () => null),
    accuracy: Array.from({ length: LEVELS.length }, () => null),
    score: Array.from({ length: LEVELS.length }, () => null),
    hintSeen: false,
  };
}

export function loadProgress(raw: string | null): HopProgress {
  if (!raw) return freshProgress();
  try {
    const parsed = JSON.parse(raw) as Partial<HopProgress> | null;
    if (!parsed || typeof parsed !== 'object' || parsed.version !== VERSION) return freshProgress();
    const fresh = freshProgress();
    const best = Array.from({ length: LEVELS.length }, (_, index) => toBest(parsed.best?.[index]));
    const accuracy = Array.from({ length: LEVELS.length }, (_, index) =>
      toAccuracy(parsed.accuracy?.[index]),
    );
    const score = Array.from({ length: LEVELS.length }, (_, index) =>
      toAccuracy(parsed.score?.[index]),
    );
    return {
      version: VERSION,
      unlocked: clampInt(parsed.unlocked, 1, LEVELS.length) ?? fresh.unlocked,
      best,
      accuracy,
      score,
      hintSeen: parsed.hintSeen === true,
    };
  } catch {
    return freshProgress();
  }
}

export function recordWin(
  progress: HopProgress,
  levelIndex: number,
  throws: number,
  accuracy?: number,
  score?: number,
): HopProgress {
  if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= LEVELS.length)
    return normalizeProgress(progress);
  if (!Number.isInteger(throws) || throws < 1) return normalizeProgress(progress);
  const normalized = normalizeProgress(progress);
  const safeThrows = Math.min(throws, 999);
  const best = normalized.best.slice();
  const accuracyBest = normalized.accuracy?.slice() ?? emptyResultList();
  const scoreBest = normalized.score?.slice() ?? emptyResultList();
  best[levelIndex] =
    best[levelIndex] === null ? safeThrows : Math.min(best[levelIndex], safeThrows);
  const safeAccuracy = toAccuracy(accuracy);
  if (safeAccuracy !== null) {
    accuracyBest[levelIndex] =
      accuracyBest[levelIndex] === null
        ? safeAccuracy
        : Math.max(accuracyBest[levelIndex], safeAccuracy);
  }
  const safeScore = toAccuracy(score);
  if (safeScore !== null) {
    scoreBest[levelIndex] =
      scoreBest[levelIndex] === null ? safeScore : Math.max(scoreBest[levelIndex], safeScore);
  }
  return {
    ...normalized,
    unlocked: Math.min(LEVELS.length, Math.max(normalized.unlocked, levelIndex + 2)),
    best,
    accuracy: accuracyBest,
    score: scoreBest,
  };
}

export function serializeProgress(progress: HopProgress) {
  return JSON.stringify(normalizeProgress(progress));
}

export function medalForAccuracy(accuracy: number): HopMedal {
  if (accuracy >= 80) return 'Gold';
  if (accuracy >= 50) return 'Silver';
  return 'Bronze';
}

function isOnPad(level: HopLevel, sample: HopSample) {
  if (!validPosition(sample) || !Number.isFinite(sample.speed)) return false;
  return (
    sample.grounded &&
    sample.speed >= 0 &&
    sample.y >= 0 &&
    sample.y < 0.075 &&
    radialDistance(level, sample) <= effectiveRadius(level)
  );
}

function isWinningSample(level: HopLevel, sample: HopSample) {
  return isOnPad(level, sample) && sample.speed < QUIET_SPEED;
}

function landingForWobble(seconds: number) {
  const span = HARD_LANDING_SECONDS - SOFT_LANDING_SECONDS;
  const over = (Number.isFinite(seconds) ? seconds : HARD_LANDING_SECONDS) - SOFT_LANDING_SECONDS;
  return Math.max(0, Math.min(100, Math.round((1 - over / span) * 100)));
}

function validPosition(sample: HopSample) {
  return Number.isFinite(sample.x) && Number.isFinite(sample.y) && Number.isFinite(sample.z);
}

function clampDt(dt: number) {
  return Number.isFinite(dt) && dt > 0 ? Math.min(dt, MAX_UPDATE_DT) : 0;
}

function normalizeProgress(progress: HopProgress): HopProgress {
  return {
    version: VERSION,
    unlocked: clampInt(progress.unlocked, 1, LEVELS.length) ?? 1,
    best: Array.from({ length: LEVELS.length }, (_, index) => toBest(progress.best?.[index])),
    accuracy: Array.from({ length: LEVELS.length }, (_, index) =>
      toAccuracy(progress.accuracy?.[index]),
    ),
    score: Array.from({ length: LEVELS.length }, (_, index) => toAccuracy(progress.score?.[index])),
    hintSeen: progress.hintSeen === true,
  };
}

function toBest(value: unknown) {
  return clampInt(value, 1, 999);
}

function toAccuracy(value: unknown) {
  return clampInt(value, 0, 100);
}

function clampInt(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min
    ? Math.min(value, max)
    : null;
}

function radialDistance(level: HopLevel, sample: HopSample) {
  return Math.hypot(sample.x - level.x, sample.z - level.z);
}

function effectiveRadius(level: HopLevel) {
  return Math.max(0, level.radius - BODY_MARGIN);
}

function accuracyForDistance(level: HopLevel, distance: number) {
  const radius = effectiveRadius(level);
  if (radius <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((1 - distance / radius) * 100)));
}

function emptyResultList() {
  return Array.from({ length: LEVELS.length }, () => null);
}
