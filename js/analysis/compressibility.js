import { GAME_RULES } from "./constants.js";

/**
 * @param {number} n
 * @param {import("./constants.js").GameRules} rules
 */
function whiteInRange(n, rules) {
  return Number.isInteger(n) && n >= rules.whiteMin && n <= rules.whiteMax;
}

function bonusInRange(n, rules) {
  return Number.isInteger(n) && n >= rules.bonusMin && n <= rules.bonusMax;
}

function binaryEntropy01(p) {
  if (p <= 0 || p >= 1) return 0;
  return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

/**
 * Empirical entropy of joint (X_t, X_{t+1}) for binary X, 4 states.
 * @param {number[]} bits 0/1
 */
function markov1Entropy(bits) {
  const n = bits.length;
  if (n < 2) return 0;
  const c = [0, 0, 0, 0];
  for (let t = 0; t < n - 1; t += 1) {
    const a = bits[t];
    const b = bits[t + 1];
    c[a * 2 + b] += 1;
  }
  const m = n - 1;
  let h = 0;
  for (let k = 0; k < 4; k += 1) {
    const q = c[k] / m;
    if (q > 0) h -= q * Math.log2(q);
  }
  return h;
}

/**
 * @param {{ draw_date: string, whites: number[], bonus: number }[]} rows chronological oldest→newest
 * @param {import("./constants.js").GameRules} rules
 * @param {{ windowSize?: number }} opts
 */
export function computeCompressibilityScores(rows, rules, opts = {}) {
  const windowSize = opts.windowSize ?? 256;
  /** @type {Record<number, number>} */
  const white = {};
  /** @type {Record<number, number>} */
  const bonus = {};

  for (let b = rules.whiteMin; b <= rules.whiteMax; b += 1) white[b] = 0;
  for (let b = rules.bonusMin; b <= rules.bonusMax; b += 1) bonus[b] = 0;

  if (!rows.length) return { white, bonus };

  const win = rows.slice(-Math.min(windowSize, rows.length));

  for (let c = rules.whiteMin; c <= rules.whiteMax; c += 1) {
    const bits = win.map((r) => (r.whites.some((w) => w === c) ? 1 : 0));
    const ones = bits.reduce((a, x) => a + x, 0);
    const p = ones / bits.length;
    const h1 = binaryEntropy01(p);
    const h2 = markov1Entropy(bits);
    const score = 0.55 * h1 + 0.45 * (h2 / 2);
    white[c] = score;
  }

  for (let b = rules.bonusMin; b <= rules.bonusMax; b += 1) {
    const bits = win.map((r) => (r.bonus === b ? 1 : 0));
    const ones = bits.reduce((a, x) => a + x, 0);
    const p = ones / bits.length;
    const h1 = binaryEntropy01(p);
    const h2 = markov1Entropy(bits);
    const score = 0.55 * h1 + 0.45 * (h2 / 2);
    bonus[b] = score;
  }

  return { white, bonus };
}

/**
 * @param {"mega_millions"|"powerball"} game
 * @param {{ draw_date: string, whites: number[], bonus: number }[]} historyRows
 */
export function computeCompressibilityScoresForGame(game, historyRows) {
  const rules = GAME_RULES[game];
  if (!rules) return { white: {}, bonus: {} };
  const ordered = [...historyRows].sort((a, b) => a.draw_date.localeCompare(b.draw_date));
  return computeCompressibilityScores(ordered, rules);
}
