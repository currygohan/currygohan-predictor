import { GAME_RULES } from "./constants.js";

/**
 * Multiply every white/bonus score by a weight (frequency counts or transition counts).
 *
 * @param {{ white: Record<number, number>, bonus: Record<number, number> }} scores
 * @param {number} weight
 */
export function scaleScores(scores, weight) {
  /** @type {{ white: Record<number, number>, bonus: Record<number, number> }} */
  const white = {};
  const bonus = {};
  for (const [k, v] of Object.entries(scores.white)) {
    white[Number(k)] = v * weight;
  }
  for (const [k, v] of Object.entries(scores.bonus)) {
    bonus[Number(k)] = v * weight;
  }
  return { white, bonus };
}

/** @deprecated use scaleScores */
export const applyFrequencyWeight = scaleScores;

/**
 * @param {{ white: Record<number, number>, bonus: Record<number, number> }} a
 * @param {{ white: Record<number, number>, bonus: Record<number, number> }} b
 * @param {"mega_millions"|"powerball"} game
 */
export function mergeScores(a, b, game) {
  const rules = GAME_RULES[game];
  if (!rules) return { white: {}, bonus: {} };
  const { whiteMin, whiteMax, bonusMin, bonusMax } = rules;
  /** @type {{ white: Record<number, number>, bonus: Record<number, number> }} */
  const white = {};
  const bonus = {};
  for (let n = whiteMin; n <= whiteMax; n += 1) {
    white[n] = (a.white[n] ?? 0) + (b.white[n] ?? 0);
  }
  for (let n = bonusMin; n <= bonusMax; n += 1) {
    bonus[n] = (a.bonus[n] ?? 0) + (b.bonus[n] ?? 0);
  }
  return { white, bonus };
}

/**
 * Pick Set A: top `whitePick` whites + top bonus by `scores`.
 * @param {{ white: Record<number, number>, bonus: Record<number, number> }} scores
 * @param {"mega_millions"|"powerball"} game
 */
export function pickSetA(scores, game) {
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

  /** @type {{ n: number, s: number }[]} */
  const bonusRanked = [];
  for (let n = bonusMin; n <= bonusMax; n += 1) {
    bonusRanked.push({ n, s: scores.bonus[n] ?? 0 });
  }
  bonusRanked.sort((a, b) => b.s - a.s || a.n - b.n);
  const bonusA = bonusRanked[0].n;

  return {
    whites: [...setAWhites].sort((a, b) => a - b),
    bonus: bonusA,
  };
}

/**
 * Pick Set B using same ranking as legacy `pickTwoTicketsFromScores` second ticket:
 * best whites excluding Set A's five; best bonus ≠ Set A's bonus when possible.
 *
 * @param {{ white: Record<number, number>, bonus: Record<number, number> }} scores
 * @param {"mega_millions"|"powerball"} game
 * @param {{ whites: number[], bonus: number }} setA
 */
export function pickSetB(scores, game, setA) {
  const rules = GAME_RULES[game];
  if (!rules) return null;
  const { whiteMin, whiteMax, bonusMin, bonusMax, whitePick } = rules;

  /** @type {{ n: number, s: number }[]} */
  const whiteRanked = [];
  for (let n = whiteMin; n <= whiteMax; n += 1) {
    whiteRanked.push({ n, s: scores.white[n] ?? 0 });
  }
  whiteRanked.sort((a, b) => b.s - a.s || a.n - b.n);

  const excludeWhites = new Set(setA.whites);
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

  const bonusA = setA.bonus;
  const bonusBEntry = bonusRanked.find((x) => x.n !== bonusA) ?? bonusRanked[1];
  const bonusB = bonusBEntry ? bonusBEntry.n : bonusA;

  return {
    whites: [...setBWhites].sort((a, b) => a - b),
    bonus: bonusB,
  };
}

/**
 * Pick two tickets: Set A = strongest by score; Set B = next-strongest whites excluding A's,
 * and second-ranked bonus ≠ A's bonus.
 *
 * @param {{ white: Record<number, number>, bonus: Record<number, number> }} scores
 * @param {"mega_millions"|"powerball"} game
 */
export function pickTwoTicketsFromScores(scores, game) {
  const setA = pickSetA(scores, game);
  if (!setA) return null;
  const setB = pickSetB(scores, game, setA);
  if (!setB) return null;
  return { setA, setB };
}
