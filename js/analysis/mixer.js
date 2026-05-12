import { GAME_RULES } from "./constants.js";

/**
 * Turn raw hit counts into weighted scores (single analyzer for now).
 *
 * @param {{ white: Record<number, number>, bonus: Record<number, number> }} counts
 * @param {number} weight
 */
export function applyFrequencyWeight(counts, weight) {
  /** @type {{ white: Record<number, number>, bonus: Record<number, number> }} */
  const white = {};
  const bonus = {};
  for (const [k, v] of Object.entries(counts.white)) {
    white[Number(k)] = v * weight;
  }
  for (const [k, v] of Object.entries(counts.bonus)) {
    bonus[Number(k)] = v * weight;
  }
  return { white, bonus };
}

/**
 * Pick two tickets: Set A = strongest by score; Set B = next-strongest whites excluding A's,
 * and second-ranked bonus ≠ A's bonus.
 *
 * @param {{ white: Record<number, number>, bonus: Record<number, number> }} scores
 * @param {"mega_millions"|"powerball"} game
 */
export function pickTwoTicketsFromScores(scores, game) {
  const rules = GAME_RULES[game];
  if (!rules) return null;

  const { whiteMin, whiteMax, bonusMin, bonusMax, whitePick } = rules;

  /** @type {{ n: number, s: number }[]} */
  const whiteRanked = [];
  for (let n = whiteMin; n <= whiteMax; n += 1) {
    whiteRanked.push({ n, s: scores.white[n] ?? 0 });
  }
  whiteRanked.sort((a, b) => b.s - a.s || a.n - b.n);

  const setAWhites = whiteRanked.slice(0, whitePick).map((x) => x.n);
  const excludeWhites = new Set(setAWhites);
  const setBWhites = whiteRanked
    .filter((x) => !excludeWhites.has(x.n))
    .slice(0, whitePick)
    .map((x) => x.n);

  /** @type {{ n: number, s: number }[]} */
  const bonusRanked = [];
  for (let n = bonusMin; n <= bonusMax; n += 1) {
    bonusRanked.push({ n, s: scores.bonus[n] ?? 0 });
  }
  bonusRanked.sort((a, b) => b.s - a.s || a.n - b.n);

  const bonusA = bonusRanked[0].n;
  const bonusBEntry = bonusRanked.find((x) => x.n !== bonusA) ?? bonusRanked[1];
  const bonusB = bonusBEntry ? bonusBEntry.n : bonusA;

  return {
    setA: { whites: [...setAWhites].sort((a, b) => a - b), bonus: bonusA },
    setB: { whites: [...setBWhites].sort((a, b) => a - b), bonus: bonusB },
  };
}
