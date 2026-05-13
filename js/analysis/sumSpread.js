import { GAME_RULES } from "./constants.js";

/** Bucket white sum (of 5) and max-min spread for a coarse joint histogram. */
const SUM_BIN_WIDTH = 12;
const SPREAD_BIN_WIDTH = 4;
const LAPLACE = 0.35;

/**
 * @param {number[]} sortedWhites length 5 ascending
 */
function sumAndSpread(sortedWhites) {
  const S = sortedWhites.reduce((a, b) => a + b, 0);
  const D = sortedWhites[4] - sortedWhites[0];
  return { S, D };
}

/**
 * Log-probability style score: balls that tended to appear in draws with
 * common (sum, spread) shapes get higher values. Whites and bonus separate.
 *
 * @param {"mega_millions"|"powerball"} game
 * @param {{ whites: number[], bonus: number }[]} rows
 */
export function computeSumSpreadScores(game, rows) {
  const rules = GAME_RULES[game];
  /** @type {Record<number, number>} */
  const white = {};
  /** @type {Record<number, number>} */
  const bonus = {};
  if (!rules || !rows.length) return { white, bonus };

  for (let n = rules.whiteMin; n <= rules.whiteMax; n += 1) white[n] = 0;
  for (let n = rules.bonusMin; n <= rules.bonusMax; n += 1) bonus[n] = 0;

  /** @type {Map<string, number>} */
  const hist = new Map();
  const prepared = [];

  for (const row of rows) {
    const w = [...row.whites]
      .filter((x) => Number.isInteger(x) && x >= rules.whiteMin && x <= rules.whiteMax)
      .sort((a, b) => a - b);
    if (w.length !== 5 || new Set(w).size !== 5) continue;
    const { S, D } = sumAndSpread(w);
    const sb = Math.floor(S / SUM_BIN_WIDTH);
    const db = Math.floor(D / SPREAD_BIN_WIDTH);
    const key = `${sb}_${db}`;
    hist.set(key, (hist.get(key) ?? 0) + 1);
    prepared.push({ w, S, D, sb, db, key, bonus: row.bonus });
  }

  const total = prepared.length;
  if (total === 0) return { white, bonus };

  const smooth = hist.size + 8;

  /** @param {string} key */
  function logP(key) {
    const c = hist.get(key) ?? 0;
    const p = (c + LAPLACE) / (total + LAPLACE * smooth);
    return Math.log(p);
  }

  for (const p of prepared) {
    const lp = logP(p.key);
    for (const ball of p.w) {
      white[ball] += lp;
    }
    const b = p.bonus;
    if (Number.isInteger(b) && b >= rules.bonusMin && b <= rules.bonusMax) {
      bonus[b] += lp;
    }
  }

  return { white, bonus };
}
