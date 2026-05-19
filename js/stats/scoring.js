import { GAME_RULES } from "../analysis/constants.js";

/**
 * @param {number} n
 * @param {number} k
 */
function comb(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  k = Math.min(k, n - k);
  let num = 1;
  let den = 1;
  for (let i = 1; i <= k; i += 1) {
    num *= n - k + i;
    den *= i;
  }
  return num / den;
}

/**
 * P(exactly k matches) when you hold K=5 "marked" numbers in population N and n=5 are drawn.
 * @param {number} k
 * @param {number} N
 */
export function hypergeometricPMF(k, N) {
  const K = 5;
  const n = 5;
  return (comb(K, k) * comb(N - K, n - k)) / comb(N, n);
}

/**
 * @param {number} N population size (white ball range)
 */
export function hypergeometricMean(N) {
  const K = 5;
  const n = 5;
  return (n * K) / N;
}

/**
 * @param {number} N
 */
export function hypergeometricVariance(N) {
  const K = 5;
  const n = 5;
  const p = K / N;
  return n * p * (1 - p) * ((N - n) / (N - 1));
}

/** Standard normal CDF (approximation). */
export function normalCDF(z) {
  if (z < -8) return 0;
  if (z > 8) return 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-(z * z) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.7814779 + t * (-1.821256 + t * 1.3302744))));
  return z >= 0 ? 1 - p : p;
}

/**
 * @param {"mega_millions"|"powerball"} game
 */
export function bonusHitProbability(game) {
  const rules = GAME_RULES[game];
  if (!rules) return 1 / 26;
  const count = rules.bonusMax - rules.bonusMin + 1;
  return 1 / count;
}

/**
 * @param {number[]} predWhites length 5
 * @param {number} predBonus
 * @param {{ whites: number[], bonus: number }} actual
 * @param {"mega_millions"|"powerball"} game
 */
export function scoreTicket(predWhites, predBonus, actual, game) {
  const rules = GAME_RULES[game];
  const N = rules?.whiteMax ?? 70;
  const pw = new Set(predWhites);
  let whiteHits = 0;
  for (const w of actual.whites) {
    if (pw.has(w)) whiteHits += 1;
  }
  const bonusHit = predBonus === actual.bonus ? 1 : 0;

  const rawMatchPct = Math.round((100 * (whiteHits + bonusHit)) / 6);

  const muW = hypergeometricMean(N);
  const varW = hypergeometricVariance(N);
  const sigmaW = Math.sqrt(varW) || 1e-9;
  const whiteZ = (whiteHits - muW) / sigmaW;

  const pB = bonusHitProbability(game);
  const sigmaB = Math.sqrt(pB * (1 - pB)) || 1e-9;
  const bonusZ = (bonusHit - pB) / sigmaB;

  const skillZ = (whiteZ + bonusZ) / Math.SQRT2;
  const skillPercentile = Math.round(normalCDF(skillZ) * 1000) / 10;

  const pWhiteAtLeast = (() => {
    let s = 0;
    for (let k = whiteHits; k <= 5; k += 1) s += hypergeometricPMF(k, N);
    return Math.round(s * 10000) / 10000;
  })();

  const pBonusAtLeast = bonusHit ? 1 : 0;
  const pBonusRandom = pB;
  const pCombinedAtLeast = Math.round(pWhiteAtLeast * pBonusAtLeast * 10000) / 10000;

  return {
    whiteHits,
    bonusHit,
    rawMatchPct,
    skillZ: Math.round(skillZ * 1000) / 1000,
    skillPercentile,
    expectedWhiteHits: Math.round(muW * 1000) / 1000,
    bonusHitProbability: Math.round(pB * 10000) / 10000,
    whiteZ: Math.round(whiteZ * 1000) / 1000,
    bonusZ: Math.round(bonusZ * 1000) / 1000,
    pCombinedAtLeast,
  };
}

/**
 * One-sided test: H0 mean skillZ <= 0 vs H1 mean skillZ > 0.
 * Uses normal approximation on mean z (valid as sample grows).
 *
 * @param {number[]} skillZs
 */
export function aggregateLuckTest(skillZs) {
  const vals = skillZs.filter((z) => Number.isFinite(z));
  const n = vals.length;
  if (n === 0) {
    return {
      n: 0,
      meanZ: null,
      pValue: null,
      verdict: "No scored predictions yet.",
    };
  }

  const meanZ = vals.reduce((a, b) => a + b, 0) / n;
  if (n === 1) {
    const p = 1 - normalCDF(meanZ);
    return {
      n,
      meanZ: Math.round(meanZ * 1000) / 1000,
      pValue: Math.round(p * 10000) / 10000,
      verdict: interpretVerdict(meanZ, p, n),
    };
  }

  let ss = 0;
  for (const z of vals) ss += (z - meanZ) ** 2;
  const s = Math.sqrt(ss / (n - 1));
  const se = s / Math.sqrt(n);
  const tStat = meanZ / (se || 1e-9);
  const pValue = 1 - normalCDF(tStat);

  return {
    n,
    meanZ: Math.round(meanZ * 1000) / 1000,
    pValue: Math.round(pValue * 10000) / 10000,
    verdict: interpretVerdict(meanZ, pValue, n),
  };
}

/**
 * @param {number} meanZ
 * @param {number} pValue
 * @param {number} n
 */
function interpretVerdict(meanZ, pValue, n) {
  if (meanZ <= 0) {
    return `Average skill score is below the random baseline (mean z = ${meanZ}). With ${n} scored ticket(s), results look like chance or worse — not evidence the model is beating luck.`;
  }
  if (pValue > 0.1) {
    return `With ${n} scored ticket(s), results are within what random picks often produce (p ≈ ${pValue}). Too early to claim the model beats luck — keep logging draws.`;
  }
  if (pValue > 0.05) {
    return `Weak signal only (p ≈ ${pValue}, n = ${n}). Some tickets beat chance, but the sample is still small — treat as inconclusive.`;
  }
  if (pValue > 0.01) {
    return `Moderately unlikely under pure luck (p ≈ ${pValue.toFixed(4)}, n = ${n}). Suggestive, but not definitive — variance is huge in lottery data.`;
  }
  return `Mean skill z is positive and p ≈ ${pValue < 0.0001 ? "< 0.0001" : pValue.toFixed(4)} with n = ${n} — unlikely to be only luck at this sample size, but lottery outcomes remain mostly random; this does not prove the analysis is correct.`;
}

/**
 * Fill skill fields on a history row when actuals exist (client-side backfill for old CSV rows).
 *
 * @param {Record<string, string>} r
 * @returns {Record<string, string>}
 */
export function enrichScoredRow(r) {
  const game = String(r.game ?? "");
  if (!String(r.actual_n1 ?? "").trim()) return r;
  if (String(r.skill_z_set_a ?? "").trim() && String(r.accuracy_set_a_pct ?? "").trim()) {
    return r;
  }

  const sorted = [
    Number.parseInt(r.actual_n1, 10),
    Number.parseInt(r.actual_n2, 10),
    Number.parseInt(r.actual_n3, 10),
    Number.parseInt(r.actual_n4, 10),
    Number.parseInt(r.actual_n5, 10),
  ].sort((a, b) => a - b);
  const act = {
    whites: sorted,
    bonus: Number.parseInt(r.actual_bonus, 10),
  };
  const wa = String(r.set_a_whites ?? "")
    .split("|")
    .map((x) => Number.parseInt(x, 10));
  const wb = String(r.set_b_whites ?? "")
    .split("|")
    .map((x) => Number.parseInt(x, 10));
  const ba = Number.parseInt(r.set_a_bonus, 10);
  const bb = Number.parseInt(r.set_b_bonus, 10);

  const sa = scoreTicket(wa, ba, act, /** @type {"mega_millions"|"powerball"} */ (game));
  const sb = scoreTicket(wb, bb, act, /** @type {"mega_millions"|"powerball"} */ (game));

  return {
    ...r,
    white_hits_a: String(sa.whiteHits),
    white_hits_b: String(sb.whiteHits),
    bonus_hit_a: String(sa.bonusHit),
    bonus_hit_b: String(sb.bonusHit),
    raw_match_pct_set_a: String(sa.rawMatchPct),
    raw_match_pct_set_b: String(sb.rawMatchPct),
    skill_z_set_a: String(sa.skillZ),
    skill_z_set_b: String(sb.skillZ),
    accuracy_set_a_pct: String(sa.skillPercentile),
    accuracy_set_b_pct: String(sb.skillPercentile),
  };
}

/**
 * Build chart points from history rows (newest last for time series).
 * @param {Record<string, string>[]} rows
 */
export function buildSkillSeries(rows) {
  /** @type {{ date: string, label: string, skillPct: number, game: string, set: string }[]} */
  const points = [];

  for (const r of rows) {
    if (!String(r.actual_n1 ?? "").trim()) continue;
    const game = String(r.game ?? "");
    const date = String(r.target_draw_date ?? "");
    for (const set of ["a", "b"]) {
      const pct = String(r[`accuracy_set_${set}_pct`] ?? "").trim();
      const z = String(r[`skill_z_set_${set}`] ?? "").trim();
      let skillPct = pct ? Number.parseFloat(pct) : NaN;
      if (!Number.isFinite(skillPct) && z) {
        skillPct = Math.round(normalCDF(Number.parseFloat(z)) * 1000) / 10;
      }
      if (!Number.isFinite(skillPct)) continue;
      points.push({
        date,
        label: `${game} Set ${set.toUpperCase()}`,
        skillPct,
        game,
        set: set.toUpperCase(),
      });
    }
  }

  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}

/**
 * @param {{ skillPct: number }[]} points
 * @param {number} window
 */
export function rollingAverage(points, window = 4) {
  const out = [];
  for (let i = 0; i < points.length; i += 1) {
    const start = Math.max(0, i - window + 1);
    const slice = points.slice(start, i + 1);
    const avg = slice.reduce((a, p) => a + p.skillPct, 0) / slice.length;
    out.push({ index: i, value: Math.round(avg * 10) / 10, date: points[i].date });
  }
  return out;
}
