import { GAME_RULES } from "./constants.js";

/**
 * Count how often each white and each bonus ball appeared in history.
 * Whites and bonus are tallied separately (each draw adds 5 white hits + 1 bonus hit).
 *
 * @param {{ whites: number[], bonus: number }[]} rows
 * @param {import("./constants.js").GameRules} rules
 * @returns {{ white: Record<number, number>, bonus: Record<number, number> }}
 */
export function computeFrequencyCounts(rows, rules) {
  const { whiteMin, whiteMax, bonusMin, bonusMax } = rules;

  /** @type {Record<number, number>} */
  const white = {};
  /** @type {Record<number, number>} */
  const bonus = {};

  for (let n = whiteMin; n <= whiteMax; n += 1) white[n] = 0;
  for (let n = bonusMin; n <= bonusMax; n += 1) bonus[n] = 0;

  for (const row of rows) {
    for (const w of row.whites) {
      if (Number.isInteger(w) && w >= whiteMin && w <= whiteMax) {
        white[w] += 1;
      }
    }
    const b = row.bonus;
    if (Number.isInteger(b) && b >= bonusMin && b <= bonusMax) {
      bonus[b] += 1;
    }
  }

  return { white, bonus };
}

/**
 * @param {import("./constants.js").GameRules} rules
 */
export function emptyFrequencyForGame(gameId) {
  const rules = GAME_RULES[gameId];
  if (!rules) return { white: {}, bonus: {} };
  return computeFrequencyCounts([], rules);
}
