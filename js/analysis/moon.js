import { GAME_RULES } from "./constants.js";
import { nextScheduledDrawLocalNoon, parseLocalNoon } from "./weekday.js";

/** Eight equal slices of the synodic cycle (0 = new … 7 = waning crescent). */
export const MOON_PHASE_LABELS = [
  "New",
  "Waxing crescent",
  "First quarter",
  "Waxing gibbous",
  "Full",
  "Waning gibbous",
  "Last quarter",
  "Waning crescent",
];

const SYNODIC_DAYS = 29.530588853;
/** Approximate JD of a known new moon (Jan 6, 2000 ~ 18:14 UTC). */
const REF_NEW_MOON_JD = 2451550.09765;

/**
 * Julian day at the instant of this Date (UTC-based from getTime).
 * @param {Date} d
 */
function julianDay(d) {
  return d.getTime() / 86400000 + 2440587.5;
}

/**
 * Synodic phase in [0, 1): 0 new, ~0.5 full.
 * @param {Date} localNoonDate calendar wall time at local noon
 */
export function synodicPhaseFraction(localNoonDate) {
  if (Number.isNaN(localNoonDate.getTime())) return 0;
  const jd = julianDay(localNoonDate);
  let frac = ((jd - REF_NEW_MOON_JD) / SYNODIC_DAYS) % 1;
  if (frac < 0) frac += 1;
  return frac;
}

/**
 * @param {Date} localNoonDate
 * @returns {number} 0–7
 */
export function moonPhaseBucketFromLocalDate(localNoonDate) {
  const frac = synodicPhaseFraction(localNoonDate);
  return Math.min(7, Math.floor(frac * 8));
}

/**
 * @param {string} drawDateIso YYYY-MM-DD
 * @returns {number} 0–7
 */
export function moonPhaseBucketFromDrawDate(drawDateIso) {
  return moonPhaseBucketFromLocalDate(parseLocalNoon(drawDateIso));
}

/**
 * Lunar phase bucket for the next scheduled draw night (local calendar).
 * @param {"mega_millions"|"powerball"} game
 */
export function nextScheduledDrawMoonPhaseBucket(game) {
  return moonPhaseBucketFromLocalDate(nextScheduledDrawLocalNoon(game));
}

/**
 * Empirical rates for draws whose draw_date fell in the same moon phase bucket
 * (local noon on draw_date) as `targetBucket`.
 *
 * @param {"mega_millions"|"powerball"} game
 * @param {{ draw_date: string, whites: number[], bonus: number }[]} rows
 * @param {number} targetBucket 0–7
 */
export function computeMoonPhaseScores(game, rows, targetBucket) {
  const rules = GAME_RULES[game];
  /** @type {Record<number, number>} */
  const white = {};
  /** @type {Record<number, number>} */
  const bonus = {};
  if (!rules) return { white, bonus };

  for (let n = rules.whiteMin; n <= rules.whiteMax; n += 1) white[n] = 0;
  for (let n = rules.bonusMin; n <= rules.bonusMax; n += 1) bonus[n] = 0;

  let nInPhase = 0;
  /** @type {Record<number, number>} */
  const whiteHits = {};
  /** @type {Record<number, number>} */
  const bonusHits = {};

  for (const row of rows) {
    if (moonPhaseBucketFromDrawDate(row.draw_date) !== targetBucket) continue;
    nInPhase += 1;
    for (const w of row.whites) {
      if (!Number.isInteger(w) || w < rules.whiteMin || w > rules.whiteMax) continue;
      whiteHits[w] = (whiteHits[w] ?? 0) + 1;
    }
    const b = row.bonus;
    if (Number.isInteger(b) && b >= rules.bonusMin && b <= rules.bonusMax) {
      bonusHits[b] = (bonusHits[b] ?? 0) + 1;
    }
  }

  if (nInPhase === 0) return { white, bonus };

  for (let c = rules.whiteMin; c <= rules.whiteMax; c += 1) {
    white[c] = (whiteHits[c] ?? 0) / nInPhase;
  }
  for (let b = rules.bonusMin; b <= rules.bonusMax; b += 1) {
    bonus[b] = (bonusHits[b] ?? 0) / nInPhase;
  }

  return { white, bonus };
}
