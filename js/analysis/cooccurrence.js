import { GAME_RULES } from "./constants.js";

/**
 * @param {number} n
 * @param {import("./constants.js").GameRules} rules
 */
function whiteInRange(n, rules) {
  return Number.isInteger(n) && n >= rules.whiteMin && n <= rules.whiteMax;
}

/**
 * @param {number} n
 * @param {import("./constants.js").GameRules} rules
 */
function bonusInRange(n, rules) {
  return Number.isInteger(n) && n >= rules.bonusMin && n <= rules.bonusMax;
}

/**
 * @param {Record<number, Record<number, number>>} ww
 * @param {number} a
 * @param {number} b
 */
function bumpWhitePair(ww, a, b) {
  if (a === b) return;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (!ww[lo]) ww[lo] = {};
  const inner = ww[lo];
  inner[hi] = (inner[hi] ?? 0) + 1;
}

/**
 * @param {Record<number, Record<number, number>>} ww
 * @param {number} c
 * @param {number} d
 */
function getWhitePairCount(ww, c, d) {
  if (c === d) return 0;
  const lo = Math.min(c, d);
  const hi = Math.max(c, d);
  return ww[lo]?.[hi] ?? 0;
}

/**
 * Same-draw co-occurrence:
 * - ww: unordered white pairs (both in the five); ww[lo][hi] = count
 * - wb: white w with bonus b in same draw; wb[w][b] = count
 *
 * @param {{ whites: number[], bonus: number }[]} rows
 * @param {import("./constants.js").GameRules} rules
 */
export function buildCooccurrenceMatrices(rows, rules) {
  /** @type {Record<number, Record<number, number>>} */
  const ww = {};
  /** @type {Record<number, Record<number, number>>} */
  const wb = {};

  for (const row of rows) {
    const ws = row.whites.filter((w) => whiteInRange(w, rules));
    const b = row.bonus;
    if (!bonusInRange(b, rules)) continue;

    for (let i = 0; i < ws.length; i += 1) {
      for (let j = i + 1; j < ws.length; j += 1) {
        bumpWhitePair(ww, ws[i], ws[j]);
      }
      for (const w of ws) {
        if (!wb[w]) wb[w] = {};
        const inner = wb[w];
        inner[b] = (inner[b] ?? 0) + 1;
      }
    }
  }

  return { ww, wb };
}

/**
 * Use the **latest** draw as context: score each candidate by how strongly it
 * co-occurred in history with that context (same-draw stats only).
 *
 * - White c: sum over each white a in last draw (a≠c) of pair count (c,a), plus
 *   count of draws where c appeared with last draw's bonus.
 * - Bonus b: sum over whites w in last draw of wb[w][b] (how often b hit with those whites).
 *
 * @param {ReturnType<typeof buildCooccurrenceMatrices>} matrices
 * @param {{ whites: number[], bonus: number }} lastDraw
 * @param {import("./constants.js").GameRules} rules
 * @returns {{ white: Record<number, number>, bonus: Record<number, number> }}
 */
export function cooccurrenceScoresForContext(matrices, lastDraw, rules) {
  const { whiteMin, whiteMax, bonusMin, bonusMax } = rules;
  const { ww, wb } = matrices;

  /** @type {Record<number, number>} */
  const white = {};
  /** @type {Record<number, number>} */
  const bonus = {};

  const lastWhites = lastDraw.whites.filter((w) => whiteInRange(w, rules));
  const lastBonus = lastDraw.bonus;
  const lastBonusOk = bonusInRange(lastBonus, rules);

  for (let c = whiteMin; c <= whiteMax; c += 1) {
    let s = 0;
    for (const a of lastWhites) {
      if (a === c) continue;
      s += getWhitePairCount(ww, c, a);
    }
    if (lastBonusOk) {
      s += wb[c]?.[lastBonus] ?? 0;
    }
    white[c] = s;
  }

  for (let b = bonusMin; b <= bonusMax; b += 1) {
    let s = 0;
    for (const w of lastWhites) {
      s += wb[w]?.[b] ?? 0;
    }
    bonus[b] = s;
  }

  return { white, bonus };
}
