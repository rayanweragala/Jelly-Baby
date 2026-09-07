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
  x: number;
  z: number;
  radius: number;
}>;

export const LEVELS = [
  { name: 'Warm Pad', x: 0.015, z: -0.09, radius: 0.065 },
  { name: 'Side Slide', x: -0.04, z: -0.11, radius: 0.063 },
  { name: 'Long Spoon', x: 0.04, z: -0.14, radius: 0.06 },
  { name: 'Corner Dab', x: -0.035, z: -0.17, radius: 0.058 },
  { name: 'Table Crown', x: 0.045, z: -0.174, radius: 0.055 },
] as const satisfies readonly HopLevel[];

const VERSION = 1;
const BODY_MARGIN = 0.01;
const SETTLE_SECONDS = 0.6;
const MAX_UPDATE_DT = 0.1;

export interface HopProgress {
  version: number;
  unlocked: number;
  best: (number | null)[];
  hintSeen: boolean;
}

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

  release() {
    if (!this.#complete) this.#throws++;
  }

  reset() {
    this.#throws = 0;
    this.#complete = false;
    this.#settledFor = 0;
  }

  update(dt: number, sample: HopSample) {
    if (this.#complete) return false;
    const level = LEVELS[this.levelIndex];
    if (this.#throws < 1 || sample.grabbing || !isWinningSample(level, sample)) {
      this.#settledFor = 0;
      return false;
    }
    this.#settledFor += clampDt(dt);
    if (this.#settledFor < SETTLE_SECONDS) return false;
    this.#complete = true;
    return true;
  }
}

export function freshProgress(): HopProgress {
  return {
    version: VERSION,
    unlocked: 1,
    best: Array.from({ length: LEVELS.length }, () => null),
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
    return {
      version: VERSION,
      unlocked: clampInt(parsed.unlocked, 1, LEVELS.length) ?? fresh.unlocked,
      best,
      hintSeen: parsed.hintSeen === true,
    };
  } catch {
    return freshProgress();
  }
}

export function recordWin(progress: HopProgress, levelIndex: number, throws: number): HopProgress {
  if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= LEVELS.length)
    return normalizeProgress(progress);
  if (!Number.isInteger(throws) || throws < 1) return normalizeProgress(progress);
  const normalized = normalizeProgress(progress);
  const safeThrows = Math.min(throws, 999);
  const best = normalized.best.slice();
  best[levelIndex] =
    best[levelIndex] === null ? safeThrows : Math.min(best[levelIndex], safeThrows);
  return {
    ...normalized,
    unlocked: Math.min(LEVELS.length, Math.max(normalized.unlocked, levelIndex + 2)),
    best,
  };
}

export function serializeProgress(progress: HopProgress) {
  return JSON.stringify(normalizeProgress(progress));
}

function isWinningSample(level: HopLevel, sample: HopSample) {
  if (!validPosition(sample) || !Number.isFinite(sample.speed)) return false;
  const radius = Math.max(0, level.radius - BODY_MARGIN);
  return (
    sample.grounded &&
    sample.speed >= 0 &&
    sample.speed < 0.025 &&
    sample.y >= 0 &&
    sample.y < 0.075 &&
    Math.hypot(sample.x - level.x, sample.z - level.z) <= radius
  );
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
    best: Array.from({ length: LEVELS.length }, (_, index) => toBest(progress.best[index])),
    hintSeen: progress.hintSeen === true,
  };
}

function toBest(value: unknown) {
  return clampInt(value, 1, 999);
}

function clampInt(value: unknown, min: number, max: number) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min
    ? Math.min(value, max)
    : null;
}
