import { GAME_RULES } from "./constants.js";
import { computeCombinedScores } from "./combineScores.js";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @template T
 * @param {T[]} arr
 * @param {() => number} rng
 */
function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
}

/**
 * Same (whites, bonus) per row; `draw_date` labels randomly permuted — breaks
 * calendar / order artifacts while keeping within-draw structure.
 *
 * @param {{ draw_date: string, whites: number[], bonus: number }[]} rows
 * @param {() => number} rng
 */
export function cloneRowsWithPermutedDates(rows, rng) {
  const dates = rows.map((r) => r.draw_date);
  shuffleInPlace(dates, rng);
  return rows.map((r, i) => ({
    ...r,
    draw_date: dates[i],
  }));
}

function hashSeed(game, rows) {
  let h = game.length * 1315423911;
  h ^= rows.length * 2654435761;
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    for (let k = 0; k < r.draw_date.length; k += 1) {
      h = Math.imul(h ^ r.draw_date.charCodeAt(k), 2654435761);
    }
    h ^= r.bonus * 1597334677;
  }
  return h >>> 0;
}

/**
 * Monte Carlo: permute draw_date across rows, recompute full combined scores.
 * Return z-maps: (observed - mean_perm) / std_perm per ball (Set B ranking only).
 *
 * @param {"mega_millions"|"powerball"} game
 * @param {{ draw_date: string, whites: number[], bonus: number }[]} historyRows
 * @param {{ white: Record<number, number>, bonus: Record<number, number> }} observedCombined
 * @param {{ replicates: number; weights?: typeof import("./config.js").DEFAULT_ANALYSIS_WEIGHTS }} opts
 */
export function computeDatePermutationZScores(game, historyRows, observedCombined, opts) {
  const rules = GAME_RULES[game];
  const replicates = Math.max(8, Math.min(200, opts.replicates ?? 72));
  const weights = opts.weights;

  /** @type {Record<number, number[]>} */
  const whiteSamples = {};
  /** @type {Record<number, number[]>} */
  const bonusSamples = {};

  if (!rules) {
    return { white: { ...observedCombined.white }, bonus: { ...observedCombined.bonus } };
  }

  for (let n = rules.whiteMin; n <= rules.whiteMax; n += 1) whiteSamples[n] = [];
  for (let n = rules.bonusMin; n <= rules.bonusMax; n += 1) bonusSamples[n] = [];

  const rng = mulberry32(hashSeed(game, historyRows));

  for (let rep = 0; rep < replicates; rep += 1) {
    const permuted = cloneRowsWithPermutedDates(historyRows, rng);
    const { combined } = computeCombinedScores(game, permuted, weights);
    for (let n = rules.whiteMin; n <= rules.whiteMax; n += 1) {
      whiteSamples[n].push(combined.white[n] ?? 0);
    }
    for (let n = rules.bonusMin; n <= rules.bonusMax; n += 1) {
      bonusSamples[n].push(combined.bonus[n] ?? 0);
    }
  }

  /** @param {number[]} arr */
  function meanStd(arr) {
    const m = arr.reduce((a, x) => a + x, 0) / arr.length;
    const v = arr.reduce((a, x) => a + (x - m) ** 2, 0) / arr.length;
    const s = Math.sqrt(v);
    return { m, s: s < 1e-12 ? 1e-12 : s };
  }

  /** @type {Record<number, number>} */
  const white = {};
  /** @type {Record<number, number>} */
  const bonus = {};

  for (let n = rules.whiteMin; n <= rules.whiteMax; n += 1) {
    const { m, s } = meanStd(whiteSamples[n]);
    white[n] = ((observedCombined.white[n] ?? 0) - m) / s;
  }
  for (let n = rules.bonusMin; n <= rules.bonusMax; n += 1) {
    const { m, s } = meanStd(bonusSamples[n]);
    bonus[n] = ((observedCombined.bonus[n] ?? 0) - m) / s;
  }

  return { white, bonus };
}
