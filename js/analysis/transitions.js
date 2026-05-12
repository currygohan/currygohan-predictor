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
 * @param {Record<number, Record<number, number>>} map
 * @param {number} k1
 * @param {number} k2
 */
function bump2(map, k1, k2) {
  if (!map[k1]) map[k1] = {};
  const inner = map[k1];
  inner[k2] = (inner[k2] ?? 0) + 1;
}

/**
 * Count transitions between consecutive draws (ordered oldest → newest).
 *
 * - ww[a][c]: prev draw had white `a`, next draw had white `c`
 * - wb[a][b]: prev white `a`, next bonus `b`
 * - bw[pb][c]: prev bonus `pb`, next white `c`
 * - bb[pb][nb]: prev bonus `pb`, next bonus `nb`
 *
 * @param {{ whites: number[], bonus: number }[]} orderedRows ascending by draw_date
 * @param {import("./constants.js").GameRules} rules
 */
export function buildTransitionMatrices(orderedRows, rules) {
  /** @type {Record<number, Record<number, number>>} */
  const ww = {};
  /** @type {Record<number, Record<number, number>>} */
  const wb = {};
  /** @type {Record<number, Record<number, number>>} */
  const bw = {};
  /** @type {Record<number, Record<number, number>>} */
  const bb = {};

  for (let i = 0; i < orderedRows.length - 1; i += 1) {
    const prev = orderedRows[i];
    const next = orderedRows[i + 1];

    for (const a of prev.whites) {
      if (!whiteInRange(a, rules)) continue;
      for (const c of next.whites) {
        if (!whiteInRange(c, rules)) continue;
        bump2(ww, a, c);
      }
      const nb = next.bonus;
      if (bonusInRange(nb, rules)) bump2(wb, a, nb);
    }

    const pb = prev.bonus;
    if (bonusInRange(pb, rules)) {
      for (const c of next.whites) {
        if (!whiteInRange(c, rules)) continue;
        bump2(bw, pb, c);
      }
      const nbon = next.bonus;
      if (bonusInRange(nbon, rules)) bump2(bb, pb, nbon);
    }
  }

  return { ww, wb, bw, bb };
}

/**
 * Score each possible next white / next bonus using the **latest** draw as context.
 *
 * @param {ReturnType<typeof buildTransitionMatrices>} matrices
 * @param {{ whites: number[], bonus: number }} lastDraw
 * @param {import("./constants.js").GameRules} rules
 * @returns {{ white: Record<number, number>, bonus: Record<number, number> }}
 */
export function transitionScoresForNextDraw(matrices, lastDraw, rules) {
  const { whiteMin, whiteMax, bonusMin, bonusMax } = rules;
  const { ww, wb, bw, bb } = matrices;

  /** @type {Record<number, number>} */
  const white = {};
  /** @type {Record<number, number>} */
  const bonus = {};

  for (let c = whiteMin; c <= whiteMax; c += 1) {
    let s = 0;
    for (const a of lastDraw.whites) {
      if (whiteInRange(a, rules)) s += ww[a]?.[c] ?? 0;
    }
    if (bonusInRange(lastDraw.bonus, rules)) {
      s += bw[lastDraw.bonus]?.[c] ?? 0;
    }
    white[c] = s;
  }

  for (let b = bonusMin; b <= bonusMax; b += 1) {
    let s = 0;
    for (const a of lastDraw.whites) {
      if (whiteInRange(a, rules)) s += wb[a]?.[b] ?? 0;
    }
    if (bonusInRange(lastDraw.bonus, rules)) {
      s += bb[lastDraw.bonus]?.[b] ?? 0;
    }
    bonus[b] = s;
  }

  return { white, bonus };
}

/**
 * @param {"mega_millions"|"powerball"} game
 */
export function zeroScoreMaps(game) {
  const rules = GAME_RULES[game];
  if (!rules) return { white: {}, bonus: {} };
  const { whiteMin, whiteMax, bonusMin, bonusMax } = rules;
  /** @type {Record<number, number>} */
  const white = {};
  /** @type {Record<number, number>} */
  const bonus = {};
  for (let n = whiteMin; n <= whiteMax; n += 1) white[n] = 0;
  for (let n = bonusMin; n <= bonusMax; n += 1) bonus[n] = 0;
  return { white, bonus };
}
