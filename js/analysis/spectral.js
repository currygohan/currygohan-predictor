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

/** Deterministic pseudo-random in [0,1) for reproducible power iteration starts. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
  return s;
}

function norm(a) {
  return Math.sqrt(dot(a, a));
}

function normalizeVec(v) {
  const n = norm(v) || 1;
  return v.map((x) => x / n);
}

function symMatVec(A, v) {
  const n = A.length;
  const out = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    const row = A[i];
    let s = 0;
    for (let j = 0; j < n; j += 1) s += row[j] * v[j];
    out[i] = s;
  }
  return out;
}

function subtractOuterSymmetric(A, lambda, v) {
  const n = A.length;
  return A.map((row, i) => row.map((val, j) => val - lambda * v[i] * v[j]));
}

function dominantEigenSymmetric(A, rng, iterations = 120) {
  const n = A.length;
  let v = new Array(n);
  for (let i = 0; i < n; i += 1) v[i] = rng() - 0.5;
  v = normalizeVec(v);
  for (let it = 0; it < iterations; it += 1) {
    const w = symMatVec(A, v);
    v = normalizeVec(w);
  }
  const Av = symMatVec(A, v);
  const lambda = dot(v, Av);
  return { lambda, v };
}

/**
 * Build symmetric white–white co-occurrence counts (same draw, unordered pairs).
 */
function buildWhiteAdjacency(rows, rules) {
  const n = rules.whiteMax - rules.whiteMin + 1;
  const W = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const row of rows) {
    const ws = row.whites.filter((w) => whiteInRange(w, rules));
    for (let i = 0; i < ws.length; i += 1) {
      for (let j = i + 1; j < ws.length; j += 1) {
        const a = ws[i] - rules.whiteMin;
        const b = ws[j] - rules.whiteMin;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        W[lo][hi] += 1;
        W[hi][lo] += 1;
      }
    }
  }
  return W;
}

/** Normalized adjacency Ã = D^{-1/2} A D^{-1/2} (diagonal of A zeroed for Laplacian-style use we use A=W). */
function normalizedAdjacency(W, eps = 1e-9) {
  const n = W.length;
  const d = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    let s = 0;
    for (let j = 0; j < n; j += 1) {
      if (i !== j) s += W[i][j];
    }
    d[i] = s + eps;
  }
  const invSqrt = d.map((x) => 1 / Math.sqrt(x));
  const N = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i === j) continue;
      N[i][j] = (W[i][j] * invSqrt[i] * invSqrt[j]);
    }
  }
  return N;
}

function buildBonusGramFromWhiteBonus(rows, rules) {
  const nw = rules.whiteMax - rules.whiteMin + 1;
  const nb = rules.bonusMax - rules.bonusMin + 1;
  const H = Array.from({ length: nb }, () => new Array(nw).fill(0));
  for (const row of rows) {
    const b = row.bonus;
    if (!bonusInRange(b, rules)) continue;
    const bi = b - rules.bonusMin;
    for (const w of row.whites) {
      if (!whiteInRange(w, rules)) continue;
      const wi = w - rules.whiteMin;
      H[bi][wi] += 1;
    }
  }
  const G = Array.from({ length: nb }, () => new Array(nb).fill(0));
  for (let i = 0; i < nb; i += 1) {
    for (let j = i; j < nb; j += 1) {
      let s = 0;
      for (let k = 0; k < nw; k += 1) s += H[i][k] * H[j][k];
      G[i][j] = s;
      G[j][i] = s;
    }
  }
  return G;
}

/**
 * "Spectral rigidity": second eigenvector of normalized co-occurrence adjacency
 * (community / algebraic contrast on the white graph); dominant eigenvector of
 * bonus Gram H H^T (coupling of bonuses through shared whites).
 *
 * @param {"mega_millions"|"powerball"} game
 * @param {{ whites: number[], bonus: number }[]} historyRows
 * @returns {{ white: Record<number, number>, bonus: Record<number, number> }}
 */
export function computeSpectralScores(game, historyRows) {
  const rules = GAME_RULES[game];
  if (!rules || !historyRows?.length) {
    return { white: {}, bonus: {} };
  }

  const seed =
    (historyRows.length * 1000003 +
      historyRows[historyRows.length - 1].bonus * 131 +
      game.length) >>>
    0;
  const rng = mulberry32(seed);

  const nW = rules.whiteMax - rules.whiteMin + 1;
  const nB = rules.bonusMax - rules.bonusMin + 1;

  /** @type {Record<number, number>} */
  const white = {};
  /** @type {Record<number, number>} */
  const bonus = {};

  for (let b = rules.whiteMin; b <= rules.whiteMax; b += 1) white[b] = 0;
  for (let b = rules.bonusMin; b <= rules.bonusMax; b += 1) bonus[b] = 0;

  const W = buildWhiteAdjacency(historyRows, rules);
  let anyEdge = false;
  for (let i = 0; i < W.length; i += 1) {
    for (let j = 0; j < W.length; j += 1) {
      if (i !== j && W[i][j] > 0) {
        anyEdge = true;
        break;
      }
    }
    if (anyEdge) break;
  }

  if (anyEdge && nW >= 2) {
    const N = normalizedAdjacency(W);
    const { lambda: l1, v: v1 } = dominantEigenSymmetric(N, rng, 100);
    const N2 = subtractOuterSymmetric(N, l1, v1);
    const { v: v2 } = dominantEigenSymmetric(N2, rng, 100);
    for (let i = 0; i < nW; i += 1) {
      const ball = rules.whiteMin + i;
      white[ball] = Math.abs(v2[i]);
    }
  }

  const G = buildBonusGramFromWhiteBonus(historyRows, rules);
  let gAny = false;
  for (let i = 0; i < G.length; i += 1) {
    for (let j = 0; j < G.length; j += 1) {
      if (G[i][j] > 0) {
        gAny = true;
        break;
      }
    }
    if (gAny) break;
  }

  if (gAny && nB >= 1) {
    const { v: u1 } = dominantEigenSymmetric(G, rng, 100);
    for (let i = 0; i < nB; i += 1) {
      const ball = rules.bonusMin + i;
      bonus[ball] = Math.abs(u1[i]);
    }
  }

  return { white, bonus };
}
